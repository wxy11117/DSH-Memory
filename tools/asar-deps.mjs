/**
 * asar-deps.mjs —— 从 Electron app.asar 里按依赖闭包解出指定包（只读、无第三方依赖）。
 *
 * 为什么需要：`npm run test:real` 要真宿主的 @deepseek-ai/dsh-agent + dsh-tools 及其依赖，
 * 而桌面版把这些都打在 app.asar 里。没有 npm 的机器上，用这个脚本把闭包抠出来即可。
 *
 * 用法：
 *   node tools/asar-deps.mjs "<app.asar 路径>" "<输出目录>" dsh-agent dsh-tools
 * 输出：
 *   <输出目录>/node_modules/@deepseek-ai/<包>/...
 *   （然后 set DSH_HOST_MODULES=<输出目录>\node_modules\@deepseek-ai）
 */
import fs from 'node:fs'
import path from 'node:path'

const [asarPath, outDir, ...roots] = process.argv.slice(2)
if (!asarPath || !outDir || !roots.length) {
  console.error('用法：node tools/asar-deps.mjs <app.asar> <输出目录> <包名...>')
  process.exit(2)
}

const fd = fs.openSync(asarPath, 'r')
// asar 头 = 8 字节 pickle 头（[0,4) 固定为 4，[4,8) = 头部载荷长度）+ 载荷
// 载荷 = 4 字节长度前缀 + 4 字节字符串长度 + JSON UTF-8
const pre = Buffer.alloc(8)
fs.readSync(fd, pre, 0, 8, 0)
const headerSize = pre.readUInt32LE(4)
const head = Buffer.alloc(headerSize)
fs.readSync(fd, head, 0, headerSize, 8)
const strLen = head.readUInt32LE(4)
const dataBase = 8 + headerSize                      // 文件数据区的起点
const jsonText = head.subarray(8, 8 + strLen).toString('utf8')
let tree
try {
  tree = JSON.parse(jsonText)
} catch (err) {
  console.error(`✗ 头部 JSON 解析失败（headerSize=${headerSize}, strLen=${strLen}）：${err.message}`)
  process.exit(1)
}

/* ── 建索引：路径 → {offset,size} ─────────────────────────────────── */
const files = new Map()
const walk = (node, prefix) => {
  for (const [k, v] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${k}` : k
    if (v.files) walk(v, p)
    else if (typeof v.offset === 'string' || typeof v.offset === 'number') {
      files.set(p, { offset: Number(v.offset), size: Number(v.size) })
    }
  }
}
walk(tree, '')

const readEntry = (p) => {
  const e = files.get(p)
  if (!e) return null
  const buf = Buffer.alloc(e.size)
  fs.readSync(fd, buf, 0, e.size, dataBase + e.offset)
  return buf
}

/* ── 依赖闭包 ─────────────────────────────────────────────────────── */
const found = new Map()   // 包名 → asar 内目录前缀
const queue = [...roots]
const depsOf = (name) => {
  const prefix = found.get(name)
  const raw = readEntry(`${prefix}/package.json`)
  if (!raw) return []
  let pkg
  try { pkg = JSON.parse(raw.toString('utf8')) } catch { return [] }
  return Object.keys({ ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) })
}
const locate = (name) => {
  const bases = name.startsWith('@')
    ? [`node_modules/${name}`, name]
    : [`node_modules/@deepseek-ai/${name}`, `node_modules/${name}`, `@deepseek-ai/${name}`, name]
  for (const b of bases) if (files.has(`${b}/package.json`)) return b
  return null
}

while (queue.length) {
  const name = queue.shift()
  if (found.has(name)) continue
  const prefix = locate(name)
  if (!prefix) { console.error(`  ! 找不到 ${name}（跳过）`); continue }
  found.set(name, prefix)
  for (const d of depsOf(name)) if (!found.has(d)) queue.push(d)
}

/* ── 写出 ─────────────────────────────────────────────────────────── */
let written = 0, bytes = 0
for (const [name, prefix] of found) {
  for (const [p, e] of files) {
    if (!p.startsWith(prefix + '/')) continue
    const rel = p.slice(prefix.length + 1)
    const target = path.join(outDir, prefix, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const buf = Buffer.alloc(e.size)
    fs.readSync(fd, buf, 0, e.size, dataBase + e.offset)
    fs.writeFileSync(target, buf)
    written++
    bytes += e.size
  }
}
fs.closeSync(fd)
console.log(`✓ 解出 ${found.size} 个包 / ${written} 个文件 / ${(bytes / 1024 / 1024).toFixed(1)} MB`)
for (const name of [...found.keys()].sort()) console.log('  - ' + name)
console.log(`\n下一步：set DSH_HOST_MODULES=${path.join(outDir, 'node_modules', '@deepseek-ai')}`)
