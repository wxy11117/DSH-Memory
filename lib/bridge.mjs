/**
 * lib/bridge.mjs —— 桥接模式：把 QQ 桥接脑当作唯一权威数据源
 * ============================================================================
 * 为什么需要这个文件：
 *   QQ 本体（蓝色大肥鱼）的记忆存在 qq-bridge 进程里（state/brain.json），
 *   DSH-Memory 插件默认自己存一份镜像（homeDir/brain.json）。两份会分叉。
 *
 * 统一方案（用户拍板「桥接当权威 + 插件当入口」）：
 *   · 读：走桥接的 GET /api/brain/*（总是最新、格式已处理、无并发写风险）；
 *   · 写：走桥接的 POST /api/brain/*（桥接是唯一写者，插件不再落本地盘）。
 *
 * 鉴权：桥接所有 /api/* 请求要求 `x-console-token`（值在 state/console-token）。
 *   通过 cfg.externalToken 传入。
 * ============================================================================
 */
import http from 'node:http'
import https from 'node:https'

/** 是否启用了桥接模式（externalApi 非空即启用） */
export function isBridge(cfg) {
  return !!(cfg && typeof cfg.externalApi === 'string' && cfg.externalApi.trim())
}

function baseOf(cfg) {
  return String(cfg.externalApi).trim().replace(/\/+$/, '')
}

function tokenOf(cfg) {
  return String(cfg.externalToken ?? '').trim()
}

/** 桥接 conversation key（如 private:<user-id>）；默认用配置的 externalKey */
export function keyOf(cfg, fallback = '') {
  return String(cfg.externalKey ?? fallback ?? '').trim()
}

function request(cfg, opts) {
  return new Promise((resolve, reject) => {
    const base = baseOf(cfg)
    const mod = base.startsWith('https') ? https : http
    const token = tokenOf(cfg)
    const headers = { ...(opts.headers || {}) }
    if (token) headers['x-console-token'] = token
    const u = new URL(opts.path, base + '/')
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        path: u.pathname + u.search,
        method: opts.method,
        headers,
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let json
          try {
            json = JSON.parse(data)
          } catch {
            json = { ok: false, error: 'bad json', raw: data.slice(0, 400) }
          }
          resolve({ status: res.statusCode || 0, json })
        })
      },
    )
    req.on('error', (e) => reject(e))
    if (opts.payload) req.write(opts.payload)
    req.end()
  })
}

/** GET 读接口；params 会拼到 query string，空值跳过 */
export function bridgeGet(cfg, pathname, params = {}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return request(cfg, { method: 'GET', path: pathname + (qs ? `?${qs}` : '') })
}

/** POST 写接口 */
export function bridgePost(cfg, pathname, body = {}) {
  const payload = JSON.stringify(body)
  return request(cfg, {
    method: 'POST',
    path: pathname,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    payload,
  })
}

/** 统一取回结果：网络错 / 桥接没开 / 桥接返回非 ok，都抛带信息的错，由工具层转成友好返回 */
export async function bridgeCall(cfg, method, pathname, arg) {
  if (!isBridge(cfg)) throw new Error('桥接模式未启用（缺 externalApi）')
  try {
    const res = method === 'GET' ? await bridgeGet(cfg, pathname, arg || {}) : await bridgePost(cfg, pathname, arg || {})
    if (res.status >= 500) throw new Error(`桥接服务不可用（HTTP ${res.status}）`)
    const j = res.json || {}
    if (j.ok === false) throw new Error(j.error || `桥接返回失败（HTTP ${res.status}）`)
    return j
  } catch (e) {
    // 网络层错误原样上抛（连不上 / 拒绝），让工具层如实告诉调用方
    throw e
  }
}
