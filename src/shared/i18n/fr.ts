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

  skillDeepHint: 'La bonne pratique est une profondeur de référence de skill inférieure à 2 — envisagez de restructurer ce skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects : ${projects}\nmcp_servers : ${mcp}`,
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  session: {
    forkPoints: (n) =>
      `Cette session comporte **${n} points de bifurcation**. La chaîne affichée remonte du dernier message jusqu’à la racine via les liens parents — c’est-à-dire « à quoi ressemble finalement cette conversation » ; les branches abandonnées ne sont pas affichées.`,
    forkedFrom: 'Cette session est issue de',
    anotherSession: 'une autre session',
    forkedFromTail: '— le préfixe rejoué a été retiré, seul ce qui suit cette bifurcation est affiché ci-dessous. **L’historique antérieur se trouve dans cette session**.',
    stripUncertainOrphan:
      '**Retrait du préfixe incertain** : cette session est issue d’un parent **hors du périmètre analysé** (fichier nettoyé ou projet non enregistré), le retrait n’a donc pu être qu’heuristique — **il a pu retirer trop (perte de messages) ou trop peu (doublons)**. Vérifiez avec l’original. Ne pas échouer en silence est la seule garantie possible ici.',
    stripUncertainMismatch: (parent) =>
      `**Retrait du préfixe incertain** : le segment rejoué ne correspond pas entrée par entrée à la session parente « ${parent} » (le journal parent a pu être réécrit), seule **la partie vérifiable** a été retirée — le début peut faire doublon avec le parent ou manquer. Vérifiez avec l’original.`,
    fetching: 'Récupération…',
    rebuilding: 'Signature d’index non concordante (fichier complété ou réécrit) → reconstruction de l’index **de ce fichier uniquement**…',
    turnFailed: (detail) => `Ce tour n’a pas pu être récupéré : ${detail}`,
    fetchedNote: (ms, bytes) =>
      `⚡ Récupéré à la demande en ${ms} ms · lecture de la seule plage d’octets de ce tour, ${bytes} — indépendant de la taille du fichier`,
    back: (project) => `‹ Retour à ${project} · Sessions`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · ${questions} questions · ${tok} tok · ${mb} · dernière activité ${ago}`,
    cannotOpen: (detail) => `Impossible d’ouvrir cette session : ${detail}`,
    loading: 'Chargement…',
    mainline: (n, days) => `Questions (fil principal) · ${n}${days}`,
    dayCount: (n) => ` · ${n} jours`,
    expandAll: 'Tout déplier',
    collapseAll: 'Tout replier',
    ascending: 'Plus anciennes d’abord',
    descending: 'Plus récentes d’abord',
    dayGroup: (day, n) => `${day} · ${n}`,
    foot: 'Le fil principal ne liste que les questions humaines ; le bruit du harness n’est pas rendu. Toutes les questions sont listées d’un coup (leur texte est lu à la demande par plage d’octets, indépendamment de la taille du fichier). Cliquez sur une question pour déplier le tour entier sur place : corps, appels d’outils, délégations à des subagents et blocs de raisonnement.'
  },

  turn: {
    typeSeparator: ', ',
    thinking: 'Réflexion',
    thinkingSum: (chars) => `${chars} caractères · texte clair disponible`,
    reasoning: 'Raisonnement',
    reasoningSum: (n) => `seulement ${n} intertitres · corps indisponible`,
    reasoningNote:
      'Le corps du raisonnement de Codex est `encrypted_content` et **restera inaccessible**. Ci-dessous les seuls intertitres en clair présents dans l’enregistrement — **non équivalents** à la réflexion en clair du côté Claude, et on ne prétend pas le contraire.',
    input: 'Entrée',
    output: 'Retour',
    empty: '(vide)',
    noOutput: '(aucun retour enregistré)',
    truncatedNote:
      'Le retour dépassait la limite par entrée de l’agent : la transcription **ne contient qu’une version tronquée** ; l’original est déposé sous `tool-results/` (chemin ci-dessus) et ce produit ne le lit pas — ce qui est affiché ici est la version tronquée, sans prétendre à l’exhaustivité.',
    subSteps: (n) => `${n} étapes · sans retour`,
    dispatchPrompt: 'Prompt de délégation',
    innerSteps: 'Étapes internes',
    unlinkedNote:
      'Les étapes internes de cette délégation n’ont **aucune chaîne de référence stable** dans l’enregistrement permettant de les rattacher ici (constaté des deux côtés) — elles ne sont pas affichées et aucun appariement spéculatif n’est fait ; la transcription complète se trouve dans son propre fichier, le cas échéant.',
    backToMain: 'Retour à la session principale',
    noReturn: '(sans retour)',
    unknownRecords: (count, types) =>
      `▧ Ce tour contient **${count} enregistrements non reconnus** (types : ${types}) — conservés tels quels dans le fichier source, non rendus. Cela signifie généralement qu’une mise à jour de l’agent a introduit un nouveau type.`
  },
  detail: {
    notInSnapshot: 'Ce projet n’est pas dans l’instantané (actualisez puis réessayez)',
    staleTag: 'Obsolète',
    tabOverview: 'Aperçu',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Sessions',
    tabCfg: 'Configuration',
    tabArts: 'Produits',
    loading: 'Chargement…',
    byModel: 'Par modèle',
    recentSessions: 'Sessions récentes',
    noSessions: 'Aucune session dans ce projet',
    sessionCountNote: (n) => `${n} sessions au total — toutes visibles dans l’onglet « Sessions ».`,
    noSessionsHint: 'Aucune session dans ce projet. Elles apparaissent automatiquement dès qu’un des deux agents a une conversation dans ce dossier.',
    searching: 'Recherche…',
    noHits: 'Aucun résultat. Seules les questions sont cherchées par défaut — essayez « Texte intégral ».',
    hitsFound: (hits, sessions) => `${hits} résultats · ${sessions} sessions`,
    folded: (n) => ` · ${n} résultats repliés (rejeux ou branches abandonnées)`,
    recentFirst: 'Plus récentes d’abord',
    oldestFirst: 'Plus anciennes d’abord',
    forkUncertain: '⑂? retrait incertain',
    hitCount: (n) => `${n} résultats`,
    inBody: 'Corps',
    sortNote: (order, n) => `Par dernière activité, ${order} · ${n} sessions`,
    descending: 'décroissant',
    ascending: 'croissant',
    forkTip: 'Cette session est issue d’une autre ; le préfixe rejoué a été retiré',
    forkUncertainTip: 'La session parente est hors du périmètre analysé ou ne correspond pas à la vérification ; le préfixe rejoué n’a pu être retiré que par heuristique — il peut en rester (doublons)',
    questionCount: (n) => `${n} questions`,
    sessionsFoot: 'Seules les sessions des projets enregistrés sont listées ; les sessions de subagent et de préchauffage ne le sont pas, mais leurs tokens comptent — ce nombre et le dénominateur des cartes de tokens ci-dessus ne sont donc pas la même chose.',
    sessionsFoot2: '« Dernière activité » prend l’horodatage le plus grand dans le fichier, ce qui est une autre chaîne que l’activité de la liste des projets (qui utilise le mtime du fichier).',
    searchPlaceholder: (n) => `Rechercher parmi les ${n} sessions de ce projet…`,
    scopeQuestions: 'Questions',
    scopeFullText: 'Texte intégral',
    levelPlugin: 'Paquet de plugin',
    levelProject: 'Niveau projet',
    levelGlobal: 'Niveau global',
    uninstall: 'Désinstaller',
    uninstalled: (name) => `${name} désinstallé (seul ce projet a été actualisé)`,
    uninstallFailed: (detail) => `Échec de la désinstallation : ${detail}`,
    secClaudeProject: 'Niveau projet · .claude/skills',
    secClaudeGlobal: 'Niveau global · Claude',
    secCodexProject: 'Niveau projet · .agents/skills',
    secCodexGlobal: 'Niveau global · Codex',
    secPlugin: 'Fournis par des plugins · effectivement activés ici (espace de noms, lecture seule)',
    noSkills: 'Aucun skill actif pour ce projet',
    confirmTitle: 'Désinstaller le skill de niveau projet ?',
    confirmBody: 'Le dossier suivant sera supprimé (gérez vous-même l’état git du projet ; aucune détection de différence n’est effectuée) :',
    cancel: 'Annuler',
    del: 'Supprimer',
    mcpTitle: 'Niveau projet · .mcp.json (enabled/disabled vient des réglages du projet)',
    noMcp: 'Ce projet n’a pas de .mcp.json ; voir la page Agents pour le MCP global',
    mcpEnabled: 'Activé',
    mcpDisabled: 'Désactivé',
    mcpDefault: 'Par défaut',
    filterAll: 'Tous',
    noArtifacts: 'Rien de déposé selon la convention (projet hors processus en huit étapes ; ce n’est pas une erreur)',
    noArtifactsOfType: 'Aucun produit de ce type',
    openInBrowser: 'HTML → navigateur',
    settingsSummary: 'résumé settings',
    noSettings: 'Aucun réglage affichable sous la clé du projet',
    fileMissing: 'Le fichier n’existe pas'
  },
  projects: {
    searchPlaceholder: 'Rechercher des projets…',
    filterAll: 'Tous',
    showStale: 'Afficher les projets obsolètes',
    staleFiltered: (n) => `${n} projet${n > 1 ? 's' : ''} obsolète${n > 1 ? 's' : ''} filtré${n > 1 ? 's' : ''}`,
    noMatch: 'Aucun projet correspondant',
    hiddenCount: (n) => `${n} projet${n > 1 ? 's' : ''} masqué${n > 1 ? 's' : ''}`,
    expandHint: '(cliquer pour déplier)',
    collapseHint: '(cliquer pour replier)',
    staleTag: 'Obsolète',
    restore: 'Restaurer',
    hide: 'Masquer'
  },
  token: {
    totalCard: (note) => `Total cumulé (les deux côtés${note ? ` · ${note}` : ''})`,
    inOut: 'Entrée / Sortie',
    inOutNote: 'Détaillé par côté, selon les conventions propres à chacun',
    cacheCard: 'Dont cache (déjà compté dans le total, convention ccusage)',
    cacheReadWrite: (read, write) => `Lecture ${read} · Écriture ${write}`,
    trendTitle: '30 derniers jours (fuseau local · par jour)',
    legendNote: 'Hauteur = total du jour ; segments = part de chaque provider',
    tipTotal: (label, total) => `${label} · total ${total}`,
    tipArchived: ' · archivé (fichiers source nettoyés)',
    tipNoUsage: 'Aucune consommation',
    noModelData: 'Aucune donnée de modèle'
  },
  label: {
    providerOther: 'Autre',
    trendTotal: 'Total'
  },

  placeholder: {
    unreadableLine: '(cette ligne n’est plus lisible)',
    untitledSession: '(session sans titre)',
    unknownTool: '(outil inconnu)',
    unknown: '(inconnu)',
    notSet: 'Non défini',
    codexGlobalMemory: '(mémoire globale Codex)',
    truncated: '…(tronqué)'
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
    invalidPref: (field) => `Valeur de préférence non conforme : ${field}`,
    contractMissing: (path) => `Charge utile non conforme reçue : ${path} est absent`,
    contractType: (path, expect) => `Charge utile non conforme reçue : ${path} devrait être ${expect}`,
    contractEnum: (path, value) =>
      `Charge utile non conforme reçue : la valeur ${value} en ${path} est hors plage`,
    untrustedSender: (sender) => `Appelant IPC non fiable : ${sender}`,
    linkProtocolUnsupported: 'Protocole de lien non pris en charge',
    linkOutOfScope: 'La cible du lien est hors de la portée lisible',
    skillBadName: 'Nom de skill invalide',
    skillStaleTarget: 'La cible est un projet obsolète (son dossier n’existe plus)',
    skillMissingSource: (name) => `Aucun skill de ce nom dans la bibliothèque globale : ${name}`,
    skillCopyMissing: 'La copie au niveau du projet n’existe pas',
    skillConflict: 'La cible possède déjà un skill de ce nom au niveau du projet — rien n’a été écrasé',
    skillCopyFailed: (detail) => `Échec de la copie, nettoyage effectué : ${detail}`,
    skillDeleteFailed: (detail) => `Échec de la suppression : ${detail}`,
    registryProjectsInvalid: 'La clé projects du registre est absente ou n’est pas un objet',
    registryParseFailed: (detail) => `Échec de l’analyse du registre : ${detail}`,
    subagentUnreadable: 'Le fichier est illisible (permissions ou erreur d’E/S)',
    subagentTomlFailed: (detail) => `Échec de l’analyse du toml : ${detail}`,
    subagentMissingName: 'Champ name valide absent (Codex ne chargera pas ce fichier)'
  },

  subagentError: {
    unreadable: 'Illisible',
    parseFailed: 'Échec d’analyse',
    detail: (msg) => `${msg}. Les autres entrées ne sont pas affectées.`
  }
}
