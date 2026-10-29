/**
 * tests/real-host.mjs —— 用**真宿主包**（从 DSH 桌面版 app.asar 解出来的 dsh-tools / schemastery）
 * 校验本插件：工具注册、参数与输出 schema、入参校验、提示词注入、实跑。
 *
 * 目的：证明「别人的 DSH 装上去能激活」不是靠我们自己的等价实现兜出来的。
 *
 * 用法（先把宿主包解到一个目录，再指给它）：
 *   set DSH_HOST_MODULES=C:\path\to\node_modules\@deepseek-ai
 *   node tests/real-host.mjs
 *
 * 不设 DSH_HOST_MODULES 时直接跳过（退出码 0），普通用户 `npm test` 不受影响。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HOST = process.env.DSH_HOST_MODULES
if (!HOST) {
  console.log('跳过：未设置 DSH_HOST_MODULES（发布前自检用，普通测试不需要）')
  process.exit(0)
}
if (!['dsh-tools', 'dsh-agent'].every((name) => fs.existsSync(path.join(HOST, name, 'package.json')))) {
  console.error(`✗ DSH_HOST_MODULES 需要 dsh-tools 与 dsh-agent（含依赖）：${HOST}`)
  process.exit(1)
}

const real = await import(pathToFileURL(path.join(HOST, 'dsh-tools', 'lib', 'index.js')).href)
const realAgent = await import(pathToFileURL(path.join(HOST, 'dsh-agent', 'lib', 'index.js')).href)

/** 沙盒家目录：别碰真记忆 */
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-real-'))
process.env.DSH_HOME = home

const plugin = await import(pathToFileURL(path.resolve('lib/index.js')).href)
console.log(`插件导出：${Object.keys(plugin).join(', ')}`)
console.log(`inject：${JSON.stringify(plugin.inject)}`)

/** 造一个最小宿主上下文，按配置挂一次插件 */
async function mount(config, homeOverride) {
  const registered = []
  const sections = []
  const listeners = new Map()
  let effects = 0
  const ctx = {
    tools: { register: (tool) => { registered.push(tool); return () => {} } },
    systemPrompt: { section: (spec) => { sections.push(spec); return () => {} } },
    on(name, fn) {
      const callbacks = listeners.get(name) || new Set()
      callbacks.add(fn); listeners.set(name, callbacks)
      return () => callbacks.delete(fn)
    },
    events: { dispatch: (_mode, args) => [...(listeners.get(args[1]) || [])] },
    effect: (fn) => {
      effects += 1
      const out = typeof fn === 'function' ? fn() : undefined
      return typeof out === 'function' ? out : () => {}
    },
  }
  await plugin.apply(ctx, { homeDir: homeOverride || path.join(home, 'hippocampus'), ...config })
  return { registered, sections, effects, ctx }
}

/* ── 1. tool 模式（显式关掉自动注入）：15 个工具、不注册注入段 ── */
const a = await mount({ space: 'real-tool', injectMode: 'tool' })
const names = a.registered.map((t) => t.name)
console.log(`\n[tool 模式] 工具 ${names.length} 个：${names.join(', ')}`)
if (names.length !== 15) {
  console.error(`✗ 期望 15 个工具，实际 ${names.length}`)
  process.exit(1)
}
console.log(`[tool 模式] systemPrompt.section ${a.sections.length} 个（期望 0：显式 tool 不注入）`)
if (a.sections.length !== 0) {
  console.error('✗ injectMode=tool 时不该注册注入段')
  process.exit(1)
}

/* ── 2. 每个工具的 schema 过真宿主校验器 ──
 * tool.parameters 是 defineTool 编译后的 **JSON Schema**，所以用 assertObjectJsonSchema
 * （宿主调用工具前走的同一条 assertion）。 */
let checked = 0
const fails = []
for (const tool of a.registered) {
  try {
    real.assertObjectJsonSchema(tool.parameters, `${tool.name}.parameters`)
    if (tool.output?.schema) real.assertSupportedJsonSchema(tool.output.schema, `${tool.name}.output`)
    checked += 1
  } catch (e) {
    fails.push(`${tool.name}: ${String(e.message).split('\n')[0]}`)
  }
}
console.log(`✓ ${checked}/${a.registered.length} 个工具 schema 通过真宿主校验器`)
if (fails.length) {
  for (const f of fails) console.error(`  ✗ ${f}`)
  process.exit(1)
}

/* ── 2.5 默认配置（不传 injectMode）应当是 auto：注册注入段 ── */
{
  // 注意：每个 mount 是一个独立 store 实例，共享同一个 brain.json 会「后写覆盖前写」。
  // 这条断言只关心「默认配置会不会注册注入段」，所以给它一个单独的家目录，别污染前面的写入。
  const d = await mount({ space: 'real-default' }, fs.mkdtempSync(path.join(os.tmpdir(), 'hp-default-')))
  console.log(`[默认配置] systemPrompt.section ${d.sections.length} 个（0.1.6 起默认 auto，期望 1）`)
  if (d.sections.length !== 1) {
    console.error('✗ 默认配置应当是 auto 并注册 1 个注入段')
    process.exitCode = 1
  }
}

/* ── 3. 入参校验：用 defineTool 内部同一函数 validateJsonSchemaValue ── */
const remember = a.registered.find((t) => t.name === 'hp_remember')
const good = real.validateJsonSchemaValue(remember.parameters, { text: '她说她对芒果过敏' }, '')
const bad = real.validateJsonSchemaValue(remember.parameters, { text: 123 }, '')
console.log(`✓ 合法入参 violations=${JSON.stringify(good)}`)
console.log(`✓ 非法入参 violations=${JSON.stringify(bad).slice(0, 120)}`)
if (good.length || !bad.length) {
  console.error('✗ 入参校验行为不对')
  process.exit(1)
}

/* ── 4. 实跑：走真 defineTool 的 execute（内部先校验再执行） ── */
const wrote = await remember.execute({ text: '她说她对芒果过敏，别再买芒果了' })
console.log(`✓ hp_remember 实跑：${JSON.stringify(wrote).slice(0, 260)}`)
const digest = a.registered.find((t) => t.name === 'hp_digest')
const seen = await digest.execute({})
const seenText = typeof seen === 'string' ? seen : JSON.stringify(seen)
console.log(`✓ hp_digest 取出：${seenText.slice(0, 200)}`)
if (!seenText.includes('芒果')) {
  console.error('✗ 实跑写入的记忆没能读回来')
  process.exit(1)
}
const recall = a.registered.find((t) => t.name === 'hp_recall')
const rows = await recall.execute({ query: '芒果', limit: 5 })
console.log(`✓ hp_recall("芒果")：${JSON.stringify(rows).slice(0, 260)}`)
const firstText = String(rows?.rows?.[0]?.text ?? '')
if (!firstText.includes('芒果')) {
  console.error(`✗ hp_recall 的 rows[0].text 没带出记忆（拿到的是 ${JSON.stringify(rows?.rows?.[0] ?? null)}）`)
  process.exit(1)
}
console.log(`  rows[0]：tier=${rows.rows[0].tier} category=${rows.rows[0].category} score=${rows.rows[0].score}`)

/* ── 5. 注入模式（injectMode: 'auto'）：注册 1 个 section 并渲染出记忆 ──
 * 等 1.8 秒：store 的落盘是「节流 1.5s + 尾随一次」，第二个 mount 是新 store，
 * 不落盘就看不到上一条（真实宿主里进程长活，不会遇到这个窗口）。 */
await new Promise((r) => setTimeout(r, 1800))
const b = await mount({ space: 'real-tool', injectMode: 'auto' })
console.log(`\n[注入模式] tools ${b.registered.length} 个，systemPrompt.section ${b.sections.length} 个，effects ${b.effects} 个`)
if (b.sections.length !== 1) {
  console.error('✗ injectMode=auto 时应当注册 1 个注入段')
  process.exit(1)
}
const sec = b.sections[0]
// DSH 的 section 规格是 { name, order, text(ctx) }——text 是函数，调用后拿到段落正文
const body = sec.text
  ? await sec.text({})
  : (sec.content ? await sec.content() : '')
console.log(`  name=${sec.name ?? '(无)'} order=${sec.order ?? '(无)'} 渲染 ${String(body || '').length} 字符`)
console.log(`  首行：${String(body || '').split('\n')[0].slice(0, 80)}`)
if (!String(body || '').includes('芒果')) {
  console.error('✗ 注入段里没有上一条记忆（注入链路断了）')
  process.exit(1)
}

/* 真宿主只有 agent/scope/signal：从正式 claimed 事件取得当前话语。 */
await b.registered.find((t) => t.name === 'hp_remember').execute({ text: '期末考试需要复习微积分', category: 'study' })
const agent = { id: 'topic-contract-agent' }
realAgent.agentEvents(b.ctx, agent, agent).emit('agent/inbox/claimed', {
  message: { role: 'user', content: [{ type: 'text', text: '微积分考试' }] }, turn: 1,
})
const topicBody = sec.text(realAgent.assembleContextFor(agent))
if (!topicBody.includes('【这会儿想起来的】') || !topicBody.includes('微积分')) {
  console.error('✗ 正式输入事件未连接到 agent/scope 提示词上下文')
  process.exit(1)
}
console.log('✓ 正式 claimed 事件 → 真实 agent/scope 上下文 → 话题检索')

console.log(`\n家目录：${path.join(home, 'hippocampus')}`)
console.log('\n✓ 真宿主契约通过（15 工具 / schema / 入参校验 / 实跑 / 注入段）')
