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
    badgeDefault: 'Default',
    appearanceFoot:
      'Light / dark follows your macOS system appearance. Scheme changes apply across the whole app immediately — no saving needed.',
    schemePurple: 'Purple',
    schemeBlue: 'Mist Blue',
    schemeAmber: 'Amber Brown',
    schemePurpleDesc: 'The brand purple. The default appearance after install, matching earlier versions.',
    schemeBlueDesc: 'Warm grey paper with a calm blue accent — easy on the eyes over long sessions.',
    schemeAmberDesc: 'Warm paper with a brown accent — closer to the feel of a printed book.'
  },

  toast: {
    languageSwitched: (name) => `Interface language switched to ${name}`,
    languageFollowSystem: (name) => `Now following the system · currently ${name}`
  }
}
