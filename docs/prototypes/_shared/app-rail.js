// Shared: the app's navigation rail — Agents and Projects at the top, Settings in the bottom group — drawn
// the same on every app prototype page, as the app draws it on every screen. Each item is a link to that
// section's prototype: inside the gallery it asks the gallery to switch (under file:// a page cannot
// change the parent's hash itself), opened alone it goes to the file; a modified click (⌘/Ctrl/Shift) is
// left to the browser, so an item can open in a new tab.
//
// Usage, right after the rail element (it draws synchronously, so the page's own scripts find it drawn):
//   <nav class="rail" data-shared-block="app-rail" data-rail-current="projects"></nav>
//   <script src="../_shared/app-rail.js"></script>
// with ../manifest.js and ../_shared/icons.js included before it. data-rail-current names the section the
// page belongs to; data-rail-<item>="<module>/<id>" sends an item to another prototype than its section's
// entry page (a skeleton page linking to the other skeleton). An item that leads to the page itself does
// nothing when clicked. The bottom group's [data-rail-slot] is where a page may draw something above
// Settings (the settings prototype's update button). The labels follow the page's language
// (demo-dimensions.js), in the app's words.
;(function () {
  const ITEMS = [
    { id: 'agents', icon: 'RobotFace', route: 'agents-page/agents' },
    { id: 'projects', icon: 'Folder', route: 'project-list/list' },
    { id: 'settings', icon: 'Settings', route: 'appearance/settings', bottom: true }
  ]
  // The app's rail labels (src/shared/i18n, rail.*)
  const LABEL = {
    zh: { agents: 'Agents', projects: 'Projects', settings: '设置' },
    en: { agents: 'Agents', projects: 'Projects', settings: 'Settings' },
    fr: { agents: 'Agents', projects: 'Projets', settings: 'Réglages' },
    es: { agents: 'Agents', projects: 'Proyectos', settings: 'Ajustes' },
    ru: { agents: 'Agents', projects: 'Проекты', settings: 'Настройки' },
    ja: { agents: 'Agents', projects: 'Projects', settings: '設定' }
  }

  function target(nav, item) {
    const route = nav.getAttribute(`data-rail-${item.id}`) || item.route
    const entry = (window.PROTOTYPES || []).find((p) => `${p.module}/${p.id}` === route)
    if (!entry) throw new Error(`app-rail: "${route}" is not in manifest.js (is ../manifest.js included before this script?)`)
    const href = `../${entry.path}`
    return { route, href, here: location.pathname.endsWith(`/${entry.path}`) }
  }

  function draw(nav) {
    const current = nav.dataset.railCurrent
    const link = (item) => {
      const { route, href, here } = target(nav, item)
      const on = item.id === current
      return `<a class="ri${item.bottom ? ' set' : ''}${on ? ' on' : ''}" data-rail="${item.id}" href="${href}"` +
        ` data-goto="${route}" data-goto-href="${href}"${here ? ' aria-current="page" data-rail-here' : on ? ' aria-current="true"' : ''}>` +
        `${window.ICONS[item.icon](17)}</a>`
    }
    nav.innerHTML = ITEMS.filter((i) => !i.bottom).map(link).join('') +
      `<div class="rail-bottom"><span class="rail-slot" data-rail-slot></span>${ITEMS.filter((i) => i.bottom).map(link).join('')}</div>`
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('a.ri')
      if (!a) return
      // The page's own cross-prototype helper must not handle the same click a second time
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      if (a.hasAttribute('data-rail-here')) return
      if (window.parent !== window) parent.postMessage({ type: 'proto-nav', target: a.dataset.goto }, '*')
      else location.href = a.dataset.gotoHref
    })
  }

  // Only the labels change with the language; redrawing would wipe what a page drew into the slot
  function label(nav, lang) {
    const words = LABEL[lang] || LABEL.en
    nav.querySelectorAll('a.ri').forEach((a) => {
      a.title = words[a.dataset.rail]
      a.setAttribute('aria-label', words[a.dataset.rail])
    })
  }

  const navs = [...document.querySelectorAll('nav[data-shared-block="app-rail"]')]
  navs.forEach(draw)
  if (window.DemoDimensions) window.DemoDimensions.on('language', (v) => navs.forEach((nav) => label(nav, v)))
  else navs.forEach((nav) => label(nav, 'zh'))
})()
