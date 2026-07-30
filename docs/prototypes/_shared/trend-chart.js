// 共享:provider 堆叠趋势图渲染器(被多个原型页引用,改此一处全部生效)。
// file:// 下 ES module import 受 CORS 限制,故挂 window 而非 export(同 logic-page 模板规矩)。
// 对应真 app 的 TrendChart 组件;裁定见 ADR-0008。
;(function () {
  const PROVIDERS = ['Anthropic', 'OpenAI', 'Google', '其他']
  const CLS = { Anthropic: 'anthropic', OpenAI: 'openai', Google: 'google', 其他: 'other' }

  function fmt(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)
  }

  /** 生成 30 天 mock;opts.scale 控制量级,opts.withGoogle 演示某 agent 混用别家模型 */
  function mockDays(seed, opts) {
    const o = opts || {}
    const rnd = ((s) => () => (s = (s * 9301 + 49297) % 233280) / 233280)(seed)
    return [...Array(30)].map((_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000)
      const by = {}
      const sc = 0.2 + rnd() * 1.7
      by.Anthropic = Math.round((o.scale || 9e7) * sc)
      if (rnd() < 0.7) by.OpenAI = Math.round((o.scale || 9e7) * 0.28 * sc * (0.3 + rnd()))
      if (o.withGoogle && [2, 8, 16].includes(i)) by.Google = Math.round((o.scale || 9e7) * 0.13 * (0.4 + rnd()))
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, mon: d.getMonth() + 1, dom: d.getDate(), by, archived: o.archivedFirst ? i < o.archivedFirst : false }
    })
  }

  // ── x 轴:只标数据日(当前视图下 total>0 的日子),无等距补白 ──
  // 首个可见标签、以及月份变化后的首个可见标签用 M/D,其余只标日数字;
  // 放不下时同优先级从右往左隔一简略;标签钉真实柱中心(量 DOM,轴柱天然对齐),首尾出界 clamp。
  let measureCtx = null
  function measurerOf(axisEl) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    // 字体取自轴容器计算样式,与 CSS 单一事实
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
    // 柱中心用 getBoundingClientRect 相对轴容器换算——不依赖 offsetParent(柱的定位祖先并非 chart)
    const axisLeft = axisEl.getBoundingClientRect().left
    const act = []
    rows.forEach((r, i) => {
      if (r.total > 0) act.push({ i, mon: r.d.mon, dom: r.d.dom })
    })
    // 文本依赖"上一个可见标签的月份",简略又会改变文本 → 循环到稳定(只删不增,必收敛)
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
      const p = mode === 'Claude' ? 'Anthropic' : 'OpenAI'
      const v = day.by[p] || 0
      return v > 0 ? [{ p: p, v: v }] : []
    }
    return PROVIDERS.map((p) => ({ p: p, v: day.by[p] || 0 })).filter((s) => s.v > 0)
  }

  /**
   * 渲染一处趋势图。
   * @param {{chart:string, xaxis:string, legend:string, seg:string}} ids 各 DOM 容器 id
   * @param {Array} days mockDays 的产物
   */
  function mount(ids, days) {
    let mode = '合计'
    let lastRows = null
    const $ = (id) => document.getElementById(id)

    function render() {
      const rows = days.map((d) => {
        const segs = segmentsOf(d, mode)
        return { d: d, segs: segs, total: segs.reduce((s, x) => s + x.v, 0) }
      })
      const max = Math.max.apply(null, rows.map((r) => r.total).concat([1]))
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
          return `<div class="col ${r.d.archived ? 'arch' : ''}" style="height:${Math.max(1.5, (r.total / max) * 100)}%" data-tip="${tip.replace(/"/g, '&quot;')}">${sp}</div>`
        })
        .join('')
      lastRows = rows
      if (ids.xaxis) renderAxis($(ids.xaxis), $(ids.chart), rows)
      if (ids.legend) {
        const used = PROVIDERS.filter((p) => rows.some((r) => r.segs.some((s) => s.p === p)))
        $(ids.legend).innerHTML =
          mode === '合计'
            ? used
                .map((p) => `<span class="lg"><span class="sw ${CLS[p]}"></span>${p}</span>`)
                .join('') +
              '<span class="lg-note">柱高=当日总量,分段=各 provider 占比;斜纹=归档段</span>'
            : '<span class="lg-note">单侧视图:仅该 agent 侧用量</span>'
      }
    }

    // 宽度变化只重排轴(柱子 flex 自适应,无需重画)
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
    render()
  }

  window.TrendChartProto = { mount: mount, mockDays: mockDays }
})()
