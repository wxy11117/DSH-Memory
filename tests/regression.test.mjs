import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as hp from '../lib/hippocampus.js'
import { pickTopic, userMessageText } from '../lib/topic.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-regression-env-'))
const plugin = await import('../lib/index.js')

function mount(t, state = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-regression-'))
  hp.ensureBrain(state)
  fs.writeFileSync(path.join(home, 'brain.json'), JSON.stringify({ version: 1, conversations: { default: state } }))
  const tools = new Map(), sections = [], listeners = new Map(), disposers = []
  plugin.apply({
    tools: { register(tool) { tools.set(tool.name, tool); return () => {} } },
    systemPrompt: { section(s) { sections.push(s); return () => {} } },
    on(name, fn) {
      const set = listeners.get(name) || new Set()
      set.add(fn); listeners.set(name, set)
      return () => set.delete(fn)
    },
    effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose },
  }, { homeDir: home, verbose: false })
  t.after(() => disposers.reverse().forEach((fn) => fn?.()))
  return {
    call: (name, args = {}) => tools.get(name).execute(args),
    render: (context) => sections[0].text(context),
    emit: (payload) => { for (const fn of listeners.get('agent/inbox/claimed') || []) fn(payload) },
  }
}

function archives(samples) {
  const state = {}
  for (const [text, category] of samples) hp.remember(state, { text, category })
  state.brain.archive = state.brain.items.map((item) => ({ ...item, archivedAt: Date.now() }))
  state.brain.items = []
  return state
}

test('归档按 query 筛选并返回正确 id、正文与时间', async (t) => {
  const state = archives([['档案甲：对芒果过敏', 'person'], ['档案乙：自行车维修', 'study']])
  const expected = state.brain.archive[0]
  const f = mount(t, state)
  const result = await f.call('hp_recall', { query: '芒果', include_archive: true })
  assert.equal(result.archive.length, 1)
  assert.equal(result.archive[0].id, expected.id)
  assert.equal(result.archive[0].text, expected.text)
  assert.equal(typeof result.archive[0].archivedAgo, 'string')
})

test('归档无匹配时返回空数组', async (t) => {
  const f = mount(t, archives([['档案甲：自行车维修', 'study']]))
  assert.deepEqual((await f.call('hp_recall', { query: '芒果', include_archive: true })).archive, [])
})

test('分类约束同时作用于活跃与归档检索', async (t) => {
  const state = archives([['档案甲：芒果相关的人物信息', 'person'], ['档案乙：芒果相关的研究记录', 'study']])
  hp.remember(state, { text: '活跃甲：芒果相关的人物信息', category: 'person' })
  hp.remember(state, { text: '活跃乙：芒果相关的研究记录', category: 'study' })
  const f = mount(t, state)
  const r = await f.call('hp_recall', { query: '芒果', category: 'study', include_archive: true })
  assert.ok(r.rows.length > 0 && r.archive.length > 0)
  assert.ok([...r.rows, ...r.archive].every((row) => row.category === 'study'))
})

test('hp_digest 的 text 与 query 别名都执行话题检索', async (t) => {
  const state = {}
  hp.remember(state, { text: '期末考试需要复习微积分', category: 'study' })
  const f = mount(t, state)
  const a = await f.call('hp_digest', { text: '考试' })
  const b = await f.call('hp_digest', { query: '考试' })
  assert.match(a.digest, /【这会儿想起来的】/)
  assert.equal(b.digest, a.digest)
})

test('话题提取支持 conversation，选择最新人类话语并忽略助手消息', () => {
  const messages = [{ role: 'user', content: '旧话题' }, { role: 'human', content: [{ type: 'text', text: '新话题' }] }, { role: 'assistant', content: '不要选我' }]
  assert.equal(pickTopic({ conversation: { messages } }), '新话题')
  assert.equal(pickTopic({ messages }), '新话题')
  assert.equal(pickTopic({ conversation: messages }), '新话题')
  assert.equal(pickTopic({ message: { role: 'user', content: '当前来信' } }), '当前来信')
  assert.equal(pickTopic({ message: { role: 'assistant', content: '不要选我' } }), '')
})

test('显式话题优先、空 text 可回退 query、长度受限', () => {
  assert.equal(pickTopic({ userText: ' 显式话题 ', query: '备用话题' }), '显式话题')
  assert.equal(pickTopic({ userText: ' ', query: '备用话题' }), '备用话题')
  assert.equal(pickTopic({ userText: '长'.repeat(500) }).length, 400)
  assert.equal(userMessageText({ role: 'tool', content: '工具返回' }), null)
})

test('只有 agent/scope 的宿主上下文可使用 claimed 话题且不跨 agent 串用', (t) => {
  const state = {}
  hp.remember(state, { text: '期末考试需要复习微积分', category: 'study' })
  const f = mount(t, state), a = {}, b = {}
  f.emit({ agent: a, message: { role: 'user', content: '考试' } })
  assert.match(f.render({ agent: a, scope: a }), /【这会儿想起来的】/)
  assert.match(f.render({ agent: b, scope: b }), /hp_digest\(\{ text:/)
  f.emit({ agent: a, message: { role: 'assistant', content: '自行车' } })
  assert.match(f.render({ agent: a }), /【这会儿想起来的】/)
  f.emit({ agent: a, message: { role: 'user', content: [] } })
  assert.match(f.render({ agent: a }), /hp_digest\(\{ text:/)
})

test('注入段的兜底调用可原样用于 digest 接口', async (t) => {
  const state = {}
  hp.remember(state, { text: '期末考试需要复习微积分', category: 'study' })
  const f = mount(t, state)
  assert.match(f.render({}), /hp_digest\(\{ text: "当前话题" \}\)/)
  assert.match((await f.call('hp_digest', { text: '考试' })).digest, /【这会儿想起来的】/)
})

test('独立示例写出的文件可被标准 CLI 和引擎读取', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-example-interop-'))
  const example = spawnSync(process.execPath, ['examples/embed.mjs', '--home', home], { cwd: root, encoding: 'utf8' })
  assert.equal(example.status, 0, example.stderr)
  const doc = JSON.parse(fs.readFileSync(path.join(home, 'brain.json'), 'utf8'))
  const state = doc.conversations.default
  assert.equal(state.brain.items.length, 4)
  assert.equal(state.brain.brain, undefined)
  assert.equal(hp.list(state).length, 4)
  const cli = spawnSync(process.execPath, ['tools/hp.mjs', '--home', home, 'list'], { cwd: root, encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  assert.match(cli.stdout, /芒果/)
  assert.match(cli.stdout, /水龙头/)
})
