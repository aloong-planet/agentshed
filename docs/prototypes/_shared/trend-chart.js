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
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, by, archived: o.archivedFirst ? i < o.archivedFirst : false }
    })
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
      if (ids.xaxis) {
        $(ids.xaxis).innerHTML = days.map((d, i) => `<span>${i % 5 === 0 ? d.label : ''}</span>`).join('')
      }
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
