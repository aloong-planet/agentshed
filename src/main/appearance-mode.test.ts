// Ticket 04: the appearance mode preference → nativeTheme.themeSource.
//
// **What is and is not tested** (the responsibility boundary): this ticket's implementation responsibility
// ends at setting themeSource correctly; whether a system appearance change then propagates to the UI is
// the responsibility of Electron and
// Chromium. So only the assignment itself is asserted, with no case of the form "the UI follows after
// themeSource changes" —
// that would use the value we just set to prove we set it correctly, which is circular and would be a
// permanently green assertion in CI.
// The propagation is filed as evidence (switching the system appearance by hand, with screenshots).
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { APPEARANCE_MODES } from '@shared/appearance'
import { applyAppearanceMode, type ThemeSourceTarget } from './appearance-mode'
import { PrefsStore } from './prefs-store'

/** A stand-in for nativeTheme: it only needs a writable themeSource, the same shape as the real object */
function fakeNativeTheme(): ThemeSourceTarget {
  return { themeSource: 'system' }
}

describe('applyAppearanceMode', () => {
  it('each of the three preferences maps to its corresponding themeSource value', () => {
    // All three states are asserted rather than just one: testing one state cannot distinguish "the
    // mapping is correct" from "it always assigns the same value"
    for (const mode of APPEARANCE_MODES) {
      const nt = fakeNativeTheme()
      // Set it to something other than the expectation first, or in the 'system' round the initial value
      // would happen to equal the expectation and
      // "no assignment happened" and "the right assignment happened" would look identical
      nt.themeSource = mode === 'dark' ? 'light' : 'dark'
      applyAppearanceMode(nt, mode)
      expect(nt.themeSource).toBe(mode)
    }
  })
})

describe('the full path from preference to themeSource', () => {
  let dir: string
  const withStore = (fn: (dir: string) => void): void => {
    dir = mkdtempSync(join(tmpdir(), 'appearance-mode-'))
    try {
      fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('with no preference file it lands on "follow system"', () => {
    withStore((d) => {
      const nt = fakeNativeTheme()
      nt.themeSource = 'dark'
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('system')
    })
  })

  it('a locked preference reads back as the locked value', () => {
    withStore((d) => {
      const s = new PrefsStore(d)
      s.setMode('dark')
      const nt = fakeNativeTheme()
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('dark')
    })
  })

  it('an invalid mode degrades to follow-system rather than passing the invalid value to themeSource', () => {
    withStore((d) => {
      writeFileSync(
        join(d, 'prefs.json'),
        JSON.stringify({ theme: 'purple', language: 'zh', mode: 'auto' })
      )
      const nt = fakeNativeTheme()
      nt.themeSource = 'light'
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('system')
    })
  })

  it('changing the language preference does not touch themeSource', () => {
    // The AC: the two "follow system" settings, language and light/dark, do not interfere. The preference
    // layer's independence is already tested in prefs-store,
    // and this observes it once more at the layer the AC names (themeSource) — if setLanguage were to
    // push mode
    // back to its default, this would go from 'dark' to 'system'
    withStore((d) => {
      const s = new PrefsStore(d)
      s.setMode('dark')
      s.setLanguage('ja')
      const nt = fakeNativeTheme()
      applyAppearanceMode(nt, new PrefsStore(d).get().mode)
      expect(nt.themeSource).toBe('dark')
    })
  })
})
