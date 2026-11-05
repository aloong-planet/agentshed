// The app's own preferences (userData/prefs.json). Never the agent configuration. Atomic writes:
// a temporary file + rename, so an interruption leaves no half file.
import { readFileSync } from 'node:fs'
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
import { ERR, appError } from '@shared/errors'

import { isTrendSpan, TREND_WINDOW_DAYS, type TrendSpan } from '@shared/trend'
import { writeFileAtomicSync } from './providers/atomic-write'
import { isAbsent } from './providers/read-utils'

export type { Prefs }

export class PrefsStore {
  private readonly file: string
  private readonly dir: string
  private prefs: Prefs
  /**
   * The file exists and could not be read at launch, so memory holds defaults and not the user's choices: writing them
   * would overwrite those choices (#367). It holds for the whole run, even if the file becomes readable, since what
   * memory holds has not changed.
   */
  private unreadable = false

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

  setTrendSpan(trendSpan: TrendSpan): Prefs {
    this.prefs = { ...this.prefs, trendSpan }
    this.persist()
    return this.get()
  }

  setAutoCheckUpdates(autoCheckUpdates: boolean): Prefs {
    this.prefs = { ...this.prefs, autoCheckUpdates }
    this.persist()
    return this.get()
  }

  private load(): Prefs {
    let text: string
    try {
      text = readFileSync(this.file, 'utf8')
    } catch (error) {
      if (isAbsent(this.file)) return { ...DEFAULT_PREFS }
      console.error('[prefs] read failed, so no save will replace the file this run:', error)
      this.unreadable = true
      // Off, unlike the other defaults: the default is on, and the app cannot know the user allowed them (AGENTS.md, on
      // automatic update checks). Turning them on from here is the user asking, so that holds
      return { ...DEFAULT_PREFS, autoCheckUpdates: false }
    }
    return this.parse(text)
  }

  /**
   * Reading degrades **per field**: one invalid entry falls back on its own without affecting the others.
   * This is the "degradation may only hurt itself" invariant applied to preferences — back when there was
   * only one field,
   * "revert the whole thing" and "revert per field" behaved identically, and they parted ways the moment
   * a second field was added.
   */
  private parse(text: string): Prefs {
    try {
      const raw: unknown = JSON.parse(text)
      if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS }
      const r = raw as Record<string, unknown>
      const theme = r['theme']
      const language = r['language']
      const mode = r['mode']
      const trendSpan = r['trendSpan']
      const autoCheckUpdates = r['autoCheckUpdates']
      return {
        theme: isAppearanceTheme(theme) ? theme : DEFAULT_THEME,
        language: isLanguagePreference(language) ? language : DEFAULT_LANGUAGE_PREFERENCE,
        mode: isAppearanceMode(mode) ? mode : DEFAULT_MODE,
        trendSpan: isTrendSpan(trendSpan) ? trendSpan : TREND_WINDOW_DAYS,
        autoCheckUpdates: typeof autoCheckUpdates === 'boolean' ? autoCheckUpdates : DEFAULT_PREFS.autoCheckUpdates
      }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  }

  /**
   * A failure leaves the choice in memory, in effect until a restart, and crosses IPC as a code: the system's
   * message names the file, and all the window has to say is what failed and what that means (docs/specs/i18n.md).
   * The cause stays in the log, the one place it is any use.
   */
  private persist(): void {
    if (this.unreadable) throw appError(ERR.prefsWriteFailed)
    try {
      writeFileAtomicSync(this.file, join(this.dir, `.prefs.json.tmp-${process.pid}`), JSON.stringify(this.prefs, null, 2))
    } catch (error) {
      console.error('[prefs] save failed:', error)
      throw appError(ERR.prefsWriteFailed)
    }
  }
}
