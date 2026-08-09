// The **logic** of the preference IPC handlers (issue #60).
//
// Extracted from index.ts for one reason only: to make these behaviours testable. They were previously
// guaranteed only by the order of statements in index.ts,
// and index.ts is the assembly layer, deliberately not unit tested per ADR-0002 — so an ordering
// requirement such as "set themeSource
// before persisting" had no test that would go red. Turned into a factory taking injections, the same
// behaviour can be driven
// without pulling in Electron (both the store and the themeSource target come in as parameters).
//
// index.ts is left with only the wiring: pass in the real prefsStore and nativeTheme, then hang them on
// the channels.
import { isAppearanceMode, isAppearanceScheme } from '@shared/appearance'
import { isLanguagePreference } from '@shared/i18n'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs'
import { ERR, appError } from '@shared/errors'
import { applyAppearanceMode, type ThemeSourceTarget } from './appearance-mode'
import type { PrefsStore } from './prefs-store'

export interface PrefsHandlerDeps {
  /**
   * **Fetched lazily**: the main process's prefsStore is a module-level variable, not assigned until
   * `app.whenReady()`,
   * while the handlers are registered before that. Passing an instance would always get null, hence a
   * getter.
   */
  store: () => PrefsStore | null
  /** The real implementation is Electron's nativeTheme; tests pass a same-shaped stand-in */
  theme: ThemeSourceTarget
}

export interface PrefsHandlers {
  getPrefs: () => Prefs
  setScheme: (scheme: unknown) => Prefs
  setLanguage: (language: unknown) => Prefs
  setMode: (mode: unknown) => Prefs
}

export function createPrefsHandlers(deps: PrefsHandlerDeps): PrefsHandlers {
  /** Get the store; throw if it is not ready — a write has no "remember it in memory and catch up
   * later" semantics */
  const required = (): PrefsStore => {
    const s = deps.store()
    if (!s) throw appError(ERR.prefsStoreNotReady)
    return s
  }

  return {
    // Reads do not throw: the first frame may precede whenReady's assignment, and throwing would leave
    // the renderer with no preferences at all
    getPrefs: () => deps.store()?.get() ?? { ...DEFAULT_PREFS },

    setScheme: (scheme) => {
      if (!isAppearanceScheme(scheme)) throw appError(ERR.invalidPref, { field: 'scheme' })
      return required().setScheme(scheme)
    },

    setLanguage: (language) => {
      if (!isLanguagePreference(language)) throw appError(ERR.invalidPref, { field: 'language' })
      return required().setLanguage(language)
    },

    setMode: (mode) => {
      if (!isAppearanceMode(mode)) throw appError(ERR.invalidPref, { field: 'mode' })
      // Validation and the readiness check both come **before** setting themeSource: an invalid value
      // must not reach themeSource,
      // and an unready store must not produce "the UI changed but nothing was remembered".
      const store = required()
      // **Apply first, then persist**, the same rule as the colour scheme (spec sequence A2) and
      // language. The order matters: written the other way round,
      // a persistence failure (a full or read-only disk) would throw before themeSource is set, so the
      // renderer would have optimistically ticked the chosen mode
      // while the UI did not change — the notice says it failed and the UI does not move either, a double
      // frustration. In the current order a failure loses only the persistence:
      // it works for this session and reverts to the on-disk value after a restart. Pinned by
      // prefs-handlers.test.ts.
      applyAppearanceMode(deps.theme, mode)
      return store.setMode(mode)
    }
  }
}
