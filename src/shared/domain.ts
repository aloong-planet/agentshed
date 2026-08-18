// Domain model: the single type source shared by both ends of the IPC boundary (learned from
// Transfer's message model drift).
// Terminology follows CONTEXT.md: project / stale project / agent side / global library /
// project install / artifact / activity / session.

import type { AppError } from './errors'
import type { Provider } from './provider'

/** Codex config.toml summary: **structured fields**; the renderer composes the sentence (ticket 07) */
export interface CodexConfigSummary {
  /** null = not set */
  model: string | null
  projectCount: number
  mcpCount: number
}

/**
 * A bounded text read result (ticket 07).
 * The main process **only reports whether it was truncated**; a marker such as "…(truncated)" is
 * appended by the renderer in the current language — the marker used to be spliced into the body by
 * the main process, which froze UI copy outside the process boundary.
 */
export interface CappedText {
  text: string
  truncated: boolean
}

export type AgentSide = 'claude' | 'codex' | 'grok'

/**
 * The per-side project skills directory, relative to the project root (the landing place of a
 * project install and the path shown in the uninstall confirmation). Keyed by AgentSide so a new
 * side is a compile error at every consumer rather than a silent fall-through in a ternary.
 */
export const PROJECT_SKILLS_DIR: Record<AgentSide, string> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  grok: '.grok/skills'
}

/** Detection information for one agent side */
export interface SideInfo {
  /** Whether that side's data directory exists on this machine */
  detected: boolean
  /**
   * Probe failure: a code plus parameters, containing no natural language (ticket 07).
   * On a registry parse failure that side's data is empty but the app does not crash.
   */
  error?: AppError
}

/** Project: a working directory recorded in either agent side's registry (union of both sides, one directory to one project) */
export interface ProjectEntry {
  /** Normalised absolute path (the unique key) */
  path: string
  /** Directory name (for display) */
  name: string
  sides: AgentSide[]
  /** Stale: still in the registry, but the directory no longer exists on disk */
  stale: boolean
  /** Activity: most recent session time (epoch ms; null with no sessions) and session count */
  lastSessionAt: number | null
  sessionCount: number
}

/** Aggregate stats for a skill package (shown inline): previewable text file count and total bytes; obtained by `stat` during the scan, without reading contents */
export interface SkillPkgStats {
  files: number
  bytes: number
}

/**
 * One skill in the global library (both sides merged into one column).
 * The G series: an entry with origin=plugin comes from an effectively enabled plugin's bundled
 * skills — a namespaced name (plugin:skill), not taking part in on-disk same-name shadowing (G2),
 * with sides always claude (G4), and not installable or uninstallable (G3; ADR-0004 confines
 * install/uninstall to the global library).
 */
export interface GlobalSkill {
  name: string
  /** The description from SKILL.md's frontmatter; null if absent */
  description: string | null
  sides: AgentSide[]
  /** Whether each side is a symlink (dereferenced and copied on install) */
  symlink: Record<AgentSide, boolean>
  /** Package stats per side; null where that side has no definition or it cannot be read */
  pkg: Record<AgentSide, SkillPkgStats | null>
  origin: 'disk' | 'plugin'
  pluginName: string | null
  /** A plugin entry's summary-source package root (the preview entry point, plugins-view H5); null for on-disk entries */
  pluginRoot: string | null
  /** A plugin entry's bare skill name (the directory name inside the package; the UI and IPC no longer parse it back out of the namespaced name); null for on-disk entries */
  pluginSkillName: string | null
}

/**
 * Per-side subagent detail. The key means different things per side (verified at source level
 * 2026-07-31): Claude = the filename (minus .md), Codex = the `name` field inside the toml
 * (agent_roles.rs; Codex does not load a file with an invalid name).
 */
export interface SubagentSideDetail {
  /** The full definition as written (truncated when oversized); the raw text or null on a parse failure */
  content: CappedText | null
  description: string | null
  /** Claude side only: frontmatter tools */
  tools: string | null
  model: string | null
  /** Codex side only: sandbox_mode */
  sandbox: string | null
  /**
   * Failure information for when that side's file exists but will not parse or has no valid name;
   * null when normal.
   *
   * **A code plus parameters, containing no natural language** (ticket 07 widened ADR-0015's rule to
   * data fields): both the wording and the branch decision are made by the renderer from the code.
   * Ticket 05 used a parallel `errorKind` field as a transition, which this ticket removed — one
   * structured field carries both "for people to read" and "for the program to judge on", and two
   * sources of truth are not needed.
   */
  error: AppError | null
}

/** A global subagent (both sides merged into one column; no cross-side content diff — the formats differ, and we do not manufacture false signals) */
export interface SubagentEntry {
  name: string
  sides: AgentSide[]
  /** The description to display: the Claude side takes priority */
  description: string | null
  claude: SubagentSideDetail | null
  codex: SubagentSideDetail | null
  /** A Codex name matching a built-in (default/worker/explorer) → the custom one overrides the built-in (role.rs semantics) */
  overridesBuiltin: boolean
}

export interface MemoryFileMeta {
  name: string
  /** Absolute path: the allow-list key for on-demand reading (contents do not enter the snapshot, see spec C8) */
  file: string
  mtimeMs: number
}

/** A Memory summary entry (Claude is per-project; Codex is a global directory, so projectPath=null) */
export interface MemorySummaryEntry {
  side: AgentSide
  projectPath: string | null
  /** **null = no owning project** (as with Codex global memory); the renderer produces the display name (ticket 07) */
  projectName: string | null
  /** Whether MEMORY.md exists (always false for the Codex global entry) */
  hasMain: boolean
  files: MemoryFileMeta[]
  lastModified: number | null
  stale: boolean
}

/** One plugin installation record (E1: several records are not merged; E3: a scope other than user/project is labelled as written) */
export interface PluginInstallRecord {
  /** **null = unknown**; the renderer produces the wording (ticket 07) */
  scope: string | null
  /** The owning project for project scope; null otherwise */
  projectPath: string | null
  /** The owning project's directory no longer exists (E2: displayed as written and marked "project lost") */
  projectMissing: boolean
  installPath: string | null
  version: string | null
}

export interface PluginHookSummary {
  event: string
  /** The number of matcher groups (E7: a summary and no further — command details are not rendered) */
  matchers: number
}

/** A plugin's bundled skill summary (plugins-view H1/H6): pkg = package stats (stat-only); null when unreadable (which is what greys the row out) */
export interface PluginSkillSummary {
  name: string
  description: string | null
  pkg: SkillPkgStats | null
}

/** A plugin's bundled component summary (E5: the directory convention merged with the manifest's declared fields; E6: a missing directory sets `missing`) */
export interface PluginContents {
  skills: PluginSkillSummary[]
  agents: string[]
  hooks: PluginHookSummary[]
  mcp: string[]
  missing: boolean
}

/** A Claude plugin (global layer, read-only). `enabled` uses the user-layer rule (E4); for the project's viewpoint see ProjectPluginEntry */
export interface PluginEntry {
  name: string
  version: string | null
  installs: PluginInstallRecord[]
  enabled: boolean
  /** The first valid installPath (used for scanning MCP and bundled components) */
  installPath: string | null
  contents: PluginContents
}

/** A Codex plugin (E8: enumerate the cache's three directory levels + the skills under the highest version's package root; enablement semantics are not wired up and are not modelled) */
export interface CodexPluginEntry {
  name: string
  marketplace: string
  /** The highest version's cache directory (the summary-source package root, H5); null when unobtainable */
  root: string | null
  /** Bundled skills (this category only, ADR-0012; the directory convention is the same as Claude's) */
  skills: PluginSkillSummary[]
  /** The highest version in the cache */
  version: string | null
  cachedVersions: number
}

/** A plugin entry in project detail: effectively enabled = `enabledPlugins` merged local > project > user (F1) */
export interface ProjectPluginEntry {
  name: string
  version: string | null
  /** The summary-source package root (the same installPath the contents scan used, H5); null with no valid record */
  installPath: string | null
  enabled: boolean
  /** Which layer the enabled/disabled judgement came from; null when no layer mentions it */
  enabledFrom: 'local' | 'project' | 'user' | null
  installs: PluginInstallRecord[]
  contents: PluginContents
}

/** A global MCP server (labelled by origin) */
export interface McpServerEntry {
  name: string
  side: AgentSide
  /** 'global-config' (~/.claude.json) | 'plugin' (bundled in plugin.json) | 'config.toml' */
  source: 'global-config' | 'plugin' | 'config.toml'
}

/** The Agents global layer (ticket 07; subagents/memory are v2 component extensions) */
export interface GlobalLayer {
  skills: GlobalSkill[]
  subagents: SubagentEntry[]
  /** The Memory summary (most recently modified first; metadata and filenames only, contents read on demand) */
  memory: MemorySummaryEntry[]
  /** The Codex memory toggle (config.toml [features] memories; the basis for C6's three-state display) */
  codexMemoriesEnabled: boolean
  plugins: PluginEntry[]
  /** Codex plugins (probe-style: an empty cache directory gives an empty array and the UI hides the whole group) */
  codexPlugins: CodexPluginEntry[]
  mcp: McpServerEntry[]
  /** The global CLAUDE.md's contents (null when absent, truncated when oversized) */
  claudeGlobalMd: CappedText | null
  /** The Codex global AGENTS.md's contents */
  codexAgentsMd: CappedText | null
  codexConfigSummary: CodexConfigSummary | null
}

/**
 * Token counts. The total rule (ADR-0005, aligned with ccusage; amended by ADR-0023):
 * Claude: total = input + output + cacheRead + cacheWrite (all four summed);
 * Codex and Grok: total = input + output — their reported input already includes cached reads, so
 * adding those would count them twice, and cache creation is not collected on either side at all
 * (`cacheWrite` reads 0 there).
 *
 * **The four fields sum to the total on every side**, which is what lets a cross-side view present
 * `input + cacheWrite` / `output` / `cacheRead` as three comparable buckets. Note that `input` and
 * `cacheWrite` do **not** each carry one meaning across sides — see the invariant in CONTEXT.md
 * before summing either of them by itself.
 */
export interface TokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface ModelUsage {
  model: string
  side: AgentSide
  total: number
}

/** Daily usage (local time zone) */
export interface DayUsage {
  day: string
  /**
   * By agent side (for the single-side filter), keyed by side (ADR-0020): a **total** Record, so
   * the moment AgentSide grows, typecheck enumerates every producer and consumer that has to
   * answer for the new member. Producers write an explicit zero for a side with no volume — unlike
   * `byProvider` below, where absence is meaningful (no segment), a side is a closed enumeration
   * whose filter control exists whether or not it has volume, so absence could only mean "the
   * producer forgot".
   */
  bySide: Record<AgentSide, number>
  /**
   * Broken down by provider (the model vendor) — the basis for the trend bars' segmentation.
   *
   * **`Partial` is load-bearing**: this map is sparse. A provider with no volume produces no segment,
   * so only providers that actually accrued tokens get a key. A plain `Record<Provider, number>` would
   * demand all four, which is a different thing from what this holds — and would push every producer
   * into writing zeros it does not mean.
   *
   * The key type is `Provider` rather than `string` so that **typecheck owns the agreement** between
   * the side producing keys and the side reading them. While it was `string`, the two could drift with
   * nothing reporting it, and the failure was invisible: the day's total still correct, the bar still
   * the right height, the legend still drawn — only the segments inside the bar gone.
   */
  byProvider: Partial<Record<Provider, number>>
}

export interface TokenStats {
  bySide: Record<AgentSide, TokenTotals>
  byModel: ModelUsage[]
  byDay: DayUsage[]
}

/**
 * A session's fork state. The three states have to be distinguishable in the data; they are not two
 * shades of one field: "not a fork" and "a fork whose strip is not trustworthy" mean completely
 * different things to the user, and the latter has to prompt them to check against the source.
 */
export type ForkState = 'none' | 'stripped' | 'uncertain'

/** Session metadata */
export interface SessionMeta {
  side: AgentSide
  /** **null = no title**; the renderer produces the fallback wording (ticket 07) */
  title: string | null
  /** Last activity time = the largest timestamp inside the file (the same meaning on both sides; a separate pipeline from project activity, which uses mtime) */
  at: number | null
  tokens: number
  /** The source file's absolute path — the session's identity. Contents are located and read by it (reads are validated against the main process's allow-list) */
  file: string
  /** The number of real human questions in this session (harness noise stripped, abandoned branches and replay prefixes removed; shares its source with the title) */
  questionCount: number
  /** How certain the fork and replay stripping is, which decides whether the list shows a "fork" or
   * "uncertain strip" pill */
  forkState: ForkState
}

/** One question on a session page (ticket 04). The text is read live by byte range — neither the index nor the cache holds any text (spec D2a) */
export interface SessionQuestion {
  /** The display index, from 1, always the original turn number within this session's displayed set (a sort change does not renumber) */
  i: number
  /** The question in full; **null = that line could not be read**, and the renderer produces the wording (ticket 07) */
  text: string | null
  at: number | null
  /** The number of tool calls in this turn (excluding subagent dispatches) */
  tools: number
  /** The number of subagent dispatches in this turn */
  subagents: number
}

/** The session page payload (the getSessionPage channel; self-contained, so the renderer does not have to assemble data from elsewhere) */
export interface SessionPage {
  file: string
  side: AgentSide
  /** **null = no title**; the renderer produces the fallback wording (ticket 07) */
  title: string | null
  at: number | null
  tokens: number
  /** The source file's byte count (for the volume display in the page header) */
  bytes: number
  forkState: ForkState
  /** The number of branch points on Claude's main chain (> 0 shows the "branches resolved" info banner); always 0 for Codex (ticket 06) */
  forkPoints: number
  /** For a Codex fork whose parent is in the scan set, the parent session's title and file (for the banner's reference and jump); null otherwise */
  forkParentTitle: string | null
  forkParentFile: string | null
  questions: SessionQuestion[]
}

/**
 * The normalised blocks of a session turn (the model was established in ticket 05 and completed in
 * ticket 07): each side's raw lines are unified into this model and the renderer knows only this.
 * The order = the source file's line order (within a line, thinking → prose → tools).
 */
export interface TurnTextBlock {
  kind: 'text'
  role: 'assistant'
  at: number | null
  body: string
}
/** Claude's plaintext thinking (the thinking segment); the Codex side has no such kind — its reasoning goes through `reason` */
export interface TurnThinkBlock {
  kind: 'think'
  at: number | null
  body: string
}
/** Codex reasoning: plaintext sub-headings only, since the body is `encrypted_content` and is never obtainable (spec C6) */
export interface TurnReasonBlock {
  kind: 'reason'
  at: number | null
  titles: string[]
}
export interface TurnToolBlock {
  kind: 'tool'
  at: number | null
  /** **null = unknown tool**; the renderer produces the wording (ticket 07) */
  name: string | null
  /** A one-line summary (arguments truncated), shown while collapsed */
  summary: string
  input: string
  /** null when there is no return (still running / the record is missing) */
  output: string | null
  /** Claude: the transcript holds only the truncated version, and the sidecar under tool-results/ is not read (spec C7, ruled 2026-08-06) */
  truncated: boolean
}
export interface TurnSubStep {
  kind: 'text' | 'tool'
  label: string
}
export interface TurnSubBlock {
  kind: 'sub'
  at: number | null
  /** The dispatch name (Claude takes subagent_type, falling back to the tool name; Codex is always spawn_agent); **null = unknown tool**, and the renderer produces the wording (ticket 07) */
  name: string | null
  prompt: string
  /** Internal steps: Claude groups the turn's sidechain lines by agentId; Codex has no reference chain and this is always empty */
  steps: TurnSubStep[]
  result: string | null
  /** Codex: a sub-thread's transcript has no stable reference chain and is unattributed (ruled 2026-08-06, labelled in the UI) */
  unlinked: boolean
}
/** A trace of unknown types outside the display allow-list (spec C8): their contents are not rendered, but they are never silently dropped */
export interface TurnUnknownBlock {
  kind: 'unknown'
  count: number
  types: string[]
}
export type TurnBlock =
  | TurnTextBlock
  | TurnThinkBlock
  | TurnReasonBlock
  | TurnToolBlock
  | TurnSubBlock
  | TurnUnknownBlock

/** A single turn's fetch payload (the getSessionTurn channel) */
export interface SessionTurn {
  blocks: TurnBlock[]
  /** The bytes actually read this time — evidence that nothing was read whole, and the data behind the UI footnote */
  bytesRead: number
}

/** A search hit (ticket 08; the searchSessions channel) */
export interface SearchHit {
  /** The question's index (within the displayed set, from 1, sharing its source with the session page) */
  i: number
  /** The question in full (the clean text of the matching line after parsing); **null = that line could not be read**, and the renderer produces the wording (ticket 07) */
  text: string | null
  at: number | null
  /** true = the hit is in that turn's answer or tool body (produced by full-text mode only) */
  inBody: boolean
  /** The context snippet for a body hit (null for a question hit; also null when extraction fails, and the renderer degrades) */
  snippet: string | null
}

export interface SearchGroup {
  file: string
  /** **null = no title**; the renderer produces the fallback wording (ticket 07) */
  title: string | null
  side: AgentSide
  forkState: ForkState
  at: number | null
  hits: SearchHit[]
}

export interface SearchResult {
  groups: SearchGroup[]
  totalHits: number
  sessionCount: number
  /** Hits outside the displayed range (fork replay copies / abandoned branches / the noise before the first question) */
  folded: number
}

/** One project's statistics (the data for the overview tab) */
export interface ProjectStats {
  tokens: TokenStats
  sessions: SessionMeta[]
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

/** A DayUsage.bySide with every side's explicit zero (ADR-0020: producers write zeros they do not
 * otherwise mean — the price of letting the compiler enforce completeness) */
export function zeroBySide(): Record<AgentSide, number> {
  return { claude: 0, codex: 0, grok: 0 }
}

export function emptyTokenStats(): TokenStats {
  return {
    bySide: { claude: emptyTotals(), codex: emptyTotals(), grok: emptyTotals() },
    byModel: [],
    byDay: []
  }
}

/** One skill in project detail (an effective-view entry; the plugin level = the bundled skills of this project's effectively enabled plugins) */
export interface ProjectSkillEntry {
  name: string
  description: string | null
  /** project = the project-level directory; global = in effect from the global layer; plugin = bundled with a plugin (a namespaced entry, not taking part in shadowing) */
  level: 'project' | 'global' | 'plugin'
  side: AgentSide
  symlink: boolean
  /** Stats for this row's package; null when unreadable */
  pkg: SkillPkgStats | null
  origin: 'disk' | 'plugin'
  pluginName: string | null
  /** A plugin entry's summary-source package root (the preview entry point, plugins-view H5); null for on-disk entries */
  pluginRoot: string | null
  /** A plugin entry's bare skill name (the directory name inside the package; the UI and IPC no longer parse it back out of the namespaced name); null for on-disk entries */
  pluginSkillName: string | null
}

/**
 * One subagent in project detail (an effective-view entry).
 * Shadowing semantics: both Claude and Codex shadow the lower layer at the project level — the
 * opposite of skills' Codex same-name coexistence (agent_roles.rs overrides by config layer,
 * verified at source level 2026-07-31).
 */
export interface ProjectSubagentEntry {
  name: string
  side: AgentSide
  level: 'project' | 'global'
  description: string | null
  detail: SubagentSideDetail
  shadows: boolean
  shadowed: boolean
  overridesBuiltin: boolean
}

/** Project detail's Memory (sequence D): MEMORY.md's contents are emitted directly, topics carry metadata only (contents read on demand) */
export interface ProjectMemory {
  /** MEMORY.md's contents (truncated when oversized); null when absent */
  main: CappedText | null
  topics: MemoryFileMeta[]
}

/** A project-level MCP (.mcp.json) entry */
export interface ProjectMcpEntry {
  name: string
  /** Synthesised from the project's enabled/disabledMcpjsonServers keys; null (the default state) when it appears in neither list */
  enabled: boolean | null
}

/**
 * The six artifact types (the eight-step process's convention; tickets under .scratch are working
 * documents and do not count).
 * The order is a contract: the top-down derivation chain — terminology and invariants →
 * architectural decisions → requirements and boundaries → UI form → current capabilities →
 * after-the-fact lessons. The reader and the UI both take this constant rather than each ordering
 * it themselves.
 */
export const ARTIFACT_ORDER = [
  'context',
  'adr',
  'specs',
  'prototypes',
  'features',
  'postmortems'
] as const

export type ArtifactType = (typeof ARTIFACT_ORDER)[number]

export interface ArtifactEntry {
  type: ArtifactType
  title: string
  /** Absolute path (reading and opening externally are validated against the main process's allow-list) */
  file: string
  mtimeMs: number
}

/** Project detail (fetched over IPC on demand; it does not enter the overview snapshot) */
export interface ProjectDetail {
  path: string
  skills: ProjectSkillEntry[]
  subagents: ProjectSubagentEntry[]
  memory: ProjectMemory
  plugins: ProjectPluginEntry[]
  mcp: ProjectMcpEntry[]
  configs: {
    claudeMd: CappedText | null
    agentsMd: CappedText | null
    settingsSummary: string | null
  }
  /** The overview tab's data (attached by the main process from the token engine; null when the engine is not ready) */
  stats: ProjectStats | null
  /** Artifacts (six types, most recent first) */
  artifacts: ArtifactEntry[]
}

/** The overview snapshot: one scan's complete output (extended incrementally by tickets 02–07) */
export interface Snapshot {
  scannedAt: number
  sides: Record<AgentSide, SideInfo>
  projects: ProjectEntry[]
  global: GlobalLayer
  /** The cross-project token summary (rule: includes stale projects; includes historical days filled in from the archive) */
  tokens: TokenStats
  /** Days that exist only in the archive, whose source session files the agent has cleaned up (the UI labels these historical spans) */
  archivedDays: string[]
}

/** An empty snapshot (the base state before a scan, or when neither side is detected) */
export function emptySnapshot(scannedAt: number): Snapshot {
  return {
    scannedAt,
    sides: { claude: { detected: false }, codex: { detected: false }, grok: { detected: false } },
    projects: [],
    global: {
      skills: [],
      subagents: [],
      memory: [],
      codexMemoriesEnabled: false,
      plugins: [],
      codexPlugins: [],
      mcp: [],
      claudeGlobalMd: null,
      codexAgentsMd: null,
      codexConfigSummary: null
    },
    tokens: emptyTokenStats(),
    archivedDays: []
  }
}
