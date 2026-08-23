// The custom application menu (ticket 13).
//
// **Why customise it**: Electron's default menu is localised by **system language**, whereas this
// product's UI language is
// a preference the user chose — the two can differ (the spec's Chinese user on an English system). The
// default menu would freeze
// a half-translated state of "the UI is in one language and the menu in another", leaving i18n unclosed
// on the menu.
//
// **The template is a pure function** (language → menu structure), and the action is injected as a
// parameter rather than operating on BrowserWindow here:
// that would stop it being pure and make it untestable. `import type` is erased after compilation, so
// this module pulls in no Electron runtime.
//
// **A known test gap**: which language the menu **actually displays** is system-drawn by macOS and
// automation cannot reach it.
// What is testable is this function's copy and structure; "the build function returned French copy" must
// not be passed off as "the menu displays in French".
import type { MenuItemConstructorOptions } from 'electron'
import { dictOf, type Language } from '@shared/i18n'

export interface MenuActions {
  /** Switch to the settings dimension (the same operation as the rail's settings entry) */
  openSettings: () => void
}

const NOOP: MenuActions = { openSettings: () => {} }

/**
 * The structure follows the standard macOS menu set; the copy comes from the dictionaries and follows
 * the **in-app** language rather than the system one.
 * The application name Agentshed is the same in every language (ADR-0013's scope boundary).
 */
export function buildMenuTemplate(
  lang: Language,
  actions: MenuActions = NOOP
): MenuItemConstructorOptions[] {
  const t = dictOf(lang)
  const m = t.menu
  return [
    {
      label: 'Agentshed',
      submenu: [
        { label: m.about, role: 'about' },
        { type: 'separator' },
        // Settings goes in the application menu bound to Cmd+, — the standard macOS location, where
        // users will look for it
        { label: t.rail.settings, accelerator: 'CmdOrCtrl+,', click: () => actions.openSettings() },
        { type: 'separator' },
        { label: m.hide, role: 'hide' },
        { label: m.hideOthers, role: 'hideOthers' },
        { label: m.unhide, role: 'unhide' },
        { type: 'separator' },
        { label: m.quit, role: 'quit' }
      ]
    },
    {
      label: m.edit,
      submenu: [
        { label: m.undo, role: 'undo' },
        { label: m.redo, role: 'redo' },
        { type: 'separator' },
        { label: m.cut, role: 'cut' },
        { label: m.copy, role: 'copy' },
        { label: m.paste, role: 'paste' },
        { label: m.selectAll, role: 'selectAll' }
      ]
    },
    {
      label: m.view,
      submenu: [
        // ⌘R is the platform reload. The global refresh used to hold this slot as the product's
        // "rescan"; with that control removed (2026-08-23) scanning is automatic, and the shortcut
        // goes back to the reload every desktop app has — the escape hatch for a wedged window.
        { label: m.reload, accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { type: 'separator' },
        { label: m.toggleDevTools, role: 'toggleDevTools' },
        { type: 'separator' },
        { label: m.resetZoom, role: 'resetZoom' },
        { label: m.zoomIn, role: 'zoomIn' },
        { label: m.zoomOut, role: 'zoomOut' },
        { type: 'separator' },
        { label: m.fullscreen, role: 'togglefullscreen' }
      ]
    },
    {
      label: m.window,
      submenu: [
        { label: m.minimize, role: 'minimize' },
        { label: m.close, role: 'close' }
      ]
    }
  ]
}
