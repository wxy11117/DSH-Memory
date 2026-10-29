#!/usr/bin/env node
/** Reproducible release ZIP, built from the same allowlist used by the checker. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { checkRelease } from './release-check.mjs'
import { collectReleaseFiles } from './release-files.mjs'
import { createZip } from './zip.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--out')) {
  console.error('用法：node tools/pack.mjs [--out <包目录之外的.zip文件>]')
  process.exitCode = 2
} else {
  try {
    const check = checkRelease(root)
    if (!check.ok) throw new Error(check.results.filter((r) => r.level === 'bad').map((r) => `${r.title}：${r.detail}`).join('\n'))
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const out = path.resolve(args[1] || path.join(root, '..', `${pkg.name}-${pkg.version}.zip`))
    if (!out.toLowerCase().endsWith('.zip') || out.startsWith(root + path.sep)) throw new Error('ZIP 必须输出到包目录之外')
    const entries = collectReleaseFiles(root, pkg).map((name) => ({ path: `${pkg.name}/${name}`, data: fs.readFileSync(path.join(root, name)) }))
    const bytes = createZip(entries)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const tmp = out + `.tmp-${process.pid}`
    try { fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, out) }
    finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) }
    const finalCheck = checkRelease(root, { zipPath: out })
    if (!finalCheck.ok) throw new Error(JSON.stringify(finalCheck.results.filter((r) => r.level === 'bad')))
    console.log(JSON.stringify({ ok: true, path: out, files: entries.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
