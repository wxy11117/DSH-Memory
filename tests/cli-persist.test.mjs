// 回归：CLI（一次性进程）必须真的落盘。
// 曾经的 bug：touch() 的节流 timer 被 unref，脚本跑完立刻退出 → 「已记下」打印了但文件没变。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.resolve(here, '../tools/hp.mjs')

function run(args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

test('CLI remember 后立刻退出，文件里必须真的有这条', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-cli-'))
  const r = run(['--home', home, 'remember', '她说她对芒果过敏，别再买芒果了'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /已记下/)

  const file = path.join(home, 'brain.json')
  assert.ok(fs.existsSync(file), `文件没生成：${file}`)
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const spaces = Object.keys(doc.conversations || {})
  assert.equal(spaces.length, 1)
  const brain = doc.conversations[spaces[0]].brain || doc.conversations[spaces[0]]
  assert.equal((brain.items || []).length, 1, 'items 应只有刚记的那条')
  assert.match(String(brain.items[0].text), /芒果/)
})

test('CLI forget 后退出，删除也必须落盘（不是只改了内存）', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-cli-'))
  assert.equal(run(['--home', home, 'remember', '他喜欢海边的风']).code, 0)
  const file = path.join(home, 'brain.json')
  const before = JSON.parse(fs.readFileSync(file, 'utf8'))
  const space = Object.keys(before.conversations)[0]
  const brain = before.conversations[space].brain || before.conversations[space]
  const id = brain.items[0].id

  assert.equal(run(['--home', home, 'forget', id]).code, 0)
  const after = JSON.parse(fs.readFileSync(file, 'utf8'))
  const b2 = after.conversations[space].brain || after.conversations[space]
  assert.equal((b2.items || []).length, 0, 'forget 后 items 应为空')
  assert.ok(b2.tombstones && b2.tombstones[id], '该留墓碑')
})

test('CLI version 正常（打包后的语料别缺文件）', () => {
  const r = run(['version'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /dsh-hippocampus\s+\d+\.\d+\.\d+/)
})
