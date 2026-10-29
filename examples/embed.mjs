/**
 * examples/embed.mjs —— 不装 DSH，直接当库用
 * ============================================================================
 * 这套记忆是**纯 JS 引擎 + 一个 JSON 文件**，不依赖 DSH 也能跑。
 * 适合：自己写的 agent、别的框架（LangChain / 自研 runtime）、一次性实验。
 *
 *   node examples/embed.mjs
 * ============================================================================
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

import { remember, render, retrieve, stats, webStats, ensureBrain, sweep } from '../lib/hippocampus.js'
import { createStore } from '../lib/store.js'

// 1. 选个地方存记忆（生产环境用固定路径，别用临时目录）
const homeIndex = process.argv.indexOf('--home')
if (homeIndex >= 0 && (!process.argv[homeIndex + 1] || process.argv[homeIndex + 1].startsWith('--'))) {
  throw new Error('--home 后需要一个目录')
}
const dir = homeIndex >= 0 ? path.resolve(process.argv[homeIndex + 1]) : process.argv.includes('--temp')
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'hp-example-'))
  : path.join(process.cwd(), '.hp-example')

const store = createStore({ dir, log: (m) => console.log('  [store]', m) })
store.load()

// 2. 一个「空间」= 一份独立的脑。单用户单人格用 'default' 就够
const st = store.stateFor('default')
ensureBrain(st)

// 3. 写记忆：给文本就行，分类/重要度/层都可以交给引擎自己判断
const samples = [
  '她说她对芒果过敏，以后别买芒果味的',
  '昨天在便利店看到一只橘猫趴在关东煮柜上，特别好笑',
  '答应过周末陪他去看那场讲深海的电影，说话算话',
  '第一次自己修好了漏水的水龙头，扳手拧到第三圈才停住',
]
for (const text of samples) {
  const out = remember(st, { text })
  console.log(`记下：${out.tier.padEnd(9)} ${out.category.padEnd(8)} S=${out.stabilityHours}h  ${text.slice(0, 22)}…`)
}

// 4. 回忆：给一句「话头」，看它把哪些带出来（这就是注入上下文的东西）
sweep(st, Date.now())
const hook = '周末出去看电影吧，顺便买点喝的'
const rows = retrieve(st, hook, { n: 3 })
console.log(`\n话头：「${hook}」`)
for (const row of rows) {
  // retrieve() 返回 [{ item, score, base }]
  const it = row.item ?? row
  console.log(`  ${String(it.tier).padEnd(9)} score=${Number(row.score ?? 0).toFixed(3)}  ${it.text}`)
}

// 5. 整块渲染：这就是要拼进 system prompt 的文本
console.log('\n── 会注入上下文的那一块 ──')
console.log(render(st, Date.now(), { text: hook }) || '（空）')

// 6. 统计
const s = stats(st, Date.now())
console.log('\n── 统计 ──')
console.log(`活记忆 ${s.total} 条 · 瞬时 ${s.tiers.instant} / 短期 ${s.tiers.short} / 长期 ${s.tiers.long} / 永久 ${s.tiers.permanent}`)
console.log(`平均留存 ${s.avgRetention} · 关系网 ${webStats(st).words} 词`)

// 7. 落盘（节流 1.5s + 尾部补刷；脚本退出前手动 flush 一次最稳）
store.touch()
store.flush()
console.log(`\n记忆库：${store.file}`)
console.log('下次再跑同一条命令，它会先 load 这份文件——记忆就是这样活过重启的。')
