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
 * 落盘：`<home>/brain.json`（默认 `$DSH_HOME/hippocampus/`）。
 * 换会话、换窗口、重启 DSH 都不会丢——记忆是侧车文件，不在会话记录里。
 * ============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

import { loadHostDeps } from './hostdeps.mjs'

// 宿主半端要用的一点点东西：拿不到也不许让整条插件不激活
const hostDeps = await loadHostDeps()
const z = hostDeps.z
const defineTool = hostDeps.defineTool

import * as hp from './hippocampus.js'
import { createStore } from './store.js'
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
  /** 家目录；留空 = $DSH_HOME/hippocampus（DSH_HOME 缺省 ~/.dsh） */
  homeDir: '',
  /** 记忆空间名：默认所有人共用一个脑；想按人格分开就改它 */
  space: 'default',
  /** 记忆空间是否跟着 DSH 会话走（默认 false：全局一份，换会话也记得） */
  followSession: false,
  /**
   * 每轮自动注入：'auto'（默认）= 宿主有 ctx.systemPrompt 就把记忆段塞进系统提示词，
   * 每轮都能看见——这才是「同款」的体验；
   * 'tool' = 不注入，只留 hp_* 工具让 agent 自己取（省 token，但绝大多数 agent 不会主动调，
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
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  cfg.enabled = cfg.enabled !== false
  cfg.space = String(cfg.space || 'default').trim() || 'default'
  cfg.followSession = cfg.followSession === true
  cfg.injectMode = cfg.injectMode === 'tool' ? 'tool' : 'auto'
  cfg.injectMaxChars = clampInt(cfg.injectMaxChars, 300, 12000, DEFAULTS.injectMaxChars)
  cfg.recallHour = clampInt(cfg.recallHour, 0, 23, DEFAULTS.recallHour)
  cfg.recallMinute = clampInt(cfg.recallMinute, 0, 59, DEFAULTS.recallMinute)
  cfg.recallCount = clampInt(cfg.recallCount, 1, 12, DEFAULTS.recallCount)
  cfg.sweepMinutes = clampInt(cfg.sweepMinutes, 1, 60, DEFAULTS.sweepMinutes)
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
    homeDir: z.string().default('').description('记忆库目录（留空 = $DSH_HOME/hippocampus）'),
    space: z.string().default('default').description('记忆空间名（换名字 = 换一个脑）'),
    followSession: z.boolean().default(false).description('记忆空间跟着当前会话走；默认 false = 全局一份，换了会话也记得'),
    injectMode: z.union([z.const('tool'), z.const('auto')]).default('auto').description('auto = 每轮自动注入记忆段（推荐）；tool = 不注入，只留 hp_* 工具手动取'),
    injectMaxChars: z.number().default(2600).description('自动注入的最大字符数'),
    recallHour: z.number().default(21).description('每天固定回忆的整点'),
    recallMinute: z.number().default(5).description('每天固定回忆的分'),
    recallCount: z.number().default(3).description('每次回忆几条'),
    sweepMinutes: z.number().default(1).description('清理周期（分钟）'),
    verbose: z.boolean().default(true).description('控制台日志'),
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
  const cfg = normalizeConfig(config)
  const log = cfg.verbose
    ? (...a) => { try { console.log('[hippocampus]', ...a) } catch { /* ignore */ } }
    : () => {}

  if (!cfg.enabled) { log('已被设置关闭（enabled=false），不挂载'); return }

  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const homeDir = cfg.homeDir ? path.resolve(cfg.homeDir) : path.join(dshHome, 'hippocampus')

  let store
  try {
    store = createStore({ dir: homeDir, log })
    store.load()
  } catch (e) {
    log(`记忆库初始化失败（插件继续跑，但只读内存）：${e?.message ?? e}`)
    store = createStore({ dir: path.join(os.tmpdir(), 'dsh-hippocampus'), log })
    store.load()
  }

  /** 当前记忆空间的状态容器（引擎就地改它） */
  const state = () => store.stateFor(cfg.space)
  /** 取（必要时建）会话的记忆对象 */
  const st = () => state()
  /** brain 对象本身（只有需要 .archive 时才用） */
  const brain = () => hp.ensureBrain(state())

  const dirty = () => store.touch()
  const now = () => Date.now()

  const registered = []
  const tool = (spec) => {
    try {
      const t = ctx.tools.register(defineTool({ ...spec, output: textOutput, async execute(args, exec) { return safe(await spec.execute(args || {}, exec)) } }))
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
        name: 'hippocampus:memory',
        order: 400,
        text: (context) => {
          try {
            const sessId = String(
              context?.agent?.session?.header?.id ?? context?.agent?.session?.id ?? context?.session?.id ?? ''
            )
            // 默认全局一份：DSH 每次新会话的 id 都不同，跟着会话走会「换会话就失忆」
            const space = (cfg.followSession && sessId) || cfg.space
            const s = store.stateFor(space)
            const bb = hp.ensureBrain(s)
            if (!bb.items || !bb.items.length) return ''
            if (cfg.autoSweep !== false) hp.sweep(s, Date.now())
            const topic = pickTopic(context) || (context?.agent && topicsByAgent.get(context.agent)) || ''
            // 有话题 → 带着它检索 + 水波联想；没话题 → 退回按层发牌（并补一句引导）
            let text = hp.render(s, Date.now(), topic ? { text: topic } : {})
            if (!text) return ''
            if (!topic) text += '\n（这轮若提到旧事，先调 hp_digest({ text: "当前话题" }) 再答，别凭印象说）'
            return text.length > cfg.injectMaxChars
              ? text.slice(0, cfg.injectMaxChars) + '\n……（记忆太长，后面的这次先不提）'
              : text
          } catch (e) {
            log(`渲染记忆摘要失败：${e?.message ?? e}`)
            return ''
          }
        },
      })
      if (!registered.includes('prompt:hippocampus:memory')) registered.push('prompt:hippocampus:memory')
      log('已挂进系统提示词（order=400，mode=auto）')
    } catch (e) {
      log(`提示词注入失败（工具仍可用）：${e?.message ?? e}`)
    }
  }
  if (cfg.injectMode === 'auto') {
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
      return { ok: true, home: homeDir, space: cfg.space, stats: s, web, digestChars: rendered.length }
    },
  })

  tool({
    name: 'hp_sweep',
    description: '手动跑一次清理：把低于遗忘线的记忆归档/淘汰、给够格的记忆升层、必要时做语义归纳。平时每分钟自动跑，这里用于手动触发。',
    parameters: params({}),
    async execute() {
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
    description: '把整个记忆库导出成文件：format=json（迁移/备份，默认）或 format=md（人可读）。',
    parameters: params({
      path: S.str('导出到哪个文件（留空 = 家目录下 export-<时间戳>.<json|md>）'),
      format: S.str('json 或 md，默认 json'),
    }),
    async execute(args) {
      store.flush()
      const md = String(args.format || 'json').toLowerCase() === 'md'
      const target = args.path ? path.resolve(args.path) : path.join(homeDir, `export-${Date.now()}.${md ? 'md' : 'json'}`)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, md ? hp.toMarkdown(store.doc) : JSON.stringify(store.doc, null, 2), 'utf8')
      return { ok: true, path: target, bytes: fs.statSync(target).size }
    },
  })

  tool({
    name: 'hp_import',
    description: '从 hp_export 导出的 JSON 恢复记忆库（会覆盖当前库，先自己备份）。',
    parameters: params({ path: S.str('要导入的文件') }, ['path']),
    async execute(args) {
      const raw = JSON.parse(fs.readFileSync(path.resolve(args.path), 'utf8'))
      store.replaceDoc(raw)
      return { ok: true, conversations: Object.keys(raw.conversations || {}).length }
    },
  })

  /* ────────────── 后台：清理 + 每日回忆 ────────────── */

  let lastRecallDay = ''
  const tick = () => {
    try {
      const d = new Date()
      hp.sweep(st(), d.getTime())
      hp.semanticize(st(), d.getTime())
      dirty()

      const day = hp.todayStr(d)
      if (d.getHours() === cfg.recallHour && d.getMinutes() === cfg.recallMinute && lastRecallDay !== day) {
        lastRecallDay = day
        const picked = hp.pickRecall(st(), cfg.recallCount, d.getTime(), {})
        const rows = picked.items || picked.rows || picked || []
        log(`每日回忆：${rows.length} 条 —— ${rows.map((r) => (r.text || '').slice(0, 24)).join(' / ')}`)
      }
    } catch (e) {
      log(`定时任务出错：${e?.message ?? e}`)
    }
  }

  const timer = setInterval(tick, cfg.sweepMinutes * 60_000)
  if (typeof timer.unref === 'function') timer.unref()
  tick()

  ctx.effect(() => () => {
    try { clearInterval(timer) } catch { /* ignore */ }
    try { if (typeof stopTopic === 'function') stopTopic() } catch { /* ignore */ }
    try { store.flush() } catch { /* ignore */ }
  }, 'hippocampus: 收摊（写盘 + 停定时器）')

  /* ────────────── 启动日志 ────────────── */
  try {
    const b = brain()
    const s = hp.stats(st(), now())
    const w = hp.webStats(st())
    log(`已挂载：家=${homeDir} 空间=${cfg.space} 记忆=${s.total} 条（瞬时${s.tiers.instant}/短期${s.tiers.short}/长期${s.tiers.long}/永久${s.tiers.permanent}）关系网=${w.words}词/${w.edges}边 工具=${registered.filter((n) => n.startsWith('hp_')).length} 个 注入段=${registered.filter((n) => n.startsWith('prompt:')).length} 个`)
    for (const n of hostDeps.notes) log(`依赖：${n}`)
  } catch (e) {
    log(`启动自检失败：${e?.message ?? e}`)
  }
}

export default { name, inject, Config, apply }
