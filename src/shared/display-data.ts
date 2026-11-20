import { displaySnapshotValid, displayDetailValid, displayStatsValid } from './display-shape'
// Successful presentation payloads only (ADR-0053). No renderer-to-disk write channel.
import type { CappedText, ProjectDetail, ProjectStats, SessionPage, SessionTurn, Snapshot } from './domain'
import type { ListSkillFilesArgs, ListSkillFilesResult } from './ipc'
import { validateProjectDetail, validateProjectStats, validateSessionPage, validateSessionTurn, validateSnapshot, AGENT_SIDES } from './validate'
import { sessionIdFromPath } from './session-resume'
import { emptyTotals, PROJECT_SKILLS_DIR, type AgentSide } from './domain'

export type SavedRead =
  | { kind: 'projectDetail'; path: string; data: ProjectDetail }
  | { kind: 'sessionPage'; file: string; data: SessionPage }
  /** `bodyBytes`: the turn's body length, which decides it is kept (ADR-0053). A turn saved without it, by a build before
   * the copy carried it, is not restored: it cannot be told from one over the keep size, and is fetched again */
  | { kind: 'turnContent'; file: string; i: number; revision: string; ms: number; bodyBytes: number; data: SessionTurn }
  | { kind: 'memoryContent' | 'skillContent'; file: string; data: CappedText }
  | { kind: 'skillFiles'; args: ListSkillFilesArgs; data: ListSkillFilesResult }

export interface ReadRegistrations {
  memoryFiles: string[]
  skillFiles: string[]
  projects: string[]
  pluginRoots: string[]
}
export interface RegistrationScope extends ReadRegistrations { owner: string }
export interface DisplayData {
  snapshot: Snapshot | null
  stats: [string, ProjectStats][]
  sessionFiles: string[]
  registrations: RegistrationScope[]
  reads: SavedRead[]
}
export type StartupStatus = 'scanning' | 'waiting' | 'ready'
export interface StartupData { display: DisplayData; status: StartupStatus }

export function emptyDisplayData(): DisplayData {
  return { snapshot: null, stats: [], sessionFiles: [],
    registrations: [], reads: [] }
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0)
const path = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const capped = (v: unknown): boolean => object(v) && typeof v.text === 'string' && v.text.length <= 500_000 && typeof v.truncated === 'boolean'
// JSON permits numeric overflow (for example 1e400); live IPC validators only check number types.
function finiteNumbers(value: unknown): boolean {
  const pending = [value]
  while (pending.length) {
    const v = pending.pop()
    if (typeof v === 'number' && !Number.isFinite(v)) return false
    if (v !== null && typeof v === 'object') for (const child of Object.values(v)) pending.push(child)
  }
  return true
}

export function validSavedRead(v: unknown): v is SavedRead {
  if (!object(v) || !finiteNumbers(v)) return false
  switch (v.kind) {
    case 'projectDetail': return path(v.path) && validateProjectDetail(v.data).ok && displayDetailValid(v.data) && (v.data as ProjectDetail).path === v.path
    case 'sessionPage': return path(v.file) && validateSessionPage(v.data).ok &&
      (v.data as SessionPage).file === v.file && path((v.data as SessionPage).revision) && (v.data as SessionPage).questions.every(q => path(q.revision))
    case 'turnContent': return path(v.file) && number(v.i) && Number.isInteger(v.i) &&
      path(v.revision) && number(v.ms) && number(v.bodyBytes) && Number.isInteger(v.bodyBytes) && validateSessionTurn(v.data).ok
    case 'memoryContent': case 'skillContent': return path(v.file) && capped(v.data)
    case 'skillFiles': {
      const a = v.args, d = v.data
      return object(a) && AGENT_SIDES.has(String(a.side)) && path(a.name) &&
        (a.scope === 'global' || (a.scope === 'project' && path(a.projectPath)) || (a.scope === 'plugin' && path(a.pluginRoot))) &&
        object(d) && Array.isArray(d.files) &&
        d.files.every(f => object(f) && path(f.path) && path(f.absPath) && number(f.bytes) && number(f.lines) && number(f.mtimeMs))
    }
    default: return false
  }
}

/** A file of an Instructions entry saved before entries carried their paths: its contents (or null, then absent),
 * given the path it was read from. A malformed one stays malformed, for validation to drop. */
const pathed = (file: string, saved: unknown): unknown => (saved === null ? null : { file, content: saved })

/** A project detail saved before its memory carried the main file's entry restores with none listed; the live
 * read replaces it (ADR-0053's upgrade case; spec memory-view, Implementation Decisions). One saved before its
 * instruction entries carried their paths — `configs` held the two files' contents and a settings summary —
 * restores with each file at its place in the project, the only place the project's own two files live, and
 * without the summary (project-detail::REQ-002/AC-02). One saved while the page listed the project's documents
 * restores without the list (ADR-0051). One saved before it carried the project's skills directories in a global library
 * restores as if every one were, offering no Uninstall until the live read says which are (skill-install R4). A session
 * page saved
 * before the session ID was kept restores with the ID its path holds — Claude Code's and Grok's — and none for
 * Codex, whose ID is in its record, until the live page replaces it (session-view::CON-003). Only an absent field
 * is filled in: a present but malformed one is left for validation to drop. */
function upgradeSavedRead(v: unknown): unknown {
  if (!object(v) || !object(v.data)) return v
  if (v.kind === 'projectDetail') {
    let data: Record<string, unknown> = v.data
    if (object(data.stats)) upgradeSavedTokens(data.stats.tokens)
    // A project page saved before Antigravity CLI's subagents were read (#325): its definitions lack agy's two fields
    if (Array.isArray(data.subagents))
      for (const s of data.subagents) if (object(s)) upgradeSavedSubagentDetail(s.detail)
    if (object(data.memory) && !('mainFile' in data.memory))
      data = { ...data, memory: { ...data.memory, mainFile: null } }
    if (object(data.configs) && 'settingsSummary' in data.configs && typeof data.path === 'string') {
      const dir = data.path.endsWith('/') ? data.path : `${data.path}/`
      data = { ...data, configs: {
        claudeMd: pathed(`${dir}CLAUDE.md`, data.configs.claudeMd),
        agentsMd: pathed(`${dir}AGENTS.md`, data.configs.agentsMd)
      } }
    }
    if ('artifacts' in data) {
      data = { ...data }
      delete data.artifacts
    }
    if (!('libraryDirs' in data)) data = { ...data, libraryDirs: [...new Set(Object.values(PROJECT_SKILLS_DIR))] }
    return data === v.data ? v : { ...v, data }
  }
  if (v.kind === 'sessionPage' && !('sessionId' in v.data) && typeof v.data.file === 'string' && AGENT_SIDES.has(String(v.data.side)))
    return { ...v, data: { ...v.data, sessionId: sessionIdFromPath(v.data.side as AgentSide, v.data.file) } }
  return v
}

/**
 * A per-side Record of a saved payload is brought to exactly this build's sides before the contract checks it.
 *
 * A payload saved before a side joined AgentSide restores with that side's empty values filled in (ADR-0020), rather
 * than failing the contract that now asks for every side and being dropped — which would cost the first launch after
 * the update every saved page. Not detected, zero totals, no symlink, no package: what a scan of a machine without that
 * side would produce; the first scan then replaces it. Only an absent key is filled in.
 *
 * A payload a newer build saved loses the keys of a side this build does not know (agents-overview::REQ-005), so
 * nothing restored names it. For token figures those are empty buckets: a non-empty one derives from usage rows naming
 * the side (ADR-0025), which fail the contract, so that entry is not restored at all. For the side's other facts —
 * detected, symlinked, packaged — this build shows them nowhere.
 */
function alignSides(rec: unknown, empty: () => unknown): void {
  if (!object(rec)) return
  for (const side of AGENT_SIDES) if (!(side in rec)) rec[side] = empty()
  for (const key of Object.keys(rec)) if (!AGENT_SIDES.has(key)) delete rec[key]
}
function upgradeSavedTokens(tokens: unknown): void {
  if (!object(tokens)) return
  alignSides(tokens.bySide, emptyTotals)
  if (Array.isArray(tokens.byDay)) for (const day of tokens.byDay) if (object(day)) alignSides(day.bySide, () => 0)
}
/** The per-side Records of a saved snapshot, aligned in place as alignSides says */
function alignSavedSnapshotSides(snap: unknown): void {
  if (!object(snap)) return
  alignSides(snap.sides, () => ({ detected: false }))
  upgradeSavedTokens(snap.tokens)
  const skills = object(snap.global) ? snap.global.skills : null
  if (Array.isArray(skills)) for (const s of skills) if (object(s)) {
    alignSides(s.symlink, () => false)
    alignSides(s.pkg, () => null)
  }
  upgradeSavedComponents(snap.global)
}

/**
 * A global layer saved before Antigravity CLI's components were read (#325) restores with what a scan of a machine
 * without them produces — no Antigravity plugins — until the first scan replaces it, rather than failing the contract
 * and costing the first launch after the update its saved snapshot. Only an absent field is filled in.
 */
function upgradeSavedComponents(global: unknown): void {
  if (!object(global)) return
  if (!('antigravityPlugins' in global)) global.antigravityPlugins = []
  // A subagent of that time had no Antigravity definition, and none of its definitions the two fields only agy's carry
  if (Array.isArray(global.subagents)) for (const s of global.subagents) if (object(s)) {
    if (!('antigravity' in s)) s.antigravity = null
    for (const d of [s.claude, s.codex, s.antigravity]) upgradeSavedSubagentDetail(d)
  }
  // An MCP entry of that time came from Claude's or Codex's configuration: none marked disabled, and its plugin, if
  // any, not recorded
  if (Array.isArray(global.mcp)) for (const m of global.mcp) if (object(m)) {
    if (!('disabled' in m)) m.disabled = false
    if (!('plugin' in m)) m.plugin = null
  }
}
function upgradeSavedSubagentDetail(detail: unknown): void {
  if (!object(detail)) return
  if (!('subagent' in detail)) detail.subagent = null
  if (!('mainAgent' in detail)) detail.mainAgent = null
}

/** Where the two global instruction files a snapshot saved before entries carried their paths had been read from
 * — `~/.claude/CLAUDE.md` and Codex's `~/.codex/AGENTS.md`. Only the main process knows them (its roots), so only
 * its parse can restore that shape (agents-overview::REQ-004). */
export interface SavedInstructionPaths {
  claudeMd: string
  codexAgentsMd: string
}

/** A snapshot saved before instruction entries carried their paths held `claudeGlobalMd` and `codexAgentsMd` as
 * contents and a `codexConfigSummary`: with the paths given, they become the two entries' files and the summary
 * goes; the two agy files that version never read are not there until the live scan replaces it. Without the
 * paths the old shape is left for validation to drop. */
function upgradeSavedSnapshot(v: unknown, paths: SavedInstructionPaths | undefined): unknown {
  if (paths === undefined || !object(v) || !object(v.global)) return v
  const old = v.global
  if (!('claudeGlobalMd' in old) || !('codexAgentsMd' in old) || 'claudeMd' in old || 'agentsMd' in old) return v
  const global: Record<string, unknown> = {
    ...old,
    claudeMd: pathed(paths.claudeMd, old.claudeGlobalMd),
    agentsMd: old.codexAgentsMd === null ? [] : [pathed(paths.codexAgentsMd, old.codexAgentsMd)]
  }
  delete global.claudeGlobalMd
  delete global.codexAgentsMd
  delete global.codexConfigSummary
  return { ...v, global }
}

/** A read saved before the project's document list went: a memory file's or a document's, under one kind */
const savedBeforeDocumentsWent = (v: unknown): v is { kind: 'artifactContent'; file: string; data: CappedText } =>
  object(v) && v.kind === 'artifactContent' && path(v.file) && capped(v.data)

/** The files the restored snapshot and project pages list as memory files, and those the scan's registration held
 * before the document list went: it only ever held the snapshot's memory files, so they stay listed when the snapshot
 * is dropped. A path registered or read before the document list went is a memory file's only when listed here:
 * anything else, a document included, is not kept (ADR-0051). */
function listedMemoryFiles(snapshot: Snapshot | null, reads: SavedRead[], registrations: unknown): Set<string> {
  const files = new Set(snapshot?.global.memory.flatMap(m => m.files.map(f => f.file)) ?? [])
  for (const r of reads) if (r.kind === 'projectDetail') {
    for (const t of r.data.memory.topics) files.add(t.file)
    if (r.data.memory.mainFile !== null) files.add(r.data.memory.mainFile.file)
  }
  if (Array.isArray(registrations)) for (const r of registrations)
    if (object(r) && r.owner === 'scan' && strings(r.artifacts)) for (const f of r.artifacts) files.add(f)
  return files
}

/** A saved registration, rebuilt with exactly the current keys. One saved before the document list went holds the
 * memory files and the documents it admitted under `artifacts`, and keeps the listed memory files among them. */
function savedRegistration(r: unknown, memory: Set<string>): RegistrationScope[] {
  if (!object(r) || !path(r.owner) || !strings(r.skillFiles) || !strings(r.projects) || !strings(r.pluginRoots)) return []
  const memoryFiles = 'memoryFiles' in r ? r.memoryFiles : strings(r.artifacts) ? r.artifacts.filter(f => memory.has(f)) : null
  if (!strings(memoryFiles)) return []
  return [{ owner: r.owner, memoryFiles, skillFiles: r.skillFiles, projects: r.projects, pluginRoots: r.pluginRoots }]
}

/** Independent entries degrade independently; corrupt envelope metadata is handled by the store. `paths` is the
 * main process's, for restoring a snapshot saved before instruction entries carried their paths. */
export function parseDisplayData(v: unknown, paths?: SavedInstructionPaths): DisplayData {
  const d = emptyDisplayData()
  if (!object(v)) return d
  // The upgrades fill in place: the payload is freshly parsed from disk or IPC, owned by this call
  const snapshot = upgradeSavedSnapshot(v.snapshot, paths)
  alignSavedSnapshotSides(snapshot)
  if (finiteNumbers(snapshot) && validateSnapshot(snapshot).ok && displaySnapshotValid(snapshot)) d.snapshot = snapshot as Snapshot
  if (Array.isArray(v.stats)) for (const p of v.stats) if (Array.isArray(p) && object(p[1])) upgradeSavedTokens(p[1].tokens)
  if (Array.isArray(v.stats)) d.stats = v.stats.filter((p): p is [string, ProjectStats] =>
    Array.isArray(p) && p.length === 2 && path(p[0]) && finiteNumbers(p[1]) && validateProjectStats(p[1]).ok && displayStatsValid(p[1]))
  if (strings(v.sessionFiles)) d.sessionFiles = v.sessionFiles
  const reads = Array.isArray(v.reads) ? v.reads.map(upgradeSavedRead) : []
  d.reads = reads.filter(validSavedRead)
  const memory = listedMemoryFiles(d.snapshot, d.reads, v.registrations)
  if (Array.isArray(v.registrations)) d.registrations = v.registrations.flatMap(r => savedRegistration(r, memory))
  for (const r of reads) if (savedBeforeDocumentsWent(r) && memory.has(r.file)) d.reads.push({ kind: 'memoryContent', file: r.file, data: r.data })
  // An answer only belongs to the saved question mapping that produced it.
  const pages = new Map(d.reads.flatMap(r => r.kind === 'sessionPage' ? [[r.file, r.data] as const] : []))
  d.reads = d.reads.filter(r => r.kind !== 'turnContent' ||
    (pages.get(r.file)?.questions[r.i]?.revision === r.revision && r.i < (pages.get(r.file)?.questions.length ?? 0)))
  return d
}

/** The key a turn's saved read is held under, for a turn known before its content is */
export function savedTurnKey(file: string, revision: string, i: number): string {
  return JSON.stringify(['turnContent', file, revision, i])
}
export function savedReadKey(r: SavedRead): string {
  switch (r.kind) {
    case 'projectDetail': return JSON.stringify([r.kind, r.path])
    case 'sessionPage': case 'memoryContent': case 'skillContent': return JSON.stringify([r.kind, r.file])
    case 'turnContent': return savedTurnKey(r.file, r.revision, r.i)
    case 'skillFiles': return JSON.stringify([r.kind, r.args.side, r.args.name, r.args.scope, r.args.projectPath ?? null, r.args.pluginRoot ?? null])
  }
}
