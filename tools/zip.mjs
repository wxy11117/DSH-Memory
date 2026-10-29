/** Bounded ZIP reader/writer for releases. Never extracts or executes archive contents. */
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const MAX_FILE = 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0)
  return n >>> 0
})
export function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]
  return (crc ^ 0xffffffff) >>> 0
}
function zipPath(raw) {
  const name = raw.replace(/\\/g, '/')
  const parts = name.replace(/\/$/, '').split('/')
  if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes('\0') ||
      parts.some((p) => !p || p === '.' || p === '..')) throw new Error(`ZIP 路径不安全：${name}`)
  return name
}
function requireBytes(buf, offset, size) {
  if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > buf.length) throw new Error('ZIP 数据截断或偏移越界')
}
export function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length > MAX_TOTAL) throw new Error('ZIP 文件过大或格式错误')
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { end = i; break }
  }
  if (end < 0) throw new Error('没有找到 ZIP 结束记录')
  const count = buf.readUInt16LE(end + 10), centralSize = buf.readUInt32LE(end + 12), centralOffset = buf.readUInt32LE(end + 16)
  if (buf.readUInt16LE(end + 4) || buf.readUInt16LE(end + 6) || buf.readUInt16LE(end + 8) !== count ||
      count === 65535 || count > 5000 || centralOffset === 0xffffffff || centralSize === 0xffffffff) throw new Error('不支持多卷或 ZIP64 发布包')
  if (centralOffset + centralSize !== end) throw new Error('ZIP 中央目录长度不一致')
  const entries = [], seen = new Set()
  let cursor = centralOffset, total = 0
  for (let i = 0; i < count; i++) {
    requireBytes(buf, cursor, 46)
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP 中央目录记录错误')
    const flags = buf.readUInt16LE(cursor + 8), method = buf.readUInt16LE(cursor + 10)
    const crc = buf.readUInt32LE(cursor + 16), compressed = buf.readUInt32LE(cursor + 20), size = buf.readUInt32LE(cursor + 24)
    const nameLength = buf.readUInt16LE(cursor + 28), extraLength = buf.readUInt16LE(cursor + 30), commentLength = buf.readUInt16LE(cursor + 32)
    const attributes = buf.readUInt32LE(cursor + 38), offset = buf.readUInt32LE(cursor + 42)
    requireBytes(buf, cursor + 46, nameLength + extraLength + commentLength)
    const name = zipPath(new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(cursor + 46, cursor + 46 + nameLength)))
    const key = name.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) throw new Error(`ZIP 重复或大小写冲突路径：${name}`)
    seen.add(key)
    if (flags & 1 || ![0, 8].includes(method)) throw new Error(`ZIP 加密或压缩方式不支持：${name}`)
    if (((attributes >>> 16) & 0xf000) === 0xa000) throw new Error(`ZIP 不能包含符号链接：${name}`)
    if (size > MAX_FILE || (total += size) > MAX_TOTAL) throw new Error(`ZIP 解压大小超过限制：${name}`)
    requireBytes(buf, offset, 30)
    if (buf.readUInt32LE(offset) !== 0x04034b50 || buf.readUInt16LE(offset + 6) !== flags || buf.readUInt16LE(offset + 8) !== method) throw new Error(`ZIP 本地记录不一致：${name}`)
    const localLength = buf.readUInt16LE(offset + 26), localExtra = buf.readUInt16LE(offset + 28)
    requireBytes(buf, offset + 30, localLength + localExtra)
    const localName = zipPath(new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(offset + 30, offset + 30 + localLength)))
    if (localName !== name) throw new Error(`ZIP 本地文件名不一致：${name}`)
    const start = offset + 30 + localLength + localExtra
    if (start + compressed > centralOffset) throw new Error(`ZIP 文件内容越界：${name}`)
    const packed = buf.subarray(start, start + compressed)
    const data = method === 0 ? Buffer.from(packed) : inflateRawSync(packed, { maxOutputLength: MAX_FILE })
    if (data.length !== size || crc32(data) !== crc) throw new Error(`ZIP 文件大小或 CRC 不一致：${name}`)
    const directory = name.endsWith('/')
    if (directory && size) throw new Error(`ZIP 目录含有文件数据：${name}`)
    entries.push({ path: name, directory, data })
    cursor += 46 + nameLength + extraLength + commentLength
    if (cursor > end) throw new Error('ZIP 中央目录越界')
  }
  if (cursor !== end) throw new Error('ZIP 中央目录条数不一致')
  return entries
}
export function createZip(entries, { method = 8 } = {}) {
  if (![0, 8].includes(method) || entries.length > 5000) throw new Error('ZIP 打包参数不支持')
  const local = [], central = [], seen = new Set()
  let offset = 0, total = 0
  for (const entry of entries) {
    const name = zipPath(entry.path), key = name.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) throw new Error(`ZIP 重复或大小写冲突路径：${name}`)
    seen.add(key)
    const filename = Buffer.from(name, 'utf8'), data = Buffer.from(entry.data || '')
    if (filename.length > 65535 || data.length > MAX_FILE || (total += data.length) > MAX_TOTAL) throw new Error('ZIP 文件过大')
    const packed = method === 8 ? deflateRawSync(data, { level: 9 }) : data
    const crc = crc32(data), header = Buffer.alloc(30), record = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6)
    header.writeUInt16LE(method, 8); header.writeUInt16LE(0x21, 12)
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(filename.length, 26)
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(0x314, 4); record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(method, 10); record.writeUInt16LE(0x21, 14)
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(data.length, 24)
    record.writeUInt16LE(filename.length, 28); record.writeUInt32LE((0o100644 << 16) >>> 0, 38); record.writeUInt32LE(offset, 42)
    local.push(header, filename, packed); central.push(record, filename)
    offset += header.length + filename.length + packed.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}
