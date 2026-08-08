import type { Locale } from './types'

export const fr: Locale = {
  languageName: 'Français',
  languageNameEn: 'French',
  htmlLang: 'fr',

  rail: {
    agents: 'Agents',
    projects: 'Projets',
    refresh: 'Tout actualiser',
    settings: 'Réglages'
  },

  settings: {
    title: 'Réglages',
    lead: 'Préférences propres à cette app. Elles s’appliquent à toute l’interface et ne sont jamais écrites dans votre configuration Claude ou Codex.',
    sectionLanguage: 'Langue',
    interfaceLanguage: 'Langue de l’interface',
    followSystem: 'Suivre le système',
    languageFoot:
      'Avec « Suivre le système », l’interface suit vos langues préférées macOS ; l’anglais est utilisé si aucune n’est prise en charge.',
    sectionAppearance: 'Apparence',
    mode: 'Mode',
    modeLight: 'Clair',
    modeDark: 'Sombre',
    palette: 'Palette',
    appearanceFoot:
      'Avec le mode « Suivre le système », le clair et le sombre suivent l’apparence macOS ; choisir Clair ou Sombre verrouille l’app, quelles que soient les modifications du système. La palette et le mode sont indépendants et se combinent librement ; Violet est utilisé par défaut. Les changements s’appliquent immédiatement à toute l’app, sans enregistrement.',
    schemePurple: 'Violet',
    schemeBlue: 'Bleu brume',
    schemeAmber: 'Ambre'
  },

  toast: {
    languageSwitched: (name) => `Langue de l’interface changée pour ${name}`,
    languageFollowSystem: (name) => `Suit désormais le système · actuellement ${name}`
  }
}
