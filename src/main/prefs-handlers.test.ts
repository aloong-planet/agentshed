// issue #60: once the preference IPC handlers were extracted into an injectable seam, the behaviours
// previously guaranteed only by the order of statements in index.ts
// finally became testable — especially **the ordering of "set themeSource before persisting"**.
//
// This does not test "whether a system appearance change propagates to the UI once themeSource is set":
// that is Electron's responsibility,
// and simulating a system change with themeSource is circular (see the same note in
// appearance-mode.test.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_PREFS } from '@shared/prefs'
import { ERR, decodeAppError } from '@shared/errors'
import { PrefsStore } from './prefs-store'
import type { ThemeSourceTarget } from './appearance-mode'
import { createPrefsHandlers } from './prefs-handlers'

/**
 * Take the thrown error's structured code. Codes are asserted rather than wording: the wording is now
 * produced by the renderer per language,
 * and asserting on it would pin UI copy into a main-process test (exactly the coupling ADR-0015 exists to
 * eliminate).
 */
function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return decodeAppError(e)?.code ?? null
  }
}

describe('the preference handlers', () => {
  let dir: string
  let store: PrefsStore
  let theme: ThemeSourceTarget

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefs-handlers-'))
    store = new PrefsStore(dir)
    theme = { themeSource: 'system' }
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const handlers = (): ReturnType<typeof createPrefsHandlers> =>
    createPrefsHandlers({ store: () => store, theme })

  it('setMode: a valid value persists and sets themeSource immediately', () => {
    expect(handlers().setMode('dark')).toEqual({ ...DEFAULT_PREFS, mode: 'dark' })
    expect(theme.themeSource).toBe('dark')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
  })

  it('setMode: **themeSource is still set when persisting fails**', () => {
    // This is #60's bullseye: written the other way round (persist first, then set themeSource), the
    // exception is thrown before
    // themeSource is set, so the renderer has optimistically ticked "dark" while the UI has not changed —
    // the notice says it failed and
    // the UI does not move either, a double frustration. In the correct order a failure loses only the
    // persistence: it works for this session and reverts on restart.
    //
    // A **real** PrefsStore produces a real persistence failure: point the storage directory at a path
    // whose parent is a file,
    // so the mkdirSync inside persist() is bound to throw ENOTDIR. Nothing is stubbed; this is the real
    // failure path.
    const asFile = join(dir, 'not-a-dir')
    writeFileSync(asFile, 'x')
    const blocked = new PrefsStore(join(asFile, 'sub'))
    const h = createPrefsHandlers({ store: () => blocked, theme })

    // Assert the error came from **persisting** rather than elsewhere: a bare toThrow() cannot
    // distinguish "persist threw" from
    // "validation or the readiness check threw first", and in those cases themeSource should not have been
    // set at all,
    // which would make this case green and meaningless
    expect(() => h.setMode('dark')).toThrow(/ENOTDIR|ENOENT/)
    expect(theme.themeSource).toBe('dark')
  })

  it('setMode: an invalid value throws, and **must not pass the invalid value to themeSource**', () => {
    expect(codeOf(() => handlers().setMode('auto'))).toBe(ERR.invalidPref)
    expect(theme.themeSource).toBe('system')
  })

  it('setMode: throws when preference storage is not ready, without touching themeSource', () => {
    // The order of checks matters: setting themeSource while storage is not ready means the UI changed
    // and nothing was remembered
    const h = createPrefsHandlers({ store: () => null, theme })
    expect(codeOf(() => h.setMode('dark'))).toBe(ERR.prefsStoreNotReady)
    expect(theme.themeSource).toBe('system')
  })

  it('setScheme / setLanguage: a valid value persists and an invalid one throws', () => {
    expect(handlers().setScheme('blue').scheme).toBe('blue')
    expect(handlers().setLanguage('ja').language).toBe('ja')
    expect(codeOf(() => handlers().setScheme('neon'))).toBe(ERR.invalidPref)
    expect(codeOf(() => handlers().setLanguage('ko'))).toBe(ERR.invalidPref)
    // An invalid call must leave no trace
    expect(new PrefsStore(dir).get()).toEqual({ scheme: 'blue', language: 'ja', mode: 'system' })
  })

  it('neither setScheme nor setLanguage touches themeSource', () => {
    // "Language and light/dark do not interfere", realised at the handler layer
    handlers().setScheme('amber')
    handlers().setLanguage('ru')
    expect(theme.themeSource).toBe('system')
  })

  it('getPrefs: returns the defaults rather than throwing when storage is not ready', () => {
    // The first frame may precede the assignment in whenReady, and throwing here would leave the renderer
    // with no preferences at all
    expect(createPrefsHandlers({ store: () => null, theme }).getPrefs()).toEqual(DEFAULT_PREFS)
  })
})
