// Shared: the app's toast. Toast.show(kind, text) adds a notice ('ok' or 'err') to the page's
// <div class="toasts" data-shared-block="toast"> and removes it 3.2 seconds later; notices stack.
;(function (global) {
  function show(kind, text) {
    const host = document.querySelector('[data-shared-block="toast"]')
    if (!host) return
    const el = document.createElement('div')
    el.className = 'toast ' + (kind === 'err' ? 'err' : 'ok')
    el.textContent = text
    host.appendChild(el)
    setTimeout(() => el.remove(), 3200)
  }
  global.Toast = { show }
})(window)
