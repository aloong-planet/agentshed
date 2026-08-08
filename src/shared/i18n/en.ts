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
    languageFollowSystem: (name) => `Now following the system · currently ${name}`,
    saveSchemeFailed: 'Failed to save the palette',
    saveModeFailed: 'Failed to save the appearance mode',
    saveLanguageFailed: 'Failed to save the language'
  },

  errors: {
    badArgs: (channel, field) =>
      field ? `Invalid call arguments: ${channel} (field ${field})` : `Invalid call arguments: ${channel}`,
    sessionNotWhitelisted:
      'This session is not in the allowed list — open the project details or refresh first',
    engineNotReady: 'The scan engine is not ready yet — please try again shortly',
    turnOutOfRange: (i, total) => `Turn index out of range: ${i} (of ${total} turns)`,
    artifactNotWhitelisted: 'This artifact path is not in the allowed list',
    pluginRootNotRegistered:
      'This plugin package root is not registered — refresh or open the details first',
    projectNotOpened: 'The project is not open — open the project details first',
    skillPackageUnavailable: 'The skill package is unavailable or outside the allowed roots',
    skillFileNotWhitelisted: 'This skill file path is not in the allowed list',
    skillFileUnreadable: 'The skill file cannot be read',
    sessionNotIndexed: 'This session is not indexed — refresh everything first',
    sessionFileUnreadable: 'The session file can no longer be read (moved or deleted?)',
    sessionMetaUnreadable: 'The first line of the session is unreadable, so the index cannot be rebuilt',
    sessionParseFailed: 'Failed to parse the session file',
    prefsStoreNotReady: 'The preference store is not ready',
    invalidPref: (field) => `Invalid preference value: ${field}`
  },

  subagentError: {
    unreadable: 'Unreadable',
    parseFailed: 'Parse failed'
  }
}
