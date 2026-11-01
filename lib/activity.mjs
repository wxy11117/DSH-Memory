/** Local activity journal. It deliberately never stores memory text or user queries. */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

export const ACTIVITY_LABELS = {
  added: '记下新记忆', recalled: '成功回忆', reinforced: '记忆强化', suppressed: '同类抑制',
  archived: '移入归档', restored: '重新唤起', forgotten: '自然淡出', deleted: '主动删除',
  revised: '订正记忆', consolidated: '归纳经历', pinned: '钉住记忆', unpinned: '取消钉住',
  sealed: '封存记忆', unsealed: '解除封存', tier_changed: '记忆层级变化', retrieved: '按话题检索',
  associated: '词语联想', injected: '准备上下文记忆', skipped: '编码门槛过滤',
  observed_added: '观察到新增', observed_removed: '观察到移除', observed_changed: '观察到内容变化',
}
export const dayKey = (at = Date.now()) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const n = (x) => Number.isFinite(Number(x)) ? Number(x) : 0
const hash = (x) => createHash('sha256').update(String(x || '')).digest('hex')
export function captureBrain(state) {
  const b = state?.brain || state || {}
  const rows = new Map()
  for (const [location, list] of [['archive', b.archive], ['active', b.items]]) {
    for (const it of Array.isArray(list) ? list : []) {
      if (!it?.id) continue
      rows.set(String(it.id), {
        id: String(it.id), location, category: String(it.category || 'misc'), tier: String(it.tier || ''),
        stability: n(it.stabilityHours), recalledAt: n(it.lastRecalledAt), revisions: n(it.reviseCount),
        semantic: !!it.semantic, pinned: !!it.pinned, sealed: !!it.sealed, textHash: hash(it.text),
      })
    }
  }
  return rows
}

/** A change is a fact; its cause is asserted only for an instrumented engine call. */
export function changesBetween(before, after, { observed = false, operation = '' } = {}) {
  const out = []
  const add = (type, row, meta = {}) => out.push({ type, memoryId: row.id, category: row.category, tier: row.tier, ...meta })
  for (const [id, row] of after) {
    const old = before.get(id)
    if (!old) { add(observed ? 'observed_added' : row.semantic ? 'consolidated' : 'added', row); continue }
    if (old.location !== row.location) add(row.location === 'archive' ? 'archived' : 'restored', row)
    if (old.textHash !== row.textHash || row.revisions > old.revisions) add(observed ? 'observed_changed' : 'revised', row)
    const recalled = row.recalledAt > old.recalledAt
    if (recalled) add('recalled', row, { beforeS: old.stability, afterS: row.stability })
    if (row.stability > old.stability && !recalled) add('reinforced', row, { beforeS: old.stability, afterS: row.stability })
    if (row.stability < old.stability) add('suppressed', row, { beforeS: old.stability, afterS: row.stability })
    if (old.tier !== row.tier) add('tier_changed', row, { fromTier: old.tier, toTier: row.tier })
    for (const [field, yes, no] of [['pinned', 'pinned', 'unpinned'], ['sealed', 'sealed', 'unsealed']]) {
      if (old[field] !== row[field]) add(row[field] ? yes : no, row)
    }
  }
  for (const [id, row] of before) {
    if (!after.has(id)) add(observed ? 'observed_removed' : operation === 'forget' ? 'deleted' : 'forgotten', row)
  }
  return out
}

export function createActivityJournal({ dir, log = () => {}, keepDays = 90, clock = Date.now } = {}) {
  const folder = path.join(dir, 'activity')
  let lastCleanup = '', lastError = '', meta = null
  const fail = (e) => { lastError = String(e?.message || e); try { log('活动日志暂不可写：' + lastError) } catch {} }
  function initialize() {
    if (meta) return
    fs.mkdirSync(folder, { recursive: true })
    const file = path.join(folder, 'meta.json')
    try { meta = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { meta = { version: 1, startedAt: clock(), retentionDays: keepDays } }
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(meta), { flag: 'wx' })
  }
  function start() { try { initialize(); return true } catch (e) { fail(e); return false } }
  function append(events, context = {}) {
    if (!events?.length) return
    try {
      initialize()
      const at = clock(), day = dayKey(at), batch = randomUUID()
      const rows = events.filter(e => ACTIVITY_LABELS[e.type]).map(e => ({
        version: 1, id: randomUUID(), batch, at, day,
        space: String(context.space || 'default'), origin: context.origin === 'observation' ? 'observation' : 'engine',
        operation: String(context.operation || '').slice(0, 80), type: e.type,
        ...(e.memoryId ? { memoryId: String(e.memoryId) } : {}),
        ...(e.category ? { category: String(e.category) } : {}),
        ...(e.tier ? { tier: String(e.tier) } : {}),
        ...(Array.isArray(e.memoryIds) ? { memoryIds: e.memoryIds.map(String).slice(0, 40) } : {}),
        ...Object.fromEntries(['count', 'beforeS', 'afterS', 'chars', 'intervalStart'].filter(k => e[k] != null).map(k => [k, n(e[k])])),
        ...Object.fromEntries(['fromTier', 'toTier'].filter(k => e[k] != null).map(k => [k, String(e[k])])),
      }))
      if (!rows.length) return
      fs.appendFileSync(path.join(folder, day + '.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      if (lastCleanup !== day) {
        lastCleanup = day
        const cutoff = new Date(at); cutoff.setDate(cutoff.getDate() - keepDays)
        for (const file of fs.readdirSync(folder)) {
          if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && file.slice(0, 10) < dayKey(cutoff)) fs.unlinkSync(path.join(folder, file))
        }
      }
    } catch (e) { fail(e) }
  }
  function read({ day, space } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return []
    try {
      const file = path.join(folder, day + '.jsonl')
      if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error('单日日志过大，请缩小记录范围')
      return fs.readFileSync(file, 'utf8').split('\n').flatMap(line => {
        try { const e = JSON.parse(line); return e.version === 1 && ACTIVITY_LABELS[e.type] && (!space || e.space === space) ? [e] : [] } catch { return [] }
      })
    } catch (e) { if (e.code !== 'ENOENT') fail(e); return [] }
  }
  function status() {
    try { if (!meta) meta = JSON.parse(fs.readFileSync(path.join(folder, 'meta.json'), 'utf8')) } catch {}
    return { startedAt: n(meta?.startedAt), retentionDays: keepDays, error: lastError }
  }
  return { folder, start, append, read, status }
}

/** Wrap only state-taking public calls; engine-internal calls remain unwrapped, avoiding double counts. */
export function instrumentEngine(engine, { journal, space = () => 'default', enabled = () => true, onMutation = () => {} }) {
  const mutations = new Set(['remember', 'forget', 'pin', 'sealMemory', 'revise', 'setTier', 'sweep', 'semanticize', 'pickRecall', 'maybeDailyRecall', 'probe', 'render', 'stats', 'list'])
  const readings = new Set(['retrieve', 'ripple', 'searchArchive'])
  const facade = { ...engine }
  for (const name of new Set([...mutations, ...readings])) {
    if (typeof engine[name] !== 'function') continue
    facade[name] = (...args) => {
      const active = enabled(), before = active && mutations.has(name) ? captureBrain(args[0]) : null
      const result = engine[name](...args)
      const context = { space: space(args[0]), operation: name }
      if (before) {
        const events = changesBetween(before, captureBrain(args[0]), { operation: name })
        journal.append(events, context)
        if (events.length) { try { onMutation() } catch {} }
      }
      if (name === 'remember' && result == null) journal.append([{ type: 'skipped', count: 1 }], context)
      if (readings.has(name)) {
        const rows = Array.isArray(result) ? result : []
        journal.append([{ type: name === 'ripple' ? 'associated' : 'retrieved', count: rows.length, memoryIds: rows.map(r => (r.item || r).id).filter(Boolean) }], context)
      }
      return result
    }
  }
  return facade
}

/** File observer never opens a store, invokes sweep or writes to the source brain. */
export function createFileObserver({ file, journal, onlySpace = '' }) {
  let previous = null, lastAt = 0, error = ''
  function poll() {
    try {
      if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error('脑文件超过 32 MiB')
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!doc || !doc.conversations || typeof doc.conversations !== 'object') throw new Error('脑文件缺少 conversations')
      const next = new Map(Object.entries(doc.conversations).filter(([key]) => !onlySpace || key === onlySpace).map(([key, st]) => [key, captureBrain(st)]))
      const now = Date.now()
      if (previous) {
        for (const key of new Set([...previous.keys(), ...next.keys()])) {
          const events = changesBetween(previous.get(key) || new Map(), next.get(key) || new Map(), { observed: true })
          journal.append(events.map(e => ({ ...e, intervalStart: lastAt })), { space: key, operation: 'file-observer', origin: 'observation' })
        }
      }
      previous = next; lastAt = now; error = ''
      return doc
    } catch (e) { error = e.code === 'ENOENT' ? '等待记忆文件创建' : String(e.message); return null }
  }
  return { poll, get error() { return error }, get lastAt() { return lastAt } }
}
