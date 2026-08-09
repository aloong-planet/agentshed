// The read point for the system's preferred languages.
//
// Uses app.getPreferredSystemLanguages(): it returns **a list of languages in priority order**.
// Not getLocale() / getSystemLocale() — Electron's type definitions state for both of them that
// the former is what to use for the user's language; those two describe the regional format
// (numbers/dates/currency), which is not the same thing as language.
//
// AGENTSHED_SYSTEM_LANGUAGES: a test-only injection point (comma separated), used the same way as
// AGENTSHED_HOME_OVERRIDE
// — "follow system" behaviour depends on the system language, which cannot be changed in tests, and
// without this hatch
// the only way to verify it would be a human repeatedly changing system settings. Never set in production.
import { app } from 'electron'

export function systemPreferredLanguages(): string[] {
  const override = process.env['AGENTSHED_SYSTEM_LANGUAGES']
  if (override !== undefined) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  try {
    return app.getPreferredSystemLanguages()
  } catch {
    // A platform probe failure must not drag down startup: leave it to the resolution layer to fall back
    // to English
    return []
  }
}
