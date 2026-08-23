import type { Locale } from './types'
import { plural } from './plural'

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
    lead: 'Preferences for this app only. They apply to the whole interface and are never written to any agent side’s configuration.',
    sectionLanguage: 'Language',
    interfaceLanguage: 'Interface language',
    followSystem: 'Follow system',
    languageFoot:
      'With “Follow system”, the interface follows your macOS preferred languages; English is used when none of them is supported.',
    sectionAppearance: 'Appearance',
    mode: 'Mode',
    modeLight: 'Light',
    modeDark: 'Dark',
    palette: 'Theme',
    appearanceFoot:
      'With mode set to “Follow system”, light and dark follow your macOS appearance; choosing Light or Dark instead fixes light and dark to that choice, regardless of later system changes. The theme and light/dark are independent and combine freely; Purple is used when nothing is chosen. Changes apply across the whole app immediately — no saving needed.',
    themePurple: 'Purple',
    themeBlue: 'Mist Blue',
    themeAmber: 'Amber Brown'
  },

  menu: {
    about: 'About Agentshed', hide: 'Hide Agentshed', hideOthers: 'Hide Others',
    unhide: 'Show All', quit: 'Quit Agentshed',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'View', reload: 'Reload', toggleDevTools: 'Developer Tools', resetZoom: 'Actual Size',
    zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullscreen: 'Enter Full Screen',
    window: 'Window', minimize: 'Minimize', close: 'Close'
  },

  toast: {
    languageSwitched: (name) => `Interface language switched to ${name}`,
    languageFollowSystem: (name) => `Now following the system · currently ${name}`,
    saveThemeFailed: 'Failed to save the theme',
    saveModeFailed: 'Failed to save the appearance mode',
    saveLanguageFailed: 'Failed to save the language'
  },

  skillDeepHint: 'Best practice is a skill reference depth below 2 — consider restructuring this skill',
  codexConfig: (model, projects, mcp) =>
    `model = ${model}\nprojects: ${projects}\nmcp_servers: ${mcp}`,
  agents: {
    sideSummary: (projects, skills, subagents) =>
      `${projects} ${plural('en', projects, { one: 'project', other: 'projects' })} · ${skills} global ${plural('en', skills, { one: 'skill', other: 'skills' })} · ${subagents} ${plural('en', subagents, { one: 'subagent', other: 'subagents' })}`,
    tabCfg: 'Config',
    notDetected: 'No agent side’s data directory was detected on this machine',
    notDetectedHint: (refreshLabel) =>
      `Install and use either agent, then click “${refreshLabel}” at the bottom left to see the overview`,
    archivedNote: (days, earliest) =>
      `For ${days} of those days (earliest ${earliest}) the source session files have already been auto-cleaned by the agent, so the numbers come from the local archive (hatched bars)`,
    byModel: 'By model (across projects; the Codex side approximates each session’s main model)',
    detected: 'Detected', undetected: 'Not detected',
    emptyGlobalLib: 'Every side’s global library is empty',
    sideMismatch: (project) => `${project} does not belong to the agent side this skill lives on`,
    installed: (skill, project, side) => `Installed ${skill} → ${project} (${side}); only this project was refreshed`,
    grokBorrowHint: 'Grok reads Claude Code’s global skills / subagents / plugins / MCP at runtime; those borrowed components belong to the Claude side and do not join Grok’s lists',
    skillsHint: 'Merged into one list · click a row for package files · click a file to preview · no cross-side diff · plugins are read-only',
    levelPluginPkg: 'Plugin package', levelGlobalLib: 'Global library',
    installTo: 'Install to…',
    pickTarget: 'Choose a target project (installed by copy; stale projects excluded)',
    srcGlobalConfig: 'global config', srcPlugin: 'bundled with plugin',
    globalMcp: 'Global MCP',
    noGlobalMcp: 'No global MCP (project-level .mcp.json belongs to the project details)',
    noMcpSection: 'config.toml has no mcp_servers section',
    cfgClaudeMd: 'Global CLAUDE.md', cfgAgentsMd: 'Global AGENTS.md', cfgToml: 'config.toml summary',
    tomlMissing: 'config.toml does not exist', fileMissing: 'File does not exist'
  },

  shell: {
    pickProject: 'Select a project to see its details',
    scanning: 'Scanning the agent sides…'
  },
  skills: {
    searchPlaceholder: 'Search skills…',
    noNameMatch: 'No skill name matched',
    listFailed: (detail) => `Listing failed: ${detail}`,
    pillPlugin: 'Plugin', pillProject: 'Project', pillGlobal: 'Global', pillSymlink: 'symlink',
    pkgSummary: (files, size) =>
      `${files} ${plural('en', files, { one: 'file', other: 'files' })} · ${size}`,
    srcPluginPkg: 'Plugin package', srcProject: 'Project', srcGlobal: 'Global library',
    listing: 'Listing…',
    deeperPaths: (paths) => `Deeper paths not listed: ${paths}`,
    colFile: 'File', colLines: 'Lines', colSize: 'Size', colMtime: 'Modified',
    noPreviewable: 'No previewable text files in this package',
    tagEntry: 'Entry', close: 'Close', raw: 'Raw', preview: 'Preview',
    loading: 'Loading…', emptyFile: 'Empty file',
    installMissing: 'Install directory missing', pkgUnreadable: 'Skill package unreadable'
  },

  subagents: {
    noneGlobal: 'No subagent definitions on either side (~/.claude/agents and ~/.codex/agents)',
    globalHint: 'Both sides merged into one list · same name on one row (no content diff) · click a row for the full definition',
    noDescription: '(no description)',
    noneProject: 'No subagent definitions at project or global level',
    projectHint: 'Effective view · project level shadows on both Claude and Codex · click a row for the full definition',
    levelProject: 'Project', levelGlobal: 'Global',
    overridesBuiltin: 'Overrides built-in', shadows: 'Shadows same name', shadowed: 'Shadowed by project level',
    metaShadows: ' · overrides a lower-level definition of the same name',
    metaShadowed: ' · shadowed by a project-level definition (not in effect)',
    noSideDef: 'No definition on this side', inherited: '— (inherited)'
  },

  memory: {
    codexLegacy: 'Codex memory is not enabled; the entries above are leftover files in the directory.',
    codexEmpty: 'Codex memory is enabled but empty.',
    codexDisabled: 'Codex memory is not enabled — turn it on with the /memories command inside Codex, or via Settings → Personalization → Enable memories (experimental).',
    noneGlobal: 'No automatic memory in any project',
    globalHint: 'Most recently modified first · includes stale (badged) · click a row for its files, click a file for its content',
    stale: 'Stale',
    codexGlobalDir: 'Global memory directory', noMainFile: 'No MEMORY.md',
    noneProject: 'No automatic memory in this project yet',
    claudeOnly: 'Memory is a Claude-side mechanism (Codex memory is global — see the Memory tab on the global page)',
    mainTitle: 'MEMORY.md (main automatic memory file)',
    noMain: 'No MEMORY.md (topic files only)',
    topicsTitle: (n) => `Topic files (${n}) · click to view`,
    noTopics: 'No topic files',
    topicMeta: (ago) => `topic file · ${ago}`,
    unreadable: (detail) => `File cannot be read: ${detail}`,
    loading: 'Loading…'
  },

  plugins: {
    projectMissing: '(project stale)',
    installMissing: 'Install directory missing (cache cleaned up) — only the registry record is visible; bundled components cannot be read',
    noBundled: 'None of the four bundled component types',
    codexCacheEnum: 'Cache enumeration',
    cachedVersions: (n) => `(${n} cached ${plural('en', n, { one: 'version', other: 'versions' })})`,
    cacheOnly: 'cache enumeration only',
    codexFoot: 'The Codex group lists only plugins present in the cache; there is no enabled/disabled semantics, and bundled skills can be previewed but are not merged into the Skills tab',
    codexFootDetail: '; Codex plugins take effect globally, with no project-level enablement semantics',
    claudeGlobalHint: 'Enablement basis: user layer · click a row to expand bundled components',
    noPlugins: 'No plugins installed',
    enabled: 'Enabled', notEnabled: 'Not enabled',
    claudeProjectHint: 'Enablement basis: this project’s effective set (local > project > user)',
    enabledShort: 'Enabled', disabledShort: 'Disabled',
    noLayerMentions: 'Not mentioned in any layer',
    verdictFrom: (verdict, layer) => `${verdict} — decided by the ${layer}`,
    layerLocal: 'local layer', layerProject: 'project layer', layerUser: 'user layer'
  },
  session: {
    forkPoints: (n) =>
      `This session has **${n} ${plural('en', n, { one: 'fork point', other: 'fork points' })}**. The chain shown is traced from the last message back along the parent links to the root — i.e. "what this conversation finally looks like"; abandoned branches are not shown.`,
    forkedFrom: 'This session was forked from',
    anotherSession: 'another session',
    parentTitle: (title) => `“${title}”`,
    forkedFromTail: '— the replayed prefix has been stripped, so only what follows this fork is shown below. **See that session for the earlier history**.',
    stripUncertainOrphan:
      '**Uncertain prefix stripping**: this session was forked from a parent **outside the scan set** (its file was cleaned up, or it belongs to an unregistered project), so stripping could only be heuristic — **it may have stripped too much (losing messages) or too little (duplicates)**. Please check against the original. Not failing silently is the only guarantee available here.',
    stripUncertainMismatch: (parent) =>
      `**Uncertain prefix stripping**: the replayed segment does not line up entry by entry with the parent session “${parent}” (the parent log may have been rewritten), so only **the part that passes verification** was stripped — the beginning may duplicate the parent or be missing. Please check against the original.`,
    fetching: 'Fetching…',
    rebuilding: 'Index signature mismatch (the file was appended to or rewritten) → rebuilding the index for **this file only**…',
    turnFailed: (detail) => `This turn could not be fetched: ${detail}`,
    fetchedNote: (ms, bytes) =>
      `Fetched on demand in ${ms} ms · read only this turn’s byte range, ${bytes} — independent of total file size`,
    back: (project) => `Back to ${project} · Sessions`,
    headMeta: (side, questions, tok, mb, ago) =>
      `${side} · ${questions} ${plural('en', questions, { one: 'question', other: 'questions' })} · ${tok} tok · ${mb} · last active ${ago}`,
    cannotOpen: (detail) => `Cannot open this session: ${detail}`,
    loading: 'Loading…',
    mainline: (n, days) =>
      `Questions (main line) · ${n} ${plural('en', n, { one: 'question', other: 'questions' })}${days}`,
    dayCount: (n) => ` · ${n} ${plural('en', n, { one: 'day', other: 'days' })}`,
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    ascending: 'Oldest first',
    descending: 'Newest first',
    dayGroup: (day, n) => `${day} · ${n} ${plural('en', n, { one: 'question', other: 'questions' })}`,
    foot: 'The main line lists only human questions; harness noise is not rendered. All questions are listed at once (their text is read by byte range on demand, independent of file size). Click a question to expand the whole turn in place: body, tool calls, subagent dispatches and reasoning blocks.'
  },

  turn: {
    typeSeparator: ', ',
    thinking: 'Thinking',
    thinkingSum: (chars) =>
      `${chars} ${plural('en', chars, { one: 'char', other: 'chars' })} · plain text available`,
    reasoning: 'Reasoning',
    reasoningSum: (n) =>
      `only ${n} ${plural('en', n, { one: 'heading', other: 'headings' })} · body unavailable`,
    reasoningNote:
      'Codex reasoning bodies are `encrypted_content` and are **never obtainable**. Below are the only plain-text headings in the record — **not equivalent** to Claude’s plain-text thinking, and not pretended to be.',
    input: 'Input',
    output: 'Output',
    empty: '(empty)',
    noOutput: '(no output recorded)',
    truncatedNote:
      'The output exceeded the agent’s per-entry cap, so the transcript **only stored a truncated version**; the original sits alongside under `tool-results/` (path shown above) and this product does not read it — what you see here is the truncated version, not claimed to be complete.',
    subSteps: (n) => `${n} ${plural('en', n, { one: 'step', other: 'steps' })} · no result`,
    dispatchPrompt: 'Dispatch prompt',
    innerSteps: 'Inner steps',
    unlinkedNote:
      'The inner steps of this dispatch have **no stable reference chain** in the record that would place them here (measured on both sides) — they are not shown, and no speculative pairing is made; the full transcript is in its own file, if any.',
    backToMain: 'Back to main session',
    noReturn: '(no result)',
    unknownRecords: (count, types) =>
      `This turn contains **${count} ${plural('en', count, { one: 'unrecognised record', other: 'unrecognised records' })}** (types: ${types}) — kept as-is in the source file, not rendered. This usually means an agent update introduced a new record type.`
  },
  detail: {
    notInSnapshot: 'This project is not in the snapshot (refresh and try again)',
    staleTag: 'Stale',
    staleCause: (n) =>
      `Why stale: the project directory no longer exists (deleted or moved), while the {sides} ${n > 1 ? 'registries' : 'registry'} still ${n > 1 ? 'record' : 'records'} it.`,
    staleFx: 'Removing the records takes this row off the list; token totals and the trend are unaffected (the statistics are independent of the registries).',
    staleSend: 'Send this line to {sides} and let each of them delete it themselves:',
    stalePrompt: (p) => `My project "${p}" is stale (the directory no longer exists) — please remove its records from your configuration.`,
    staleCopy: 'Copy',
    staleCopied: 'Copied',
    staleCopyFailed: 'Copy failed',
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
    sessionCountNote: (n) =>
      `${n} ${plural('en', n, { one: 'session', other: 'sessions' })} in total — see the “Sessions” tab for all of them.`,
    noSessionsHint: 'No sessions in this project yet. They appear automatically once any agent side has a conversation in this directory.',
    searching: 'Searching…',
    noHits: 'No hits. Only questions are searched by default — try switching to “Full text”.',
    hitsFound: (hits, sessions) =>
      `Found ${hits} ${plural('en', hits, { one: 'hit', other: 'hits' })} · ${sessions} ${plural('en', sessions, { one: 'session', other: 'sessions' })}`,
    folded: (n) =>
      ` · ${n} ${plural('en', n, { one: 'hit', other: 'hits' })} folded away (replays or abandoned branches)`,
    recentFirst: 'Newest first',
    oldestFirst: 'Oldest first',
    forkUncertain: 'uncertain strip',
    hitCount: (n) => `${n} ${plural('en', n, { one: 'hit', other: 'hits' })}`,
    inBody: 'Body',
    sortNote: (order, n) =>
      `By last activity, ${order} · ${n} ${plural('en', n, { one: 'session', other: 'sessions' })}`,
    descending: 'descending',
    ascending: 'ascending',
    forkTip: 'This session was forked from another; the replayed prefix has been stripped',
    forkUncertainTip: 'The parent session is outside the scan set or fails verification, so the replayed prefix could only be stripped heuristically — some may remain (duplicates)',
    questionCount: (n) => `${n} ${plural('en', n, { one: 'question', other: 'questions' })}`,
    sessionsFoot: 'Only sessions of registered projects are listed; subagent and warm-up sessions are not listed separately, though their tokens still count — so this count and the denominator of the token cards above are not the same thing.',
    sessionsFoot2: '“Last activity” takes the largest timestamp inside the file, which is a different pipeline from the project list’s activity (which uses file mtime).',
    searchPlaceholder: (n) =>
      `Search across ${n} ${plural('en', n, { one: 'session', other: 'sessions' })} in this project…`,
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
    staleFiltered: (n) =>
      `${n} stale ${plural('en', n, { one: 'project', other: 'projects' })} filtered out`,
    noMatch: 'No matching projects',
    staleTag: 'Stale',
  },
  token: {
    winAll: 'Total · all history',
    winToday: 'Today',
    winD7: 'Last 7 days',
    winD30: 'Last 30 days',
    compCacheRead: 'Cache reads',
    compUncached: 'Uncached input',
    /* Not bare “Output”: turn.output already renders that way, and the two name different things —
       a turn's reply text versus the tokens the model generated. English needs two words where the
       source language draws that distinction with two different words. */
    compOutput: 'Generated output',
    compTipCacheRead: (v) => `${v} · input served from cache, never recomputed`,
    compTipUncached: (v) => `${v} · cache writes included: everything the model read afresh this turn`,
    compTipOutput: (v) => `${v} · tokens the model generated`,
    byModelIn: (title, win) => `${title} · ${win}`,
    noUsageInWindow: 'No usage in the selected window',
    trendTitle: 'Last 30 days’ trend (local time zone · daily)',
    legendNote: 'Bar height = daily total; segments = share per provider',
    legendDimNote: '; dimmed = outside the selected window',
    tipTotal: (label, total) => `${label} · total ${total}`,
    tipArchived: ' · archived (source files cleaned up)',
    tipNoUsage: 'No usage',
    noModelData: 'No model data yet'
  },
  /** The display names that vary by language (the rest, such as Anthropic / Claude, are proper nouns and
   * are not translated) */
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
    turnOutOfRange: (i, total) =>
      `Turn index out of range: ${i} (of ${total} ${plural('en', total, { one: 'turn', other: 'turns' })})`,
    artifactNotWhitelisted: 'This artifact path is not in the allowed list',
    pluginRootNotRegistered:
      'This plugin package root is not registered — refresh or open the details first',
    projectNotOpened: 'The project is not open — open the project details first',
    skillPackageUnavailable: 'The skill package is unavailable or outside the allowed roots',
    skillFileNotWhitelisted: 'This skill file path is not in the allowed list',
    skillFileUnreadable: 'The skill file cannot be read',
    sessionNotIndexed: 'This session is not indexed — use Refresh all first',
    sessionFileUnreadable: 'The session file can no longer be read (moved or deleted?)',
    sessionMetaUnreadable: 'The session’s first-line metadata is unreadable, so the index cannot be rebuilt',
    sessionParseFailed: 'Failed to parse the session file',
    prefsStoreNotReady: 'The preference store is not ready',
    invalidPref: (field) => `Invalid preference value: ${field}`,
    contractMissing: (path) => `Received an invalid payload: ${path} is missing`,
    contractType: (path, expect) => `Received an invalid payload: ${path} should be ${expect}`,
    contractEnum: (path, value) =>
      `Received an invalid payload: ${path} has the value ${value}, which is not one of the allowed values`,
    untrustedSender: (sender) => `Untrusted IPC caller: ${sender}`,
    linkProtocolUnsupported: 'Unsupported link protocol',
    linkOutOfScope: 'The link target is outside the readable scope',
    skillBadName: 'Invalid skill name',
    skillStaleTarget: 'The target is a stale project (its directory no longer exists)',
    skillMissingSource: (name) => `No such skill in the global library: ${name}`,
    skillCopyMissing: 'The project-level copy does not exist',
    skillConflict: 'Blocked: the target already has a project-level skill with this name, and nothing was overwritten',
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
