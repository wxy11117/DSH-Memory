#!/usr/bin/env node
/**
 * tools/hp.mjs —— 命令行入口（不装插件也能查/改记忆）
 * ============================================================================
 *   node tools/hp.mjs stats                 体检
 *   node tools/hp.mjs digest                现在会注入的记忆全文
 *   node tools/hp.mjs list [--tier long]    列条目（带 id）
 *   node tools/hp.mjs remember "话" [--cat food]
 *   node tools/hp.mjs recall "火锅"          按话头检索
 *   node tools/hp.mjs pin <id> | forget <id> | seal <id>
 *   node tools/hp.mjs sweep                 跑一次清理 + 归纳
 *   node tools/hp.mjs export [文件] [--md] | import <文件>
 *   node tools/hp.mjs version               版本号
 *   node tools/hp.mjs doctor                环境自检
 *
 * 家目录：--home <dir>，缺省 $DSH_HOME/hippocampus 或 ~/.dsh/hippocampus
 * ============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as hp from '../lib/hippocampus.js'
import { createStore } from '../lib/store.js'

const argv = process.argv.slice(2)
const flag = (name, dflt = '') => {
  const i = argv.indexOf(name)
  if (i === -1) return dflt
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v ?? dflt
}
const homeFlag = flag('--home')
const spaceFlag = flag('--space', 'default')
const tierFlag = flag('--tier')
const catFlag = flag('--cat')
const cmd = (argv[0] || 'stats').toLowerCase()

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const homeDir = homeFlag ? path.resolve(homeFlag) : path.join(dshHome, 'hippocampus')

const store = createStore({ dir: homeDir, log: (m) => process.env.HP_DEBUG && console.log(`[store] ${m}`) })
store.load()
const st = store.stateFor(spaceFlag)
const b = hp.ensureBrain(st)
const line = (s) => console.log(s)

function printItem(r, i) {
  const flags = [r.pinned ? '钉住' : '', r.sealed ? '封存' : '', r.semantic ? '归纳' : ''].filter(Boolean).join(',')
  line(`${String(i).padStart(2)}. [${r.tier}/${r.category}${flags ? ',' + flags : ''}] ${r.text}`)
  line(`    id=${r.id} 重要度=${r.salience} 稳定性=${Math.round(r.stabilityHours)}h 留存=${hp.retentionOf(r).toFixed(2)} ${hp.agoText(r.lastTouch ?? r.updatedAt ?? r.createdAt)}`)
}

switch (cmd) {
  case 'version': {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    line(`${pkg.name} ${pkg.version}`)
    break
  }
  case 'doctor': {
    line(`引擎文件   ${path.join(import.meta.dirname ?? '', '..', 'lib', 'hippocampus.js')}`)
    line(`记忆库     ${store.file}${fs.existsSync(store.file) ? '' : '（还没创建）'}`)
    line(`空间       ${spaceFlag}`)
    const s = hp.stats(st)
    const w = hp.webStats(st)
    line(`活记忆     ${s.total} 条（瞬时 ${s.tiers.instant} / 短期 ${s.tiers.short} / 长期 ${s.tiers.long} / 永久 ${s.tiers.permanent}）`)
    line(`其它       封存 ${s.sealed} · 归档 ${s.archived} · 归纳 ${s.semantic} · 钉住 ${hp.list(st).filter((x) => x.pinned).length}`)
    line(`关系网     ${w.words} 词 / ${w.edges} 边`)
    line(`注入体积   ${hp.render(st).length} 字符`)
    break
  }
  case 'stats': {
    const s = hp.stats(st)
    const w = hp.webStats(st)
    line(`活记忆 ${s.total} 条（瞬时 ${s.tiers.instant} / 短期 ${s.tiers.short} / 长期 ${s.tiers.long} / 永久 ${s.tiers.permanent}）`)
    line(`封存 ${s.sealed} · 归档 ${s.archived} · 归纳 ${s.semantic} · 钉住 ${hp.list(st).filter((x) => x.pinned).length} · 平均留存 ${s.avgRetention}`)
    line(`分类：${Object.entries(s.categories).map(([k, v]) => `${k} ${v}`).join(' / ') || '（空）'}`)
    line(`关系网 ${w.words} 词 / ${w.edges} 边 · 注入 ${hp.render(st).length} 字符`)
    break
  }
  case 'digest': {
    line(hp.render(st, Date.now(), { text: argv[1] || '' }))
    break
  }
  case 'list': {
    let rows = hp.list(st)
    if (tierFlag) rows = rows.filter((r) => r.tier === tierFlag)
    if (catFlag) rows = rows.filter((r) => r.category === catFlag)
    if (!rows.length) line('（没有记忆）')
    rows.forEach(printItem)
    break
  }
  case 'remember': {
    const text = argv[1]
    if (!text) { line('用法：remember "一句话" [--cat 分类]'); process.exit(2) }
    const it = hp.remember(st, { text, category: catFlag || undefined })
    if (!it) { line('没记：这条被判成流水账，闸门挡下了（想强制记就用 --cat promise 之类更重的类别）'); break }
    store.touch(); store.flush()
    line(`已记下：id=${it.id} 层=${it.tier} 分类=${it.category} 重要度=${it.salience} 稳定性=${Math.round(it.stabilityHours)}h`)
    break
  }
  case 'recall': {
    const q = argv.slice(1).join(' ')
    if (!q) { line('用法：recall "话头"'); process.exit(2) }
    const rows = hp.retrieve(st, q, { n: 8 })
    if (!rows.length) line('（没有相关记忆）')
    rows.map((r) => r.item ?? r).forEach(printItem)
    break
  }
  case 'pin': case 'forget': case 'seal': {
    const id = argv[1]
    if (!id) { line(`用法：${cmd} <id>`); process.exit(2) }
    const r = cmd === 'pin' ? hp.pin(st, id, true) : cmd === 'forget' ? hp.forget(st, id) : hp.sealMemory(st, id, true)
    store.touch(); store.flush()
    line(JSON.stringify(r))
    break
  }
  case 'sweep': {
    const a = hp.sweep(st); const s = hp.semanticize(st)
    store.touch(); store.flush()
    line(`清理：${JSON.stringify(a)}`)
    line(`归纳：${JSON.stringify(s)}`)
    break
  }
  case 'export': {
    // export [文件] [--md]：默认 JSON（迁移/备份）；--md 出人可读的 Markdown
    store.flush()
    const md = argv.includes('--md')
    const fileArg = argv.slice(1).find((a) => !a.startsWith('--'))
    const target = fileArg
      ? path.resolve(fileArg)
      : path.join(homeDir, `export-${Date.now()}.${md ? 'md' : 'json'}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, md ? hp.toMarkdown(store.doc) : JSON.stringify(store.doc, null, 2), 'utf8')
    line(`已导出：${target}（${fs.statSync(target).size} 字节）`)
    break
  }
  case 'import': {
    const src = argv[1]
    if (!src) { line('用法：import <文件>'); process.exit(2) }
    store.replaceDoc(JSON.parse(fs.readFileSync(path.resolve(src), 'utf8')))
    line(`已导入：${src}`)
    break
  }
  default:
    line(`未知命令：${cmd}`)
    line('可用：version | doctor | stats | digest | list | remember | recall | pin | forget | seal | sweep | export | import')
    process.exit(2)
}

store.flush()
