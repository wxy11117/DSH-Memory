/**
 * tools/migrate.mjs —— 把「已有的 brain.json」搬进本插件的记忆库
 * ============================================================================
 * 典型场景：先在别处（比如 QQ 桥接的 `state/brain.json`）养了一批记忆，
 * 现在换成这套插件，不想从零开始。
 *
 *   node tools/migrate.mjs --from <源 brain.json> --list
 *   node tools/migrate.mjs --from <源 brain.json> --dry
 *   node tools/migrate.mjs --from <源 brain.json> [--from-space <key>] [--to <家目录>] [--to-space default]
 *
 * 合并语义：同 id 取「更晚的那版」；墓碑（已删）不会被复活；
 * 源里独有的条目/关系网边/归档都会带过来。想整份覆盖就加 --mode replace。
 * ============================================================================
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureBrain, mergeBrains } from '../lib/hippocampus.js'
import { createStore } from '../lib/store.js'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

const from = arg('from')
const listOnly = has('list')
const dry = has('dry')
const mode = arg('mode', 'merge')
const toSpace = arg('to-space', 'default')
const fromSpaceArg = arg('from-space')

if (!from) {
  console.log(`用法：
  node tools/migrate.mjs --from <源 brain.json> --list
  node tools/migrate.mjs --from <源 brain.json> --dry
  node tools/migrate.mjs --from <源 brain.json> [--from-space <key>] [--to <家目录>] [--to-space default] [--mode merge|replace]`)
  process.exit(2)
}

if (!fs.existsSync(from)) {
  console.error(`✗ 源文件不存在：${from}`)
  process.exit(1)
}

let src
try {
  src = JSON.parse(fs.readFileSync(from, 'utf8'))
} catch (e) {
  console.error(`✗ 源文件不是合法 JSON：${e.message}`)
  process.exit(1)
}
const convs = src.conversations && typeof src.conversations === 'object' ? src.conversations : null
if (!convs) {
  console.error('✗ 源文件里没有 conversations（不是 brain.json 格式）')
  process.exit(1)
}

const keys = Object.keys(convs)
/** 两种格式都认：
 *   · 本插件 / store.js：conversations[k] = { brain: {…} }
 *   · QQ 桥接的侧车 brain.json：conversations[k] = { items, persons, web, … }（没有 brain 这层） */
const brainOf = (conv) => (conv && typeof conv === 'object' ? (conv.brain ?? conv) : null)
const summarize = (brain) => {
  const b = brain || {}
  return {
    items: Array.isArray(b.items) ? b.items.length : 0,
    archive: Array.isArray(b.archive) ? b.archive.length : 0,
    persons: Array.isArray(b.persons) ? b.persons.length : 0,
    words: b.web?.words ? Object.keys(b.web.words).length : 0,
    edges: b.web?.edges ? Object.keys(b.web.edges).length : 0,
    tombstones: b.tombstones ? Object.keys(b.tombstones).length : 0,
  }
}

console.log(`源：${from}`)
console.log(`会话（记忆空间）${keys.length} 个：`)
for (const k of keys) {
  const s = summarize(brainOf(convs[k]))
  console.log(`  · ${k.padEnd(24)} 记忆 ${String(s.items).padStart(3)} · 归档 ${String(s.archive).padStart(3)} · 人 ${s.persons} · 关系网 ${s.words} 词/${s.edges} 边${s.tombstones ? ` · 墓碑 ${s.tombstones}` : ''}`)
}

if (listOnly) process.exit(0)

/* ── 选源空间 ── */
let fromSpace = fromSpaceArg
if (!fromSpace) {
  if (keys.length === 1) {
    fromSpace = keys[0]
    console.log(`\n源只有一个空间，自动选：${fromSpace}`)
  } else {
    const richest = keys
      .map((k) => ({ k, n: summarize(brainOf(convs[k])).items }))
      .sort((a, b) => b.n - a.n)[0]
    console.error(`\n✗ 源里有 ${keys.length} 个空间，请用 --from-space 指定（记忆最多的是 ${richest.k}，${richest.n} 条）`)
    process.exit(1)
  }
}
const srcBrain = ensureBrain({ brain: brainOf(convs[fromSpace]) })
const srcSum = summarize(srcBrain)

/* ── 目标 ── */
const homeDir = arg('to') || process.env.HP_HOME ||
  (process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'hippocampus') : path.join(os.homedir(), '.dsh', 'hippocampus'))

const store = createStore({ dir: homeDir, log: () => {} })
store.load()
const destConv = store.stateFor(toSpace)
const destBrain = ensureBrain(destConv)
const beforeSum = summarize(destBrain)

console.log(`\n目标：${path.join(homeDir, 'brain.json')}（空间 ${toSpace}）`)
console.log(`合并前：记忆 ${beforeSum.items} · 归档 ${beforeSum.archive} · 人 ${beforeSum.persons} · 关系网 ${beforeSum.words} 词/${beforeSum.edges} 边`)

/* ── 合并或替换 ── */
let merged
if (mode === 'replace') {
  merged = JSON.parse(JSON.stringify(srcBrain))
} else {
  merged = mergeBrains(srcBrain, destBrain)
}
const afterSum = summarize(merged)
console.log(`合并后：记忆 ${afterSum.items} · 归档 ${afterSum.archive} · 人 ${afterSum.persons} · 关系网 ${afterSum.words} 词/${afterSum.edges} 边`)
console.log(`增量：记忆 +${afterSum.items - beforeSum.items} · 归档 +${afterSum.archive - beforeSum.archive} · 人 +${afterSum.persons - beforeSum.persons} · 边 +${afterSum.edges - beforeSum.edges}`)

if (dry) {
  console.log('\n--dry：什么都没写。去掉 --dry 才会真的落盘。')
  process.exit(0)
}

destConv.brain = merged
store.touch()
store.flush()
console.log(`\n✓ 已写入：${store.file}`)
console.log('提醒：如果目标机器上 DSH 正跑着，插件进程里是旧状态，重启后才会看到这批记忆。')
