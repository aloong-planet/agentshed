// Ticket 13: building the custom application menu's template.
//
// **What can and cannot be tested was settled in the ticket**: the template is a pure function of
// "language → menu structure", so its copy and structure are unit testable;
// while **which language the menu actually displays is drawn by macOS and automation cannot reach it**.
// "The build function returned Chinese copy" must not be passed off as "the menu displays in Chinese" —
// the latter can only be accepted by hand.
import { describe, it, expect } from 'vitest'
import { LANGUAGES, dictOf } from '@shared/i18n'
import { buildMenuTemplate } from './app-menu'

const labels = (lang: Parameters<typeof buildMenuTemplate>[0]): string[] =>
  buildMenuTemplate(lang).map((m) => String(m.label ?? ''))

describe('buildMenuTemplate', () => {
  it('both languages build a non-empty menu with the same number of top-level items', () => {
    const counts = new Set(LANGUAGES.map((l) => buildMenuTemplate(l).length))
    expect(counts.size).toBe(1)
    for (const lang of LANGUAGES) expect(buildMenuTemplate(lang).length).toBeGreaterThan(0)
  })

  it('the top-level copy changes with the language rather than being hard-coded to one', () => {
    // Asserting only "there is a label" cannot distinguish a real dictionary lookup from hard-coded text;
    // languages have to be compared against each other
    expect(labels('zh')).not.toEqual(labels('en'))
  })

  it('every top-level item\'s copy comes from the dictionaries, with no empty label', () => {
    for (const lang of LANGUAGES) {
      for (const l of labels(lang)) expect(l.length).toBeGreaterThan(0)
    }
  })

  it('the application name is the same in every language (a brand name is not localised)', () => {
    // ADR-0013's scope boundary: Agentshed stays the same in every language as a brand name
    for (const lang of LANGUAGES) expect(labels(lang)[0]).toBe('Agentshed')
  })

  it('⌘, opens settings and ⌘R is the platform reload, not an app action', () => {
    // The global refresh used to own ⌘R and shadowed the reload every desktop app has (removed
    // 2026-08-23). The accelerator must be back on the platform role: a click-driven item here would
    // mean the app has taken the shortcut over again.
    const all = buildMenuTemplate('zh').flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    const accels = all.map((i) => String((i as { accelerator?: string }).accelerator ?? ''))
    expect(accels).toContain('CmdOrCtrl+,') // Settings: the standard macOS slot
    const cmdR = all.find((i) => (i as { accelerator?: string }).accelerator === 'CmdOrCtrl+R')
    expect(cmdR, '⌘R must still be bound — to the reload role').toBeDefined()
    expect((cmdR as { role?: string }).role).toBe('reload')
    expect((cmdR as { click?: () => void }).click).toBeUndefined()
  })

  it('the settings entry point\'s copy shares its source with the same-named operation in the UI', () => {
    // The menu calling it "Settings" while the UI calls it something else gives one feature two names —
    // users would take them for two different things
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      const flat = buildMenuTemplate(lang)
        .flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
        .map((i) => String((i as { label?: string }).label ?? ''))
      expect(flat).toContain(t.rail.settings)
      expect(flat).toContain(t.menu.reload)
    }
  })

  it('the settings entry point calls the injected action rather than touching the window itself', () => {
    // Injected rather than operating on BrowserWindow inside the template: that would stop it being pure
    // and make it untestable
    const called: string[] = []
    const tpl = buildMenuTemplate('zh', {
      openSettings: () => called.push('settings'),
      checkForUpdates: () => called.push('updates'),
      openSearch: () => called.push('search')
    })
    const items = tpl.flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : []))
    for (const i of items) {
      const click = (i as { click?: () => void }).click
      if (click) click()
    }
    // "Check for Updates…" comes first, directly below "About"; "Search Sessions…" closes the Edit menu
    expect(called).toEqual(['updates', 'settings', 'search'])
  })

  const appItems = (lang: Parameters<typeof buildMenuTemplate>[0], canCheck = false) => {
    const sub = buildMenuTemplate(lang, undefined, canCheck)[0].submenu
    return (Array.isArray(sub) ? sub : []) as Array<{ label?: string; role?: string; enabled?: boolean }>
  }

  it('"Check for Updates…" sits directly below "About Agentshed", in the in-app language (app-update::REQ-005)', () => {
    expect(appItems('en')[1].label).toBe('Check for Updates…')
    expect(appItems('zh')[1].label).toBe('检查更新…')
    for (const lang of LANGUAGES) {
      const items = appItems(lang)
      expect(items[0].role, lang).toBe('about')
      expect(items[1].label, lang).toBe(dictOf(lang).menu.checkForUpdates)
    }
  })

  it('it is disabled in a development run and enabled in a run that checks for updates (app-update::US-005/AC-02)', () => {
    expect(appItems('en')[1].enabled).toBe(false)
    expect(appItems('en', true)[1].enabled).toBe(true)
  })

  type Item = { label?: string; role?: string; id?: string; type?: string; accelerator?: string }
  const editItems = (lang: Parameters<typeof buildMenuTemplate>[0]): Item[] => {
    const sub = buildMenuTemplate(lang)[1].submenu
    return Array.isArray(sub) ? sub : []
  }

  it('"Search Sessions…" closes the Edit menu after a separator, bound to ⌘⇧F, in the in-app language (global-search::US-004/AC-02)', () => {
    for (const lang of LANGUAGES) {
      const [selectAll, separator, item] = editItems(lang).slice(-3)
      expect(selectAll.role, lang).toBe('selectAll')
      expect(separator.type, lang).toBe('separator')
      expect(item.id, lang).toBe('searchSessions')
      expect(item.accelerator, lang).toBe('CmdOrCtrl+Shift+F')
      expect(item.label, lang).toBe(dictOf(lang).menu.searchSessions)
    }
    expect(editItems('en').at(-1)?.label).toBe('Search Sessions…')
    expect(editItems('zh').at(-1)?.label).toBe('搜索会话…')
    expect(new Set(LANGUAGES.map((l) => editItems(l).at(-1)?.label)).size).toBe(LANGUAGES.length)
    // No other entry in the template names the same accelerator string (the installed menu's check, with the
    // chord normalised and the roles' own accelerators included, is the global search e2e's)
    const all = buildMenuTemplate('en').flatMap((m) => (Array.isArray(m.submenu) ? m.submenu : [])) as Item[]
    expect(all.filter((i) => i.accelerator === 'CmdOrCtrl+Shift+F').map((i) => i.id)).toEqual(['searchSessions'])
  })
})
