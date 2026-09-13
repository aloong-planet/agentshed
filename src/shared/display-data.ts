import { displaySnapshotValid, displayDetailValid, displayStatsValid } from './display-shape'
// Successful presentation payloads only (ADR-0029). No renderer-to-disk write channel.
import type { CappedText, ProjectDetail, ProjectStats, SessionPage, SessionTurn, Snapshot } from './domain'
import type { ListSkillFilesArgs, ListSkillFilesResult } from './ipc'
import { validateProjectDetail, validateProjectStats, validateSessionPage, validateSessionTurn, validateSnapshot } from './validate'

export type SavedRead =
  | { kind: 'projectDetail'; path: string; data: ProjectDetail }
  | { kind: 'sessionPage'; file: string; data: SessionPage }
  | { kind: 'turnContent'; file: string; i: number; revision: string; ms: number; data: SessionTurn }
  | { kind: 'artifactContent' | 'skillContent'; file: string; data: CappedText }
  | { kind: 'skillFiles'; args: ListSkillFilesArgs; data: ListSkillFilesResult }

export interface ReadRegistrations {
  artifacts: string[]
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
      path(v.revision) && number(v.ms) && validateSessionTurn(v.data).ok
    case 'artifactContent': case 'skillContent': return path(v.file) && capped(v.data)
    case 'skillFiles': {
      const a = v.args, d = v.data
      return object(a) && ['claude', 'codex', 'grok'].includes(String(a.side)) && path(a.name) &&
        (a.scope === 'global' || (a.scope === 'project' && path(a.projectPath)) || (a.scope === 'plugin' && path(a.pluginRoot))) &&
        object(d) && typeof d.deep === 'boolean' && strings(d.deepPaths) && Array.isArray(d.files) &&
        d.files.every(f => object(f) && path(f.path) && path(f.absPath) && number(f.bytes) && number(f.lines) && number(f.mtimeMs))
    }
    default: return false
  }
}

/** Independent entries degrade independently; corrupt envelope metadata is handled by the store. */
export function parseDisplayData(v: unknown): DisplayData {
  const d = emptyDisplayData()
  if (!object(v)) return d
  if (finiteNumbers(v.snapshot) && validateSnapshot(v.snapshot).ok && displaySnapshotValid(v.snapshot)) d.snapshot = v.snapshot as Snapshot
  if (Array.isArray(v.stats)) d.stats = v.stats.filter((p): p is [string, ProjectStats] =>
    Array.isArray(p) && p.length === 2 && path(p[0]) && finiteNumbers(p[1]) && validateProjectStats(p[1]).ok && displayStatsValid(p[1]))
  if (strings(v.sessionFiles)) d.sessionFiles = v.sessionFiles
  if (Array.isArray(v.registrations)) d.registrations = v.registrations.filter((r): r is RegistrationScope =>
    object(r) && path(r.owner) && ['artifacts', 'skillFiles', 'projects', 'pluginRoots'].every(k => strings(r[k])))
  if (Array.isArray(v.reads)) d.reads = v.reads.filter(validSavedRead)
  // An answer only belongs to the saved question mapping that produced it.
  const pages = new Map(d.reads.flatMap(r => r.kind === 'sessionPage' ? [[r.file, r.data] as const] : []))
  d.reads = d.reads.filter(r => r.kind !== 'turnContent' ||
    (pages.get(r.file)?.questions[r.i]?.revision === r.revision && r.i < (pages.get(r.file)?.questions.length ?? 0)))
  return d
}

export function savedReadKey(r: SavedRead): string {
  switch (r.kind) {
    case 'projectDetail': return JSON.stringify([r.kind, r.path])
    case 'sessionPage': case 'artifactContent': case 'skillContent': return JSON.stringify([r.kind, r.file])
    case 'turnContent': return JSON.stringify([r.kind, r.file, r.revision, r.i])
    case 'skillFiles': return JSON.stringify([r.kind, r.args.side, r.args.name, r.args.scope, r.args.projectPath ?? null, r.args.pluginRoot ?? null])
  }
}
