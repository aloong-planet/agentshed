// The parity command's core (`pnpm engine:parity`; ADR-0045). Each change that moves a side's parsing into the engine
// module proves it here first: the session files are parsed by the TypeScript parser and by the module, and the two
// results compared file by file, field by field. The files are the scan's own: the token engine plans the scan over an
// empty cache, so every file gets the job, inputs included, that a cold scan gives it, and the comparison runs in the
// place of the parse. The application never imports this.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mergeKey } from '@shared/path-key'
import type { EngineModule, EngineSource } from './engine-module'
import { CodexHeads, readCodexSessionMeta } from './providers/codex'
import { readGrokSessionMeta } from './providers/grok'
import { scan, walkSessions, type SessionWalk } from './providers/scan'
import { byName } from './providers/scan-order'
import { TokenEngine, type ParseJob, type ParseResult } from './providers/token-stats'
import type { ScanRoots } from './providers/types'

export type ParseSide = ParseJob['kind']
export type Parse = (job: ParseJob) => Promise<ParseResult>

/**
 * How the module parses each side both parsers parse, the sides the command compares. A side's entry comes with the
 * change that moves its parsing into the module and goes with the change that removes its TypeScript parser, after
 * which the module is the only parser of that side; the command refuses to compare a side without one.
 */
export const MODULE_PARSES: Partial<Record<ParseSide, (module: EngineModule, job: ParseJob) => Promise<ParseResult>>> = {}

export interface ParityReport {
  /** The files both parsers parsed, in the order the scan met them */
  compared: string[]
  /** Where each differing file's two results first part, as a path into the result */
  differing: Array<{ file: string; at: string }>
  /** A parse that threw, and its message: the TypeScript parser's or the module's */
  failed: Array<{ file: string; message: string }>
  /** Files asked for by path that the scan never met */
  missing: string[]
}

const isPlain = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Where two results first differ, as a path into them (`agg.calls[3].input`), or null when they are equal. Numbers and
 * strings are compared exactly (`Object.is`), arrays element by element, and plain objects by their keys, a key holding
 * undefined counting as absent, as it does once the result is stored. A value of any other kind is reported as a
 * difference rather than compared loosely: what is not compared is not proven equal.
 */
export function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  if (Object.is(a, b)) return null
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path || '(the result)'
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return path || '(the result)'
    if (a.length !== b.length) return `${path}.length`
    for (let i = 0; i < a.length; i++) {
      const at = firstDifference(a[i], b[i], `${path}[${i}]`)
      if (at !== null) return at
    }
    return null
  }
  if (!isPlain(a) || !isPlain(b)) return `${path || '(the result)'} (not plain data)`
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((k) => left[k] !== undefined || right[k] !== undefined).sort()
  for (const key of keys) {
    const at = firstDifference(left[key], right[key], path ? `${path}.${key}` : key)
    if (at !== null) return at
  }
  return null
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Compares the two parsers over the scan of `roots`: every file of `sides`, and every file in `files`, whichever side.
 * `cacheDir` is an empty directory the planning may open its token store in; nothing else is written.
 */
export async function runParity(o: {
  roots: ScanRoots
  sides: ParseSide[]
  files: string[]
  typescript: Parse
  module: Parse
  cacheDir: string
  /** The engine module whose token store the planning opens in `cacheDir` */
  engine: EngineSource
  concurrency?: number
}): Promise<ParityReport> {
  const report: ParityReport = { compared: [], differing: [], failed: [], missing: [] }
  const asked = new Set(o.files)
  const met = new Set<string>()
  const select = (job: ParseJob): boolean => o.sides.includes(job.kind) || asked.has(job.file)
  const engine = new TokenEngine(o.cacheDir, o.engine, {
    concurrency: o.concurrency ?? 1,
    run: async (job) => {
      if (!select(job)) return null
      met.add(job.file)
      let typescript: ParseResult
      let module: ParseResult
      try {
        typescript = await o.typescript(job)
      } catch (error) {
        report.failed.push({ file: job.file, message: `the TypeScript parser: ${messageOf(error)}` })
        return null
      }
      try {
        module = await o.module(job)
      } catch (error) {
        report.failed.push({ file: job.file, message: `the engine module: ${messageOf(error)}` })
        return typescript
      }
      report.compared.push(job.file)
      const at = firstDifference(typescript, module)
      if (at !== null) report.differing.push({ file: job.file, at })
      return typescript
    }
  })
  // The scan's own inputs to the build: the walk, and the projects that credit Claude sessions and admit reads
  const walked = walkSessions(o.roots)
  const snapshot = await scan(o.roots, { now: () => Date.now(), sessions: walked })
  const claudePaths = snapshot.projects.filter((p) => p.sides.includes('claude')).map((p) => p.path)
  await engine.build(o.roots, claudePaths, new Set(snapshot.projects.map((p) => mergeKey(p.path))), walked)
  report.missing = o.files.filter((file) => !met.has(file))
  return report
}

/** 0 when at least one file was compared and every file asked for was compared equal; 1 otherwise */
export function parityExitCode(report: ParityReport): number {
  const clean = report.differing.length === 0 && report.failed.length === 0 && report.missing.length === 0
  return clean && report.compared.length > 0 ? 0 : 1
}

// ── The session walk's parity (#431; removed with the TypeScript walk) ──

/** One implementation of the session walk and the single-file reads that share its source, as `--walk` compares them */
export interface WalkReader {
  /** A walk with no memory behind it */
  walk: (roots: ScanRoots) => SessionWalk
  /** A walk that holds one fresh memory across its calls */
  remembering: () => (roots: ScanRoots) => SessionWalk
  /** The session page's single-file read of a Codex rollout or a Grok update stream */
  meta: (kind: 'codex' | 'grok', file: string) => unknown
}

/** The TypeScript walk (src/main/providers/scan.ts) */
export const TYPESCRIPT_WALK: WalkReader = {
  walk: (roots) => walkSessions(roots),
  remembering: () => {
    const heads = new CodexHeads()
    return (roots) => walkSessions(roots, heads)
  },
  meta: (kind, file) => (kind === 'codex' ? readCodexSessionMeta(file) : readGrokSessionMeta(file))
}

/** The engine module's walk */
export function moduleWalk(module: EngineModule): WalkReader {
  return {
    walk: (roots) => module.walkSessions(roots),
    remembering: () => {
      const memory = new module.SessionMemory()
      return (roots) => module.walkSessions(roots, memory)
    },
    meta: (kind, file) => (kind === 'codex' ? module.sessionMeta('codex', file) : module.sessionMeta('grok', file))
  }
}

export interface WalkParityReport {
  /** Each comparison, and how many entries it held */
  compared: Array<{ what: string; entries: number }>
  /** A comparison whose two results part, where they part from the TypeScript reading made before the module's and from
   * the one made after it */
  differing: Array<{ what: string; before: string; after: string }>
  /** Comparisons equal only to the TypeScript reading made after the module's: what they read changed in between */
  moved: string[]
  /** A reading that threw, and its message */
  failed: Array<{ what: string; message: string }>
}

/** Every rollout name under Codex's two trees, whether or not its first line gives a session, depth-first in scan
 * order */
function rolloutFiles(codexHome: string): string[] {
  const out: string[] = []
  const visit = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort(byName)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) visit(p)
      else if (e.name.endsWith('.jsonl') || e.name.endsWith('.jsonl.zst')) out.push(p)
    }
  }
  for (const tree of ['sessions', 'archived_sessions']) visit(join(codexHome, tree))
  return out
}

/** Every Grok update stream there is, under a directory whose name decodes or not */
function grokStreams(grokHome: string): string[] {
  const out: string[] = []
  const root = join(grokHome, 'sessions')
  const dirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true }).sort(byName).filter((e) => e.isDirectory()).map((e) => join(dir, e.name))
    } catch {
      return []
    }
  }
  for (const cwdDir of dirs(root)) {
    for (const sessionDir of dirs(cwdDir)) {
      const stream = join(sessionDir, 'updates.jsonl')
      if (existsSync(stream)) out.push(stream)
    }
  }
  return out
}

/**
 * Compares the module's session walk with the TypeScript one over `roots`: each side's list, in order, from a walk with
 * no memory and from the second walk through one memory; and the single-file read of every Codex rollout and every Grok
 * update stream there is. Each module reading is compared with a TypeScript reading made before it and one made after,
 * so a file an agent wrote in between shows as moved, not as a difference.
 */
export function runWalkParity(roots: ScanRoots, typescript: WalkReader, module: WalkReader): WalkParityReport {
  const report: WalkParityReport = { compared: [], differing: [], moved: [], failed: [] }
  const compare = (what: string, read: (reader: WalkReader) => unknown, entries: (value: unknown) => number): void => {
    let before: unknown
    let got: unknown
    let after: unknown
    try {
      before = read(typescript)
      got = read(module)
      after = read(typescript)
    } catch (error) {
      report.failed.push({ what, message: messageOf(error) })
      return
    }
    report.compared.push({ what, entries: entries(got) })
    const atBefore = firstDifference(before, got)
    if (atBefore === null) return
    const atAfter = firstDifference(after, got)
    if (atAfter === null) report.moved.push(what)
    else report.differing.push({ what, before: atBefore, after: atAfter })
  }
  const sides = ['codex', 'grok', 'antigravity'] as const
  const listLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0)
  for (const side of sides) compare(`walk ${side}`, (reader) => reader.walk(roots)[side], listLength)
  const walks = new Map<WalkReader, (roots: ScanRoots) => SessionWalk>()
  for (const reader of [typescript, module]) {
    const walk = reader.remembering()
    walk(roots)
    walks.set(reader, walk)
  }
  for (const side of sides) compare(`remembered walk ${side}`, (reader) => walks.get(reader)!(roots)[side], listLength)
  const one = (): number => 1
  for (const file of rolloutFiles(roots.codexHome)) compare(`codex meta ${file}`, (reader) => reader.meta('codex', file), one)
  for (const file of grokStreams(roots.grokHome)) compare(`grok meta ${file}`, (reader) => reader.meta('grok', file), one)
  return report
}

/** 0 when something was compared and nothing differed or failed; 1 otherwise */
export function walkParityExitCode(report: WalkParityReport): number {
  return report.compared.length > 0 && report.differing.length === 0 && report.failed.length === 0 ? 0 : 1
}
