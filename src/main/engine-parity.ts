// The parity command's core (`pnpm engine:parity`; ADR-0045). Each change that moves a side's parsing into the engine
// module proves it here first: the session files are parsed by the TypeScript parser and by the module, and the two
// results compared file by file, field by field. The files are the scan's own: the token engine plans the scan over an
// empty cache, so every file gets the job, inputs included, that a cold scan gives it, and the comparison runs in the
// place of the parse. The application never imports this.
import { mergeKey } from '@shared/path-key'
import type { EngineModule } from './engine-module'
import { scan, walkSessions } from './providers/scan'
import { TokenEngine, type ParseJob, type ParseResult } from './providers/token-stats'
import type { ScanRoots } from './providers/types'

export type ParseSide = ParseJob['kind']
export type Parse = (job: ParseJob) => Promise<ParseResult>

/**
 * How the module parses each side it parses. A side's entry comes with the change that moves its parsing into the
 * module; a side without one is parsed by TypeScript alone, and the command refuses to compare it.
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
 * `cacheDir` is an empty directory the planning may write its cache to; nothing else is written.
 */
export async function runParity(o: {
  roots: ScanRoots
  sides: ParseSide[]
  files: string[]
  typescript: Parse
  module: Parse
  cacheDir: string
  concurrency?: number
}): Promise<ParityReport> {
  const report: ParityReport = { compared: [], differing: [], failed: [], missing: [] }
  const asked = new Set(o.files)
  const met = new Set<string>()
  const select = (job: ParseJob): boolean => o.sides.includes(job.kind) || asked.has(job.file)
  const engine = new TokenEngine(o.cacheDir, {
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
