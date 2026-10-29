#!/usr/bin/env node
/** Check release sources and every decompressed entry in the final ZIP. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectReleaseFiles, forbiddenPath, inspectFiles } from './release-files.mjs'
import { readZip } from './zip.mjs'

export function checkRelease(root, { zipPath } = {}) {
  const results = []
  const add = (level, title, detail = '') => results.push({ level, title, detail })
  let pkg, files = new Map()
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    files = new Map(collectReleaseFiles(root, pkg).map((name) => [name, fs.readFileSync(path.join(root, name))]))
    const changelog = files.get('CHANGELOG.md')?.toString('utf8') || ''
    if (changelog.match(/^##\s+(\S+)/m)?.[1] === pkg.version) add('ok', '版本号一致', pkg.version)
    else add('bad', '版本号不一致', 'package.json 与 CHANGELOG 顶部标题必须相同')
    const required = ['package.json', 'lib/index.js', 'lib/hippocampus.js', 'lib/store.js', 'lib/topic.js',
      'cordis.patch.yml', 'README.md', 'LICENSE', 'CHANGELOG.md', 'locale/zh.json',
      'tools/install.mjs', 'tools/check-install.mjs']
    const missing = required.filter((name) => !files.has(name))
    add(missing.length ? 'bad' : 'ok', '必备文件', missing.join('、') || required.length + ' 个必备文件齐全')
    const problems = inspectFiles(files)
    add(problems.length ? 'bad' : 'ok', '源码发布内容检查', problems.join('\n') || files.size + ' 个文件通过路径、大小、占位符与敏感内容检查')
    const repository = pkg.repository?.url || ''
    if (!/^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repository)) add('bad', '仓库地址格式', '需要实际的 GitHub repository.url')
    else {
      const url = repository.replace(/^git\+/, '').replace(/\.git$/, '')
      const linksMatch = pkg.homepage === url + '#readme' && pkg.bugs?.url === url + '/issues' && pkg.meta?.links?.homepage === url
      add(linksMatch ? 'ok' : 'bad', '仓库链接一致性', linksMatch ? url : 'repository/homepage/bugs/meta.links.homepage 必须指向同一仓库')
    }
    const patch = files.get('cordis.patch.yml')?.toString('utf8') || ''
    const name = patch.match(/name:\s*([^\s#]+)/)?.[1]
    add(name === pkg.name ? 'ok' : 'bad', '补丁入口名', name === pkg.name ? pkg.name : '补丁 name 与包名不一致')
  } catch (error) {
    add('bad', '读取源码发布清单失败', error.message)
  }

  if (zipPath && pkg) {
    try {
      const entries = readZip(fs.readFileSync(zipPath))
      const prefix = pkg.name + '/', actual = new Map(), problems = []
      for (const entry of entries) {
        if (!entry.path.startsWith(prefix)) { problems.push(entry.path + '：不在唯一根目录 ' + prefix + ' 下'); continue }
        const name = entry.path.slice(prefix.length)
        const reason = forbiddenPath(name)
        if (reason) problems.push(name + '：' + reason)
        if (!entry.directory) actual.set(name, entry.data)
      }
      problems.push(...inspectFiles(actual))
      for (const [name, data] of actual) {
        if (!files.has(name)) problems.push(name + '：最终 ZIP 含有发布清单外文件')
        else if (!files.get(name).equals(data)) problems.push(name + '：最终 ZIP 与当前源码不同')
      }
      for (const name of files.keys()) if (!actual.has(name)) problems.push(name + '：最终 ZIP 缺少发布文件')
      add(problems.length ? 'bad' : 'ok', '最终 ZIP 逐项检查', problems.join('\n') || actual.size + ' 个文件逐项解压、CRC 校验、内容扫描且与源码一致')
    } catch (error) {
      add('bad', '最终 ZIP 无法验证', error.message)
    }
  }
  return { ok: !results.some((r) => r.level === 'bad'), version: pkg?.version, files: files.size, results }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2)
  if (args.some((arg) => !['--zip', '--json', '--help', '-h'].includes(arg))) {
    console.error('未知参数；--help 查看用法')
    process.exitCode = 2
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('用法：node tools/release-check.mjs [--zip] [--json]\n--zip 会解压检查最终 ZIP 全部条目，并与源码逐字节核对。')
  } else {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const result = checkRelease(root, { zipPath: args.includes('--zip') ? path.join(root, '..', pkg.name + '-' + pkg.version + '.zip') : undefined })
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
    else {
      console.log('dsh-hippocampus ' + result.version + ' · 发布文件 ' + result.files + ' 个')
      for (const r of result.results) {
        console.log((r.level === 'ok' ? '✓' : '✗') + ' ' + r.title)
        if (r.detail) console.log('    ' + r.detail.replace(/\n/g, '\n    '))
      }
      console.log(result.ok ? '✓ 发布检查通过。' : '✗ 发布检查失败。')
    }
    process.exitCode = result.ok ? 0 : 1
  }
}
