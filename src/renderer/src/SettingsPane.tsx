// The settings third dimension · UI language + appearance (mode × theme), both applying app-wide.
// The UI matches the prototype docs/prototypes/appearance/prototype-settings.html (confirmed 2026-08-08).
// The language section comes before appearance: it determines how the rest of the page reads.
import { useEffect, useState, type JSX } from 'react'
import {
  APPEARANCE_MODES,
  APPEARANCE_THEMES,
  type AppearanceMode,
  type AppearanceTheme
} from '@shared/appearance'
import { dictOf, type LanguagePreference } from '@shared/i18n'
import { LanguageSelect } from './LanguageSelect'
import { useLanguage } from './language'

// Palette preview samples (--card / --accent-soft / --accent / --text), in **two sets** by effective
// light/dark:
// the palette is a what-you-see-is-what-you-get preview, and showing light samples in dark mode would not
// match what is actually seen.
// The values are copied from theme.css's variable blocks, so **changing a theme colour means changing
// this too** — they cannot be read at runtime,
// since getComputedStyle can only read the set currently in effect, not the other two themes'
// variables.
const THEME_SWATCH: Record<'light' | 'dark', Record<AppearanceTheme, string[]>> = {
  light: {
    purple: ['#ffffff', '#f0ebf6', '#8a67ab', '#37352f'],
    blue: ['#fffcf9', '#eef2f7', '#4a6fa5', '#2c2a28'],
    amber: ['#fffcf7', '#f3ead4', '#6b5220', '#3a342c']
  },
  dark: {
    purple: ['#1f2124', '#2c2733', '#a084c7', '#e6e6e5'],
    blue: ['#1c1f24', '#1e2a38', '#7a9dc4', '#e6e4e0'],
    amber: ['#221e1a', '#2e2820', '#c4a46a', '#ebe4d8']
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * The current **effective light/dark**.
 *
 * The main process sets `nativeTheme.themeSource` from the preference, which directly changes how this
 * media query evaluates —
 * so the renderer neither computes light/dark itself nor writes a DOM attribute, and just reads it;
 * listening for change covers both
 * "the user changed the mode" and "the system appearance changed while following it", with no separate
 * wiring needed.
 */
function useEffectiveDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (): void => setDark(mq.matches)
    // It may have changed between installing the listener and reading the initial value, so read once
    // more rather than sitting on a stale one
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

export function SettingsPane({
  theme,
  onTheme,
  mode,
  onMode,
  language,
  onLanguage
}: {
  theme: AppearanceTheme
  onTheme: (s: AppearanceTheme) => void
  mode: AppearanceMode
  onMode: (m: AppearanceMode) => void
  language: LanguagePreference
  onLanguage: (l: LanguagePreference) => void
}): JSX.Element {
  // The language comes from context rather than being threaded down as a prop (the convergence after
  // ticket 05 introduced context; ticket 11 AC)
  const lang = useLanguage()
  const t = dictOf(lang).settings
  const dark = useEffectiveDark()
  const themeName: Record<AppearanceTheme, string> = {
    purple: t.themePurple,
    blue: t.themeBlue,
    amber: t.themeAmber
  }
  // "Follow system" shares one piece of copy with the language section: the two are structurally
  // identical policies and should not be worded differently
  const modeName: Record<AppearanceMode, string> = {
    system: t.followSystem,
    light: t.modeLight,
    dark: t.modeDark
  }
  const swatch = THEME_SWATCH[dark ? 'dark' : 'light']

  return (
    <div className="settings">
      <h1 className="settings-h1">{t.title}</h1>
      <p className="settings-lead">{t.lead}</p>

      <div className="settings-sec-t">{t.sectionLanguage}</div>
      <LanguageSelect pref={language} effective={lang} onChange={onLanguage} />
      <p className="settings-foot" data-testid="language-foot">{t.languageFoot}</p>

      <div className="settings-sec-t settings-sec-gap">{t.sectionAppearance}</div>
      {/* One card with two rows: mode on top, theme below, the same form as the language section */}
      <div className="field" data-testid="appearance-field">
        <div className="frow">
          <span className="flabel">{t.mode}</span>
          <span className="seg seg-field" role="radiogroup" aria-label={t.mode} data-testid="mode-seg">
            {APPEARANCE_MODES.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={mode === id}
                data-mode-option={id}
                className={mode === id ? 'on' : ''}
                onClick={() => onMode(id)}
              >
                {modeName[id]}
              </button>
            ))}
          </span>
        </div>
        <div className="frow">
          <span className="flabel">{t.palette}</span>
          <div className="theme-grid" role="radiogroup" aria-label={t.palette}>
            {APPEARANCE_THEMES.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={theme === id}
                data-theme-option={id}
                className={`theme-card ${theme === id ? 'on' : ''}`}
                onClick={() => onTheme(id)}
              >
                <span className="theme-swatches">
                  {swatch[id].map((c) => (
                    <span key={c} className="theme-sw" style={{ background: c }} />
                  ))}
                </span>
                <span className="theme-name">{themeName[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* After compacting, the palette cards carry no description, and information such as "purple is
          the default" lands in this explanation */}
      <p className="settings-foot" data-testid="appearance-foot">{t.appearanceFoot}</p>
    </div>
  )
}
