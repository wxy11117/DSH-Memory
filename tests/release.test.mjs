import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createZip, readZip, crc32 } from '../tools/zip.mjs'
import { checkRelease } from '../tools/release-check.mjs'
import { collectReleaseFiles, inspectFiles } from '../tools/release-files.mjs'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-release-'))
  const url = 'https://github.com/exampleuser/hippo-test'
  const pkg = { name: 'hippo-test', version: '1.0.0', files: ['lib', 'tools', 'locale', 'README.md', 'CHANGELOG.md', 'LICENSE', 'cordis.patch.yml'],
    repository: { url: 'git+' + url + '.git' }, homepage: url + '#readme', bugs: { url: url + '/issues' }, meta: { links: { homepage: url } } }
  const data = {
    'package.json': JSON.stringify(pkg), 'README.md': '# Example package', 'CHANGELOG.md': '## 1.0.0\n', LICENSE: 'MIT',
    'cordis.patch.yml': '- insert:\n    - name: hippo-test\n', 'locale/zh.json': '{}',
    'lib/index.js': '', 'lib/hippocampus.js': '', 'lib/store.js': '', 'lib/topic.js': '',
    'tools/install.mjs': '', 'tools/check-install.mjs': '', '.gitignore': '.hp-example/\n', '.gitattributes': '* text=auto\n',
    '.github/workflows/test.yml': 'name: test\n',
  }
  for (const [name, text] of Object.entries(data)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), text)
  }
  const entries = () => collectReleaseFiles(root, pkg).map((name) => ({ path: 'hippo-test/' + name, data: fs.readFileSync(path.join(root, name)) }))
  const check = (items = entries()) => {
    const zipPath = path.join(os.tmpdir(), path.basename(root) + '.zip')
    fs.writeFileSync(zipPath, createZip(items))
    return checkRelease(root, { zipPath })
  }
  return { root, pkg, entries, check }
}
const details = (result) => result.results.filter((r) => r.level === 'bad').map((r) => r.detail).join('\n')

test('最终 ZIP 与清单、源码逐字节一致时通过，包括 GitHub 工作流', () => {
  const f = fixture()
  const r = f.check()
  assert.equal(r.ok, true, details(r))
  assert.ok(f.entries().some((e) => e.path.includes('.github/workflows/')))
})

test('白名单外的样例 brain.json 即使压缩后也必须判红', () => {
  const f = fixture()
  const r = f.check([...f.entries(), { path: 'hippo-test/.hp-example/brain.json', data: '{}' }])
  assert.equal(r.ok, false)
  assert.match(details(r), /brain\.json/)
  assert.match(details(r), /清单外/)
})

test('压缩内容中的凭据会被检查，示例字样不能绕过', () => {
  const secret = ['sk', 'x'.repeat(32)].join('-')
  const f = fixture()
  const entries = f.entries().map((e) => e.path.endsWith('/README.md') ? { ...e, data: '示例：' + secret } : e)
  const r = f.check(entries)
  assert.equal(r.ok, false)
  assert.match(details(r), /疑似 API key/)
})

test('最终 ZIP 漏文件、含旧内容或多根目录都会判红', () => {
  const f = fixture(), entries = f.entries()
  assert.match(details(f.check(entries.filter((e) => !e.path.endsWith('/lib/topic.js')))), /缺少发布文件/)
  assert.match(details(f.check(entries.map((e) => e.path.endsWith('/README.md') ? { ...e, data: 'stale' } : e))), /与当前源码不同/)
  assert.match(details(f.check([...entries, { path: 'wrong-root/file.txt', data: 'extra' }])), /唯一根目录/)
})

test('两种旧仓库占位符都会被检出', () => {
  for (const owner of ['YOUR_GITHUB_USER', '<your-name>']) {
    const value = ['https:', '', 'github.com', owner, 'project'].join('/')
    assert.match(inspectFiles(new Map([['README.md', Buffer.from(value)]])).join('\n'), /占位符/)
  }
})

test('本地示例数据不进入打包清单', () => {
  const f = fixture()
  fs.mkdirSync(path.join(f.root, '.hp-example'))
  fs.writeFileSync(path.join(f.root, '.hp-example', 'brain.json'), '{}')
  assert.ok(!collectReleaseFiles(f.root, f.pkg).some((name) => name.includes('.hp-example')))
})

test('ZIP 兼容未压缩、deflate、UTF-8 路径，CRC 使用标准结果', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
  for (const method of [0, 8]) {
    const zip = createZip([{ path: 'root/中文.txt', data: '内容' }], { method })
    assert.equal(readZip(zip)[0].data.toString(), '内容')
    assert.equal(readZip(zip)[0].path, 'root/中文.txt')
  }
})

test('ZIP 写入结果可复现，损坏内容和截断会被拒绝', () => {
  const entries = [{ path: 'root/file.txt', data: 'unchanged' }]
  assert.deepEqual(createZip(entries), createZip(entries))
  const corrupted = createZip(entries, { method: 0 })
  corrupted[30 + Buffer.byteLength(entries[0].path)] ^= 1
  assert.throws(() => readZip(corrupted), /CRC/)
  assert.throws(() => readZip(corrupted.subarray(0, 10)), /结束记录/)
})

test('读取恶意 ZIP 时拒绝路径穿越、符号链接、加密与过大解压尺寸', () => {
  const original = createZip([{ path: 'root/AA/file.txt', data: 'x' }], { method: 0 })
  const traversal = Buffer.from(original)
  let offset = 0
  while ((offset = traversal.indexOf(Buffer.from('root/AA/'), offset)) >= 0) { traversal.write('root/../', offset); offset += 8 }
  assert.throws(() => readZip(traversal), /路径不安全/)
  const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  const symlink = Buffer.from(original); symlink.writeUInt32LE((0o120777 << 16) >>> 0, central + 38)
  assert.throws(() => readZip(symlink), /符号链接/)
  const encrypted = Buffer.from(original); encrypted.writeUInt16LE(0x801, central + 8)
  assert.throws(() => readZip(encrypted), /加密/)
  const large = Buffer.from(original); large.writeUInt32LE(1024 * 1024 + 1, central + 24)
  assert.throws(() => readZip(large), /大小超过/)
})

test('ZIP 拒绝重复及大小写冲突的文件名', () => {
  assert.throws(() => createZip([{ path: 'root/a.txt' }, { path: 'root/A.txt' }]), /冲突/)
  const zip = createZip([{ path: 'root/a.txt' }, { path: 'root/b.txt' }])
  let i = 0
  while ((i = zip.indexOf(Buffer.from('root/b.txt'), i)) >= 0) { zip.write('root/a.txt', i); i += 10 }
  assert.throws(() => readZip(zip), /冲突/)
})
