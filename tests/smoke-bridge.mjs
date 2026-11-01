import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 桥接模式 smoke：用假宿主挂载插件，配置 externalApi/externalFile 指向真实 QQ 桥接，验证 hp_* 读桥接脑、写走 API。
// 本机联调专用：需要 BRIDGE_TOKEN / BRIDGE_FILE 环境变量（不参与 `npm test`，缺环境就跳过）。
const token = process.env.BRIDGE_TOKEN || ''
const externalApi = process.env.BRIDGE_API || 'http://127.0.0.1:3100'
const externalKey = process.env.BRIDGE_KEY || ''
const externalFile = process.env.BRIDGE_FILE || ''
if (!token || !externalFile || !externalKey) {
  console.log('跳过：桥接模式 smoke 需 BRIDGE_TOKEN 与 BRIDGE_FILE 环境变量（本机联调用）。')
  process.exit(0)
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-bridge-'))
process.env.DSH_HOME = home

const tools = []
const sections = []
const effects = []
const ctx = {
  tools: { register: (def) => { tools.push(def); return () => {} } },
  systemPrompt: { section: (sec) => { sections.push(sec); return () => {} } },
  effect: (fn) => { effects.push(fn); return () => {} },
  on: () => () => {},
  inject: (deps, fn) => { if (deps.every((n) => ctx[n])) return fn(ctx) },
  logger: { info() {}, warn() {}, error() {} },
  webServer: { register: () => () => {} },
}

const mod = await import('../lib/index.js')
mod.apply(ctx, {
  injectMode: 'auto',
  externalApi,
  externalKey,
  externalToken: token,
  externalFile,
  verbose: true,
})

const get = (n) => tools.find((t) => t.name === n)
const problems = []

// 1. hp_stats 读桥接脑
const statsT = get('hp_stats')
if (!statsT) problems.push('没找到 hp_stats')
else {
  const r = await statsT.execute({})
  console.log('hp_stats →', JSON.stringify({ total: r?.stats?.total, home: r?.home, space: r?.space, digestChars: r?.digestChars }))
  if (!r?.stats?.total || r.stats.total < 50) problems.push(`hp_stats total=${r?.stats?.total} 期望 ≥50`)
  if (r?.space !== externalKey) problems.push(`hp_stats space=${r?.space} 期望配置的 BRIDGE_KEY`)
}

// 2. hp_list 读桥接脑
const listT = get('hp_list')
if (!listT) problems.push('没找到 hp_list')
else {
  const r = await listT.execute({ tier: 'permanent' })
  const n = r?.rows?.length ?? 0
  console.log('hp_list(permanent) →', JSON.stringify({ n, total: r?.total, sample: r?.rows?.[0]?.text?.slice(0, 40) }))
  if (!n) problems.push('hp_list(permanent) 返回 0 条')
}

// 3. 注入段渲染桥接脑
let rendered = ''
if (sections[0]?.text) rendered = sections[0].text({})
console.log('注入渲染', rendered.length, '字符 →', JSON.stringify(rendered.slice(0, 60)))
if (!rendered || rendered.length < 10) problems.push(`注入段渲染 ${rendered.length} 字符，太短`)

// 4. 写一条 → 删（走桥接 API）
const remT = get('hp_remember')
const fgtT = get('hp_forget')
if (remT && fgtT) {
  const w = await remT.execute({ text: '（smoke桥接测试）写一条，稍后删', category: 'misc', salience: 15 })
  console.log('hp_remember 完整返回 →', JSON.stringify(w))
  const id = w?.item?.id || w?.id
  if (!id) problems.push('hp_remember 没返回 item.id')
  else {
    const d = await fgtT.execute({ id })
    console.log('hp_forget →', JSON.stringify(d))
    if (!d?.ok) problems.push('hp_forget 没 ok')
  }
} else problems.push('缺 hp_remember 或 hp_forget')

console.log('\n' + (problems.length ? '✗ ' + problems.join('；') : '✓ 桥接模式 smoke 通过（读桥接脑 + 写走 API + 注入渲染）'))
process.exit(problems.length ? 1 : 0)
