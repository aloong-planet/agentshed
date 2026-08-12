// The app's own preferences (userData/prefs.json). Never the agent configuration. Atomic writes as in
// HiddenStore.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  isAppearanceMode,
  isAppearanceTheme,
  type AppearanceMode,
  type AppearanceTheme
} from '@shared/appearance'
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  isLanguagePreference,
  type LanguagePreference
} from '@shared/i18n'
import { DEFAULT_PREFS, type Prefs } from '@shared/prefs'

export type { Prefs }

export class PrefsStore {
  private readonly file: string
  private readonly dir: string
  private prefs: Prefs

  constructor(storeDir: string) {
    this.dir = storeDir
    this.file = join(storeDir, 'prefs.json')
    this.prefs = this.load()
  }

  get(): Prefs {
    return { ...this.prefs }
  }

  setTheme(theme: AppearanceTheme): Prefs {
    this.prefs = { ...this.prefs, theme }
    this.persist()
    return this.get()
  }

  setLanguage(language: LanguagePreference): Prefs {
    this.prefs = { ...this.prefs, language }
    this.persist()
    return this.get()
  }

  setMode(mode: AppearanceMode): Prefs {
    this.prefs = { ...this.prefs, mode }
    this.persist()
    return this.get()
  }

  /**
   * Reading degrades **per field**: one invalid entry falls back on its own without affecting the others.
   * This is the "degradation may only hurt itself" invariant applied to preferences — back when there was
   * only one field,
   * "revert the whole thing" and "revert per field" behaved identically, and they parted ways the moment
   * a second field was added.
   */
  private load(): Prefs {
    if (!existsSync(this.file)) return { ...DEFAULT_PREFS }
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS }
      const r = raw as Record<string, unknown>
      const theme = r['theme']
      const language = r['language']
      const mode = r['mode']
      return {
        theme: isAppearanceTheme(theme) ? theme : DEFAULT_THEME,
        language: isLanguagePreference(language) ? language : DEFAULT_LANGUAGE_PREFERENCE,
        mode: isAppearanceMode(mode) ? mode : DEFAULT_MODE
      }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  }

  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.prefs.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(this.prefs, null, 2))
    renameSync(tmp, this.file)
  }
}
