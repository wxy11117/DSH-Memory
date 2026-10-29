/**
 * lib/store.js —— 记忆落盘
 * ============================================================================
 * 一个文件装所有会话的记忆：`<home>/brain.json`
 *
 *   {
 *     "version": 1,
 *     "updatedAt": 1793123456789,
 *     "conversations": {
 *       "<key>": { "brain": { items:[], archive:[], persons…, web:… } }
 *     }
 *   }
 *
 * 为什么要**侧车文件**而不是塞进会话记录：
 *   · 换会话 / 删会话 / 换窗口 / DSH 重启都不该带走记忆；
 *   · 记忆要能被人直接打开看、备份、迁移；
 *   · 会话记录归宿主，插件不该去改它。
 *
 * 写盘策略：节流 1500ms + **尾部补刷**（只节流不补刷会丢最后一次写，
 * 这是我们在 QQ 桥接里真实踩过的坑：记忆写入后立刻重启，最后一句没了）。
 * ============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'

const FLUSH_DELAY_MS = 1500

/** 原子写：先写 .tmp 再 rename，断电也不会留半个 JSON */
export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8')
    fs.renameSync(tmp, file)
  } finally {
    try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  }
}

export function emptyDoc() {
  return { version: 1, updatedAt: 0, conversations: {} }
}

/**
 * @param {object} opts
 * @param {string} opts.dir      家目录（绝对路径）
 * @param {number} [opts.flushDelayMs]
 * @param {(msg:string)=>void} [opts.log]
 */
export function createStore({ dir, flushDelayMs = FLUSH_DELAY_MS, log = () => {} }) {
  const file = path.join(dir, 'brain.json')
  let doc = emptyDoc()
  let dirty = false
  let timer = null

  function load() {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
      if (!parsed.conversations || typeof parsed.conversations !== 'object') parsed.conversations = {}
      parsed.version = Number(parsed.version) || 1
      doc = parsed
      log(`记忆库已载入：${file}（${Object.keys(doc.conversations).length} 个会话）`)
    } catch (e) {
      if (e?.code === 'ENOENT') { log(`记忆库还空着，将在第一次写入时创建：${file}`); return doc }
      // 坏文件不静默覆盖：改名留档，然后从空白开始
      try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); log(`记忆库损坏，已改名留档：${file} → *.corrupt-*`) } catch { /* ignore */ }
      doc = emptyDoc()
    }
    return doc
  }

  /** 取（或建）某个会话的记忆状态容器；引擎直接改 `state.brain` */
  function stateFor(key) {
    const k = String(key || 'default')
    if (!doc.conversations[k] || typeof doc.conversations[k] !== 'object') doc.conversations[k] = {}
    const conv = doc.conversations[k]
    if (!conv.brain || typeof conv.brain !== 'object') conv.brain = {}
    return conv
  }

  // 进程退出前补刷一次。
  // 为什么必须：touch() 的节流 timer 被 unref 了，脚本式一次性进程（CLI）会在 1.5s 内退出，
  // 于是「已记下」打印了、文件却没变——实测静默丢数据。退出钩子是最后一道保险。
  let exitHooked = false
  function ensureExitHook() {
    if (exitHooked) return
    exitHooked = true
    process.once('exit', () => {
      try { if (dirty) flush() } catch { /* 退出阶段不再抛 */ }
    })
  }

  /** 标脏 + 节流落盘（尾部一定补刷） */
  function touch() {
    dirty = true
    ensureExitHook()
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, flushDelayMs)
    // 不让它拖住建进程退出（Node 的 timer 默认会）
    if (typeof timer.unref === 'function') timer.unref()
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null }
    if (!dirty) return
    dirty = false
    doc.updatedAt = Date.now()
    try { atomicWriteJson(file, doc); log('记忆库已落盘') }
    catch (e) { dirty = true; log(`记忆库落盘失败：${e?.message ?? e}`) }
  }

  /** 直接整份替换（导入用） */
  function replaceDoc(next) {
    if (!next || typeof next !== 'object' || !next.conversations) throw new Error('导入文件格式不对：缺 conversations')
    doc = { version: Number(next.version) || 1, updatedAt: Number(next.updatedAt) || 0, conversations: next.conversations }
    dirty = true
    flush()
  }

  return { file, dir, load, stateFor, touch, flush, replaceDoc, get doc() { return doc } }
}
