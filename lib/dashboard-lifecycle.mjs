/** Share one local panel across startup and tool requests; dispose late startups too. */
export function createDashboardLifecycle(start) {
  let pending = null, closing = null, stopped = false
  const stoppedError = () => Object.assign(new Error('插件已停止，请在插件重新启用后获取面板地址'), { code: 'DASHBOARD_STOPPED' })

  function get() {
    if (stopped) return Promise.reject(stoppedError())
    if (!pending) {
      pending = Promise.resolve().then(() => {
        if (stopped) throw stoppedError()
        return start()
      }).then(async panel => {
        if (stopped) {
          await panel.close()
          throw stoppedError()
        }
        // The optional panel must not keep an otherwise exiting host alive.
        panel.server?.unref()
        return panel
      }).catch(error => {
        pending = null
        throw error
      })
    }
    return pending
  }

  function close() {
    stopped = true
    if (!closing) closing = pending ? pending.then(panel => panel.close(), () => {}) : Promise.resolve()
    return closing
  }

  return { get, close }
}
