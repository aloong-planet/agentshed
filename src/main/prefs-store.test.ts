// appearance ticket 01: PrefsStore — the app's own prefs.json, defaulting to purple, falling back on
// corruption or invalid values, written atomically.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PrefsStore } from './prefs-store'

describe('PrefsStore', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefs-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('with no file: purple + follow the system language + follow the system appearance', () => {
    expect(new PrefsStore(dir).get()).toEqual({
      theme: 'purple',
      language: 'system',
      mode: 'system'
    })
  })

  it('setMode persists; "follow system" reads back as "follow system"', () => {
    const s = new PrefsStore(dir)
    s.setMode('dark')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
    // The key point, structurally identical to language: what is stored is the **policy**, not the
    // light/dark of that moment. If the implementation persisted "follow system"
    // as the light/dark evaluated at write time, this would read back a concrete value and
    // "follow system" would degrade into a one-off snapshot — later system appearance changes would no
    // longer be followed
    s.setMode('system')
    expect(new PrefsStore(dir).get().mode).toBe('system')
  })

  it('setLanguage persists; "follow system" reads back as "follow system"', () => {
    const s = new PrefsStore(dir)
    s.setLanguage('fr')
    expect(new PrefsStore(dir).get().language).toBe('fr')
    // The key point: what is stored is the **preference**, not the resolution. If the implementation
    // persisted "follow system" as whatever language it resolved to,
    // this would read back 'zh' or 'en' and "follow system" would have degraded into a one-off snapshot
    s.setLanguage('system')
    expect(new PrefsStore(dir).get().language).toBe('system')
  })

  it('changing one field leaves the others alone', () => {
    const s = new PrefsStore(dir)
    s.setTheme('amber')
    s.setLanguage('ru')
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'amber', language: 'ru', mode: 'system' })
    s.setTheme('blue')
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'blue', language: 'ru', mode: 'system' })
  })

  it('the two "follow system" settings, language and appearance mode, do not interfere', () => {
    // They are **independent fields** at the preference layer, and this case tests for "no accidental
    // coupling" —
    // changing the language pushing mode back to its default, or changing the mode resetting the
    // language, both go red here.
    // "Whether a system appearance change propagates to the UI" is not tested here; that is Electron's
    // responsibility (see ticket 04's responsibility boundary)
    const s = new PrefsStore(dir)
    s.setMode('dark')
    s.setLanguage('ja')
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'purple', language: 'ja', mode: 'dark' })
    // Changing the language leaves mode alone
    s.setLanguage('system')
    expect(new PrefsStore(dir).get().mode).toBe('dark')
    // Changing the mode leaves the language alone
    s.setMode('light')
    expect(new PrefsStore(dir).get().language).toBe('system')
  })

  it('one invalid field degrades only itself, without affecting the others', () => {
    // The "degradation may only hurt itself" invariant: back when there was only one field, "revert the
    // whole thing" and "revert per field"
    // behaved identically; they only parted ways once a second field was added, which is why every new
    // field has to bring this test
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ theme: 'amber', language: 'ko', mode: 'dark' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'amber', language: 'system', mode: 'dark' })
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ theme: 'neon', language: 'ja', mode: 'dark' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'purple', language: 'ja', mode: 'dark' })
  })

  it('an invalid mode degrades only mode, with the language and theme still read correctly', () => {
    // Ticket 04's AC: one invalid preference degrades only itself. Construct a file with an invalid mode
    // but a valid language and theme —
    // if the implementation reverted the whole thing, the user would lose two unrelated choices at once
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ theme: 'amber', language: 'ru', mode: 'auto' })
    )
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'amber', language: 'ru', mode: 'system' })
  })

  it('a file holding only theme: keeps it and fills in the language and mode defaults', () => {
    // A file missing fields must not lose the ones it does have. Deliberately **not** described as an
    // "old file": since the theme key was renamed without a compatible read, a genuinely old file
    // (which spelled it `scheme`) loses its theme by design — calling this the upgrade case would
    // suggest a compatibility this code does not provide.
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ theme: 'blue' }))
    expect(new PrefsStore(dir).get()).toEqual({
      theme: 'blue',
      language: 'system',
      mode: 'system'
    })
  })

  it('a file holding theme + language: keeps both and fills in the mode default', () => {
    // Same point as above: this is field-level defaulting, not cross-version key compatibility
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ theme: 'amber', language: 'fr' }))
    expect(new PrefsStore(dir).get()).toEqual({ theme: 'amber', language: 'fr', mode: 'system' })
  })

  it('setTheme persists and all three values read back', () => {
    const s = new PrefsStore(dir)
    s.setTheme('blue')
    expect(new PrefsStore(dir).get().theme).toBe('blue')
    s.setTheme('amber')
    expect(new PrefsStore(dir).get().theme).toBe('amber')
    s.setTheme('purple')
    expect(new PrefsStore(dir).get().theme).toBe('purple')
  })

  it('a corrupt or invalid theme falls back to purple without throwing', () => {
    writeFileSync(join(dir, 'prefs.json'), 'not-json')
    expect(new PrefsStore(dir).get().theme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({ theme: 'neon' }))
    expect(new PrefsStore(dir).get().theme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify({}))
    expect(new PrefsStore(dir).get().theme).toBe('purple')
    writeFileSync(join(dir, 'prefs.json'), JSON.stringify(null))
    expect(new PrefsStore(dir).get().theme).toBe('purple')
  })

  it('a valid file reads back; after writing, the disk holds an object', () => {
    writeFileSync(
      join(dir, 'prefs.json'),
      JSON.stringify({ theme: 'amber', language: 'ja', mode: 'light' }, null, 2)
    )
    expect(new PrefsStore(dir).get().theme).toBe('amber')
    const s = new PrefsStore(dir)
    s.setTheme('blue')
    const raw = JSON.parse(readFileSync(join(dir, 'prefs.json'), 'utf8')) as Record<string, string>
    expect(raw).toEqual({ theme: 'blue', language: 'ja', mode: 'light' })
  })

  it('writes are atomic: no temporary file is left in the directory', () => {
    const s = new PrefsStore(dir)
    s.setTheme('blue')
    expect(readdirSync(dir)).toEqual(['prefs.json'])
  })
})
