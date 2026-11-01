#!/usr/bin/env node
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { startDashboard } from '../lib/dashboard-server.mjs'

const args = process.argv.slice(2)
const take = (name, fallback = '') => {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(name + ' 缺少值')
  const v = args[i + 1]; args.splice(i, 2); return v
}
const home = path.resolve(take('--home', path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'hippocampus')))
const file = path.resolve(take('--file', path.join(home, 'brain.json')))
const dir = path.resolve(take('--activity-dir', home))
const space = take('--space', 'default'), port = Number(take('--port', '0'))
if (args.includes('--help')) {
  console.log('记忆活动面板（本机，只读脑文件）\nnode tools/dashboard.mjs --home <记忆目录> --space default\nnode tools/dashboard.mjs --file <脑文件> --space <空间> --activity-dir <活动日志目录>\nnode tools/dashboard.mjs --demo\n可选 --port 0（随机空闲端口）、--open（打开默认浏览器）。\n独立运行时仅观察文件变化，不能回溯启动前的操作或记录未落盘的检索。')
  process.exit(0)
}
const allowed = new Set(['--demo', '--open'])
if (args.some(a => !allowed.has(a)) || !Number.isInteger(port) || port < 0 || port > 65535) { console.error('参数无效，使用 --help 查看说明'); process.exit(2) }
const panel = await startDashboard({ file, dir, space, port, demo: args.includes('--demo'), mode: 'observation' })
console.log('记忆活动面板已启动，仅本机访问。关闭此窗口会停止面板。')
console.log(panel.url)
if (args.includes('--open')) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const params = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', panel.url] : [panel.url]
  const child = spawn(command, params, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => console.log('请手动打开上面的链接')); child.unref()
}
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { if (stopping) return; stopping = true; await panel.close(); process.exit(0) })
