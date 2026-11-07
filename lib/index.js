/**
 * dsh-hippocampus —— 拟人记忆插件（DSH host 半端）
 * ============================================================================
 * 一句话：给任何 DSH agent 装一颗「会忘、会想起、会归纳、会记人」的海马体。
 *
 * 记忆不是数据库，是一组连续的过程（详见 docs/DESIGN.md）：
 *   1. 编码有闸门   —— 不是所有事都配进记忆（刷到的东西当场就不写）
 *   2. 稳定性 S     —— 一条记忆能撑多久，由「类别 × 重要度 × 情绪」算出来
 *   3. 遗忘曲线     —— R = exp(-Δt/S)；R < 0.06 才离开活库
 *   4. 间隔效应     —— 每次成功想起 S×1.6；同类竞争 S×0.88（想起 A 会压 B）
 *   5. 概率回忆     —— 想不想得起来是概率（越模糊越容易被一句话勾起来）
 *   6. 语义归纳     —— 同类 3 条小事 → 熬成一条「道理」，原件进归档
 *   7. 关系网       —— 词与词反复一起出现就长边；从一个词能扩散出联想
 *
 * 落盘：`<home>/brain.json`（本研究版默认 `$DSH_HOME/hippocampus-room-preview/`）。
 * 换会话、换窗口、重启 DSH 都不会丢——记忆是侧车文件，不在会话记录里。
 * ============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { acquireSpaceHub, sessionId, spaceKey } from './spaces.mjs'
import { createRoomState } from './room-state.mjs'
import { startRoomService } from './room-server.mjs'
import { FIRST_USE_MESSAGE, onboardingPrompt } from './onboarding.mjs'
import {createRoomLife} from './room-life.mjs'
import {actionCatalog} from '../room/src/action-catalog.js'
import { fileURLToPath } from 'node:url'

import { loadHostDeps } from './hostdeps.mjs'

// 宿主半端要用的一点点东西：拿不到也不许让整条插件不激活
const hostDeps = await loadHostDeps()
const z = hostDeps.z
const defineTool = hostDeps.defineTool

import * as hpEngine from './hippocampus.js'
import { createActivityJournal, instrumentEngine } from './activity.mjs'
import { createDashboardLifecycle } from './dashboard-lifecycle.mjs'
import { isBridge, bridgeCall, keyOf } from './bridge.mjs'
import { pickTopic, userMessageText } from './topic.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.resolve(HERE, '..')

/* ────────────────────────────── 配置 ────────────────────────────── */

export const name = 'hippocampus'

/**
 * 依赖的宿主服务：只有 `tools` 是必需的。
 * `systemPrompt` 在独立的 ctx.inject(['systemPrompt'], ...) 子上下文中使用。
 * Cordis 禁止未声明依赖的上下文直接读取 ctx.systemPrompt；把整个插件依赖它又会
 * 让缺少提示词服务时的工具一并等待。子上下文使工具先激活，提示词服务到达后再注册，
 * 并在该服务重载或插件卸载时自动清理注入段。
 */
export const inject = ['tools']

const DEFAULTS = {
  enabled: true,
  /** 独立研究目录；留空 = $DSH_HOME/hippocampus-room-preview */
  homeDir: '',
  /** 仅 shared 模式使用的空间名；默认 bound 模式按会话绑定 */
  space: 'default',
  /** 旧配置兼容：true 等价于 scopeMode=session */
  followSession: false,
  scopeMode: 'bound',
  roomEnabled: true,
  /**
   * 每轮自动注入：'auto'（默认）= 宿主有 ctx.systemPrompt 就把记忆段塞进系统提示词，
   * 每轮都能看见——这才是「同款」的体验；
   * 'tool' = 不注入记忆，只留 hp_* 工具让 agent 自己取（bound 模式未绑定时保留首次引导；
   * 效果等于记忆不存在）。
   * auto 的代价：每轮多付 injectMaxChars 字（默认 2600 字 ≈ 900–1300 token），可调小。
   */
  injectMode: 'auto',
  /** 自动注入时最多注入多少字符（防止把上下文吃光） */
  injectMaxChars: 2600,
  /** 每天几点做一次「固定回忆」（0–23，本地时间） */
  recallHour: 21,
  recallMinute: 5,
  /** 每次回忆几条 */
  recallCount: 3,
  /** 清理定时器周期（分钟） */
  sweepMinutes: 1,
  /** 是否在控制台打印详细日志 */
  verbose: true,
  /** 桥接模式：把 QQ 桥接脑当唯一权威（externalApi 非空即启用） */
  externalApi: '',
  externalKey: '',
  externalToken: '',
  externalFile: '',
  activityLog: true,
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  cfg.enabled = cfg.enabled !== false
  cfg.space = String(cfg.space || 'default').trim() || 'default'
  cfg.followSession = cfg.followSession === true
  cfg.scopeMode = ['bound','shared','session'].includes(cfg.scopeMode) ? cfg.scopeMode : 'bound'
  if (cfg.followSession) cfg.scopeMode = 'session'
  cfg.roomEnabled = cfg.roomEnabled !== false
  spaceKey(cfg.space)
  cfg.injectMode = cfg.injectMode === 'tool' ? 'tool' : 'auto'
  cfg.injectMaxChars = clampInt(cfg.injectMaxChars, 300, 12000, DEFAULTS.injectMaxChars)
  cfg.recallHour = clampInt(cfg.recallHour, 0, 23, DEFAULTS.recallHour)
  cfg.recallMinute = clampInt(cfg.recallMinute, 0, 59, DEFAULTS.recallMinute)
  cfg.recallCount = clampInt(cfg.recallCount, 1, 12, DEFAULTS.recallCount)
  cfg.sweepMinutes = clampInt(cfg.sweepMinutes, 1, 60, DEFAULTS.sweepMinutes)
  cfg.externalApi = String(cfg.externalApi || '').trim()
  cfg.externalKey = String(cfg.externalKey || '').trim()
  cfg.externalToken = String(cfg.externalToken || '').trim()
  cfg.externalFile = String(cfg.externalFile || '').trim()
  cfg.activityLog = cfg.activityLog !== false
  return cfg
}

function clampInt(v, min, max, dflt) {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** 有 schemastery 时给 DSH 一个正经的设置表单；没有就退化成普通对象 */
export const Config = z
  ? z.object({
    enabled: z.boolean().default(true).description('总开关'),
    homeDir: z.string().default('').description('研究版记忆目录（留空 = $DSH_HOME/hippocampus-room-preview）'),
    space: z.string().default('default').description('shared 模式共用的空间名；bound 模式由用户在页面选择'),
    followSession: z.boolean().default(false).description('旧参数：true 等价于每会话独立；false 时使用 scopeMode'),
    scopeMode: z.union([z.const('bound'), z.const('shared'), z.const('session')]).default('bound').description('bound=用户绑定会话与记忆空间；shared=明确共享一个空间；session=每会话独立'),
    roomEnabled: z.boolean().default(true).description('启用本机小屋，失败不阻塞记忆工具'),
    injectMode: z.union([z.const('tool'), z.const('auto')]).default('auto').description('auto = 每轮自动注入记忆段；tool = 手动取记忆；bound 模式未绑定时两者均提供首次引导'),
    injectMaxChars: z.number().default(2600).description('自动注入的最大字符数'),
    recallHour: z.number().default(21).description('每天固定回忆的整点'),
    recallMinute: z.number().default(5).description('每天固定回忆的分'),
    recallCount: z.number().default(3).description('每次回忆几条'),
    sweepMinutes: z.number().default(1).description('清理周期（分钟）'),
    verbose: z.boolean().default(true).description('控制台日志'),
    externalApi: z.string().default('').description('桥接 API base（如 http://127.0.0.1:3100）；非空 = 桥接模式，读写 QQ 桥接脑'),
    externalKey: z.string().default('').description('桥接的会话 key（如 private:<user-id>）'),
    externalToken: z.string().default('').description('桥接控制台令牌（state/console-token 的内容）'),
    externalFile: z.string().default('').description('桥接脑文件路径（如 …\qq-bridge\state\brain.json），读用'),
    activityLog: z.boolean().default(true).description('记录本地记忆活动（不另存正文），供活动面板按天查看'),
  })
  : DEFAULTS

/* ────────────────────────────── 工具 schema 小工具 ────────────────────────────── */

const S = {
  str: (description, extra = {}) => ({ type: 'string', description, ...extra }),
  num: (description, extra = {}) => ({ type: 'number', description, ...extra }),
  bool: (description, extra = {}) => ({ type: 'boolean', description, ...extra }),
  arr: (description, items, extra = {}) => ({ type: 'array', description, items, ...extra }),
}

/**
 * 组装工具参数。DSH 的 defineTool 用的是自研 DSL：
 * 属性节点上写 required:true（不是父级 required 数组），对象类型要显式 additionalProperties。
 */
function params(props, required = []) {
  const merged = { ...props }
  for (const key of required) if (merged[key]) merged[key] = { ...merged[key], required: true }
  return merged
}

const textOutput = {
  schema: { type: 'json' },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
}

/** 工具返回值统一过一遍：宿主只吃无损 JSON */
function safe(v) {
  if (v === undefined || v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

/* ────────────────────────────── 主入口 ────────────────────────────── */

export function apply(ctx, config) {
  const reportInitError = error => {
    try { ctx.tools.register(defineTool({ name: 'hp_space', description: '查看记忆插件初始化结果', parameters: params({}), output: textOutput, execute: async () => ({ok:false,code:'MEMORY_INIT_ERROR',error:error.message}) })) }
    catch { console.warn('[hippocampus] 记忆初始化未完成：'+error.message) }
  }
  let cfg
  try { cfg = normalizeConfig(config) } catch(error) { reportInitError(error); return }
  const log = cfg.verbose
    ? (...a) => { try { console.log('[hippocampus]', ...a) } catch { /* ignore */ } }
    : () => {}

  if (!cfg.enabled) { log('已被设置关闭（enabled=false），不挂载'); return }

  const bridgeMode = isBridge(cfg)
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const homeDir = cfg.homeDir ? path.resolve(cfg.homeDir) : path.join(dshHome, 'hippocampus-room-preview')

  let hub
  try {
    if (bridgeMode) throw new Error('本研究版仅支持插件本地模式；请使用独立目录，不连接 QQ 桥接')
    hub = acquireSpaceHub(homeDir, log)
  } catch (error) {
    log('记忆初始化已停止：' + error.message)
    reportInitError(error)
    return
  }
  const store = hub.store
  const scope = new AsyncLocalStorage()
  const resolveSession = id => cfg.scopeMode === 'shared' ? cfg.space : cfg.scopeMode === 'session' ? '会话-' + createHash('sha256').update(id).digest('hex').slice(0,20) : hub.resolve(id)
  const fromContext = context => {
    if (cfg.scopeMode === 'shared') return cfg.space
    const value = resolveSession(sessionId(context))
    if (!value) throw Object.assign(new Error(FIRST_USE_MESSAGE + ' 请调用 hp_space 获取设置链接，由用户确认。'), {code:'SPACE_UNBOUND'})
    return value
  }
  const currentSpace = () => {
    const value = scope.getStore() || (cfg.scopeMode === 'shared' ? cfg.space : null)
    if (!value) throw Object.assign(new Error('没有绑定的记忆空间'),{code:'SPACE_UNBOUND'})
    return value
  }
  const scopedDoc = space => ({version:store.doc.version,updatedAt:store.doc.updatedAt,conversations:Object.hasOwn(store.doc.conversations,space)?{[space]:store.doc.conversations[space]}:{}})
  const activity = createActivityJournal({ dir: homeDir, log })
  if (cfg.activityLog) activity.start()
  const quietJournal = { ...activity, start() {}, append() {} }
  const hp = instrumentEngine(hpEngine, {journal:cfg.activityLog?activity:quietJournal,space:currentSpace,enabled:()=>cfg.activityLog,onMutation:()=>store.touch()})
  const dashboards = new Map()
  function getDashboard(space,session=null) {
    const panelKey=JSON.stringify([space,session])
    if (!dashboards.has(panelKey)) dashboards.set(panelKey,createDashboardLifecycle(async()=>{
      const {startDashboard}=await import('./dashboard-server.mjs')
      const roomEntry=cfg.roomEnabled&&session?async()=>{
        if(resolveSession(session)!==space)throw new Error('会话已切换空间，请重新调用 hp_dashboard')
        const service=await roomServer.get();return{url:service.issue(session,space),space}
      }:null
      return startDashboard({file:store.file,dir:homeDir,space,journal:cfg.activityLog?activity:quietJournal,getDoc:()=>scopedDoc(space),strictSpace:true,roomEntry})
    }))
    return dashboards.get(panelKey).get()
  }
  // The room remains an optional child service; no Cordis service is accessed here.
  let rooms, roomInitError
  try { rooms = hub.rooms ??= createRoomState(homeDir) } catch(error) { roomInitError=error; log('小屋存档暂不可读，记忆工具继续运行：'+error.message) }
  let autonomyBridge=null
  const life=rooms?createRoomLife({rooms,listSpaces:()=>cfg.scopeMode==='shared'?[cfg.space]:hub.list(),resolveSpace:resolveSession,getBridge:()=>autonomyBridge,log}):null
  if(cfg.roomEnabled && typeof ctx.inject==='function')ctx.inject(['agents'],function hippocampusAutonomy(child){
    try {
      const agents=child.agents
      if(!agents||typeof agents.get!=='function'||!hostDeps.createUserMessage)return
      const bridge={getAgent:id=>agents.get(id),createMessage:hostDeps.createUserMessage}
      child.effect(()=>{autonomyBridge=bridge;return()=>{if(autonomyBridge===bridge)autonomyBridge=null}})
    } catch(error){log('自主活动接口未连接，普通记忆继续运行：'+error.message)}
  })
  const roomServer = createDashboardLifecycle(()=>{ if(roomInitError)throw roomInitError; return startRoomService({hub,rooms,life,resolveSpace:resolveSession,dashboard:getDashboard}) })

  /** 当前记忆空间的状态容器（引擎就地改它） */
  const state = () => {
    if (bridgeMode) {
      // 读桥接脑文件，包装成插件形状的会话容器（conv.brain = {items,…}）
      if (!cfg.externalFile) throw new Error('桥接模式缺 externalFile（桥接 brain.json 路径）')
      const raw = fs.readFileSync(cfg.externalFile, 'utf8')
      const doc = JSON.parse(raw)
      const conv = doc.conversations?.[keyOf(cfg)] || {}
      return conv && typeof conv.brain === 'object' && conv.brain ? conv : { brain: conv }
    }
    return store.stateFor(currentSpace())
  }
  /** 取（必要时建）会话的记忆对象 */
  const st = () => state()
  /** brain 对象本身（只有需要 .archive 时才用） */
  const brain = () => hp.ensureBrain(state())

  const dirty = () => store.touch()
  const now = () => Date.now()

  const registered = []
  const tool = (spec) => {
    try {
      const t = ctx.tools.register(defineTool({ ...spec, output: textOutput, async execute(args, exec) {
        try {
          if (['hp_space','hp_room'].includes(spec.name)) return safe(await spec.execute(args||{},exec))
          const selected=fromContext(exec)
          return await scope.run(selected,async()=>safe(await spec.execute(args||{},exec)))
        } catch(error) {
          return {ok:false,code:error.code||'MEMORY_ERROR',error:error.message,
            ...(error.code==='SPACE_UNBOUND'?{needsBinding:true,nextTool:'hp_space',userMessage:FIRST_USE_MESSAGE}:{})}
        }
      } }))
      registered.push(spec.name)
      return t
    } catch (e) {
      log(`工具 ${spec.name} 注册失败：${e?.message ?? e}`)
      return null
    }
  }

  // DSH 0.2 的 assembleContextFor() 仅提供 agent/scope/signal。
  // inbox 在 assemble 前发出 claimed 事件，按 agent 保存当轮用户话语，避免跨会话串用。
  const topicsByAgent = new WeakMap()
  let stopTopic = null
  if (typeof ctx.on === 'function') {
    try {
      stopTopic = ctx.on('agent/inbox/claimed', (...args) => {
        const event = args.find((v) => v && typeof v === 'object' && v.agent && v.message)
        if (!event || typeof event.agent !== 'object') return
        life?.claimed(event.agent.id,event.message)
        const text = userMessageText(event.message)
        if (text === null) return
        if (text) topicsByAgent.set(event.agent, text)
        else topicsByAgent.delete(event.agent)
      })
    } catch (e) {
      log(`当前话题事件不可用，改用提示词上下文：${e?.message ?? e}`)
    }
  }

  /* ── 注入：每轮把记忆摘要挂进系统提示词 ──
   * DSH 的提示词注册表由 @deepseek-ai/dsh-system-prompt 提供（ctx.systemPrompt）：
   *   section({ name, order, text })  text 可以是函数，每次 assemble 时现算；
   *   段按 order 升序拼接，外部贡献可以用任意有限 order。
   * 我们把记忆放在人设（0）之后、工具文档（1000+）之前——
   * 「她记得什么」属于她是谁的一部分，不属于工具说明。
   */
  const registerPrompt = (promptCtx) => {
    try {
      const systemPrompt = promptCtx.systemPrompt
      if (!systemPrompt || typeof systemPrompt.section !== 'function') {
        log('宿主没提供 systemPrompt——工具仍可用，可用 hp_digest 手动取记忆')
        return
      }
      systemPrompt.section({
        name: cfg.injectMode === 'auto' ? 'hippocampus:memory' : 'hippocampus:onboarding',
        order: 400,
        text: (context) => {
          try {
            const selected = fromContext(context)
            if (cfg.injectMode === 'tool') return ''
            return scope.run(selected, () => {
            const space = selected
            const s = state()
            const bb = hp.ensureBrain(s)
            if (!bb.items || !bb.items.length) return ''
            if (cfg.autoSweep !== false) hp.sweep(s, Date.now())
            const topic = pickTopic(context) || (context?.agent && topicsByAgent.get(context.agent)) || ''
            // 有话题 → 带着它检索 + 水波联想；没话题 → 退回按层发牌（并补一句引导）
            let text = hp.render(s, Date.now(), topic ? { text: topic } : {})
            if (!text) return ''
            if (!topic) text += '\n（这轮若提到旧事，先调 hp_digest({ text: "当前话题" }) 再答，别凭印象说）'
            const rendered = text.length > cfg.injectMaxChars
              ? text.slice(0, cfg.injectMaxChars) + '\n……（记忆太长，后面的这次先不提）'
              : text
            if (cfg.activityLog) activity.append([{ type: 'injected', chars: rendered.length }], { space, operation: 'system-prompt' })
            return rendered
            })
          } catch (e) {
            if (e.code === 'SPACE_UNBOUND') return onboardingPrompt(cfg.roomEnabled)
            if (e.code === 'SESSION_REQUIRED') return ''
            log(`渲染记忆摘要失败：${e?.message ?? e}`)
            return ''
          }
        },
      })
      const promptName = cfg.injectMode === 'auto' ? 'prompt:hippocampus:memory' : 'prompt:hippocampus:onboarding'
      if (!registered.includes(promptName)) registered.push(promptName)
      log('已注册记忆或首次引导提示（order=400，mode=' + cfg.injectMode + '）')
    } catch (e) {
      log(`提示词注入失败（工具仍可用）：${e?.message ?? e}`)
    }
  }
  if (cfg.injectMode === 'auto' || cfg.scopeMode === 'bound') {
    if (typeof ctx.inject === 'function') {
      // Do not await this child: tools must activate even without systemPrompt.
      ctx.inject(['systemPrompt'], function hippocampusPrompt(promptCtx) {
        registerPrompt(promptCtx)
      })
      log('自动注入随 systemPrompt 服务挂载；服务尚未就绪时，记忆工具照常可用')
    } else {
      // Standalone embedders may supply a plain context rather than Cordis.
      registerPrompt(ctx)
    }
  }

  /* ── 写：记一条 ── */
  tool({
    name: 'hp_remember',
    description: '记住一件事。重要度/分类/层都可以不给，引擎会自己算（分类看关键词、重要度看措辞、层看稳定性）。重复的话会强化同一条而不是新增。',
    parameters: params({
      text: S.str('要记的内容（用第一人称、写成一句完整的话，别写成关键词）'),
      category: S.str('可选分类：daily|watch|food|place|event|feeling|study|person|promise|self|misc'),
      salience: S.num('可选重要度 0–100（不给就自动打分）'),
      tier: S.str('可选强制层：instant|short|long|permanent（一般不要给）'),
      tags: S.arr('可选标签', S.str('标签')),
      remind_at: S.num('可选：到点提醒的时间戳（毫秒），用于「说好几点提醒我」'),
      source: S.str('可选来源标记，例如 qzone / diary / tool'),
    }, ['text']),
    async execute(args) {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/append', {
          key: keyOf(cfg), text: args.text, category: args.category, salience: args.salience,
          tier: args.tier, tags: args.tags, remindAt: args.remind_at,
        })
        if (r.skipped) return { ok: false, skipped: true, reason: r.reason || '没达到记事门槛（流水类记忆不写）' }
        const it = r.item || {}
        return { ok: true, id: it.id, tier: it.tier, category: it.category, salience: it.salience, stabilityHours: it.stabilityHours, duplicate: false }
      }
      const before = hp.list(st()).length
      const item = hp.remember(st(), {
        text: args.text,
        category: args.category,
        salience: args.salience,
        tier: args.tier,
        tags: args.tags,
        remindAt: args.remind_at,
        source: args.source,
      })
      dirty()
      const after = hp.list(st()).length
      if (!item) {
        // 引擎的编码门槛会拒掉「太像流水」的内容（太短、daily/watch 且重要度不足），
        // 此时 remember 返回 null。这不是出错，但要如实告诉调用方「没记」，
        // 否则读 item.id 会直接抛 TypeError（0.1.6 及以前就会）。
        return {
          ok: false,
          skipped: true,
          reason: '这条没记：daily/watch 类别的重要度不足。确需保存时，可提高 salience，或按实际内容指定正确的 category。',
          total: after,
        }
      }
      return {
        ok: true,
        id: item.id,
        tier: item.tier,
        category: item.category,
        salience: item.salience,
        stabilityHours: item.stabilityHours,
        duplicate: after === before,
        note: after === before ? '与已有记忆相同的前 20 字，已合并强化（不是新增一条）' : '已记下',
      }
    },
  })

  /* ── 读：按话头想起来 ── */
  tool({
    name: 'hp_recall',
    description: '按一句话/一个话头去记忆里找：返回最相关的那几条（带「几小时前记下、提过几次」这类元信息），以及可选的归档检索结果。',
    parameters: params({
      query: S.str('话头（可以为空：空的时候返回当前会注入的记忆全貌）'),
      limit: S.num('最多几条（默认 8）'),
      category: S.str('只看某个分类'),
      include_archive: S.bool('是否同时搜归档区（很久以前、已经淡出活库的）'),
    }),
    async execute(args) {
      const b = brain()
      const limit = clampInt(args.limit, 1, 40, 8)
      if (!args.query) return { ok: true, digest: hp.render(st(), now(), {}) }
      // 注意：引擎 retrieve() 返回的是 [{ item, score, base }]，不是「摊平的记忆对象」
      const rows = hp.retrieve(st(), args.query, { n: limit, category: args.category })
      const out = {
        ok: true,
        query: args.query,
        rows: rows.map((row) => {
          const it = row.item ?? row
          const r = hp.retentionOf(it, now())
          return {
            id: it.id,
            tier: it.tier,
            category: it.category,
            text: it.text,
            retention: Number(r.toFixed(3)),
            ago: hp.agoText(it.lastRecalledAt ?? it.updatedAt ?? it.createdAt, now()),
            hits: it.hits,
            base: row.base === true,
            score: Number((row.score ?? 0).toFixed(3)),
          }
        }),
      }
      if (args.include_archive) {
        const ar = hp.searchArchive(st(), { query: args.query, category: args.category, n: Math.max(3, Math.floor(limit / 2)) })
        out.archive = ar.map(({ item, archivedAt }) => ({
          id: item.id,
          text: item.text,
          category: item.category,
          archivedAgo: hp.agoText(archivedAt || item.updatedAt, now()),
        }))
      }
      return out
    },
  })

  /* ── 看：现在会注入什么 ── */
  tool({
    name: 'hp_digest',
    description: '返回「此刻会进入上下文的记忆块」全文。新会话开始时调一次，就知道自己记得什么；也可以传当前来信做话头，拿到按话头检索后的版本。',
    parameters: params({
      text: S.str('可选：当前对方说的话（给了就按话头检索；优先使用）'),
      query: S.str('text 的兼容别名；同时提供时以非空 text 为准'),
    }),
    async execute(args) {
      const out = hp.render(st(), now(), { text: pickTopic({ userText: args.text, query: args.query }) })
      return { ok: true, chars: out.length, digest: out }
    },
  })

  /* ── 列 / 看单条 ── */
  tool({
    name: 'hp_list',
    description: '按层或分类列出记忆（不含归档），给 id 便于后续订正/封存/钉住。',
    parameters: params({
      tier: S.str('instant|short|long|permanent'),
      category: S.str('分类'),
      limit: S.num('最多几条（默认 30）'),
      include_archive: S.bool('是否列归档'),
    }),
    async execute(args) {
      const b = brain()
      const limit = clampInt(args.limit, 1, 400, 30)
      let rows = hp.list(st())
      if (args.tier) rows = rows.filter((r) => r.tier === args.tier)
      if (args.category) rows = rows.filter((r) => r.category === args.category)
      rows = rows.slice(0, limit)
      const out = {
        ok: true,
        total: hp.list(st()).length,
        rows: rows.map((r) => ({ id: r.id, tier: r.tier, category: r.category, salience: r.salience, text: r.text, pinned: !!r.pinned, sealed: !!r.sealed })),
      }
      if (args.include_archive) out.archive = (b.archive || []).slice(-Math.min(limit, 50)).map((r) => ({ id: r.id, text: r.text, category: r.category }))
      return out
    },
  })

  tool({
    name: 'hp_get',
    description: '看某一条记忆的完整字段（稳定性、留存、被想起次数、订正历史…）。',
    parameters: params({ id: S.str('记忆 id') }, ['id']),
    async execute(args) {
      const b = brain()
      const it = hp.list(st()).find((r) => r.id === args.id) || (b.archive || []).find((r) => r.id === args.id)
      if (!it) return { ok: false, error: '没有这条记忆' }
      return {
        ok: true,
        item: { ...it, retention: Number(hp.retentionOf(it, now()).toFixed(3)) },
        revisions: it.revisions || [],
      }
    },
  })

  /* ── 改 / 删 / 封存 / 钉住 ── */
  tool({
    name: 'hp_revise',
    description: '订正一条记忆（记错了就改）。保留旧版本，标记「改过一次」，并且以后都偏向新版本。可以整条重写，也可以只替换其中一段。',
    parameters: params({
      id: S.str('记忆 id（不给就用 text 去匹配）'),
      text: S.str('要匹配的旧内容片段'),
      new_text: S.str('新的说法'),
    }, ['new_text']),
    async execute(args) {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/revise', { key: keyOf(cfg), id: args.id, text: args.text, newText: args.new_text })
        return { ok: true, item: r.item }
      }
      const r = hp.revise(st(), { id: args.id, text: args.text, newText: args.new_text })
      dirty()
      return safe(r)
    },
  })

  tool({
    name: 'hp_forget',
    description: '真的删掉一条记忆。会留一个墓碑（不可复活），但内容不再出现在任何地方。删除是不可逆的，只在明确要求时用。',
    parameters: params({ id: S.str('记忆 id'), text: S.str('或按内容片段匹配') }),
    async execute(args) {
      if (bridgeMode) {
        let id = args.id
        if (!id && args.text) id = hp.list(st()).find((x) => x.text.includes(args.text))?.id
        if (!id) return { ok: false, error: '没有这条记忆（请给 id）' }
        const r = await bridgeCall(cfg, 'POST', '/api/brain/forget', { key: keyOf(cfg), id })
        return { ok: true, id: r.id }
      }
      const r = hp.forget(st(), args.id || hp.list(st()).find((x) => args.text && x.text.includes(args.text))?.id)
      dirty()
      return safe(r)
    },
  })

  tool({
    name: 'hp_seal',
    description: '封存一条记忆：不再主动想起、不再进上下文，需要时仍能按分类检索到；到期后转进归档（不是删掉）。用来处理「不想天天想起但也不想删」的事。',
    parameters: params({ id: S.str('记忆 id'), sealed: S.bool('true 封存 / false 解封（默认 true）') }, ['id']),
    async execute(args) {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/seal', { key: keyOf(cfg), id: args.id, sealed: args.sealed !== false })
        return { ok: true, item: r.item }
      }
      const r = hp.sealMemory(st(), args.id, args.sealed !== false)
      dirty()
      return safe(r)
    },
  })

  tool({
    name: 'hp_pin',
    description: '钉住一条记忆：不进遗忘曲线、不会被清理淘汰、合并不丢、每轮单独出现在【不能忘的】里。用来保护「必须长期记得」的事实。',
    parameters: params({ id: S.str('记忆 id'), pinned: S.bool('true 钉住 / false 取消（默认 true）') }, ['id']),
    async execute(args) {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/pin', { key: keyOf(cfg), id: args.id, pinned: args.pinned !== false })
        return { ok: true, id: r.id, pinned: r.pinned }
      }
      const r = hp.pin(st(), args.id, args.pinned !== false)
      dirty()
      return safe(r)
    },
  })

  /* ── 人 ── */
  tool({
    name: 'hp_person',
    description: '记一个「人」：名字 + 关于他/她的事实。人是一等公民——单独一块【我认识的人】，不和视频记忆抢配额。',
    parameters: params({
      name: S.str('这个人怎么称呼'),
      facts: S.arr('关于这个人的事实（一条一句）', S.str('事实')),
      salience: S.num('可选重要度 0–100'),
    }, ['name']),
    async execute(args) {
      const b = brain()
      const facts = (args.facts && args.facts.length ? args.facts : ['']).filter(Boolean)
      if (bridgeMode) {
        const made = []
        for (const f of facts.length ? facts : ['']) {
          const text = f ? `${args.name}：${f}` : `认识 ${args.name}`
          const r = await bridgeCall(cfg, 'POST', '/api/brain/append', { key: keyOf(cfg), text, category: 'person', salience: args.salience, tags: [args.name] })
          if (r.item) made.push({ id: r.item.id, tier: r.item.tier, text: r.item.text })
        }
        return { ok: true, person: args.name, created: made, skipped: (facts.length ? facts : ['']).length - made.length }
      }
      const made = []
      for (const f of facts.length ? facts : ['']) {
        const text = f ? `${args.name}：${f}` : `认识 ${args.name}`
        made.push(hp.remember(st(), { text, category: 'person', salience: args.salience, tags: [args.name] }))
      }
      dirty()
      return {
        ok: true,
        person: args.name,
        created: made.filter(Boolean).map((m) => ({ id: m.id, tier: m.tier, text: m.text })),
        skipped: made.filter((m) => !m).length,
      }
    },
  })

  /* ── 统计 / 维护 ── */
  tool({
    name: 'hp_stats',
    description: '记忆体检：各层条数、封存/归档/归纳/钉住、平均留存、关系网规模、最近会注入多少字。',
    parameters: params({}),
    async execute() {
      const b = brain()
      const s = hp.stats(st(), now())
      const web = hp.webStats(st())
      const rendered = hp.render(st(), now(), {})
      return { ok: true, home: bridgeMode ? cfg.externalFile : homeDir, space: currentSpace(), stats: s, web, digestChars: rendered.length }
    },
  })

  tool({
    name: 'hp_sweep',
    description: '手动跑一次清理：把低于遗忘线的记忆归档/淘汰、给够格的记忆升层、必要时做语义归纳。平时每分钟自动跑，这里用于手动触发。',
    parameters: params({}),
    async execute() {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/sweep', { key: keyOf(cfg) })
        return { ok: true, sweep: r.summary, stats: r.stats }
      }
      const r = hp.sweep(st(), now())
      const sem = hp.semanticize(st(), now())
      dirty()
      return { ok: true, sweep: safe(r), semantic: safe(sem) }
    },
  })

  tool({
    name: 'hp_recall_daily',
    description: '立刻做一次「固定回忆」：从长期/永久里按「越模糊越容易被挑中」抽几条，返回它们在说什么。每天 21:05 会自动跑一次，这里用于手动。',
    parameters: params({ count: S.num('几条（默认取配置值）') }),
    async execute(args) {
      if (bridgeMode) {
        const r = await bridgeCall(cfg, 'POST', '/api/brain/recall', { key: keyOf(cfg), n: clampInt(args.count, 1, 12, cfg.recallCount) })
        return { ok: true, picked: (r.picked || []).map((it) => ({ id: it.id, text: it.text, tier: it.tier, ago: it.ago || '' })) }
      }
      const b = brain()
      const picked = hp.pickRecall(st(), clampInt(args.count, 1, 12, cfg.recallCount), now(), {})
      dirty()
      return {
        ok: true,
        picked: (picked.items || picked.rows || picked || []).map((r) => ({ id: r.id, text: r.text, tier: r.tier, ago: hp.agoText(r.lastTouch ?? r.updatedAt, now()) })),
      }
    },
  })

  /* ── 导入 / 导出 ── */
  tool({
    name: 'hp_export',
    description: '只导出当前绑定记忆空间：format=json（迁移/备份，默认）或 format=md（人可读）。',
    parameters: params({
      path: S.str('可选导出文件名，不能含目录；文件写入当前空间专属 exports 目录'),
      format: S.str('json 或 md，默认 json'),
    }),
    async execute(args) {
      if (bridgeMode) {
        const doc = JSON.parse(fs.readFileSync(cfg.externalFile, 'utf8'))
        const md = String(args.format || 'json').toLowerCase() === 'md'
        const target = args.path ? path.resolve(args.path) : path.join(homeDir, `export-${Date.now()}.${md ? 'md' : 'json'}`)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, md ? hp.toMarkdown(doc) : JSON.stringify(doc, null, 2), 'utf8')
        return { ok: true, path: target, bytes: fs.statSync(target).size }
      }
      store.flush()
      const md = String(args.format || 'json').toLowerCase() === 'md'
      const filename=args.path||`export-${Date.now()}.${md?'md':'json'}`
      if(typeof filename!=='string'||path.basename(filename)!==filename||/[\\/:\x00-\x1f]/.test(filename)||!filename.endsWith(md?'.md':'.json'))throw new Error('导出只接受 .json 或 .md 文件名，不能覆盖目录里的其他文件')
      const target=path.join(homeDir,'exports',createHash('sha256').update(currentSpace()).digest('hex').slice(0,20),filename)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, md ? hp.toMarkdown(scopedDoc(currentSpace())) : JSON.stringify(scopedDoc(currentSpace()), null, 2), 'utf8')
      return { ok: true, path: target, bytes: fs.statSync(target).size }
    },
  })

  tool({
    name: 'hp_import',
    description: '从 JSON 恢复当前绑定空间；文件只能包含同名空间，导入前自动备份该空间，不改其他空间。',
    parameters: params({ path: S.str('要导入的文件') }, ['path']),
    async execute(args) {
      if (bridgeMode) return { ok: false, error: '桥接模式下记忆由 QQ 桥接管理，不能用本插件导入。请在桥接侧操作，或临时切回本地模式。' }
      const raw = JSON.parse(fs.readFileSync(path.resolve(args.path), 'utf8'))
      const space=currentSpace(), keys=Object.keys(raw.conversations||{})
      if(keys.length!==1||keys[0]!==space||!raw.conversations[space]||typeof raw.conversations[space]!=='object')throw new Error('只能导入当前同名记忆空间；不能在会话工具中覆盖其他空间')
      const backup=path.join(homeDir,'backups','space-'+createHash('sha256').update(space).digest('hex').slice(0,16)+'-'+Date.now()+'.json')
      fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify(scopedDoc(space)),'utf8')
      store.replaceDoc({...store.doc,conversations:{...store.doc.conversations,[space]:raw.conversations[space]}})
      return { ok: true, conversations: 1, space, backup }
    },
  })

  tool({
    name: 'hp_dashboard',
    description: '返回当前空间的本机记忆看板地址。首次查看时启动该空间的面板，随后随插件运行；启动失败时可重试，不修改记忆。',
    parameters: params({}),
    async execute(_args,exec) {
      try {
        let identity=null;try{identity=sessionId(exec)}catch{}
        const panel = await getDashboard(currentSpace(),identity)
        return { ok: true, url: panel.url, space: currentSpace(), refreshIntervalMs: 60000, mode: bridgeMode ? 'observation' : 'engine',
          note: bridgeMode ? '只读观察指定脑文件；不回溯此前活动，也不改动桥接。' : cfg.activityLog ? '本机活动面板，日志不另存正文。显示的是插件操作，不代表模型已经采纳记忆。' : '活动记录已关闭；面板仍可查看当前记忆状态。' }
      } catch (e) { return { ok: false, error: `面板未能启动，记忆工具继续可用：${e?.message || e}` } }
    },
  })

  /* ────────────── 后台：清理 + 每日回忆 ────────────── */

  tool({name:'hp_space',description:'首次使用先调用：提醒不同的鱼选择不同记忆空间；查看当前绑定，返回本机设置页供用户选择确认。工具不能自行指定空间。',parameters:params({}),async execute(_args,exec){
    const id=sessionId(exec),space=resolveSession(id)
    if(!cfg.roomEnabled)return{ok:true,sessionId:id,space,note:'小屋已关闭；绑定需在本地 spaces.json 中配置'}
    const service=await roomServer.get()
    if(cfg.scopeMode!=='bound')return{ok:true,sessionId:id,space,url:service.issue(id,space),note:'当前为 '+cfg.scopeMode+' 模式；需要用户选择空间时请在插件配置改用 bound'}
    return{ok:true,sessionId:id,space,needsBinding:!space,setupUrl:service.issue(id,space,true),
      userMessage:space?'当前会话已绑定：'+space:FIRST_USE_MESSAGE,
      note:'请用户亲自选择当前会话属于哪个记忆空间；绑定完成后重新调用 hp_space 核对。'}
  }})
  tool({name:'hp_room',description:'打开当前空间的小屋；settings=true 返回小屋开关、自主生活设置入口。未绑定时先由用户选择空间。',parameters:params({settings:S.bool('可选：打开小屋设置')}),async execute(args,exec){
    if(!cfg.roomEnabled)return{ok:false,error:'小屋功能已关闭'}
    const id=sessionId(exec),space=resolveSession(id),service=await roomServer.get()
    return{ok:true,space,url:service.issue(id,space)+(space&&args.settings?'&settings=1':''),needsBinding:!space,note:space?'请在运行 DSH 的电脑打开；小屋里的电脑已接入本空间记忆面板':'请用户在页面中选择空间；选择后 AI 再调用 hp_room_state'}
  }})
  tool({name:'hp_room_state',description:'查看当前空间的房间状态、便签、家具和最近 8 次动作结果；queued/running 尚未完成，不能声称动作已完成。',parameters:params({}),async execute(){if(roomInitError)throw roomInitError;const room=rooms.current(currentSpace());let environment=null;try{environment=JSON.parse(room.storage['dayu.seaside.room.v1']||'null')}catch{}const {storage,...rest}=room;return{ok:true,...rest,environment,note:storage['dayu.computer.note.v1']||''}}})
  tool({name:'hp_room_action',description:'安排一个房间动作：优先用 vector=[楼层,活动,事项]（可查 hp_room_catalog），也兼容 action。两者只填一种。queued 不等于完成；自主轮次须携带 runId。',parameters:params({vector:S.arr('三个整数：[楼层,活动,事项]',S.num('编号')),vectorVersion:S.num('动作目录版本，当前为 1'),runId:S.str('仅自主生活触发时提供其 runId'),action:S.str('兼容指令：light|curtains|weather|time|note|say|activity|furniture|view|kitchen|observe'),on:S.bool('灯或窗帘开关'),value:S.str('具体动作值，优先查询动作目录'),text:S.str('便签或说话内容'),item:S.str('家具 ID'),x:S.num('家具 x'),z:S.num('家具 z'),rotation:S.num('旋转弧度')}),async execute(args,exec){
    if(!cfg.roomEnabled)return{ok:false,error:'小屋功能已关闭'}
    if(roomInitError)throw roomInitError
    let identity=null;try{identity=sessionId(exec)}catch(error){if(cfg.scopeMode!=='shared'||args.runId)throw error}
    if(identity)life.authorizeAction(identity,currentSpace(),args.runId)
    return rooms.enqueue(currentSpace(),args)
  }})
  tool({name:'hp_room_catalog',description:'查询版本化动作目录。vector=[楼层,活动,事项]，楼层1=一楼，2=阁楼；先查总览，再按 floor/activity 查看细项。',parameters:params({floor:S.num('1 一楼，2 阁楼'),activity:S.num('可选：此楼层活动编号')}),async execute(args){return{ok:true,...actionCatalog(args)}}})
  tool({name:'hp_room_life',description:'查看当前空间的自主生活状态、今日唤醒次数和设置链接。默认关闭，仅用户在页面确认费用后开启；此工具不能代替用户启用或提高额度。',parameters:params({}),async execute(_args,exec){
    if(!cfg.roomEnabled)return{ok:false,error:'小屋功能已关闭'}
    if(roomInitError)throw roomInitError
    const service=await roomServer.get(),space=currentSpace()
    return {ok:true,...life.status(space),settingsUrl:service.issue(sessionId(exec),space)+'&settings=1'}
  }})

  const recalledDays=new Map()
  const tick=()=>{
    const all=cfg.scopeMode==='shared'?[cfg.space]:hub.list()
    for(const space of all)scope.run(space,()=>{try{
      const d=new Date();hp.sweep(st(),d.getTime());hp.semanticize(st(),d.getTime());dirty()
      const day=hp.todayStr(d)
      if(d.getHours()===cfg.recallHour&&d.getMinutes()===cfg.recallMinute&&recalledDays.get(space)!==day){recalledDays.set(space,day);hp.pickRecall(st(),cfg.recallCount,d.getTime(),{});dirty()}
    }catch(error){log('空间维护暂不可用：'+error.message)}})
  }
  const timer=setInterval(tick,cfg.sweepMinutes*60000);timer.unref?.();tick()
  const lifeTimer=cfg.roomEnabled&&life?setInterval(()=>void life.tick(),15000):null;lifeTimer?.unref?.()
  let disposed=false
  ctx.effect(()=>()=>{
    if(disposed)return;disposed=true
    clearInterval(timer);clearInterval(lifeTimer);life?.close();autonomyBridge=null;stopTopic?.()
    return Promise.allSettled([roomServer.close(),...[...dashboards.values()].map(d=>d.close())]).finally(()=>{if(hub.refs===1){try{rooms?.shutdown()}catch{}}hub.release()})
  },'hippocampus: 保存记忆并停止空间服务')
  if(cfg.roomEnabled)void roomServer.get().catch(error=>log('小屋未启动，记忆工具继续运行：'+error.message))
  if(cfg.scopeMode==='shared')void getDashboard(cfg.space).catch(error=>log('看板未启动：'+error.message))
  log('测试版已挂载；空间模式='+cfg.scopeMode+'；工具='+registered.filter(n=>n.startsWith('hp_')).length)

}

export default { name, inject, Config, apply }
