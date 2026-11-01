import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createActivityJournal, createFileObserver, dayKey } from './activity.mjs'
import { buildDashboard } from './dashboard-model.mjs'

const UI = fileURLToPath(new URL('../dashboard/', import.meta.url))
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/demo.js', ['demo.js', 'text/javascript; charset=utf-8']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/warm.css', ['warm.css', 'text/css; charset=utf-8']],
  ['/dafeiyu-mascot.webp', ['dafeiyu-mascot.webp', 'image/webp']],
  ['/network.js', ['network.js', 'text/javascript; charset=utf-8']],
])

/** Optional local service. No DSH services, dependencies, write APIs, or public bind address. */
export async function startDashboard({ file, dir, space = 'default', journal, getDoc, mode = 'engine', port = 0, demo = false, pollMs = 60_000, onError = () => {} } = {}) {
  const access = randomBytes(24).toString('base64url')
  const activity = journal || createActivityJournal({ dir })
  let observer = null, latest = null, sourceError = '', timer = null
  if (!demo && mode === 'observation') {
    activity.start()
    observer = createFileObserver({ file, journal: activity, onlySpace: space })
    latest = observer.poll()
    timer = setInterval(() => { const doc = observer.poll(); if (doc) latest = doc }, pollMs)
    timer.unref?.()
  }
  const server = http.createServer((req, res) => {
    const address = server.address(), origin = `http://127.0.0.1:${address.port}`
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)) }
    try {
      if (req.headers.host !== `127.0.0.1:${address.port}` || (req.headers.origin && req.headers.origin !== origin)) return json(403, { error: '仅允许本机同源访问' })
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: '面板只提供读取' })
      const u = new URL(req.url, origin)
      if (u.pathname === '/api/dashboard') {
        const given = Buffer.from(String(req.headers['x-memory-access'] || '')), expected = Buffer.from(access)
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json(401, { error: '请从插件工具或启动脚本返回的完整链接打开面板' })
        if (demo) return json(200, { demo: true })
        const day = u.searchParams.get('day') || dayKey()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(new Date(day + 'T12:00:00').getTime())) return json(400, { error: '日期格式无效' })
        const selected = u.searchParams.get('space') || space
        // A bridge-scoped panel never exposes other spaces in the same sidecar.
        if (mode === 'observation' && space && selected !== space) return json(403, { error: '此面板只连接指定记忆空间' })
        let doc
        if (getDoc) { doc = getDoc(); sourceError = '' }
        else if (observer) { doc = latest || { conversations: {} }; sourceError = observer.error }
        else {
          try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); sourceError = '' }
          catch (e) { doc = { conversations: {} }; sourceError = e.code === 'ENOENT' ? '等待第一条记忆写入' : '记忆文件暂不可读' }
        }
        const viewDoc = mode === 'observation' && space ? { conversations: Object.hasOwn(doc.conversations || {}, space) ? { [space]: doc.conversations[space] } : {} } : doc
        return json(200, buildDashboard({ doc: viewDoc, journal: activity, space: selected, day, reveal: u.searchParams.get('reveal') === '1', mode, sourceError, observedAt: observer?.lastAt || 0 }))
      }
      const asset = assets.get(u.pathname)
      if (!asset) return json(404, { error: '没有这个页面' })
      const body = fs.readFileSync(path.join(UI, asset[0]))
      res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': body.length })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (e) {
      onError(e)
      if (!res.headersSent) json(500, { error: '面板暂时无法读取数据，记忆引擎继续运行' })
      else res.end()
    }
  })
  server.on('error', onError)
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve() }) })
  } catch (e) { if (timer) clearInterval(timer); throw e }
  const url = `http://127.0.0.1:${server.address().port}/#access=${access}${demo ? '&demo=1' : ''}`
  return { url, port: server.address().port, server, close: () => new Promise(resolve => { if (timer) clearInterval(timer); server.close(resolve); server.closeIdleConnections?.() }) }
}
