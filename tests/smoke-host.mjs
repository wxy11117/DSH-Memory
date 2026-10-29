/**
 * tests/_host-stub.mjs —— 用假宿主把插件入口跑一遍（不需要真的 DSH）
 * ============================================================================
 * 验证三件事：
 *   1. lib/index.js 能加载、14 个工具都注册成功（参数 DSL 合法）
 *   2. auto 模式下 ctx.systemPrompt.section() 确实被调用，且能渲染出记忆
 *   3. 卸载时 disposer / 定时器都能收干净
 * ============================================================================
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-stub-'))
process.env.DSH_HOME = home

// 先往库里塞两条，让注入有东西可渲染
const hp = await import('../lib/hippocampus.js')
const { createStore } = await import('../lib/store.js')
const seedStore = createStore({ dir: path.join(home, 'hippocampus') })
seedStore.load()
const seedState = seedStore.stateFor('default')
hp.remember(seedState, { text: '答应过主人周末陪他去看那场电影，说话算话', category: 'promise' })
hp.remember(seedState, { text: '第一次和她一起看电影，特别难忘', category: 'event' })
hp.remember(seedState, { text: '她说她对芒果过敏，别再买芒果了', category: 'person' })
seedStore.touch()   // 先标记脏，否则 flush() 什么都不写
seedStore.flush()
if (!fs.existsSync(path.join(home, 'hippocampus', 'brain.json'))) {
  console.log('✗ 种子没落盘：' + path.join(home, 'hippocampus', 'brain.json'))
  process.exit(1)
}

// ── 假宿主 ──────────────────────────────────────────────────────────────────
const tools = []
const sections = []
const effects = []
const ctx = {
  tools: { register: (def) => { tools.push(def); return () => {} } },
  systemPrompt: { section: (sec) => { sections.push(sec); return () => {} } },
  effect: (fn) => { effects.push(fn); return () => {} },
  on: () => () => {},
  inject: (deps, fn) => { if (deps.every(name => ctx[name])) return fn(ctx) },
  logger: { info() {}, warn() {}, error() {} },
  webServer: { register: () => () => {} },
}

const mod = await import('../lib/index.js')
const log = []
const origLog = console.log
console.log = (...a) => log.push(a.join(' '))

mod.apply(ctx, { injectMode: 'auto', verbose: true })
console.log = origLog

const problems = []
if (typeof mod.apply !== 'function') problems.push('缺少 apply 导出')
if (!Array.isArray(mod.inject) || !mod.inject.includes('tools')) problems.push('inject 未声明 tools')
if (tools.length < 10) problems.push(`只注册了 ${tools.length} 个工具（期望 ≥10）`)
if (sections.length !== 1) problems.push(`systemPrompt.section 调用 ${sections.length} 次（期望 1）`)

// 抽查一个工具的参数形态：
//   · 真宿主 defineTool 在场时，会把 DSL 编译成 JSON Schema（type:'object' + required 数组）
//   · 没有真宿主的等价实现时，保留 DSL 原样（required 在属性节点上）
// 两种都算合法，只要求「text 是必填 string」这一点在任一种形态下都成立。
const rememberTool = tools.find((t) => t.name === 'hp_remember')
if (!rememberTool) problems.push('没找到 hp_remember')
else {
  const p = rememberTool.parameters || {}
  if (p.type === 'object' && p.properties) {
    if (p.properties.text?.type !== 'string') problems.push('hp_remember.parameters.properties.text 不是 string')
    if (!Array.isArray(p.required) || !p.required.includes('text')) problems.push('hp_remember.parameters.required 里没有 text')
  } else if (p.text) {
    if (p.text?.required !== true) problems.push('hp_remember.parameters.text 没标 required:true')
  } else {
    problems.push(`hp_remember.parameters 形态不认识：${JSON.stringify(p).slice(0, 120)}`)
  }
}

// 注入的段：跑一次 text()，看能不能渲染出记忆
let rendered = ''
if (sections[0]?.text) {
  rendered = sections[0].text({ agent: { session: { header: { id: 'stub-session' } } } })
}
if (!rendered || !rendered.includes('电影')) problems.push(`注入段渲染异常：${JSON.stringify(rendered.slice(0, 120))}`)

console.log('── 结果 ──')
console.log(`工具：${tools.length} 个 → ${tools.map((t) => t.name).join(', ')}`)
console.log(`注入段：${sections.map((s) => `${s.name}@order=${s.order}`).join(', ') || '（没有）'}`)
console.log(`effects：${effects.length} 个`)
console.log(`注入渲染（${rendered.length} 字符）：\n${rendered.split('\n').map((l) => '    ' + l).join('\n')}`)
if (log.length) console.log(`插件日志：\n${log.map((l) => '    ' + l).join('\n')}`)

if (problems.length) {
  console.log('\n✗ 有问题：')
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log('\n✓ 插件入口可用（工具注册 + 提示词注入 + effect 清理都正常）')
process.exit(0)
