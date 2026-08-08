import type { Locale } from './types'

export const en: Locale = {
  languageName: 'English',
  languageNameEn: 'English',
  htmlLang: 'en',

  rail: {
    agents: 'Agents',
    projects: 'Projects',
    refresh: 'Refresh all',
    settings: 'Settings'
  },

  settings: {
    title: 'Settings',
    lead: 'Preferences for this app only. They apply to the whole interface and are never written to your Claude or Codex configuration.',
    sectionLanguage: 'Language',
    interfaceLanguage: 'Interface language',
    followSystem: 'Follow system',
    languageFoot:
      'With “Follow system”, the interface follows your macOS preferred languages; English is used when none of them is supported.',
    sectionAppearance: 'Appearance',
    mode: 'Mode',
    modeLight: 'Light',
    modeDark: 'Dark',
    palette: 'Palette',
    appearanceFoot:
      'With mode set to “Follow system”, light and dark follow your macOS appearance; choosing Light or Dark locks the app regardless of later system changes. Palette and light/dark are independent and combine freely; Purple is used when nothing is chosen. Changes apply across the whole app immediately — no saving needed.',
    schemePurple: 'Purple',
    schemeBlue: 'Mist Blue',
    schemeAmber: 'Amber Brown'
  },

  toast: {
    languageSwitched: (name) => `Interface language switched to ${name}`,
    languageFollowSystem: (name) => `Now following the system · currently ${name}`
  }
}
