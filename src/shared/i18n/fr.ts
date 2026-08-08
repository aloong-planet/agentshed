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
    badgeDefault: 'Par défaut',
    appearanceFoot:
      'Le mode clair / sombre suit l’apparence système de macOS. Les changements de thème s’appliquent immédiatement à toute l’app, sans enregistrement.',
    schemePurple: 'Violet',
    schemeBlue: 'Bleu brume',
    schemeAmber: 'Ambre',
    schemePurpleDesc:
      'Le violet de la marque. Apparence par défaut après installation, identique aux versions précédentes.',
    schemeBlueDesc:
      'Fond papier gris chaud et accent bleu apaisant, confortable pour de longues lectures.',
    schemeAmberDesc: 'Fond papier chaud et accent brun, plus proche du toucher d’un livre imprimé.'
  },

  toast: {
    languageSwitched: (name) => `Langue de l’interface changée pour ${name}`,
    languageFollowSystem: (name) => `Suit désormais le système · actuellement ${name}`
  }
}
