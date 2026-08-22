import type { Locale } from './types'
import { plural } from './plural'

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
    lead: 'Préférences propres à cette app. Elles s’appliquent à toute l’interface et ne sont jamais écrites dans la configuration d’aucun côté agent.',
    sectionLanguage: 'Langue',
    interfaceLanguage: 'Langue de l’interface',
    followSystem: 'Suivre le système',
    languageFoot:
      'Avec « Suivre le système », l’interface suit les langues préférées de macOS ; l’anglais est utilisé si aucune n’est prise en charge.',
    sectionAppearance: 'Apparence',
    mode: 'Mode',
    modeLight: 'Clair',
    modeDark: 'Sombre',
    palette: 'Thème',
    appearanceFoot:
      'Avec le mode « Suivre le système », le clair et le sombre suivent l’apparence macOS ; choisir Clair ou Sombre fixe le clair/sombre sur ce choix, quelles que soient les modifications ultérieures du système. Le thème et le mode sont indépendants et se combinent librement ; Violet est utilisé par défaut. Les changements s’appliquent immédiatement à toute l’app, sans enregistrement.',
    themePurple: 'Violet',
    themeBlue: 'Bleu brume',
    themeAmber: 'Ambre'
  },

  menu: {
    about: 'À propos d’Agentshed', hide: 'Masquer Agentshed', hideOthers: 'Masquer les autres',
    unhide: 'Tout afficher', quit: 'Quitter Agentshed',
    edit: 'Édition', undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner',
    view: 'Présentation', reload: 'Recharger', toggleDevTools: 'Outils de développement', resetZoom: 'Taille réelle',
    zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', fullscreen: 'Passer en plein écran',
    window: 'Fenêtre', minimize: 'Réduire', close: 'Fermer'
  },

  toast: {
    languageSwitched: (name) => `Langue de l’interface changée en ${name}`,
    languageFollowSystem: (name) => `Suit désormais le système · actuellement ${name}`,
    saveThemeFailed: 'Échec de l’enregistrement du thème',
    saveModeFailed: 'Échec de l’enregistrement du mode d’apparence',
    saveLanguageFailed: 'Échec de l’enregistrement de la langue'
  },

  skillDeepHint: 'La bonne pratique est une profondeur de référence de skill inférieure à 2 — envisagez de restructurer ce skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  agents: {
    sideSummary: (projects, skills, subagents) =>
      `${projects} ${plural('fr', projects, { one: 'projet', other: 'projets' })} · ${skills} ${plural('fr', skills, { one: 'skill global', other: 'skills globaux' })} · ${subagents} ${plural('fr', subagents, { one: 'subagent', other: 'subagents' })}`,
    tabCfg: 'Configuration',
    notDetected: 'Aucun répertoire de données d’un côté agent n’a été détecté sur cette machine',
    notDetectedHint: (refreshLabel) =>
      `Installez et utilisez l’un des agents, puis cliquez sur « ${refreshLabel} » en bas à gauche pour voir la vue d’ensemble`,
    archivedNote: (days, earliest) => `Pour ${days} de ces jours (le plus ancien ${earliest}), les fichiers de session source ont été nettoyés automatiquement par l’agent ; les valeurs viennent de l’archive locale (barres hachurées)`,
    byModel: 'Par modèle (tous projets ; côté Codex, approximation du modèle principal de la session)',
    detected: 'Détecté', undetected: 'Non détecté',
    emptyGlobalLib: 'Les bibliothèques globales de tous les côtés sont vides',
    sideMismatch: (project) => `${project} n’appartient pas au côté agent où réside ce skill`,
    installed: (skill, project, side) => `${skill} installé → ${project} (${side}) ; seul ce projet a été actualisé`,
    grokBorrowHint: 'Grok lit à l’exécution les skills / subagents / plugins / MCP globaux de Claude Code ; ces composants empruntés appartiennent au côté Claude et ne rejoignent pas les listes de Grok',
    skillsHint: 'Fusionné en une liste · cliquez sur une ligne pour les fichiers du paquet · sur un fichier pour l’aperçu · pas de diff inter-côtés · les plugins sont en lecture seule',
    levelPluginPkg: 'Paquet de plugin', levelGlobalLib: 'Bibliothèque globale',
    installTo: 'Installer dans…',
    pickTarget: 'Choisissez un projet cible (installation par copie ; projets obsolètes exclus)',
    srcGlobalConfig: 'configuration globale', srcPlugin: 'fourni par le plugin',
    globalMcp: 'MCP global',
    noGlobalMcp: 'Aucun MCP global (les .mcp.json de niveau projet relèvent du détail du projet)',
    noMcpSection: 'config.toml n’a pas de section mcp_servers',
    cfgClaudeMd: 'CLAUDE.md global', cfgAgentsMd: 'AGENTS.md global', cfgToml: 'résumé de config.toml',
    tomlMissing: 'config.toml n’existe pas', fileMissing: 'Le fichier n’existe pas'
  },

  shell: {
    pickProject: 'Sélectionnez un projet pour voir son détail',
    scanning: 'Analyse des côtés agents…'
  },
  skills: {
    searchPlaceholder: 'Rechercher un skill…',
    noNameMatch: 'Aucun nom de skill ne correspond',
    listFailed: (detail) => `Échec du listage : ${detail}`,
    pillPlugin: 'Plugin', pillProject: 'Projet', pillGlobal: 'Global', pillSymlink: 'lien',
    pkgSummary: (files, size) => `${files} ${plural('fr', files, { one: 'fichier', other: 'fichiers' })} · ${size}`,
    srcPluginPkg: 'Paquet de plugin', srcProject: 'Projet', srcGlobal: 'Bibliothèque globale',
    listing: 'Listage…',
    deeperPaths: (paths) => `Chemins plus profonds non listés : ${paths}`,
    colFile: 'Fichier', colLines: 'Lignes', colSize: 'Taille', colMtime: 'Modifié',
    noPreviewable: 'Aucun fichier texte prévisualisable dans ce paquet',
    tagEntry: 'Point d’entrée', close: 'Fermer', raw: 'Source', preview: 'Aperçu',
    loading: 'Chargement…', emptyFile: 'Fichier vide',
    installMissing: 'Dossier d’installation manquant', pkgUnreadable: 'Paquet skill illisible'
  },

  subagents: {
    noneGlobal: 'Aucune définition de subagent des deux côtés (~/.claude/agents et ~/.codex/agents)',
    globalHint: 'Les deux côtés fusionnés en une liste · même nom sur une ligne (pas de diff de contenu) · cliquez pour la définition complète',
    noDescription: '(pas de description)',
    noneProject: 'Aucune définition de subagent au niveau projet ni global',
    projectHint: 'Vue effective · le niveau projet éclipse le global des deux côtés · cliquez pour la définition complète',
    levelProject: 'Projet', levelGlobal: 'Global',
    overridesBuiltin: 'Remplace l’intégré', shadows: 'Éclipse le même nom', shadowed: 'Éclipsé par le projet',
    metaShadows: ' · prend le pas sur une définition de niveau inférieur du même nom',
    metaShadowed: ' · éclipsé par une définition de niveau projet (sans effet)',
    noSideDef: 'Aucune définition de ce côté', inherited: '— (hérité)'
  },

  memory: {
    codexLegacy: 'La mémoire Codex n’est pas activée ; les entrées ci-dessus sont des fichiers résiduels du dossier.',
    codexEmpty: 'La mémoire Codex est activée mais vide.',
    codexDisabled: 'La mémoire Codex n’est pas activée — activez-la avec la commande /memories dans Codex, ou via Réglages → Personnalisation → Enable memories (expérimental).',
    noneGlobal: 'Aucun projet n’a de mémoire automatique',
    globalHint: 'Du plus récent au plus ancien · inclut les obsolètes (avec badge) · cliquez sur une ligne pour ses fichiers, sur un fichier pour son contenu',
    stale: 'Obsolète',
    codexGlobalDir: 'Dossier de mémoire globale', noMainFile: 'Pas de MEMORY.md',
    noneProject: 'Aucune mémoire automatique dans ce projet',
    claudeOnly: 'La mémoire est un mécanisme côté Claude (la mémoire Codex est globale — voir l’onglet Memory de la page globale)',
    mainTitle: 'MEMORY.md (fichier principal de mémoire automatique)',
    noMain: 'Pas de MEMORY.md (fichiers topic uniquement)',
    topicsTitle: (n) => `Fichiers topic (${n}) · cliquez pour voir`,
    noTopics: 'Aucun fichier topic',
    topicMeta: (ago) => `fichier topic · ${ago}`,
    unreadable: (detail) => `Fichier illisible : ${detail}`,
    loading: 'Chargement…'
  },

  plugins: {
    projectMissing: '(projet obsolète)',
    installMissing: 'Dossier d’installation manquant (cache nettoyé) — seul l’enregistrement du registre est visible ; les composants inclus ne peuvent pas être lus',
    noBundled: 'Aucun des quatre types de composants inclus',
    codexCacheEnum: 'Énumération du cache',
    cachedVersions: (n) => `(${n} ${plural('fr', n, { one: 'version', other: 'versions' })} en cache)`,
    cacheOnly: 'énumération du cache uniquement',
    codexFoot: 'Le groupe Codex ne liste que les plugins présents dans le cache ; aucune sémantique d’activation, et les skills inclus sont prévisualisables sans être fusionnés dans l’onglet Skills',
    codexFootDetail: ' ; les plugins Codex s’appliquent globalement, sans sémantique d’activation par projet',
    claudeGlobalHint: 'Base d’activation : couche user · cliquez pour déplier les composants inclus',
    noPlugins: 'Aucun plugin installé',
    enabled: 'Activé', notEnabled: 'Non activé',
    claudeProjectHint: 'Base d’activation : ensemble effectif de ce projet (local > project > user)',
    enabledShort: 'Activé', disabledShort: 'Désactivé',
    noLayerMentions: 'N’apparaît dans aucune couche',
    verdictFrom: (verdict, layer) => `${verdict} — décidé par la ${layer}`,
    layerLocal: 'couche « local »', layerProject: 'couche « project »', layerUser: 'couche « user »'
  },
  session: {
    forkPoints: (n) =>
      `Cette session comporte **${n} ${plural('fr', n, { one: 'point de bifurcation', other: 'points de bifurcation' })}**. La chaîne affichée remonte du dernier message jusqu’à la racine via les liens parents — c’est-à-dire « à quoi ressemble finalement cette conversation » ; les branches abandonnées ne sont pas affichées.`,
    forkedFrom: 'Cette session est issue de',
    anotherSession: 'une autre session',
    parentTitle: (title) => `« ${title} »`,
    forkedFromTail: '— le préfixe rejoué a été retiré, seul ce qui suit cette bifurcation est affiché ci-dessous. **L’historique antérieur se trouve dans la session d’origine**.',
    stripUncertainOrphan:
      '**Retrait du préfixe incertain** : cette session est issue d’un parent **hors du périmètre analysé** (fichier nettoyé ou projet non enregistré), le retrait n’a donc pu être qu’heuristique — **il a pu retirer trop (perte de messages) ou trop peu (doublons)**. Vérifiez avec l’original. Ne pas échouer en silence est la seule garantie possible ici.',
    stripUncertainMismatch: (parent) =>
      `**Retrait du préfixe incertain** : le segment rejoué ne correspond pas entrée par entrée à la session parente « ${parent} » (le journal parent a pu être réécrit), seule **la partie vérifiable** a été retirée — le début peut faire doublon avec le parent ou manquer. Vérifiez avec l’original.`,
    fetching: 'Récupération…',
    rebuilding: 'Signature d’index non concordante (du contenu a été ajouté au fichier, ou il a été réécrit) → reconstruction de l’index **de ce fichier uniquement**…',
    turnFailed: (detail) => `Ce tour n’a pas pu être récupéré : ${detail}`,
    fetchedNote: (ms, bytes) =>
      `Récupéré à la demande en ${ms} ms · lecture de la seule plage d’octets de ce tour, ${bytes} — indépendamment de la taille totale du fichier`,
    back: (project) => `Retour à ${project} · Sessions`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · ${questions} ${plural('fr', questions, { one: 'question', other: 'questions' })} · ${tok} tok · ${mb} · dernière activité ${ago}`,
    cannotOpen: (detail) => `Impossible d’ouvrir cette session : ${detail}`,
    loading: 'Chargement…',
    mainline: (n, days) =>
      `Questions (fil principal) · ${n} ${plural('fr', n, { one: 'question', other: 'questions' })}${days}`,
    dayCount: (n) => ` · ${n} ${plural('fr', n, { one: 'jour', other: 'jours' })}`,
    expandAll: 'Tout déplier',
    collapseAll: 'Tout replier',
    ascending: 'Plus anciennes d’abord',
    descending: 'Plus récentes d’abord',
    dayGroup: (day, n) => `${day} · ${n} ${plural('fr', n, { one: 'question', other: 'questions' })}`,
    foot: 'Le fil principal ne liste que les questions humaines ; le bruit du harness n’est pas rendu. Toutes les questions sont listées d’un coup (leur texte est lu à la demande par plage d’octets, indépendamment de la taille du fichier). Cliquez sur une question pour déplier le tour entier sur place : corps, appels d’outils, délégations à des subagents et blocs de raisonnement.'
  },

  turn: {
    typeSeparator: ', ',
    thinking: 'Réflexion',
    thinkingSum: (chars) =>
      `${chars} ${plural('fr', chars, { one: 'caractère', other: 'caractères' })} · texte clair disponible`,
    reasoning: 'Raisonnement',
    reasoningSum: (n) =>
      `seulement ${n} ${plural('fr', n, { one: 'intertitre', other: 'intertitres' })} · corps indisponible`,
    reasoningNote:
      'Le corps du raisonnement de Codex est `encrypted_content` et **restera inaccessible**. Ci-dessous les seuls intertitres en clair présents dans l’enregistrement — **non équivalents** à la réflexion en clair du côté Claude, et on ne prétend pas le contraire.',
    input: 'Entrée',
    output: 'Retour',
    empty: '(vide)',
    noOutput: '(aucun retour enregistré)',
    truncatedNote:
      'Le retour dépassait la limite par entrée de l’agent : la transcription **ne contient qu’une version tronquée** ; l’original est déposé sous `tool-results/` (chemin ci-dessus) et ce produit ne le lit pas — ce qui est affiché ici est la version tronquée, sans prétendre à l’exhaustivité.',
    subSteps: (n) => `${n} ${plural('fr', n, { one: 'étape', other: 'étapes' })} · sans retour`,
    dispatchPrompt: 'Prompt de délégation',
    innerSteps: 'Étapes internes',
    unlinkedNote:
      'Les étapes internes de cette délégation n’ont **aucune chaîne de référence stable** dans l’enregistrement permettant de les rattacher ici (constaté des deux côtés) — elles ne sont pas affichées et aucun appariement spéculatif n’est fait ; la transcription complète se trouve dans son propre fichier, le cas échéant.',
    backToMain: 'Retour à la session principale',
    noReturn: '(sans retour)',
    unknownRecords: (count, types) =>
      `Ce tour contient **${count} ${plural('fr', count, { one: 'enregistrement non reconnu', other: 'enregistrements non reconnus' })}** (types : ${types}) — conservés tels quels dans le fichier source, non rendus. Cela signifie généralement qu’une mise à jour de l’agent a introduit un nouveau type.`
  },
  detail: {
    notInSnapshot: 'Ce projet n’est pas dans l’instantané (actualisez puis réessayez)',
    staleTag: 'Obsolète',
    tabOverview: 'Synthèse',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Sessions',
    tabCfg: 'Configuration',
    tabArts: 'Artefacts',
    loading: 'Chargement…',
    byModel: 'Par modèle',
    recentSessions: 'Sessions récentes',
    noSessions: 'Aucune session dans ce projet',
    sessionCountNote: (n) =>
      `${n} ${plural('fr', n, { one: 'session au total — toute visible', other: 'sessions au total — toutes visibles' })} dans l’onglet « Sessions ».`,
    noSessionsHint: 'Aucune session dans ce projet. Elles apparaissent automatiquement dès qu’un côté agent a une conversation dans ce dossier.',
    searching: 'Recherche…',
    noHits: 'Aucun résultat. Par défaut, la recherche ne porte que sur les questions — essayez « Texte intégral ».',
    hitsFound: (hits, sessions) =>
      `${hits} ${plural('fr', hits, { one: 'résultat', other: 'résultats' })} · ${sessions} ${plural('fr', sessions, { one: 'session', other: 'sessions' })}`,
    folded: (n) =>
      ` · ${n} ${plural('fr', n, { one: 'résultat replié', other: 'résultats repliés' })} (rejeux ou branches abandonnées)`,
    recentFirst: 'Plus récentes d’abord',
    oldestFirst: 'Plus anciennes d’abord',
    forkUncertain: 'retrait incertain',
    hitCount: (n) => `${n} ${plural('fr', n, { one: 'résultat', other: 'résultats' })}`,
    inBody: 'Corps',
    sortNote: (order, n) =>
      `Par dernière activité, ${order} · ${n} ${plural('fr', n, { one: 'session', other: 'sessions' })}`,
    descending: 'décroissant',
    ascending: 'croissant',
    forkTip: 'Cette session est issue d’une autre ; le préfixe rejoué a été retiré',
    forkUncertainTip: 'La session parente est hors du périmètre analysé ou ne correspond pas à la vérification ; le préfixe rejoué n’a pu être retiré que par heuristique — il peut en rester (doublons)',
    questionCount: (n) => `${n} ${plural('fr', n, { one: 'question', other: 'questions' })}`,
    sessionsFoot: 'Seules les sessions des projets enregistrés sont listées ; les sessions de subagent et de préchauffage ne le sont pas, mais leurs tokens comptent — ce nombre et le dénominateur des cartes de tokens ci-dessus ne sont donc pas la même chose.',
    sessionsFoot2: '« Dernière activité » prend l’horodatage le plus grand dans le fichier, ce qui est une autre chaîne que l’activité de la liste des projets (qui utilise le mtime du fichier).',
    searchPlaceholder: (n) =>
      `Rechercher parmi ${n} ${plural('fr', n, { one: 'session', other: 'sessions' })} de ce projet…`,
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
    noArtifactsOfType: 'Aucun artefact de ce type',
    openInBrowser: 'HTML → navigateur',
    settingsSummary: 'résumé de settings.json',
    noSettings: 'Aucun réglage affichable sous la clé du projet',
    fileMissing: 'Le fichier n’existe pas'
  },
  projects: {
    searchPlaceholder: 'Rechercher des projets…',
    filterAll: 'Tous',
    showStale: 'Afficher les projets obsolètes',
    staleFiltered: (n) =>
      `${n} ${plural('fr', n, { one: 'projet obsolète filtré', other: 'projets obsolètes filtrés' })}`,
    noMatch: 'Aucun projet correspondant',
    staleTag: 'Obsolète',
  },
  token: {
    winAll: 'Total · tout l’historique',
    winToday: 'Aujourd’hui',
    winD7: '7 derniers jours',
    winD30: '30 derniers jours',
    compCacheRead: 'Lectures de cache',
    compUncached: 'Entrée hors cache',
    compOutput: 'Sortie',
    compTipCacheRead: (v) => `${v} · entrée servie par le cache, jamais recalculée`,
    compTipUncached: (v) => `${v} · écritures de cache incluses : tout ce que le modèle a relu ce tour-ci`,
    compTipOutput: (v) => `${v} · tokens générés par le modèle`,
    byModelIn: (title, win) => `${title} · ${win}`,
    noUsageInWindow: 'Aucune consommation sur la période sélectionnée',
    trendTitle: 'Tendance sur 30 jours (fuseau local · par jour)',
    legendNote: 'Hauteur = total du jour ; segments = part de chaque provider',
    legendDimNote: ' ; atténué = hors de la période sélectionnée',
    tipTotal: (label, total) => `${label} · total ${total}`,
    tipArchived: ' · archivé (fichiers source nettoyés)',
    tipNoUsage: 'Aucune consommation',
    noModelData: 'Aucune donnée de modèle'
  },
  /** The display names that vary by language (the rest, such as Anthropic / Claude, are proper nouns and
   * are not translated) */
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
    turnOutOfRange: (i, total) =>
      `Indice de tour hors limites : ${i} (sur ${total} ${plural('fr', total, { one: 'tour', other: 'tours' })})`,
    artifactNotWhitelisted: 'Ce chemin d’artefact n’est pas dans la liste autorisée',
    pluginRootNotRegistered:
      'Cette racine de plugin n’est pas enregistrée — actualisez ou ouvrez d’abord le détail',
    projectNotOpened: 'Le projet n’est pas ouvert — ouvrez d’abord son détail',
    skillPackageUnavailable:
      'Le paquet skill est indisponible ou hors des racines autorisées',
    skillFileNotWhitelisted: 'Ce chemin de fichier skill n’est pas dans la liste autorisée',
    skillFileUnreadable: 'Le fichier skill est illisible',
    sessionNotIndexed: 'Cette session n’est pas indexée — lancez d’abord Tout actualiser',
    sessionFileUnreadable: 'Le fichier de session n’est plus lisible (déplacé ou supprimé ?)',
    sessionMetaUnreadable:
      'Les métadonnées de la première ligne de la session sont illisibles, impossible de reconstruire l’index',
    sessionParseFailed: 'Échec de l’analyse du fichier de session',
    prefsStoreNotReady: 'Le stockage des préférences n’est pas prêt',
    invalidPref: (field) => `Valeur de préférence non conforme : ${field}`,
    contractMissing: (path) => `Charge utile non conforme reçue : ${path} est absent`,
    contractType: (path, expect) => `Charge utile non conforme reçue : ${path} devrait être ${expect}`,
    contractEnum: (path, value) =>
      `Charge utile non conforme reçue : la valeur ${value} de ${path} n’est pas dans les valeurs autorisées`,
    untrustedSender: (sender) => `Appelant IPC non fiable : ${sender}`,
    linkProtocolUnsupported: 'Protocole de lien non pris en charge',
    linkOutOfScope: 'La cible du lien est hors de la portée lisible',
    skillBadName: 'Nom de skill invalide',
    skillStaleTarget: 'La cible est un projet obsolète (son dossier n’existe plus)',
    skillMissingSource: (name) => `Aucun skill de ce nom dans la bibliothèque globale : ${name}`,
    skillCopyMissing: 'La copie au niveau du projet n’existe pas',
    skillConflict: 'Bloqué : la cible possède déjà un skill de ce nom au niveau du projet, et rien n’a été écrasé',
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
