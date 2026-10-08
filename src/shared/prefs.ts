// The contract for the app's own preferences (landed in userData, **never written to the agent
// configuration**).
//
// Each preference's own type is defined in its domain module (the theme in ./appearance, the UI
// language in ./i18n),
// and this file only assembles them into one preferences object and guards the cross-process entry
// point. Preferences keep being added, hence its own file —
// putting it inside one domain module would make that module a misnomer.
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  isAppearanceMode,
  isAppearanceTheme,
  type AppearanceMode,
  type AppearanceTheme
} from './appearance'
import { DEFAULT_LANGUAGE_PREFERENCE, isLanguagePreference, type LanguagePreference } from './i18n'

import { isTrendSpan, TREND_WINDOW_DAYS, type TrendSpan } from './trend'

export interface Prefs {
  theme: AppearanceTheme
  /** What is persisted is **the preference** (which may be "follow system"), not the resolved effective
   * language */
  language: LanguagePreference
  /** As above: what is persisted is the policy (which may be "follow system"), not the effective
   * light/dark evaluated at that moment */
  mode: AppearanceMode
  trendSpan: TrendSpan
}

export const DEFAULT_PREFS: Prefs = {
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE_PREFERENCE,
  mode: DEFAULT_MODE,
  trendSpan: TREND_WINDOW_DAYS
}

/**
 * The IPC / preload entry point: narrow an unknown into Prefs; return null when it does not meet the
 * contract (without throwing — the caller decides the copy).
 *
 * This is **contract validation**, a different thing from degrading when reading the local file:
 * receiving a value that does not meet the contract across a process boundary means
 * the protocol is broken and the whole thing should be refused; whereas one broken field in the file
 * should degrade only that field without affecting the others
 * (see PrefsStore's read logic and the "degradation may only hurt itself" invariant).
 */
export function parsePrefs(raw: unknown): Prefs | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const theme = r['theme']
  const language = r['language']
  const mode = r['mode']
  const trendSpan = r['trendSpan']
  if (!isAppearanceTheme(theme)) return null
  if (!isLanguagePreference(language)) return null
  if (!isAppearanceMode(mode)) return null
  if (!isTrendSpan(trendSpan)) return null
  return { theme, language, mode, trendSpan }
}
