// Shared: the app's navigation rail — Agents and Projects at the top, Settings in the bottom group — drawn
// the same on every app prototype page, as the app draws it on every screen. Each item carries data-goto to
// that section's prototype, which the page's navigation helper follows (the prototype skill's
// cross-prototype navigation); an item that leads to the page itself carries none and does nothing.
//
// Usage, right after the rail element (it draws synchronously, so the page's own scripts find it drawn):
//   <nav class="rail" data-shared-block="app-rail" data-rail-current="projects"></nav>
//   <script src="../_shared/app-rail.js"></script>
// with ../manifest.js and ../_shared/icons.js included before it. data-rail-current names the section the
// page belongs to; data-rail-<item>="<module>/<id>" sends an item to another prototype than its section's
// entry page (a skeleton page linking to the other skeleton). The bottom group's [data-rail-slot] is where a
// page may draw something above Settings (the settings prototype's update button). The labels follow the
// page's language (demo-dimensions.js).
;(function () {
  const ITEMS = [
    { id: 'agents', icon: 'RobotFace', route: 'agents-page/agents' },
    { id: 'projects', icon: 'Folder', route: 'project-list/list' },
    { id: 'settings', icon: 'Settings', route: 'appearance/settings', bottom: true }
  ]
  // The rail labels
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
    const item = (it) => {
      const { route, href, here } = target(nav, it)
      const on = it.id === current
      // An item leading to the page itself stays static: its landing is the screen already shown
      const goto = here ? '' : ` data-goto="${route}" data-goto-href="${href}"`
      return `<button type="button" class="ri${it.bottom ? ' set' : ''}${on ? ' on' : ''}" data-rail="${it.id}"${goto}` +
        `${here ? ' aria-current="page"' : on ? ' aria-current="true"' : ''}>${window.ICONS[it.icon](17)}</button>`
    }
    nav.innerHTML = ITEMS.filter((i) => !i.bottom).map(item).join('') +
      `<div class="rail-bottom"><span class="rail-slot" data-rail-slot></span>${ITEMS.filter((i) => i.bottom).map(item).join('')}</div>`
  }

  // Only the labels change with the language; redrawing would wipe what a page drew into the slot
  function label(nav, lang) {
    const words = LABEL[lang] || LABEL.en
    // Only the rail's own items: a page may draw another .ri into the slot (the settings prototype's update button)
    nav.querySelectorAll('.ri[data-rail]').forEach((b) => {
      b.title = words[b.dataset.rail]
      b.setAttribute('aria-label', words[b.dataset.rail])
    })
  }

  const navs = [...document.querySelectorAll('nav[data-shared-block="app-rail"]')]
  navs.forEach(draw)
  if (window.DemoDimensions) window.DemoDimensions.on('language', (v) => navs.forEach((nav) => label(nav, v)))
  else navs.forEach((nav) => label(nav, 'zh'))
})()
