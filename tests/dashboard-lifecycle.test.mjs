import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDashboardLifecycle } from '../lib/dashboard-lifecycle.mjs'

test('startup and concurrent address requests share one service; disposal closes it once', async () => {
  let starts = 0, closes = 0, unrefs = 0
  const panel = { url: 'local-panel', server: { unref() { unrefs++ } }, async close() { closes++ } }
  const lifecycle = createDashboardLifecycle(async () => { starts++; return panel })
  const [startup, first, second] = await Promise.all([lifecycle.get(), lifecycle.get(), lifecycle.get()])
  assert.equal(starts, 1); assert.equal(unrefs, 1)
  assert.equal(startup, panel); assert.equal(first, second)
  assert.equal(await lifecycle.get(), panel)
  await Promise.all([lifecycle.close(), lifecycle.close()])
  assert.equal(closes, 1)
  await assert.rejects(lifecycle.get(), { code: 'DASHBOARD_STOPPED' })
})

test('a failed background start can be retried by the next address request', async () => {
  let starts = 0, closes = 0
  const panel = { url: 'recovered-panel', async close() { closes++ } }
  const lifecycle = createDashboardLifecycle(() => {
    if (++starts === 1) throw Object.assign(new Error('simulated listen failure'), { code: 'EACCES' })
    return panel
  })
  const first = lifecycle.get(), duplicate = lifecycle.get()
  assert.equal(first, duplicate)
  await assert.rejects(first, { code: 'EACCES' })
  assert.equal(await lifecycle.get(), panel); assert.equal(starts, 2)
  await lifecycle.close(); assert.equal(closes, 1)
})

test('unloading before startup runs never creates a listener', async () => {
  let starts = 0
  const lifecycle = createDashboardLifecycle(() => { starts++ })
  const starting = lifecycle.get(), closing = lifecycle.close()
  await assert.rejects(starting, { code: 'DASHBOARD_STOPPED' })
  await closing
  assert.equal(starts, 0)
})

test('unloading during an asynchronous start waits for and closes the late service', async () => {
  let finish, closes = 0
  const lifecycle = createDashboardLifecycle(() => new Promise(resolve => { finish = resolve }))
  const starting = lifecycle.get()
  await Promise.resolve()
  const closing = lifecycle.close()
  const rejected = assert.rejects(starting, { code: 'DASHBOARD_STOPPED' })
  finish({ url: 'late-panel', async close() { closes++ } })
  await Promise.all([closing, rejected, lifecycle.close()])
  assert.equal(closes, 1)
  await assert.rejects(lifecycle.get(), { code: 'DASHBOARD_STOPPED' })
})
