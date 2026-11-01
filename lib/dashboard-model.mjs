import { createHash } from 'node:crypto'
import { dayKey, ACTIVITY_LABELS } from './activity.mjs'
import { retentionOf, wordsOf } from './hippocampus.js'

const tiers = ['instant', 'short', 'long', 'permanent']
const cleanNumber = v => Number.isFinite(Number(v)) ? Number(v) : 0
const wordId = word => createHash('sha256').update(word).digest('hex').slice(0, 16)

/** Pure projection: unlike engine.stats/render this never sweeps or reclassifies. */
export function projectBrain(doc, { space = 'default', reveal = false, now = Date.now() } = {}) {
  const state = doc?.conversations?.[space] || {}
  const brain = state.brain || state
  const items = Array.isArray(brain.items) ? brain.items.filter(Boolean) : []
  const archive = Array.isArray(brain.archive) ? brain.archive.filter(Boolean) : []
  const counts = Object.fromEntries(tiers.map(t => [t, 0]))
  for (const it of items) if (tiers.includes(it.tier)) counts[it.tier]++
  const visible = [...items, ...archive].filter(it => !it.sealed)
  const memories = visible.slice(0, 1600).map(it => ({
    id: String(it.id), text: reveal ? String(it.text || '') : '', category: String(it.category || 'misc'),
    tier: String(it.tier || ''), stability: cleanNumber(it.stabilityHours), retention: retentionOf(it, now),
    importance: cleanNumber(it.salience), pinned: !!it.pinned, semantic: !!it.semantic,
    archived: !items.includes(it), createdAt: cleanNumber(it.createdAt), updatedAt: cleanNumber(it.updatedAt),
  }))
  const web = brain.web || {}, allowed = new Map()
  for (const it of visible) {
    for (const word of wordsOf(it.text, { category: it.category, tags: it.tags })) {
      if (!web.words?.[word]) continue
      if (!allowed.has(word)) allowed.set(word, [])
      allowed.get(word).push(String(it.id))
    }
  }
  const allWords = Object.keys(web.words || {}), allEdges = Object.entries(web.edges || {})
  const selected = [...allowed.keys()].sort((a, b) => cleanNumber(web.words[b]?.w) - cleanNumber(web.words[a]?.w) || a.localeCompare(b)).slice(0, 600)
  const selectedSet = new Set(selected)
  const nodes = selected.map((word, i) => ({ id: wordId(word), label: reveal ? word : `词项 ${i + 1}`, weight: cleanNumber(web.words[word]?.w), kind: web.words[word]?.kind || 'gram', memoryIds: allowed.get(word).slice(0, 25) }))
  const edges = allEdges.flatMap(([key, edge]) => {
    const [a, b] = key.split('\u0001')
    return selectedSet.has(a) && selectedSet.has(b) ? [{ source: wordId(a), target: wordId(b), weight: cleanNumber(edge.w) }] : []
  }).sort((a, b) => b.weight - a.weight).slice(0, 1800)
  return {
    total: items.length, archived: archive.length, semantic: items.filter(it => it.semantic).length,
    pinned: items.filter(it => it.pinned).length, sealed: items.filter(it => it.sealed).length, tiers: counts,
    avgRetention: items.length ? items.reduce((s, it) => s + retentionOf(it, now), 0) / items.length : 0,
    words: allWords.length, edges: allEdges.length, memories, graph: { nodes, edges, availableNodes: allowed.size, nodeLimit: 600, edgeLimit: 1800 },
  }
}

export function buildDashboard({ doc, journal, space = 'default', day = dayKey(), reveal = false, mode = 'engine', sourceError = '', observedAt = 0, now = Date.now() }) {
  const snapshot = projectBrain(doc, { space, reveal, now })
  const available = Object.keys(doc?.conversations || {})
  const date = new Date(day + 'T12:00:00')
  const events = journal.read({ day, space })
  const counts = Object.create(null)
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(date); d.setDate(d.getDate() - i)
    const key = dayKey(d), rows = journal.read({ day: key, space })
    days.push({ day: key, total: rows.length, added: rows.filter(e => ['added', 'observed_added'].includes(e.type)).length, recalled: rows.filter(e => e.type === 'recalled').length })
  }
  return {
    version: 1, generatedAt: now, day, mode, reveal, sourceError,
    space, spaces: available.map((key, i) => ({ value: key, label: reveal ? key : `记忆空间 ${i + 1}` })),
    tracking: { ...journal.status(), observedAt, limited: mode === 'observation' },
    snapshot, counts, eventCount: events.length, days,
    events: events.slice(-1500).reverse().map(e => ({ ...e, label: ACTIVITY_LABELS[e.type] })),
    truncated: events.length > 1500,
  }
}
