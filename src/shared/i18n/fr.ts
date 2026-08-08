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
    languageFollowSystem: (name) => `Suit désormais le système · actuellement ${name}`,
    saveSchemeFailed: 'Échec de l’enregistrement de la palette',
    saveModeFailed: 'Échec de l’enregistrement du mode d’apparence',
    saveLanguageFailed: 'Échec de l’enregistrement de la langue'
  },

  errors: {
    badArgs: (channel, field) =>
      field
        ? `Arguments d’appel non conformes : ${channel} (champ ${field})`
        : `Arguments d’appel non conformes : ${channel}`,
    sessionNotWhitelisted:
      'Cette session n’est pas dans la liste autorisée — ouvrez d’abord le détail du projet ou actualisez',
    engineNotReady: 'Le moteur d’analyse n’est pas prêt — réessayez dans un instant',
    turnOutOfRange: (i, total) => `Indice de tour hors limites : ${i} (sur ${total} tours)`,
    artifactNotWhitelisted: 'Ce chemin de produit n’est pas dans la liste autorisée',
    pluginRootNotRegistered:
      'Cette racine de plugin n’est pas enregistrée — actualisez ou ouvrez d’abord le détail',
    projectNotOpened: 'Le projet n’est pas ouvert — ouvrez d’abord son détail',
    skillPackageUnavailable:
      'Le paquet skill est indisponible ou hors des racines autorisées',
    skillFileNotWhitelisted: 'Ce chemin de fichier skill n’est pas dans la liste autorisée',
    skillFileUnreadable: 'Le fichier skill est illisible',
    sessionNotIndexed: 'Cette session n’est pas indexée — lancez d’abord une actualisation globale',
    sessionFileUnreadable: 'Le fichier de session n’est plus lisible (déplacé ou supprimé ?)',
    sessionMetaUnreadable:
      'La première ligne de la session est illisible, impossible de reconstruire l’index',
    sessionParseFailed: 'Échec de l’analyse du fichier de session',
    prefsStoreNotReady: 'Le stockage des préférences n’est pas prêt',
    invalidPref: (field) => `Valeur de préférence non conforme : ${field}`
  },

  subagentError: {
    unreadable: 'Illisible',
    parseFailed: 'Échec d’analyse'
  }
}
