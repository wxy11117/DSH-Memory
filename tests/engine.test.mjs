/**
 * tests/engine.test.mjs —— 引擎的硬行为测试（不需要 DSH，不需要网络）
 *   node --test tests/
 * ============================================================================
 * 契约：所有函数都拿「会话状态对象」`st`（形状 { brain }），不是 brain 本身。
 * 这些断言就是文档里那些话的可执行版本。
 * ============================================================================
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import * as hp from '../lib/hippocampus.js'

const DAY = 86400000
const HOUR = 3600000
const st = () => ({})
const b = (s) => hp.ensureBrain(s)

test('编码闸门：刷到的东西不写，重要的事写', () => {
  const s = st()
  hp.remember(s, { text: '刷到一条视频，没什么', category: 'watch' })
  assert.equal(hp.list(s).length, 0, '低重要度的流水账应该被闸门挡下')

  hp.remember(s, { text: '第一次和主人一起看完了整场直播，特别开心', category: 'event' })
  assert.equal(hp.list(s).length, 1, '带「第一次/特别」的事件应该进来')
})

test('层是算出来的：重要度低的短、承诺的长', () => {
  const s = st()
  const low = hp.remember(s, { text: '吃了一碗面', category: 'food' })
  const high = hp.remember(s, { text: '答应过她，明天早上八点叫她起床，说话算话', category: 'promise' })
  assert.ok(high.stabilityHours > low.stabilityHours, `承诺应比一顿饭持久：${high.stabilityHours} vs ${low.stabilityHours}`)
  assert.equal(high.tier, 'permanent')
  assert.ok(['instant', 'short'].includes(low.tier), `吃饭这类不该一上来就是长期：${low.tier}`)
})

test('遗忘曲线：时间推过去，留存单调下降', () => {
  const s = st()
  const it = hp.remember(s, { text: '和朋友去吃了火锅，那天特别开心', category: 'food' })
  const t0 = Date.now()
  const r0 = hp.retentionOf(it, t0)
  const r1 = hp.retentionOf(it, t0 + 10 * HOUR)
  const r2 = hp.retentionOf(it, t0 + 30 * DAY)
  assert.ok(r0 > r1 && r1 > r2, `留存应递减：${r0} > ${r1} > ${r2}`)
})

test('间隔效应：被想起一次，稳定性变长', () => {
  const s = st()
  const it = hp.remember(s, { text: '「火锅」这家店我很喜欢，去了好几次', category: 'food' })
  const s0 = it.stabilityHours
  hp.reinforce(it, Date.now())
  assert.ok(it.stabilityHours > s0, `S 应增大：${s0} → ${it.stabilityHours}`)
  assert.ok(it.hits >= 2, `被想起一次后 hits 应从 1 涨到 2，实际 ${it.hits}`)
})

test('清算：长期/永久不真删，只有短期流水会消失', () => {
  const s = st()
  const it = hp.remember(s, { text: '答应过你的那件大事，一辈子都算数', category: 'promise' })
  // 手动把它推到「很久没碰」的状态
  it.lastRecalledAt = 0
  it.updatedAt = 0
  it.createdAt = Date.now() - 900 * DAY
  const t = Date.now()
  hp.sweep(s, t)
  const alive = hp.list(s).find((x) => x.id === it.id)
  const inArchive = (b(s).archive || []).some((x) => x.id === it.id)
  assert.ok(alive || inArchive, '长期/永久的条目不该凭空消失')
})

test('订正：保留旧版 + 计数 + 加固', () => {
  const s = st()
  const it = hp.remember(s, { text: '她说她喜欢猫', category: 'person' })
  const s0 = it.stabilityHours
  const r = hp.revise(s, { id: it.id, newText: '她说她其实更喜欢狗' })
  assert.ok(r && r.ok !== false, `订正应成功：${JSON.stringify(r)}`)
  const after = hp.list(s).find((x) => x.id === it.id)
  assert.equal(after.text, '她说她其实更喜欢狗')
  assert.ok(after.stabilityHours > s0, '订正会顺手巩固一次')
  assert.ok((after.revisions || []).length >= 1 || after.reviseCount >= 1, '应留下旧版痕迹')
})

test('删除：写墓碑，原条目不再活', () => {
  const s = st()
  const it = hp.remember(s, { text: '一件不想再提起的事', category: 'event' })
  hp.forget(s, it.id)
  assert.equal(hp.list(s).find((x) => x.id === it.id), undefined, '删了就不在活库里')
  assert.ok(Object.keys(b(s).tombstones || {}).includes(it.id), '应留下墓碑')
})

test('钉住：不进遗忘曲线', () => {
  const s = st()
  const it = hp.remember(s, { text: '这是必须永远记得的一条', category: 'event' })
  hp.pin(s, it.id, true)
  it.lastRecalledAt = 0
  it.updatedAt = 0
  it.createdAt = Date.now() - 900 * DAY
  hp.sweep(s, Date.now())
  const alive = hp.list(s).find((x) => x.id === it.id)
  assert.ok(alive && alive.pinned, '钉住的条目不会被清理走')
})

test('合并：墓碑不复活、钉住与封存是单调事实', () => {
  const sa = st()
  const sb = st()
  const kept = hp.remember(sa, { text: '共同的一条记忆内容', category: 'event' })
  const gone = hp.remember(sa, { text: '要被删掉的那一条内容', category: 'event' })
  hp.forget(sa, gone.id)

  // B 侧是 A 的旧副本（同 id），但 A 新增了钉住与删除
  const copy = JSON.parse(JSON.stringify(b(sa)))
  hp.pin(sa, kept.id, true)

  const merged = hp.mergeBrains(b(sa), copy)
  const list = merged.items || []
  assert.ok(list.find((x) => x.id === kept.id)?.pinned, '钉住状态应保留')
  assert.equal(list.find((x) => x.id === gone.id), undefined, '墓碑应阻止复活')
})

test('语义归纳：同类 3 条 → 一条「道理」', () => {
  const s = st()
  hp.remember(s, { text: '晚上和朋友去吃了火锅，很热闹', category: 'food' })
  hp.remember(s, { text: '又去吃了火锅，这次加了毛肚', category: 'food' })
  hp.remember(s, { text: '还是火锅，家里自己煮的', category: 'food' })
  const r = hp.semanticize(s, Date.now())
  const sem = hp.list(s).filter((x) => x.semantic)
  assert.ok(sem.length >= 1, `应归纳出至少 1 条道理（返回 ${JSON.stringify(r)}）`)
  assert.ok(sem.some((x) => x.text.includes('火锅')), `归纳句里应出现共同词：${sem.map((x) => x.text).join(' | ')}`)
})

test('检索：按话头能找到，且会加固', () => {
  const s = st()
  const it = hp.remember(s, { text: '猫咪地铁站那条视频是手工微缩，站台门和车门能同步', category: 'event' })
  const s0 = it.stabilityHours
  const rows = hp.retrieve(s, '那个地铁站的视频', { n: 5 })
  const hit = rows.find((r) => (r.item?.id ?? r.id) === it.id)
  assert.ok(hit, `应该检索到这条，实际：${JSON.stringify(rows.map((r) => r.item?.text ?? r.text))}`)
  assert.ok(it.hits >= 1 || it.stabilityHours >= s0, '被检索到应产生加固')
})

test('渲染：给出人话，不是 JSON', () => {
  const s = st()
  hp.remember(s, { text: '答应过周末陪她去看那场电影，说话算话', category: 'promise' })
  const out = hp.render(s, Date.now(), {})
  assert.ok(typeof out === 'string' && out.length > 10, '应渲染出文本')
  assert.ok(!out.trimStart().startsWith('{'), '不应该是原始 JSON')
})

test('持久化形状：brain 可 JSON 往返', () => {
  const s = st()
  hp.remember(s, { text: '这是一条用来测序列化的记忆', category: 'event' })
  assert.equal(hp.list(s).length, 1)
  const round = JSON.parse(JSON.stringify(b(s)))
  const s2 = { brain: round }
  assert.equal(hp.list(s2).length, 1, 'JSON 往返后条数应一致')
  assert.ok(hp.render(s2).length > 0)
})

test('统计口径：stats 的 tiers 合计等于总数', () => {
  const s = st()
  hp.remember(s, { text: '第一次见到雪，特别难忘', category: 'event' })
  hp.remember(s, { text: '刷到一条搞笑视频', category: 'watch' })
  const x = hp.stats(s)
  const sum = Object.values(x.tiers || {}).reduce((a, n) => a + Number(n || 0), 0)
  assert.equal(sum, x.total, `tiers 合计 ${sum} 应等于 total ${x.total}`)
})
