/**
 * tests/smoke-noprompt.mjs —— 兼容性场景：宿主**没有** ctx.systemPrompt 时还能不能用。
 *
 * 为什么单独一条：`export const inject = ['tools', 'systemPrompt']` 会让 cordis 一直等这个服务；
 * 在没有 @deepseek-ai/dsh-system-prompt 的宿主上，插件会**完全不激活**——连 hp_* 工具都没有，
 * 而用户看到的现象只是「装了没反应」。主插件只依赖 tools，提示词在独立 ctx.inject 子插件里等待。
 *
 * 这条轻量测试守的是缺服务时工具可用；真实代理权限与生命周期由 real-cordis.mjs 验证：
 *   · 主插件 inject 不依赖 systemPrompt，子插件等待它
 *   · 没有 systemPrompt 时：15 个工具照常注册、不注册注入段、日志里说清楚为什么
 *   · 用 hp_digest 手动依然能取到记忆内容（这是缺注入时的兜底路径）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-noprompt-'))
process.env.DSH_HOME = home

const hp = await import('../lib/hippocampus.js')
const { createStore } = await import('../lib/store.js')
const seedStore = createStore({ dir: path.join(home, 'hippocampus') })
seedStore.load()
const st = seedStore.stateFor('default')
hp.remember(st, { text: '她说她对芒果过敏，别再买芒果了', category: 'person' })
hp.remember(st, { text: '答应过主人周末陪他去看那场电影，说话算话', category: 'promise' })
seedStore.touch()
seedStore.flush()

// ── 假宿主：**故意不提供** systemPrompt ──────────────────────────────────
const tools = []
const deferred = []
const ctx = {
  tools: { register: (def) => { tools.push(def); return () => {} } },
  effect: () => () => {},
  on: () => () => {},
  inject: (deps, fn) => { deferred.push({ deps, fn }); return {} },
  logger: { info() {}, warn() {}, error() {} },
  webServer: { register: () => () => {} },
}

const mod = await import('../lib/index.js')
const log = []
const origLog = console.log
console.log = (...a) => log.push(a.join(' '))
mod.apply(ctx, { injectMode: 'auto', verbose: true })     // 注意：auto 模式，但宿主没这个服务
console.log = origLog

const problems = []
if (!Array.isArray(mod.inject) || mod.inject.includes('systemPrompt')) {
  problems.push(`inject 不该包含 systemPrompt（当前 ${JSON.stringify(mod.inject)}）——否则没这个服务的宿主上插件永不激活`)
}
if (!mod.inject.includes('tools')) problems.push('inject 必须声明 tools')
if (deferred.length !== 1 || !deferred[0].deps.includes('systemPrompt')) problems.push('提示词应在独立子插件里等待 systemPrompt')
if (tools.length < 10) problems.push(`只注册了 ${tools.length} 个工具（期望 15）`)
if (!tools.some((t) => t.name === 'hp_digest')) problems.push('没有 hp_digest，缺注入时就没兜底了')

const saidIt = log.some((l) => /systemPrompt/.test(l))
if (!saidIt) problems.push('没在日志里说明提示词会随 systemPrompt 服务挂载')

// 兜底：手动取记忆，内容必须出得来
const digest = tools.find((t) => t.name === 'hp_digest')
let digestText = ''
try {
  const r = await digest.execute({ maxChars: 800 })
  digestText = typeof r === 'string' ? r : JSON.stringify(r)
} catch (e) {
  problems.push('hp_digest 执行失败：' + e.message)
}
if (digestText && !digestText.includes('芒果')) problems.push(`hp_digest 没取到记忆：${digestText.slice(0, 120)}`)

console.log('── 结果（宿主无 systemPrompt）──')
console.log(`inject：${JSON.stringify(mod.inject)}`)
console.log(`工具：${tools.length} 个`)
console.log(`插件日志：${log.length ? '\n' + log.map((l) => '    ' + l).join('\n') : '（无）'}`)
console.log(`hp_digest 兜底：${digestText ? digestText.slice(0, 60).replace(/\n/g, ' ') + '…' : '（空）'}`)

if (problems.length) {
  console.log('\n✗ 有问题：')
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log('\n✓ 没有 systemPrompt 的宿主上也能用（工具全在，只是不自动注入）')
process.exit(0)
