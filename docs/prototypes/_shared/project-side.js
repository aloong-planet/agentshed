// Shared: the Projects dimension's project column — search, the side filter, the stale toggle and its
// counter, the project rows — drawn the same on every prototype page that shows it, with the startup
// skeleton while the scan runs. The styles are project-side.css, and the one mock project list lives here,
// so every page shows the same projects.
//
// Usage, right after the column element (it draws synchronously, so the page's own scripts find it drawn):
//   <aside class="side" data-shared-block="project-side" data-side-selected="Transfer"></aside>
//   <script src="../_shared/project-side.js"></script>
// with ../manifest.js and ../_shared/icons.js included before it.
//   data-side-selected    the project the page shows; its row is selected
//   data-side-browse      the page shows no project yet: a row with no prototype of its own is selected
//                         when clicked (on any other page such a row has nothing to open)
//   data-side-show-stale  the stale toggle starts on (a page showing a stale project)
//   data-side-state       "scanning" (the startup skeleton) or "empty" (a scan that found no project)
// A row whose project has a prototype of its own opens it: inside the gallery it asks the gallery to
// switch (under file:// a page cannot change the parent's hash itself), opened alone it goes to the file.
//   ProjectSide.setState(state)  "scanning" | "empty" | "loaded", for a page that demonstrates the states
//   ProjectSide.onRender(fn)     calls fn(column) after every draw
// The copy follows the page's language (demo-dimensions.js).
;(function () {
  // Most recent first, as the app sorts them. Transfer carries all three sides: the row where the name,
  // the stale slot, the activity and the count crowd the column hardest.
  const PROJECTS = [
    { name: 'agentshed', path: '~/CascadeProjects/agentshed', sides: ['claude', 'grok'], days: 0 },
    { name: 'chatgpt-token', path: '~/CascadeProjects/chatgpt-token', sides: ['codex'], days: 1 },
    { name: 'openclaw-v3', path: '~/CascadeProjects/openclaw-v3', sides: ['claude', 'grok'], days: 2 },
    { name: 'Transfer', path: '~/CascadeProjects/Transfer', sides: ['claude', 'codex', 'grok'], days: 3, route: 'project-detail/detail' },
    { name: 'AI-Learning', path: '~/CascadeProjects/AI-Learning', sides: ['codex'], days: 5 },
    { name: 'aloong-tools', path: '~/CascadeProjects/aloong-tools', sides: ['claude'], days: 7 },
    { name: 'csv-debug-viewer', path: '~/CascadeProjects/csv-debug-viewer', sides: ['claude'], days: 30 },
    { name: 'removed-experiment-2025', path: '/Users/you/Projects/removed-experiment-2025', sides: ['claude', 'codex', 'grok'], days: 45, stale: true, route: 'project-detail/detail-stale-note' },
    { name: 'New project', path: '~/Projects/New project', sides: ['codex'], days: 60, stale: true },
    { name: 'fe', path: '~/tmp/fe', sides: ['codex'], days: 60, stale: true }
  ]
  // Product names, identical in every language (ProjectsPane's SIDE_NAME)
  const SIDE_NAME = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' }
  const plural = (l, n, forms) => forms[new Intl.PluralRules(l).select(n)] ?? forms.other
  // projects.searchPlaceholder / filterAll / showStale / staleFiltered / noMatch / staleTag
  const COPY = {
    zh: { locale: 'zh-CN', search: '搜索项目…', all: '全部', showStale: '显示失效项目', staleFiltered: (n) => `已过滤 ${n} 个失效`, noMatch: '无匹配项目', staleTag: '失效' },
    en: { locale: 'en', search: 'Search projects…', all: 'All', showStale: 'Show stale projects', staleFiltered: (n) => `${n} stale ${plural('en', n, { one: 'project', other: 'projects' })} filtered out`, noMatch: 'No matching projects', staleTag: 'Stale' },
    fr: { locale: 'fr', search: 'Rechercher des projets…', all: 'Tous', showStale: 'Afficher les projets obsolètes', staleFiltered: (n) => `${n} ${plural('fr', n, { one: 'projet obsolète filtré', other: 'projets obsolètes filtrés' })}`, noMatch: 'Aucun projet correspondant', staleTag: 'Obsolète' },
    es: { locale: 'es', search: 'Buscar proyectos…', all: 'Todos', showStale: 'Mostrar proyectos obsoletos', staleFiltered: (n) => `${n} ${plural('es', n, { one: 'proyecto obsoleto excluido', other: 'proyectos obsoletos excluidos' })}`, noMatch: 'No hay proyectos coincidentes', staleTag: 'Obsoleto' },
    ru: { locale: 'ru', search: 'Поиск проектов…', all: 'Все', showStale: 'Показывать устаревшие проекты', staleFiltered: (n) => `Отфильтровано ${n} ${plural('ru', n, { one: 'устаревший проект', few: 'устаревших проекта', many: 'устаревших проектов', other: 'устаревших проекта' })}`, noMatch: 'Нет подходящих проектов', staleTag: 'Устарел' },
    ja: { locale: 'ja', search: 'プロジェクトを検索…', all: 'すべて', showStale: '失効したプロジェクトを表示', staleFiltered: (n) => `失効 ${n} 件を除外しました`, noMatch: '一致するプロジェクトがありません', staleTag: '失効' }
  }
  let lang = 'zh'
  const t = () => COPY[lang] || COPY.en
  // = relativeDays (src/shared/format.ts): RelativeTimeFormat with numeric:'auto', months from 30 days
  function ago(days) {
    const rtf = new Intl.RelativeTimeFormat(t().locale, { numeric: 'auto' })
    return days < 30 ? rtf.format(-days, 'day') : rtf.format(-Math.floor(days / 30), 'month')
  }
  // The surface FloatingBox gives every floating layer (src/renderer/src/FloatingBox.tsx); position:fixed
  // is what carries the layer out of the list's overflow clipping
  const SURFACE = 'position:fixed;z-index:30;background:var(--card);border:1px solid var(--line-strong);' +
    'border-radius:9px;box-shadow:0 6px 22px var(--float-shadow);'
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  function target(route) {
    const entry = (window.PROTOTYPES || []).find((p) => `${p.module}/${p.id}` === route)
    if (!entry) throw new Error(`project-side: "${route}" is not in manifest.js (is ../manifest.js included before this script?)`)
    return { route, href: `../${entry.path}`, here: location.pathname.endsWith(`/${entry.path}`) }
  }
  function open(route) {
    if (window.parent !== window) parent.postMessage({ type: 'proto-nav', target: route }, '*')
    else location.href = target(route).href
  }

  const columns = []
  const listeners = []

  function mount(el) {
    const c = {
      el,
      state: el.dataset.sideState || 'loaded',
      selected: el.dataset.sideSelected || null,
      browse: el.hasAttribute('data-side-browse'),
      showStale: el.hasAttribute('data-side-show-stale'),
      kw: '',
      filter: 'all'
    }
    columns.push(c)
    build(c)
  }

  // ── The column's frame, drawn once per state; typing and filtering only redraw the rows ──
  function build(c) {
    const { el } = c
    el.classList.toggle('sk-page', c.state === 'scanning')
    if (c.state === 'scanning') el.setAttribute('aria-hidden', 'true')
    else el.removeAttribute('aria-hidden')
    const scanning = c.state === 'scanning'
    el.innerHTML =
      `<div class="sh"><div class="sh-field">${ICONS.Search(13)}<input${scanning ? ' disabled' : ''}></div></div>` +
      `<div class="opts"><button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"${scanning ? ' tabindex="-1"' : ''}></button>` +
      `<label><input type="checkbox"${scanning ? ' disabled' : ''}${c.showStale ? ' checked' : ''}><span></span></label>` +
      `<span class="cnt"></span></div>` +
      `<div class="list"></div>` +
      `<div class="side-pop" style="${SURFACE}padding:4px" hidden><div role="listbox"></div></div>` +
      `<div class="sides-tip" style="${SURFACE}padding:6px 9px" hidden></div>`
    const input = el.querySelector('.sh input')
    input.value = c.kw
    input.oninput = () => { c.kw = input.value; rows(c) }
    el.querySelector('.opts input').onchange = (e) => { c.showStale = e.target.checked; rows(c) }
    el.querySelector('.dd-trigger').onclick = (e) => {
      e.stopPropagation()
      if (popOpen(c)) closePop(c)
      else openPop(c)
    }
    copy(c)
  }

  function copy(c) {
    const { el } = c
    el.querySelector('.sh input').placeholder = t().search
    el.querySelector('.opts label span').textContent = t().showStale
    trigger(c)
    rows(c)
    if (popOpen(c)) openPop(c)
  }

  const label = (f) => (f === 'all' ? t().all : SIDE_NAME[f])
  function trigger(c) {
    c.el.querySelector('.dd-trigger').innerHTML = `<span>${esc(label(c.filter))}</span><span class="chev">${ICONS.ChevronDown(11)}</span>`
  }

  // ── The rows (ProjectsPane's filter: side, then name or path, then stale) ──
  function rows(c) {
    const { el } = c
    const list = el.querySelector('.list')
    const cnt = el.querySelector('.opts .cnt')
    if (c.state === 'scanning') {
      // ProjectsSkeleton: name widths staggered like real names, one fixed shape on every launch
      list.innerHTML = [128, 96, 142, 88, 150, 104, 120, 134, 92].map((w, i) => {
        const d = `animation-delay:${(i % 6) * 0.12}s`
        return `<div class="row"><span class="nm"><span class="sk-line">​<span class="sk-ph" style="width:${w}px;height:10px;${d}"></span></span></span>` +
          `<span class="meta"><span class="sk-line">​<span class="sk-ph" style="width:34px;height:8px;${d}"></span></span></span>` +
          `<span class="sk-ph" style="width:26px;height:17px;border-radius:9px;${d}"></span></div>`
      }).join('')
      cnt.hidden = true
      listeners.forEach((fn) => fn(el))
      return
    }
    const k = c.kw.trim().toLowerCase()
    const base = (c.state === 'empty' ? [] : PROJECTS)
      .filter((p) => c.filter === 'all' || p.sides.includes(c.filter))
      .filter((p) => !k || p.name.toLowerCase().includes(k) || p.path.toLowerCase().includes(k))
    const visible = base.filter((p) => c.showStale || !p.stale).sort((a, b) => a.days - b.days)
    const filtered = base.length - visible.length
    cnt.hidden = c.showStale || filtered === 0
    cnt.textContent = cnt.title = t().staleFiltered(filtered)
    list.innerHTML = visible.map((p) => {
      const link = p.route ? target(p.route) : null
      return `<div class="row${p.stale ? ' stale' : ''}${c.selected === p.name ? ' sel' : ''}" data-project="${esc(p.name)}" title="${esc(p.path)}"` +
        `${link ? ` data-goto="${link.route}" data-goto-href="${link.href}"` : ''}>` +
        `<span class="nm">${esc(p.name)}</span>` +
        `${p.stale ? `<span class="stale-tag">${esc(t().staleTag)}</span>` : ''}` +
        `<span class="meta">${esc(ago(p.days))}</span>` +
        `<span class="cnt-b" data-sides="${p.sides.join(',')}">${ICONS.Bot(11)}${p.sides.length}</span></div>`
    }).join('') || `<div class="list-empty">${esc(t().noMatch)}</div>`
    listeners.forEach((fn) => fn(el))
  }

  // ── The side filter's layer: left-aligned below the trigger ──
  const popOpen = (c) => !c.el.querySelector('.side-pop').hidden
  function openPop(c) {
    const pop = c.el.querySelector('.side-pop')
    const trig = c.el.querySelector('.dd-trigger')
    pop.firstChild.innerHTML = ['all', ...Object.keys(SIDE_NAME)].map((f) =>
      `<button type="button" role="option" aria-selected="${f === c.filter}" class="dd-opt${f === c.filter ? ' on' : ''}" data-f="${f}">` +
      `${f === 'all' ? '' : `<i class="dot ${f}"></i>`}<span class="n">${esc(label(f))}</span><span class="ck">${ICONS.Check(13)}</span></button>`).join('')
    place(c)
    pop.hidden = false
    trig.setAttribute('aria-expanded', 'true')
  }
  function place(c) {
    const r = c.el.querySelector('.dd-trigger').getBoundingClientRect()
    const pop = c.el.querySelector('.side-pop')
    pop.style.left = `${r.left}px`
    pop.style.top = `${r.bottom + 6}px`
  }
  function closePop(c) {
    c.el.querySelector('.side-pop').hidden = true
    c.el.querySelector('.dd-trigger').setAttribute('aria-expanded', 'false')
  }

  // ── The sides layer: right edges aligned under the count badge ──
  function showTip(c, badge) {
    const tip = c.el.querySelector('.sides-tip')
    tip.innerHTML = badge.dataset.sides.split(',').map((s) => `<div class="st"><i class="dot ${s}"></i>${SIDE_NAME[s]}</div>`).join('')
    const r = badge.getBoundingClientRect()
    tip.style.right = `${window.innerWidth - r.right}px`
    tip.style.top = `${r.bottom + 6}px`
    tip.hidden = false
  }
  const hideTip = (c) => { c.el.querySelector('.sides-tip').hidden = true }

  function wire(c) {
    const { el } = c
    el.addEventListener('click', (e) => {
      const opt = e.target.closest('.dd-opt')
      if (opt) {
        c.filter = opt.dataset.f
        closePop(c)
        trigger(c)
        rows(c)
        return
      }
      const row = e.target.closest('.row[data-project]')
      if (!row) return
      // The page's own cross-prototype helper must not handle the same click a second time
      e.stopPropagation()
      const p = PROJECTS.find((x) => x.name === row.dataset.project)
      if (p.route && !target(p.route).here) return open(p.route)
      if (c.browse && !p.route) {
        c.selected = p.name
        rows(c)
      }
    })
    el.addEventListener('mouseover', (e) => {
      const badge = e.target.closest('.cnt-b')
      if (badge) showTip(c, badge)
    })
    el.addEventListener('mouseout', (e) => {
      if (e.target.closest('.cnt-b') && !e.relatedTarget?.closest?.('.cnt-b')) hideTip(c)
    })
  }

  // Clicking outside closes the filter's layer; any scroll but a layer's own dismisses both layers; a
  // resize repositions the filter (it is being operated) and dismisses the sides layer (it is a glance).
  // A resize clamps scroll positions and fires a scroll of its own, which must not count as the user's.
  let lastResize = -1e9
  document.addEventListener('click', (e) => {
    for (const c of columns) if (popOpen(c) && !c.el.querySelector('.side-pop').contains(e.target)) closePop(c)
  })
  document.addEventListener('scroll', (e) => {
    if (performance.now() - lastResize < 150) return
    for (const c of columns) {
      if (popOpen(c) && !c.el.querySelector('.side-pop').contains(e.target)) closePop(c)
      if (!c.el.querySelector('.sides-tip').contains(e.target)) hideTip(c)
    }
  }, true)
  window.addEventListener('resize', () => {
    lastResize = performance.now()
    for (const c of columns) {
      if (popOpen(c)) place(c)
      hideTip(c)
    }
  })

  document.querySelectorAll('aside[data-shared-block="project-side"]').forEach((el) => {
    mount(el)
    wire(columns[columns.length - 1])
  })
  if (window.DemoDimensions) {
    window.DemoDimensions.on('language', (v) => {
      lang = v
      columns.forEach(copy)
    })
  }

  window.ProjectSide = {
    setState(state) {
      for (const c of columns) {
        c.state = state
        build(c)
      }
    },
    onRender(fn) {
      listeners.push(fn)
      columns.forEach((c) => fn(c.el))
    }
  }
})()
