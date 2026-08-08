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

  skillDeepHint: 'Best practice is a skill reference depth below 2 — consider restructuring this skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  /** 随语言变化的展示名(其余如 Anthropic / Claude 是专有名词,不译) */
  detail: {
    notInSnapshot: 'This project is not in the snapshot (refresh and try again)',
    staleTag: 'Stale',
    tabOverview: 'Overview',
    tabSkills: 'Skills',
    tabMcp: 'MCP',
    tabSessions: 'Sessions',
    tabCfg: 'Config',
    tabArts: 'Artifacts',
    loading: 'Loading…',
    byModel: 'By model',
    recentSessions: 'Recent sessions',
    noSessions: 'No sessions in this project yet',
    sessionCountNote: (n) => `${n} sessions in total — see the “Sessions” tab for all of them.`,
    noSessionsHint: 'No sessions in this project yet. They appear automatically once either agent has a conversation in this directory.',
    searching: 'Searching…',
    noHits: 'No hits. Only questions are searched by default — try switching to “Full text”.',
    hitsFound: (hits, sessions) => `Found ${hits} hits · ${sessions} sessions`,
    folded: (n) => ` · ${n} hits folded away (replays or abandoned branches)`,
    recentFirst: 'Newest first',
    oldestFirst: 'Oldest first',
    forkUncertain: '⑂? uncertain strip',
    hitCount: (n) => `${n} hits`,
    inBody: 'Body',
    sortNote: (order, n) => `By last activity, ${order} · ${n} sessions`,
    descending: 'descending',
    ascending: 'ascending',
    forkTip: 'This session was forked from another; the replayed prefix has been stripped',
    forkUncertainTip: 'The parent session is outside the scan set or fails verification, so the replayed prefix could only be stripped heuristically — some may remain (duplicates)',
    questionCount: (n) => `${n} questions`,
    sessionsFoot: 'Only sessions of registered projects are listed; subagent and warm-up sessions are not listed separately, though their tokens still count — so this count and the denominator of the token cards above are not the same thing.',
    sessionsFoot2: '“Last activity” takes the largest timestamp inside the file, which is a different pipeline from the project list’s activity (which uses file mtime).',
    searchPlaceholder: (n) => `Search across ${n} sessions in this project…`,
    scopeQuestions: 'Questions',
    scopeFullText: 'Full text',
    levelPlugin: 'Plugin package',
    levelProject: 'Project level',
    levelGlobal: 'Global level',
    uninstall: 'Uninstall',
    uninstalled: (name) => `Uninstalled ${name} (only this project was refreshed)`,
    uninstallFailed: (detail) => `Uninstall failed: ${detail}`,
    secClaudeProject: 'Project level · .claude/skills',
    secClaudeGlobal: 'Global level · Claude',
    secCodexProject: 'Project level · .agents/skills',
    secCodexGlobal: 'Global level · Codex',
    secPlugin: 'Bundled in plugins · effectively enabled here (namespaced, read-only)',
    noSkills: 'No skills in effect for this project',
    confirmTitle: 'Uninstall the project-level skill?',
    confirmBody: 'The following directory will be deleted (handle your project’s git state yourself; no copy-diff check is performed):',
    cancel: 'Cancel',
    del: 'Delete',
    mcpTitle: 'Project level · .mcp.json (enabled/disabled comes from project settings)',
    noMcp: 'This project has no .mcp.json; see the Agents page for global MCP',
    mcpEnabled: 'Enabled',
    mcpDisabled: 'Disabled',
    mcpDefault: 'Default',
    filterAll: 'All',
    noArtifacts: 'Nothing captured under the convention (not an eight-step project; not an error)',
    noArtifactsOfType: 'No artifacts of this type',
    openInBrowser: 'HTML → browser',
    settingsSummary: 'settings summary',
    noSettings: 'No displayable settings under the project key',
    fileMissing: 'File does not exist'
  },
  projects: {
    searchPlaceholder: 'Search projects…',
    filterAll: 'All',
    showStale: 'Show stale projects',
    staleFiltered: (n) => `${n} stale ${n === 1 ? 'project' : 'projects'} filtered out`,
    noMatch: 'No matching projects',
    hiddenCount: (n) => `${n} hidden ${n === 1 ? 'project' : 'projects'}`,
    expandHint: '(click to expand)',
    collapseHint: '(click to collapse)',
    staleTag: 'Stale',
    restore: 'Restore',
    hide: 'Hide'
  },
  token: {
    totalCard: (note) => `Total usage (both sides${note ? ` · ${note}` : ''})`,
    inOut: 'Input / Output',
    inOutNote: 'Listed per side in each side’s native terms',
    cacheCard: 'Of which cache (already counted in the total, ccusage convention)',
    cacheReadWrite: (read, write) => `Read ${read} · Write ${write}`,
    trendTitle: 'Last 30 days (local time zone · daily)',
    legendNote: 'Bar height = daily total; segments = share per provider',
    tipTotal: (label, total) => `${label} · total ${total}`,
    tipArchived: ' · archived (source files cleaned up)',
    tipNoUsage: 'No usage',
    noModelData: 'No model data yet'
  },
  label: {
    providerOther: 'Other',
    trendTotal: 'Total'
  },

  placeholder: {
    unreadableLine: '(this line can no longer be read)',
    untitledSession: '(untitled session)',
    unknownTool: '(unknown tool)',
    unknown: '(unknown)',
    notSet: 'Not set',
    codexGlobalMemory: '(Codex global memory)',
    truncated: '…(truncated)'
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
    invalidPref: (field) => `Invalid preference value: ${field}`,
    contractMissing: (path) => `Received an invalid payload: ${path} is missing`,
    contractType: (path, expect) => `Received an invalid payload: ${path} should be ${expect}`,
    contractEnum: (path, value) =>
      `Received an invalid payload: the value ${value} at ${path} is out of range`,
    untrustedSender: (sender) => `Untrusted IPC caller: ${sender}`,
    linkProtocolUnsupported: 'Unsupported link protocol',
    linkOutOfScope: 'The link target is outside the readable scope',
    skillBadName: 'Invalid skill name',
    skillStaleTarget: 'The target is a stale project (its directory no longer exists)',
    skillMissingSource: (name) => `No such skill in the global library: ${name}`,
    skillCopyMissing: 'The project-level copy does not exist',
    skillConflict: 'The target already has a project-level skill with this name — nothing was overwritten',
    skillCopyFailed: (detail) => `Copy failed and was cleaned up: ${detail}`,
    skillDeleteFailed: (detail) => `Delete failed: ${detail}`,
    registryProjectsInvalid: 'The registry’s projects key is missing or not an object',
    registryParseFailed: (detail) => `Failed to parse the registry: ${detail}`,
    subagentUnreadable: 'The file cannot be read (permissions or I/O error)',
    subagentTomlFailed: (detail) => `Failed to parse the toml: ${detail}`,
    subagentMissingName: 'No valid name field (Codex will not load this file)'
  },

  subagentError: {
    unreadable: 'Unreadable',
    parseFailed: 'Parse failed',
    detail: (msg) => `${msg}. Other entries are unaffected.`
  }
}
