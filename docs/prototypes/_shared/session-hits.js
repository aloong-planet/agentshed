/* Shared: session search hits — how a hit row draws its question, the same in a project's own session search
   (project-detail, Sessions tab) and in global search (global-search). Every occurrence of the keyword is
   marked. A row is drawn from the question's beginning; when the first occurrence would not be wholly in view
   (past the line's cut, or under its ellipsis), the row starts 20 characters before that occurrence, after an
   ellipsis — as a full-text hit's snippet does. Rows whose keyword is already in view, and short questions,
   stay as they are. Whether it is in view is judged at the row's actual width, and again whenever the width
   changes (the owner's calls, 2026-10-22). When even that does not show the keyword whole (a long keyword in a
   narrow row), the row starts at the keyword itself, after the ellipsis. A full-text hit's snippet is already
   cut around its keyword and is drawn as it is.
     SessionHits.text(question, keyword) → the row's text box: <span class="t">…</span>
     SessionHits.fit(root)               → after rows are put in root, move the start of rows that need it
     SessionHits.watch(root)             → fit root now and whenever its width changes (a resize, or a hidden
                                           tab shown); call once per root */
window.SessionHits = (() => {
  const BEFORE = 20
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  /** The text, escaped, with every occurrence of the keyword marked (case-insensitive) */
  function mark(s, k) {
    if (!k) return esc(s)
    const lower = s.toLowerCase(), key = k.toLowerCase()
    let out = '', from = 0
    for (let i = lower.indexOf(key); i !== -1; i = lower.indexOf(key, from)) {
      out += esc(s.slice(from, i)) + `<mark>${esc(s.slice(i, i + k.length))}</mark>`
      from = i + k.length
    }
    return out + esc(s.slice(from))
  }
  const text = (q, k) => `<span class="t" data-q="${esc(q)}" data-k="${esc(k)}">${mark(q, k)}</span>`

  /** The width the line's ellipsis takes in this text box's font */
  function ellipsisWidth(el) {
    const probe = document.createElement('span')
    probe.textContent = '…'
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
    el.appendChild(probe)
    const w = probe.getBoundingClientRect().width
    probe.remove()
    return w
  }

  /** Whether the first marked occurrence is wholly in view: when the line overflows, its end shows the ellipsis
   *  instead of text, so the visible text stops before it */
  function inView(el) {
    const m = el.querySelector('mark')
    const box = el.getBoundingClientRect()
    const end = el.scrollWidth > el.clientWidth ? box.right - ellipsisWidth(el) : box.right
    return m.getBoundingClientRect().right <= end + 0.5
  }

  function fitRow(el) {
    const q = el.dataset.q, k = el.dataset.k
    el.innerHTML = mark(q, k)
    if (!el.querySelector('mark') || el.getBoundingClientRect().width === 0 || inView(el)) return
    const chars = Array.from(q)
    const at = Array.from(q.slice(0, q.toLowerCase().indexOf(k.toLowerCase()))).length
    if (at === 0) return
    if (at > BEFORE) {
      el.innerHTML = '…' + mark(chars.slice(at - BEFORE).join(''), k)
      if (inView(el)) return
    }
    el.innerHTML = '…' + mark(chars.slice(at).join(''), k)
  }

  const fit = (root) => root.querySelectorAll('.hit .t[data-q]').forEach(fitRow)

  function watch(root) {
    let width = -1
    new ResizeObserver(() => {
      const w = root.getBoundingClientRect().width
      if (w !== width) { width = w; fit(root) }
    }).observe(root)
  }

  return { text, fit, watch }
})()
