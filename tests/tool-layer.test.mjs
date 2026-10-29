/**
 * tests/tool-layer.test.mjs —— 工具层端到端（这一层以前没有任何测试）
 * ============================================================================
 * 为什么补这一层：引擎测试 58 条全绿，但工具层把 `st` 函数当状态传（`hp.list(st)`
 * 而不是 `hp.list(st())`），于是「写入成功、hp_list 却 0 条、hp_get 查不到、
 * hp_person 直接抛」。引擎对、接线错——只有真的调一遍工具才看得见。
 *
 * 这里用假宿主（不装 DSH）验证工具层调用的返回结构与内容。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-tools-'))
process.env.DSH_HOME = home

const mod = await import('../lib/index.js')

const tools = []
const sections = []
const ctx = {
  tools: { register: (def) => { tools.push(def); return () => {} } },
  systemPrompt: { section: (sec) => { sections.push(sec); return () => {} } },
  effect: (fn) => { return () => {} },
  on: () => () => {},
  inject: (deps, fn) => fn(),
  logger: { info() {}, warn() {}, error() {} },
  webServer: { register: () => () => {} },
}

const quiet = console.log
console.log = () => {}
mod.apply(ctx, { injectMode: 'auto', space: 'layer', verbose: false })
console.log = quiet

const byName = new Map(tools.map((t) => [t.name, t]))
const call = async (name, args = {}) => {
  const t = byName.get(name)
  assert.ok(t, `没有这个工具：${name}`)
  return t.execute(args)
}

let rememberedId = ''

test('15 个工具都在（少一个说明注册失败）', () => {
  assert.equal(tools.length, 15, `实际 ${tools.length} 个：${tools.map((t) => t.name).join(', ')}`)
})

test('hp_remember 真能写进去，并返回 id / 层 / 分类', async () => {
  const r = await call('hp_remember', { text: '她说她对芒果过敏，别再买芒果了', category: 'person' })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(typeof r.id, 'string')
  assert.equal(r.category, 'person')
  rememberedId = r.id
})

test('hp_list 必须看得见刚写的那条（回归：以前恒 0 条）', async () => {
  const r = await call('hp_list', {})
  assert.equal(r.ok, true)
  assert.ok(r.total >= 1, `total=${r.total}，说明 list 拿到的不是状态对象`)
  assert.ok(r.rows.some((x) => x.id === rememberedId), 'rows 里没有刚记的 id')
})

test('hp_get 按 id 能查到原文（回归：以前「没有这条记忆」）', async () => {
  const r = await call('hp_get', { id: rememberedId })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.match(r.item.text, /芒果/)
  assert.equal(typeof r.item.retention, 'number')
})

test('hp_person 建人也不抛（回归：以前把函数传进去直接崩）', async () => {
  const r = await call('hp_person', { name: '主人', facts: ['喜欢安静的晚上'] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.created.length, 1)
  assert.equal(typeof r.created[0].id, 'string')
  assert.equal(r.skipped, 0)
})

test('hp_digest 出可注入全文；hp_recall 按话头检索', async () => {
  const d = await call('hp_digest', {})
  assert.equal(d.ok, true)
  assert.ok(typeof d.digest === 'string' && d.digest.length > 0)
  assert.equal(typeof d.chars, 'number')

  // 传当前来信做话头 → 走检索，把「芒果」那条提到前面
  const withTopic = await call('hp_digest', { text: '你还记得我对芒果过敏吗' })
  assert.match(withTopic.digest, /芒果/)

  const r = await call('hp_recall', { query: '芒果' })
  assert.equal(r.ok, true)
  assert.ok(r.rows.length >= 1, '带 query 应当检索到芒果那条')
  assert.match(r.rows[0].text, /芒果/)
  assert.equal(typeof r.rows[0].retention, 'number')
})

test('hp_stats / hp_sweep / hp_recall_daily 都能正常返回', async () => {
  const s = await call('hp_stats', {})
  assert.equal(s.ok, true)
  assert.ok(s.stats.total >= 2, `total=${s.stats.total}`)
  assert.ok(typeof s.web.words === 'number')

  const sw = await call('hp_sweep', {})
  assert.equal(sw.ok, true)
  assert.ok(sw.sweep && typeof sw.sweep === 'object')

  const rc = await call('hp_recall_daily', { count: 2 })
  assert.equal(rc.ok, true)
  assert.ok(Array.isArray(rc.picked))
})

test('hp_export 导出 json 与 md 两种，且 md 是人可读的', async () => {
  const j = await call('hp_export', {})
  assert.equal(j.ok, true)
  assert.ok(fs.existsSync(j.path))
  const json = JSON.parse(fs.readFileSync(j.path, 'utf8'))
  assert.ok(json.conversations)

  const m = await call('hp_export', { format: 'md' })
  assert.equal(m.ok, true)
  assert.ok(m.path.endsWith('.md'))
  const md = fs.readFileSync(m.path, 'utf8')
  assert.match(md, /# 海马体记忆导出/)
  assert.match(md, /芒果/)
})

test('hp_import 能把刚导出的整库读回来', async () => {
  const j = await call('hp_export', {})
  const r = await call('hp_import', { path: j.path })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('流水内容被编码门槛拒掉时，返回 skipped 而不是崩（回归：以前读 null.id）', async () => {
  const r = await call('hp_remember', { text: '刷到了', category: 'watch' })
  assert.equal(r.ok, false, JSON.stringify(r))
  assert.equal(r.skipped, true)
  assert.match(r.reason, /没记/)
})

test('注入段把「当前话题」交给引擎：带 userText 时能勾出联想/检索块', () => {
  assert.equal(sections.length, 1, '默认 auto 应当注册 1 个注入段')
  const sec = sections[0]
  assert.equal(sec.name, 'hippocampus:memory')
  assert.equal(sec.order, 400)

  const withTopic = sec.text({ userText: '你还记得我对芒果过敏吗' })
  assert.ok(withTopic.length > 0)
  assert.match(withTopic, /芒果/, '带话题时应当按检索把芒果那条提上来')

  const noTopic = sec.text({})
  assert.ok(noTopic.length > 0)
  assert.match(noTopic, /hp_digest/, '没话题时应当留一句「先调 hp_digest 再答」的引导')
})
