// Shared: the provider-stacked trend chart renderer (referenced by several prototype pages, so changing it
// here changes all of them).
// Under file:// an ES module import is blocked by CORS, so it hangs off window rather than exporting (the
// same rule as the logic-page template).
// It corresponds to the real app's TrendChart component; the ruling is in ADR-0008.
;(function () {
  // Prototype-only storage demonstrates the requested global preference. It never touches app prefs.
  const SPAN_KEY = 'agentshed-prototype-trend-span'
  const SPANS = [30, 60, 90]
  const spanViews = new Map()
  let selectedSpan = Number(localStorage.getItem(SPAN_KEY))
  if (!SPANS.includes(selectedSpan)) selectedSpan = 30

  function changeSpan(next, persist) {
    if (!SPANS.includes(next)) return
    selectedSpan = next
    if (persist) localStorage.setItem(SPAN_KEY, String(next))
    spanViews.forEach((render) => render())
  }
  window.addEventListener('storage', (event) => {
    if (event.key === SPAN_KEY) changeSpan(Number(event.newValue) || 30, false)
  })

  function bindSpan(id, onChange, disabled) {
    const control = document.getElementById(id)
    control.innerHTML = SPANS.map((days) =>
      `<button type="button" class="trend-span-choice" data-span="${days}" ${disabled ? 'disabled' : ''}>${days}</button>`
    ).join('<span class="trend-span-separator" aria-hidden="true">/</span>')
    control.onclick = (event) => {
      const button = event.target.closest('button[data-span]')
      if (button && !button.disabled) changeSpan(Number(button.dataset.span), true)
    }
    const render = () => {
      control.querySelectorAll('button').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.span) === selectedSpan))
      })
      onChange(selectedSpan)
    }
    spanViews.set(id, render)
    render()
  }

  function watchSpan(listener) {
    spanViews.set(listener, () => listener(selectedSpan))
    listener(selectedSpan)
  }

  // The prototype cards and chart share daily mock totals. Google belongs to the Codex mock side.
  const SIDE_PROVIDERS = [['Anthropic'], ['OpenAI', 'Google'], ['xAI']]
  function totalsFor(days, span) {
    return SIDE_PROVIDERS.map((providers) => days.slice(-span).reduce((sum, day) =>
      sum + providers.reduce((n, p) => n + (day.by[p] || 0), 0), 0))
  }
  function scaleHistory(days, last30) {
    const current = totalsFor(days, 30)
    return days.map((day) => ({ ...day, by: Object.fromEntries(Object.entries(day.by).map(([p, n]) => {
      const side = SIDE_PROVIDERS.findIndex((providers) => providers.includes(p))
      return [p, Math.round(n * last30[side] / current[side])]
    })) }))
  }

  const PROVIDERS = ['Anthropic', 'OpenAI', 'Google', 'xAI', '其他']
  const CLS = { Anthropic: 'anthropic', OpenAI: 'openai', Google: 'google', xAI: 'xai', 其他: 'other' }
  // 单侧模式 → 该侧当前实际在用的 provider。三侧各自一一对应只是此刻的事实,不是不变量:
  // ADR-0008 之所以按 provider 而非按侧分段,就是为了让某侧哪天混入别家模型时图表逻辑不必改。
  const MODE_PROVIDER = { Claude: 'Anthropic', Codex: 'OpenAI', Grok: 'xAI' }

  function fmt(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)
  }

  /** Generate mock daily history; opts.scale controls the magnitude and opts.withGoogle demonstrates an
   * agent mixing in another vendor's models */
  function mockDays(seed, opts) {
    const o = opts || {}
    const count = o.days || 30
    const rnd = ((s) => () => (s = (s * 9301 + 49297) % 233280) / 233280)(seed)
    return [...Array(count)].map((_, i) => {
      const d = new Date()
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() - (count - 1 - i))
      const by = {}
      const sc = 0.2 + rnd() * 1.7
      by.Anthropic = Math.round((o.scale || 9e7) * sc)
      if (rnd() < 0.7) by.OpenAI = Math.round((o.scale || 9e7) * 0.28 * sc * (0.3 + rnd()))
      if (o.withGoogle && [2, 8, 16].includes(i)) by.Google = Math.round((o.scale || 9e7) * 0.13 * (0.4 + rnd()))
      // Grok 是刚接进来的一侧,只有最近几天有量 —— 这是它现在真实的样子,也正是要压测的边界:
      // 合计模式下它是薄薄一段(分辨得出来吗),单侧模式下 30 天里只剩几个数据日(x 轴按数据日出标签,
      // 见 ADR-0009),两种情形都比「每天都有量」更能暴露问题。
      if (i >= count - 6) by.xAI = Math.round((o.scale || 9e7) * 0.22 * (0.35 + rnd()))
      if (count > 30 && i % 17 === 0) Object.keys(by).forEach((p) => delete by[p])
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, mon: d.getMonth() + 1, dom: d.getDate(), by, archived: o.archivedFirst ? i < o.archivedFirst : false }
    })
  }

  // ── The x axis: data days only (days with total > 0 under the current view), with no evenly spaced
  // filler ──
  // The first visible label, and the first visible label after a month change, use M/D; the rest show the
  // day number alone;
  // when space runs out, thin every other one from right to left at equal priority; labels are pinned to
  // real bar centres (measured from the DOM, so the axis and bars align naturally) and clamped at the ends.
  let measureCtx = null
  function measurerOf(axisEl) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    // The font comes from the axis container's computed style, a single source of truth with the CSS
    const cs = getComputedStyle(axisEl)
    measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`
    return (t) => measureCtx.measureText(t).width
  }

  function renderAxis(axisEl, chartEl, rows) {
    const W = axisEl.clientWidth
    const cols = chartEl.children
    if (!W || cols.length !== rows.length) return
    const MINGAP = 4
    const measureText = measurerOf(axisEl)
    // Bar centres are converted from getBoundingClientRect relative to the axis container — not relying on
    // offsetParent (a bar's positioned ancestor is not the chart)
    const axisLeft = axisEl.getBoundingClientRect().left
    const act = []
    rows.forEach((r, i) => {
      if (r.total > 0) act.push({ i, mon: r.d.mon, dom: r.d.dom })
    })
    // The text depends on "the previous visible label's month" and thinning changes the text → iterate to a
    // fixed point (it only removes, never adds, so it must converge)
    for (let pass = 0; pass < 6; pass++) {
      let prevMon = null
      for (const c of act) {
        c.text = prevMon === c.mon ? String(c.dom) : `${c.mon}/${c.dom}`
        c.w = measureText(c.text)
        const colRect = cols[c.i].getBoundingClientRect()
        const center = colRect.left + colRect.width / 2 - axisLeft
        c.left = Math.min(Math.max(center - c.w / 2, 1), W - 1 - c.w)
        prevMon = c.mon
      }
      let removed = false
      for (;;) {
        let conflict = null
        let prev = null
        for (const c of act) {
          if (prev && c.left < prev.left + prev.w + MINGAP) { conflict = c; break }
          prev = c
        }
        if (!conflict) break
        act.splice(act.indexOf(conflict), 1)
        removed = true
      }
      if (!removed) break
    }
    axisEl.innerHTML = act.map((c) => `<span style="left:${c.left.toFixed(1)}px">${c.text}</span>`).join('')
  }

  function segmentsOf(day, mode) {
    if (mode !== '合计') {
      const p = MODE_PROVIDER[mode]
      const v = day.by[p] || 0
      return v > 0 ? [{ p: p, v: v }] : []
    }
    return PROVIDERS.map((p) => ({ p: p, v: day.by[p] || 0 })).filter((s) => s.v > 0)
  }

  /**
   * Render one trend chart.
   * @param {{chart:string, xaxis:string, legend:string, seg:string, span?:string}} ids The DOM container ids
   * @param {Array} days What mockDays produced
   */
  function mount(ids, days0) {
    let days = days0
    let mode = '合计'
    let span = selectedSpan
    let lastRows = null
    // How many trailing days are "in range". null = the whole window; the caller drives it via setRange.
    let range = null
    const $ = (id) => document.getElementById(id)

    function render() {
      const visible = days.slice(-span)
      const from = range === null ? 0 : Math.max(0, visible.length - range)
      const rows = visible.map((d, i) => {
        const segs = segmentsOf(d, mode)
        return { d: d, segs: segs, total: segs.reduce((s, x) => s + x.v, 0), out: i < from }
      })
      const max = Math.max.apply(null, rows.map((r) => r.total).concat([1]))
      $(ids.chart).dataset.trendSpan = String(span)
      $(ids.chart).innerHTML = rows
        .map((r) => {
          const tip = [
            `${r.d.label} · 合计 ${fmt(r.total)}${r.d.archived ? ' · 归档(源文件已清理)' : ''}`
          ]
            .concat(
              r.total === 0
                ? ['无用量']
                : r.segs.map((s) => `${s.p}  ${fmt(s.v)}  ${Math.round((s.v / r.total) * 100)}%`)
            )
            .join('\n')
          const sp = r.segs
            .map((s) => `<div class="sp ${CLS[s.p]}" style="height:${(s.v / r.total) * 100}%"></div>`)
            .join('')
          const cls = ['col', r.d.archived ? 'arch' : '', r.out ? 'out' : ''].filter(Boolean).join(' ')
          return `<div class="${cls}" style="height:${Math.max(1.5, (r.total / max) * 100)}%" data-tip="${tip.replace(/"/g, '&quot;')}">${sp}</div>`
        })
        .join('')
      lastRows = rows
      if (ids.xaxis) renderAxis($(ids.xaxis), $(ids.chart), rows)
      if (ids.legend) {
        const used = PROVIDERS.filter((p) => rows.some((r) => r.segs.some((s) => s.p === p)))
        const dim = range === null ? '' : ';压暗段=选中窗口之外'
        $(ids.legend).innerHTML =
          mode === '合计'
            ? used
                .map((p) => `<span class="lg"><span class="sw ${CLS[p]}"></span>${p}</span>`)
                .join('') +
              `<span class="lg-note">柱高=当日总量,分段=各 provider 占比;斜纹=归档段${dim}</span>`
            : `<span class="lg-note">单侧视图:仅该 agent 侧用量${dim}</span>`
      }
    }

    // A width change re-lays out only the axis (the bars flex on their own and need no redraw)
    if (ids.xaxis && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        if (lastRows) renderAxis($(ids.xaxis), $(ids.chart), lastRows)
      }).observe($(ids.chart))
    }

    if (ids.seg) {
      $(ids.seg).addEventListener('click', (e) => {
        if (e.target.tagName !== 'SPAN') return
        const spans = $(ids.seg).querySelectorAll('span')
        spans.forEach((s) => s.classList.toggle('on', s === e.target))
        mode = e.target.textContent
        render()
      })
    }
    if (ids.span) {
      bindSpan(ids.span, (next) => {
        span = next
        render()
      })
    }
    render()
    // The caller keeps the range control (it lives in the totals-card row); the chart only reacts.
    return {
      setRange: function (n) {
        range = n
        render()
      },
      // Demo harness only: swapping the mock days so the chart cannot contradict the cards above it
      // (a prototype whose bars show volume on a day its cards call empty teaches the wrong thing).
      setDays: function (d) {
        days = d
        render()
      }
    }
  }

  window.TrendChartProto = { mount, mockDays, bindSpan, watchSpan, totalsFor, scaleHistory }
})()
