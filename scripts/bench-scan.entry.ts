// The body of the startup-scan benchmark. scripts/bench-scan.mjs bundles this file with esbuild and
// runs the bundle under the Electron binary (the main process) or, with --node, under plain Node —
// the same code in both, so the only variable is the runtime. Why that matters is the AGENTS.md
// invariant on main-process measurements.
//
// Modes (the first argument):
//   cold          a full scan into an empty cache directory — what a first launch or a
//                 CACHE_VERSION bump costs
//   warm          a full scan against a copy of the app's own token store — what a routine launch costs
//                 (Electron only: the copy is taken from app.getPath('userData')). An app that still has
//                 only its JSON cache gives a copy of that instead, which the build imports first
//                 (token-stats C26): what the first launch after the upgrade costs
//   file <path>…  the engine module's line reader, the one every parse reads a session file by
//                 (engine/src/read/), over the given files, one at a time, through its test seam
//   grow <rollout> a Codex rollout copied into a scratch home, scanned whole, then grown by about 1 MB
//                 of its own last lines and scanned again — the rescan a live session costs (#158). The
//                 grown scan is checked against a cold scan of the same file.
//   workers       a cold scan parsed on the main thread, then one parsed on the parse pool (#159): the
//                 time of each, the main thread's longest event-loop stall during each (how long an IPC
//                 call could wait), and whether the two token stores agree entry by entry: an entry the two
//                 hold under one signature with different contents, or that only one of them holds, fails
//                 the run; one whose signature differs is a file that changed between the two builds,
//                 counted apart (scripts/lib/bench-store-compare.mjs).
//                 `workers --pool-only` runs the pool's scan alone, for a peak-memory figure that is
//                 not stacked on the main-thread run's.
//   rescan        two scans in one process against a copy of the app's cache, as the app runs them: on
//                 the scan worker, with the archive merge on the main process (Electron only). What a
//                 scan costs once the run's first is behind it, and what token-stats::QR-001 is judged
//                 by: for the second scan, the main process's longest event-loop stall, whether the
//                 token store was written, and where the scan ran — the scan worker, or the main
//                 process when the worker failed. A file an agent writes between the two scans is
//                 parsed, and the store is then written.
//                 `rescan --main` runs both scans on the main process instead, by the scanner the app
//                 falls back to once its scan worker has failed, and counts the files parsed.
//                 `rescan --grow` appends to the newest Claude session file its own last line between
//                 the two scans, so the second has a file to parse and a store to write. It writes to
//                 the scanned home, so it runs only when AGENTSHED_HOME_OVERRIDE points at a copy of
//                 one, and starts from an empty store: the app's store knows none of the copy's paths.
//   page <rollout> the read the session page makes as it opens a Codex rollout (getSessionPage in
//                 src/main/index.ts): every question's range in one call, each question's text then taken by
//                 the engine module's line rule. The question index comes first, from the engine module's
//                 parse, outside the measurement, as a scan has it ready before the page asks. What the read
//                 took, the bytes it went through, and the main process's longest event-loop stall during it
//                 (session-view C2: a cold rollout's read must not hold the main process).
//   search-index  a scan of the home through the scan worker, as the app's own scan runs, into a fresh cache
//                 directory, which then holds beside the token store each project's sessions as the app keeps them
//                 to search by. Prints the directory, the projects by the bytes a full-text search reads of their
//                 sessions (a cold rollout's decompressed stream, its size taken from its zstd frame headers, and an
//                 Antigravity conversation's transcript) with their bytes on disk beside them, and the project holding
//                 the cold rollout with the largest stream.
//   search <index dir> <project path> <needle> [--full-text]
//                 one project's session search through the app's own search code, in question mode or, with
//                 --full-text, full-text mode, over the sessions a search-index run kept, the question indexes read
//                 through the scan worker as the app reads them (#469). In a process of its own, so that the peak is
//                 the search's and not a scan's, and in the state the app searches in: each session's question index
//                 asked for once before the measurement, which loads what the app's scans and earlier reads have long
//                 loaded, and reads no session file's contents unless it changed since the index. It reports what it
//                 found, its wall time, the main process's longest event-loop
//                 stall during it, and the main process's footprint before it and at its peak, worker threads
//                 included, read with macOS `footprint` as token-stats::QR-004 reads memory (macOS only).
//   turn-index <side> <dir>
//                 the turns of a side (claude, codex or grok) the turn mode measures: every session of the side under
//                 the home, walked and indexed by the engine module's parse as a scan indexes it, and of their turns the
//                 three of plain files whose bodies are the largest within the turn limit, and the largest of a cold
//                 rollout when there is one; and a session of the side written into <dir>, one question and a body of
//                 tool calls and their results a little under the limit. Prints each as the turn mode's arguments.
//   turn <side> <file> <question start> <question end> <turn end>
//                 the turn fetch the session page makes as it expands a turn of the side (getSessionTurn in
//                 src/main/index.ts), from the turn's question index record as turn-index printed it: the turn read,
//                 its blocks, and their contract check, the question index's lookup and the display copy aside. In a
//                 process of its own, so that the peak is the fetch's: one JSON line with the time to the blocks and
//                 the main process's footprint before the fetch and at its peak, read as the search mode reads it
//                 (macOS only).
//
// A check that fails, and a mode that throws, exit the run non-zero, under Electron as under Node.
//
// Nothing here writes to the app's userData: every cache lands in a fresh temporary directory.
// AGENTSHED_HOME_OVERRIDE is honoured the way the app honours it (see src/main/roots.ts).
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from '../src/main/providers/sqlite'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { availableParallelism } from 'node:os'
import { scan, type SessionWalk } from '../src/main/providers/scan'
import { TokenEngine, runParseJob, sessionReadSource, type ParseRunner } from '../src/main/providers/token-stats'
import { questionRevision, readSessionRanges, readSessionTurn, sourceIdentity } from '../src/main/source-identity'
import { readTurnRanges, turnLimitBytes } from '../src/main/turn-limit'
import { turnKeepBytes, turnKept } from '../src/main/turn-keep'
import { bodyBlocks } from '../src/main/providers/turn-content'
import { assertSessionTurn } from '../src/shared/validate'
import { ParsePool } from '../src/main/parse-pool'
import { ENGINE_BUILD, loadEngineModule, threadEngineModule, type EngineModule, type EngineSource } from '../src/main/engine-module'
import { Scanner, settleScan, tokenBuildInputs, type ScanOutput } from '../src/main/providers/scanner'
import { startScans } from '../src/main/scan-client'
import { UsageArchive } from '../src/main/providers/archive'
import type { ScanRoots } from '../src/main/providers/types'
import { isColdRollout } from '../src/main/providers/cold-rollout'
import { searchProjectSessions } from '../src/main/providers/search-sessions'
import type { QuestionRec } from '../src/main/providers/question-index'
import { realRoots } from '../src/main/roots'
import { compareStores, type StoreRow } from './lib/bench-store-compare.mjs'
import type { SearchResult, SessionMeta, SessionTurn } from '../src/shared/domain'
import { mergeKey } from '../src/shared/path-key'

const isElectron = typeof process.versions['electron'] === 'string'

function since(t0: number): string {
  return `${(performance.now() - t0).toFixed(0)} ms`
}

/** The line-reader seam the development build of the engine module exports (engine/src/seams.rs): the lines a file
 * gives the reader, a cold rollout read through its zstd stream */
interface LineReaderSeam extends EngineModule {
  seamEachLine(file: string, cold: boolean): number
}

function timeFile(file: string): void {
  const size = statSync(file).size
  const t0 = performance.now()
  const lines = (threadEngineModule() as LineReaderSeam).seamEachLine(file, isColdRollout(file))
  const seconds = (performance.now() - t0) / 1000
  console.log(
    `[file] ${(size / 1e6).toFixed(1)} MB, ${lines} lines, ${(seconds * 1000).toFixed(0)} ms, ${(size / 1e6 / seconds).toFixed(1)} MB/s  ${file}`
  )
}

/**
 * The app's userData directory, where the live cache lives; only an Electron process can resolve it.
 * A bare script under the Electron binary is the "Electron" app, so its own userData is that app's
 * directory, and app.setName does not move it (measured: the copy came from the wrong place and
 * "warm" was a cold run wearing the wrong label). So the directory is built from appData and the
 * app name the runner passes in — package.json's name, which on this case-insensitive filesystem is
 * also the packaged app's directory.
 */
async function userDataDir(): Promise<string | null> {
  if (!isElectron) return null
  const { app } = (await import('electron')) as typeof import('electron')
  const name = process.env['AGENTSHED_BENCH_APP_NAME']
  if (!name) throw new Error('AGENTSHED_BENCH_APP_NAME is not set: run through scripts/bench-scan.mjs')
  return join(app.getPath('appData'), name)
}

/** The token store's file in a settings directory (engine/src/store/) */
const STORE_FILE = 'token-store.sqlite'

/**
 * A fresh cache directory holding a copy of the app's token store and archive. The store is copied through SQLite, so
 * the copy holds what the app's log does too, whole even while the app writes. An app that has only its JSON cache
 * yet has that copied instead, and the first build imports it (token-stats C26).
 */
async function warmCacheDir(mode: string): Promise<string> {
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
  const from = await userDataDir()
  if (from === null) throw new Error(`${mode} needs the app cache, which only the Electron run can locate: drop --node`)
  const store = join(from, STORE_FILE)
  const json = join(from, 'token-cache.json')
  if (existsSync(store)) {
    const db = new DatabaseSync(store, { readOnly: true })
    try {
      db.exec(`VACUUM INTO '${join(cacheDir, STORE_FILE).replace(/'/g, "''")}'`)
    } finally {
      db.close()
    }
    console.log(`[${mode}] ${STORE_FILE} ${(statSync(join(cacheDir, STORE_FILE)).size / 1e6).toFixed(1)} MB copied from ${from}`)
  } else if (existsSync(json)) {
    copyFileSync(json, join(cacheDir, 'token-cache.json'))
    console.log(`[${mode}] token-cache.json ${(statSync(json).size / 1e6).toFixed(1)} MB copied from ${from}, imported by the first build`)
  } else {
    // No cache is not a warm run at all; saying so beats reporting a cold run under the wrong label
    throw new Error(`${mode} needs the app cache and none exists in ${from}: launch the app once first`)
  }
  const archive = join(from, 'usage-archive.json')
  if (existsSync(archive)) copyFileSync(archive, join(cacheDir, 'usage-archive.json'))
  return cacheDir
}

async function fullScan(mode: 'cold' | 'warm'): Promise<void> {
  const cacheDir = mode === 'warm' ? await warmCacheDir(mode) : mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
  console.log(`[mode] ${mode}, cache dir ${cacheDir}`)
  const roots = realRoots()

  // The app's order: one walk of every side's session list, shared by scan() and build()
  let t0 = performance.now()
  const sessions = walkSessions(roots)
  console.log(`[walkSessions] claude=${sessions.claude.length}, codex=${sessions.codex.length}, grok=${sessions.grok.length}, antigravity=${sessions.antigravity.length}: ${since(t0)}`)

  t0 = performance.now()
  const snap = await scan(roots, { now: () => Date.now(), sessions })
  console.log(`[scan()] registries, activity, global layer, memory: ${since(t0)} (projects=${snap.projects.length})`)

  const engine = new TokenEngine(cacheDir, engineSource())
  // A page's freshness check opens the store before it reads it, so this times the open alone: with a JSON cache in
  // the directory, the one import of the first launch after the upgrade (token-stats C26)
  t0 = performance.now()
  engine.isFresh(join(cacheDir, 'no-session'))
  console.log(`[TokenEngine] store open, and import of any JSON cache: ${since(t0)}`)

  // The stamp only matters for the archive's conflict rule, which a benchmark never exercises twice
  const archive = new UsageArchive(cacheDir, { stamp: 'bench' })
  // As the app's scan passes them
  const { claudeProjectPaths, registeredKeys } = tokenBuildInputs(snap)
  t0 = performance.now()
  const built = await engine.build(roots, claudeProjectPaths, registeredKeys, sessions)
  console.log(
    `[TokenEngine.build] store reads, parses, combine, store writes: ${since(t0)} (rows=${built.rows.length}, sessionFiles=${built.sessionFiles.size})`
  )

  t0 = performance.now()
  archive.merge(built.rows, Date.now())
  console.log(`[archive.merge] ${since(t0)}`)
}

/** The complete lines in the last `bytes` of a file */
function lastLines(file: string, bytes: number): Buffer {
  const size = statSync(file).size
  const take = Math.min(bytes, size)
  const buf = Buffer.alloc(take)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buf, 0, take, size - take)
  } finally {
    closeSync(fd)
  }
  const from = buf.indexOf(0x0a) + 1
  return buf.subarray(from)
}

async function growScan(source: string): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-bench-home-'))
  try {
    const dir = join(home, '.codex', 'sessions', '2026', '01', '01')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, basename(source))
    copyFileSync(source, file)
    process.env['AGENTSHED_HOME_OVERRIDE'] = home
    const roots = realRoots()
    const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
    const build = (dirName: string): ReturnType<TokenEngine['build']> =>
      new TokenEngine(dirName, engineSource()).build(roots, [], undefined, walkSessions(roots))
    let t0 = performance.now()
    await build(cacheDir)
    console.log(`[grow] whole parse of ${(statSync(file).size / 1e6).toFixed(0)} MB: ${since(t0)}`)
    const tail = lastLines(source, 1024 * 1024)
    appendFileSync(file, tail)
    t0 = performance.now()
    const grown = await build(cacheDir)
    console.log(`[grow] rescan after appending ${(tail.length / 1e6).toFixed(2)} MB: ${since(t0)}`)
    t0 = performance.now()
    const cold = await build(mkdtempSync(join(tmpdir(), 'agentshed-bench-')))
    console.log(`[grow] cold parse of the grown file: ${since(t0)}`)
    const same = JSON.stringify([grown.global, grown.rows]) === JSON.stringify([cold.global, cold.rows])
    console.log(`[grow] grown result equals the cold result: ${same ? 'yes' : 'NO'}`)
    if (!same) process.exitCode = 1
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/**
 * The longest stretch the thread stayed busy while `work` ran, in ms. The monitor records the time between
 * two of its own ticks, so one tick is let through before the work and one after it: a stretch that
 * starts before the first tick, or ends with the work, is otherwise not recorded at all (measured: 11 ms
 * reported for a scan that held the thread 1.3 s). An idle tick records its own interval, about 10 ms.
 */
async function longestStall(work: () => Promise<void>): Promise<{ max: string; p99: string }> {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 50))
  const lag = monitorEventLoopDelay({ resolution: 10 })
  lag.enable()
  await tick()
  await work()
  await tick()
  lag.disable()
  return { max: (lag.max / 1e6).toFixed(0), p99: (lag.percentile(99) / 1e6).toFixed(0) }
}

async function pageRead(file: string): Promise<void> {
  const engine = threadEngineModule()
  const meta = engine.sessionMeta('codex', file)
  if (meta === null) throw new Error(`${file} gives no Codex session`)
  let t0 = performance.now()
  const parsed = await runParseJob({ kind: 'codex', file, projectKey: '', meta, threadName: undefined })
  if (parsed === null || parsed.agg.kind !== 'codex') throw new Error(`${file} could not be parsed`)
  const questions = parsed.agg.questions
  console.log(`[page] ${(statSync(file).size / 1e6).toFixed(1)} MB on disk, ${questions.length} questions indexed in ${since(t0)}  ${file}`)
  let took = ''
  let bytes = 0
  let unread = 0
  // The process's resident memory, sampled while the read runs: one that grew with the bytes gone through, rather than
  // with those in flight, would show here as gigabytes
  const before = process.memoryUsage.rss()
  let peak = before
  const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage.rss())), 10)
  const stall = await longestStall(async () => {
    t0 = performance.now()
    const { texts, bytesRead } = await readSessionRanges(file, questions.map((r) => ({ start: r[0], end: r[1] })))
    unread = texts.filter((t) => engine.questionText('codex', t) === null).length
    bytes = bytesRead
    took = since(t0)
  })
  clearInterval(sampler)
  console.log(
    `[page] read ${took}, through ${(bytes / 1e6).toFixed(1)} MB, ${unread} questions unreadable; main-process event-loop stall max ${stall.max} ms, p99 ${stall.p99} ms; resident memory ${(before / 1e6).toFixed(0)} MB before, ${(peak / 1e6).toFixed(0)} MB at most during the read`
  )
}

/** The session walk, by the engine module, with no memory behind it */
function walkSessions(roots: ScanRoots): SessionWalk {
  return loadEngineModule(engineSource()).walkSessions(roots)
}

/** The engine module (ADR-0045) every scanner and parse worker here loads: the development build the runner made */
function engineSource(): EngineSource {
  const path = process.env['AGENTSHED_BENCH_ENGINE_MODULE']
  if (!path) throw new Error('AGENTSHED_BENCH_ENGINE_MODULE is not set: run through scripts/bench-scan.mjs')
  return { path, build: ENGINE_BUILD }
}

/** The app's pool size, or AGENTSHED_BENCH_POOL_SIZE to measure another */
function poolSize(): number {
  const forced = Number(process.env['AGENTSHED_BENCH_POOL_SIZE'])
  return Number.isInteger(forced) && forced > 0 ? forced : Math.min(4, Math.max(1, availableParallelism() - 1))
}

async function workersScan(): Promise<void> {
  const script = process.env['AGENTSHED_BENCH_PARSE_WORKER']
  if (!script) throw new Error('AGENTSHED_BENCH_PARSE_WORKER is not set: run through scripts/bench-scan.mjs')
  const roots = realRoots()
  const sessions = walkSessions(roots)
  const snap = await scan(roots, { now: () => Date.now(), sessions })
  const { claudeProjectPaths, registeredKeys } = tokenBuildInputs(snap)
  const run = async (label: string, runner?: ParseRunner): Promise<string> => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
    let took = ''
    const stall = await longestStall(async () => {
      const t0 = performance.now()
      await new TokenEngine(cacheDir, engineSource(), runner).build(roots, claudeProjectPaths, registeredKeys, sessions)
      took = since(t0)
    })
    console.log(`[workers] ${label}: ${took}; main-thread event-loop stall max ${stall.max} ms, p99 ${stall.p99} ms`)
    return cacheDir
  }
  if (process.argv.includes('--pool-only')) {
    const pool = new ParsePool(script, poolSize(), engineSource())
    await run(`parse pool of ${pool.concurrency}`, pool)
    pool.close()
    return
  }
  const inlineDir = await run('main thread')
  const pool = new ParsePool(script, poolSize(), engineSource())
  const poolDir = await run(`parse pool of ${pool.concurrency}`, pool)
  pool.close()
  const verdict = compareStores(storeRows(inlineDir), storeRows(poolDir))
  console.log(
    `[workers] store entries: ${verdict.entries}; disagreeing, under one signature: ${verdict.disagreeing.length}; in one store only: ${verdict.onlyInMainThread.length + verdict.onlyInPool.length}`
  )
  for (const path of verdict.onlyInMainThread) console.log(`[workers] only in the main thread's store: ${path}`)
  for (const path of verdict.onlyInPool) console.log(`[workers] only in the parse pool's store: ${path}`)
  console.log(`[workers] files changed between the two builds, not a disagreement: ${verdict.changed.length}`)
  if (verdict.fails) process.exitCode = 1
}

/**
 * Every entry of a token store: its path, signature, aggregate and resume point. Read from a copy of the store's file:
 * the engine that wrote it is in this process and has it open, and a second SQLite here would take its locks away
 * (engine/src/store/mod.rs). Each write the engine makes ends with a checkpoint into that file, so with no other process
 * reading the store the copy holds every write that landed.
 */
function storeRows(cacheDir: string): StoreRow[] {
  const copy = join(mkdtempSync(join(tmpdir(), 'agentshed-bench-store-')), STORE_FILE)
  copyFileSync(join(cacheDir, STORE_FILE), copy)
  const db = new DatabaseSync(copy, { readOnly: true })
  try {
    const rows = db.prepare('SELECT path, sig, agg, resume FROM entries').all() as Array<Record<string, unknown>>
    return rows.map((r) => ({
      path: String(r['path']),
      sig: String(r['sig']),
      agg: String(r['agg']),
      resume: typeof r['resume'] === 'string' ? r['resume'] : null
    }))
  } finally {
    db.close()
    rmSync(dirname(copy), { recursive: true, force: true })
  }
}

/**
 * Watches a token store for a write: one that lands adds to the store's log and is checkpointed into its file, and a
 * scan that writes nothing touches neither. Told by the two files' modification times and sizes, not by a connection
 * to the store, which a second SQLite in this process must not open (engine/src/store/mod.rs).
 */
function watchStore(cacheDir: string): () => boolean {
  const state = (): string =>
    ['', '-wal']
      .map((suffix) => {
        try {
          const st = statSync(join(cacheDir, STORE_FILE + suffix))
          return `${st.mtimeMs}:${st.size}`
        } catch {
          return '-'
        }
      })
      .join(' ')
  const before = state()
  return () => state() !== before
}

/** One way of running the rescan mode's scans: `once` runs a scan and reports it, `counted` adds to the last line */
interface RescanRun {
  once(label: string): Promise<void>
  counted(): string
  close(): Promise<void>
}

/** One scan by `scan` and what the main process makes of its result, as the app's own scan routine does both */
async function timedScan(label: string, scan: () => Promise<ScanOutput>, archive: UsageArchive, where: () => string): Promise<void> {
  const start = performance.now()
  const out = await scan()
  const scanned = since(start)
  const t0 = performance.now()
  settleScan(out, archive)
  console.log(`[rescan] ${label} scan: the scan ${scanned} ${where()}, archive merge and figures ${since(t0)}; total ${since(start)}`)
}

/** What the rescans' stored group results come from: one for this run, as a packaged build's second launch keeps one
 * (token-stats, Implementation Decisions, Cache), so a rescan combines only the groups its changes reach */
const COMBINATION = `bench run ${randomUUID()}`

/** The app's way: the scan on the scan worker */
function rescanThroughWorker(cacheDir: string, roots: ScanRoots, archive: UsageArchive, scanScript: string, parseScript: string): RescanRun {
  const scans = startScans({ script: scanScript, parseScript, cacheDir, poolSize: poolSize(), engine: engineSource(), combination: COMBINATION })
  const where = (): string => (scans.servedOn === 'worker' ? 'on the scan worker' : 'on the main process, the scan worker having failed')
  return { once: (label) => timedScan(label, () => scans.scan(roots), archive, where), counted: () => '', close: () => scans.close() }
}

/** The scan on the main process, by the scanner the app falls back to once its scan worker has failed, its parses counted */
function rescanOnMain(cacheDir: string, roots: ScanRoots, archive: UsageArchive, parseScript: string): RescanRun {
  const pool = new ParsePool(parseScript, poolSize(), engineSource())
  let parsed = 0
  const scanner = new Scanner(cacheDir, engineSource(), {
    concurrency: pool.concurrency,
    run: (job) => {
      parsed++
      return pool.run(job)
    },
    close: () => pool.close()
  }, COMBINATION)
  return {
    once: (label) => {
      parsed = 0
      return timedScan(label, () => scanner.scan(roots), archive, () => 'on the main process')
    },
    counted: () => `files parsed ${parsed}; `,
    close: () => {
      scanner.close()
      return Promise.resolve()
    }
  }
}

/** Appends to the most recently written Claude session file its own last line, and says so */
function growNewestClaudeSession(roots: ScanRoots): void {
  const projects = join(roots.claudeHome, 'projects')
  let newest: { file: string; mtimeMs: number } | null = null
  for (const dir of existsSync(projects) ? readdirSync(projects, { withFileTypes: true }) : []) {
    if (!dir.isDirectory()) continue
    for (const e of readdirSync(join(projects, dir.name), { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
      const file = join(projects, dir.name, e.name)
      const { mtimeMs } = statSync(file)
      if (newest === null || mtimeMs > newest.mtimeMs) newest = { file, mtimeMs }
    }
  }
  if (newest === null) throw new Error(`rescan --grow found no Claude session file under ${projects}`)
  const tail = lastLines(newest.file, 1024 * 1024)
  const line = tail.subarray(tail.lastIndexOf(0x0a, tail.length - 2) + 1)
  appendFileSync(newest.file, line)
  console.log(`[rescan] grown by its own last line, ${line.length} bytes: ${newest.file}`)
}

async function rescan(flags: string[]): Promise<void> {
  const parseScript = process.env['AGENTSHED_BENCH_PARSE_WORKER']
  const scanScript = process.env['AGENTSHED_BENCH_SCAN_WORKER']
  if (!parseScript || !scanScript) throw new Error('AGENTSHED_BENCH_PARSE_WORKER and AGENTSHED_BENCH_SCAN_WORKER are not set: run through scripts/bench-scan.mjs')
  const unknown = flags.filter((f) => f !== '--main' && f !== '--grow')
  if (unknown.length > 0) throw new Error(`rescan takes --main and --grow, not ${unknown.join(' ')}`)
  const home = process.env['AGENTSHED_HOME_OVERRIDE']
  const grow = flags.includes('--grow')
  if (grow && !home) throw new Error('rescan --grow appends to a session file, so it runs only when AGENTSHED_HOME_OVERRIDE points at a copy of a home')
  let cacheDir: string
  if (home) {
    cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
    console.log(`[rescan] home ${home}: an empty cache, so the first scan parses every file`)
  } else {
    cacheDir = await warmCacheDir('rescan')
  }
  const roots = realRoots()
  // The stamp only matters for the archive's conflict rule, which a benchmark never exercises
  const archive = new UsageArchive(cacheDir, { stamp: 'bench' })
  const run = flags.includes('--main')
    ? rescanOnMain(cacheDir, roots, archive, parseScript)
    : rescanThroughWorker(cacheDir, roots, archive, scanScript, parseScript)
  try {
    await run.once('first')
    if (grow) growNewestClaudeSession(roots)
    const written = watchStore(cacheDir)
    const stall = await longestStall(() => run.once('second'))
    console.log(
      `[rescan] second scan: main-process event-loop stall max ${stall.max} ms; ${run.counted()}token store written: ${written() ? 'yes' : 'no'}`
    )
  } finally {
    await run.close()
  }
}

/** The file a search-index run keeps the session lists in, beside the token store its scan wrote */
const SEARCH_INDEX_FILE = 'search-sessions.json'

interface SearchIndex {
  roots: ScanRoots
  /** Each project's sessions by its merge key, as the app keeps them to search by (perProjectStats in src/main/index.ts),
   * and what they held when indexed */
  projects: Record<string, { path: string; sessions: SessionMeta[]; held: Holding }>
}

const mb = (bytes: number, digits = 1): string => (bytes / 1e6).toFixed(digits)

/** A session file's size on disk; one that can no longer be read counts nothing */
function sizeOnDisk(file: string): number {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

/**
 * The bytes of a cold rollout's decompressed stream, read off its zstd frame headers without decompressing it (the
 * format's RFC 8878, section 3.1): each frame's recorded content size summed, a skippable frame passed over, and each
 * frame's blocks walked by their headers to where the next frame starts. Null when a frame records no content size, or
 * the file does not lay out as zstd frames to its last byte.
 */
function zstdStreamSize(file: string): number | null {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return null
  }
  try {
    const end = statSync(file).size
    const head = Buffer.alloc(18)
    let pos = 0
    let total = 0
    while (pos < end) {
      const got = readSync(fd, head, 0, head.length, pos)
      if (got < 5) return null
      const magic = head.readUInt32LE(0)
      if (magic >>> 4 === 0x184d2a5) {
        // A skippable frame: its size follows the magic number
        if (got < 8) return null
        pos += 8 + head.readUInt32LE(4)
        continue
      }
      if (magic !== 0xfd2fb528) return null
      const descriptor = head[4]
      const singleSegment = (descriptor >> 5) & 1
      const sizeField = [singleSegment, 2, 4, 8][descriptor >> 6]
      if (sizeField === 0) return null
      // The window descriptor, absent from a single-segment frame, then the dictionary ID
      const at = 5 + (singleSegment ? 0 : 1) + [0, 1, 2, 4][descriptor & 3]
      if (got < at + sizeField) return null
      total +=
        sizeField === 1 ? head[at] : sizeField === 2 ? head.readUInt16LE(at) + 256 : sizeField === 4 ? head.readUInt32LE(at) : Number(head.readBigUInt64LE(at))
      pos += at + sizeField
      // Each block's 3-byte header: last-block flag, type, size; an RLE block holds one byte, type 3 is reserved
      for (let last = 0; last === 0; ) {
        if (readSync(fd, head, 0, 3, pos) < 3) return null
        const block = head.readUIntLE(0, 3)
        const type = (block >> 1) & 3
        if (type === 3) return null
        last = block & 1
        pos += 3 + (type === 1 ? 1 : block >>> 3)
      }
      // The content checksum
      if ((descriptor >> 2) & 1) pos += 4
    }
    return pos === end ? total : null
  } finally {
    closeSync(fd)
  }
}

/** A session's bytes on disk, and the bytes a full-text search reads of it: a cold rollout's decompressed stream (its
 * size on disk when its frames record none), an Antigravity conversation's transcript rather than its database
 * (sessionReadSource), any other session's file */
function sessionBytes(roots: ScanRoots, file: string): { onDisk: number; read: number; cold: boolean; unsized: boolean } {
  const onDisk = sizeOnDisk(file)
  if (isColdRollout(file)) {
    const stream = zstdStreamSize(file)
    return { onDisk, read: stream ?? onDisk, cold: true, unsized: stream === null }
  }
  const source = sessionReadSource(roots, file)
  return { onDisk, read: source === file ? onDisk : sizeOnDisk(source), cold: false, unsized: false }
}

/** What a set of sessions holds, by the bytes a full-text search reads and by those on disk */
interface Holding {
  sessions: number
  read: number
  onDisk: number
  cold: number
  coldRead: number
  coldOnDisk: number
  /** Cold rollouts whose frames record no stream size, counted at their size on disk */
  unsized: number
  /** The cold rollout whose stream is the largest */
  largestCold: { file: string; read: number; onDisk: number } | null
}

function holding(roots: ScanRoots, sessions: SessionMeta[]): Holding {
  const h: Holding = { sessions: sessions.length, read: 0, onDisk: 0, cold: 0, coldRead: 0, coldOnDisk: 0, unsized: 0, largestCold: null }
  for (const s of sessions) {
    const b = sessionBytes(roots, s.file)
    h.read += b.read
    h.onDisk += b.onDisk
    if (!b.cold) continue
    h.cold++
    h.coldRead += b.read
    h.coldOnDisk += b.onDisk
    if (b.unsized) h.unsized++
    if (h.largestCold === null || b.read > h.largestCold.read) h.largestCold = { file: s.file, read: b.read, onDisk: b.onDisk }
  }
  return h
}

const describeHolding = (h: Holding): string =>
  `${mb(h.read)} MB read by full text, ${mb(h.onDisk)} MB on disk; ${h.sessions} sessions, ${h.cold} cold rollouts ` +
  `(${mb(h.coldRead)} MB of stream, ${mb(h.coldOnDisk)} MB on disk${h.unsized > 0 ? `; ${h.unsized} recording no stream size, counted at their size on disk` : ''})`

/** The scan worker's and the parse pool's scripts, which the runner bundles */
function workerScripts(): { scanScript: string; parseScript: string } {
  const parseScript = process.env['AGENTSHED_BENCH_PARSE_WORKER']
  const scanScript = process.env['AGENTSHED_BENCH_SCAN_WORKER']
  if (!parseScript || !scanScript) throw new Error('AGENTSHED_BENCH_PARSE_WORKER and AGENTSHED_BENCH_SCAN_WORKER are not set: run through scripts/bench-scan.mjs')
  return { scanScript, parseScript }
}

async function searchIndex(): Promise<void> {
  const { scanScript, parseScript } = workerScripts()
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-search-'))
  const roots = realRoots()
  const scans = startScans({ script: scanScript, parseScript, cacheDir, poolSize: poolSize(), engine: engineSource(), combination: COMBINATION })
  const t0 = performance.now()
  let out: ScanOutput
  try {
    out = await scans.scan(roots)
  } finally {
    await scans.close()
  }
  console.log(`[search-index] scan ${since(t0)} ${scans.servedOn === 'worker' ? 'on the scan worker' : 'on the main process, the scan worker having failed'}`)
  // The stamp only matters for the archive's conflict rule, which a benchmark never exercises
  const { stats } = settleScan(out, new UsageArchive(cacheDir, { stamp: 'bench' }))
  const paths = new Map(out.snapshot.projects.map((p) => [mergeKey(p.path), p.path]))
  const index: SearchIndex = { roots, projects: {} }
  for (const [key, { sessions }] of stats) index.projects[key] = { path: paths.get(key) ?? key, sessions, held: holding(roots, sessions) }
  writeFileSync(join(cacheDir, SEARCH_INDEX_FILE), JSON.stringify(index))
  console.log(`[search-index] index ${cacheDir}`)

  // Ranked by the bytes a full-text search reads, which a cold rollout's size on disk understates (#469)
  const ranked = Object.values(index.projects).sort((a, b) => b.held.read - a.held.read)
  const SHOWN = 10
  console.log(`[search-index] ${ranked.length} projects with sessions; the ${Math.min(SHOWN, ranked.length)} whose sessions a full-text search reads the most bytes of:`)
  for (const p of ranked.slice(0, SHOWN)) console.log(`[search-index]   ${describeHolding(p.held)}  ${p.path}`)
  const largest = ranked.reduce<{ path: string; file: string; read: number; onDisk: number } | null>(
    (a, p) => (p.held.largestCold !== null && (a === null || p.held.largestCold.read > a.read) ? { path: p.path, ...p.held.largestCold } : a),
    null
  )
  console.log(
    largest === null
      ? '[search-index] no project lists a cold rollout'
      : `[search-index] the largest cold rollout, ${mb(largest.read)} MB of stream (${mb(largest.onDisk)} MB on disk), is in ${largest.path}: ${largest.file}`
  )
}

/** This process's footprint now and at its peak so far, in bytes, read with macOS `footprint`; its worker threads are
 * this process's own, so their memory is in both */
function footprint(): { now: number; peak: number } {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-bench-footprint-'))
  const file = join(dir, 'footprint.json')
  try {
    execFileSync('footprint', ['-p', String(process.pid), '-f', 'bytes', '--noCategories', '-j', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    const read = JSON.parse(readFileSync(file, 'utf8')) as {
      processes?: Array<{ pid?: number; auxiliary?: { phys_footprint?: number; phys_footprint_peak?: number } }>
    }
    const own = read.processes?.find((p) => p.pid === process.pid)?.auxiliary
    if (typeof own?.phys_footprint !== 'number' || typeof own.phys_footprint_peak !== 'number')
      throw new Error(`footprint gave no footprint for process ${process.pid}`)
    return { now: own.phys_footprint, peak: own.phys_footprint_peak }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function searchRun(args: string[]): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('search reads the footprint with macOS `footprint`, so it runs on macOS only')
  const fullText = args.includes('--full-text')
  const positional = args.filter((a) => a !== '--full-text')
  if (positional.length !== 3) throw new Error('search mode needs <index dir> <project path> <needle>, and --full-text for full-text mode')
  const [indexDir, project, needle] = positional
  const { scanScript, parseScript } = workerScripts()
  const index = JSON.parse(readFileSync(join(indexDir, SEARCH_INDEX_FILE), 'utf8')) as SearchIndex
  const roots = realRoots()
  if (JSON.stringify(index.roots) !== JSON.stringify(roots))
    throw new Error(`${indexDir} was made for the home at ${dirname(index.roots.claudeHome)}: run search with the AGENTSHED_HOME_OVERRIDE its search-index run had`)
  const listed = index.projects[mergeKey(project)]
  if (!listed) throw new Error(`${indexDir} lists no sessions for ${project}`)
  const { sessions } = listed

  // The token store the search-index run's scan wrote, read through the scan worker as the app reads its own
  const scans = startScans({ script: scanScript, parseScript, cacheDir: indexDir, poolSize: poolSize(), engine: engineSource(), combination: COMBINATION })
  try {
    // Outside the measurement, the state the app is in by the time it is asked to search: the scan worker started
    // with its store open, the engine module loaded on this thread (scan-client.ts), and what the worker's engine
    // builds at every scan and would otherwise build at the search's first need of it, the files a fork's parent may
    // be in and agy's titles (TokenEngine in token-stats.ts). Asking for each listed session's question index, as the
    // search will, prepares all of them; a session changed since the index has its index rebuilt here, as the app's
    // scan would have, and one that cannot be read is skipped, as the search skips it.
    let changed = 0
    for (const s of sessions) if (!(await scans.isFresh(s.file))) changed++
    for (const s of sessions) await scans.sessionQuestions(roots, s.file).catch(() => null)
    // What the index found them to hold: reading a cold rollout's frame headers again here would bring its pages back
    // into the page cache ahead of a search meant to find them cold
    console.log(`[search] ${listed.path}: ${describeHolding(listed.held)} when indexed; ${changed} changed since the index`)
    const before = footprint()
    let took = ''
    let result: SearchResult | null = null
    const stall = await longestStall(async () => {
      const t0 = performance.now()
      result = await searchProjectSessions(scans, roots, sessions, needle, fullText)
      took = since(t0)
    })
    const after = footprint()
    const r = result as SearchResult | null
    if (r === null) throw new Error('the search gave no result')
    console.log(
      `[search] ${fullText ? 'full text' : 'questions'} ${JSON.stringify(needle)}: ${took}; ${r.totalHits} hits in ${r.sessionCount} sessions, ${r.folded} folded; main-process event-loop stall max ${stall.max} ms, p99 ${stall.p99} ms; ${scans.servedOn === 'worker' ? 'indexes read on the scan worker' : 'indexes read on the main process, the scan worker having failed'}`
    )
    console.log(
      `[search] main-process footprint, worker threads included: ${mb(before.now, 0)} MB before the search; peak ${mb(after.peak, 0)} MB, ${
        after.peak > before.peak
          ? `reached during the search, ${mb(after.peak - before.now, 0)} MB over the footprint before it`
          : `reached before the search began: the search's own peak is not above it`
      }`
    )
  } finally {
    await scans.close()
  }
}

/** The turn limit and keep size the app applies (turn-limit.ts, turn-keep.ts), with no seam moving them */
const TURN_LIMIT = turnLimitBytes(undefined)
const TURN_KEEP = turnKeepBytes(undefined)

/** A turn by its question index record's first three numbers: the question's start and end, and the turn's end */
interface IndexedTurn {
  file: string
  rec: [number, number, number]
}

const bodyBytes = (t: IndexedTurn): number => t.rec[2] - t.rec[1]

/** The sides the turn mode measures */
type TurnSide = 'claude' | 'codex' | 'grok'

/** The turn mode's arguments for a turn of `side` */
const turnArgs = (side: TurnSide, t: IndexedTurn): string => `turn ${side} ${t.file} ${t.rec.join(' ')}`

/** The question index records of a parse's entry, as turns of `file` */
function indexedTurns(file: string, questions: readonly QuestionRec[]): IndexedTurn[] {
  return questions.map((r) => ({ file, rec: [r[0], r[1], r[2]] }))
}

/** What the turn mode measures of a side */
interface TurnSideBench {
  /** The scan root holding the side's sessions */
  root: 'claudeHome' | 'codexHome' | 'grokHome'
  /** Every turn of the side's sessions in `walk`, as the engine module's parse indexes them for a scan, and how many
   * sessions there were */
  turns(walk: SessionWalk): Promise<{ sessions: number; turns: IndexedTurn[] }>
  /** A session of one question whose body is a little under the turn limit, written into `dir`: its lines, the body's
   * after the question's */
  nearLimit(dir: string): { file: string; lines: string[] }
}

/** A run of tool calls and their results, each result about a MiB of output the shape a long build log has, quotes,
 * tabs and non-ASCII text among it, after `head`, the lines before the body: as many as fit a little under the turn
 * limit. `call(i)` writes the i-th call's lines, `result(i, text)` its result's. */
function nearLimitLines(head: string, call: (i: number) => string, result: (i: number, text: string) => string): string[] {
  const unit = `2026-11-20T10:00:00.000Z INFO\tworker-3 handled "GET /api/sessions/résumé" 200 in 12 ms — ok\n`
  const target = TURN_LIMIT - 4096
  const lines = [head]
  let body = 0
  for (let i = 0; ; i++) {
    const empty = Buffer.byteLength(call(i)) + Buffer.byteLength(result(i, ''))
    const perUnit = Buffer.byteLength(result(i, unit)) - Buffer.byteLength(result(i, ''))
    const room = Math.floor((target - body - empty) / perUnit)
    if (room <= 0) break
    const n = Math.min(room, Math.floor((1024 * 1024) / perUnit))
    const pair = [call(i), result(i, unit.repeat(n))]
    lines.push(...pair)
    body += Buffer.byteLength(pair.join(''))
  }
  return lines
}

const TURN_SIDES: Record<TurnSide, TurnSideBench> = {
  claude: {
    root: 'claudeHome',
    async turns(walk) {
      const turns: IndexedTurn[] = []
      for (const t of walk.claude) {
        const parsed = await runParseJob({ kind: 'claude', file: t.file, projectKey: '', listed: !t.nested })
        if (parsed !== null && parsed.agg.kind === 'claude') turns.push(...indexedTurns(t.file, parsed.agg.questions))
      }
      return { sessions: walk.claude.length, turns }
    },
    nearLimit(dir) {
      const ts = '2026-11-20T10:00:00.000Z'
      const line = (o: unknown): string => JSON.stringify(o) + '\n'
      const lines = nearLimitLines(
        line({ type: 'user', timestamp: ts, uuid: 'q', message: { role: 'user', content: 'Why does the nightly build fail?' } }),
        (i) =>
          line({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [
            { type: 'text', text: `Reading log ${i}.` },
            { type: 'tool_use', id: `toolu_${i}`, name: 'Bash', input: { command: `cat build-${i}.log`, description: `Read build log ${i}` } }
          ] } }),
        (i, text) => line({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: text }] } })
      )
      return { file: join(dir, 'near-limit.jsonl'), lines }
    }
  },
  codex: {
    root: 'codexHome',
    async turns(walk) {
      const turns: IndexedTurn[] = []
      for (const s of walk.codex) {
        const parsed = await runParseJob({ kind: 'codex', file: s.file, projectKey: '', meta: s, threadName: undefined })
        if (parsed !== null && parsed.agg.kind === 'codex') turns.push(...indexedTurns(s.file, parsed.agg.questions))
      }
      return { sessions: walk.codex.length, turns }
    },
    nearLimit(dir) {
      const ts = '2026-11-20T10:00:00.000Z'
      const line = (type: string, payload: unknown): string => JSON.stringify({ timestamp: ts, type, payload }) + '\n'
      // A plain rollout of the legacy format: its session's meta line, the question, then the agent's prose and a shell
      // call, as a Codex rollout writes them, and the call's output
      const lines = nearLimitLines(
        line('session_meta', { id: '0196f1c2-3b4d-7e5f-8a6b-1c2d3e4f5a6b', timestamp: ts, cwd: '/work/nightly', originator: 'codex_cli_rs', cli_version: '0.60.0' }) +
          line('event_msg', { type: 'user_message', message: 'Why does the nightly build fail?', images: [] }),
        (i) =>
          line('event_msg', { type: 'agent_message', message: `Reading log ${i}.` }) +
          line('response_item', { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: `cat build-${i}.log`, workdir: '/work/nightly' }), call_id: `call_${i}` }),
        (i, text) => line('response_item', { type: 'function_call_output', call_id: `call_${i}`, output: text })
      )
      return { file: join(dir, 'rollout-2026-11-20T10-00-00-0196f1c2-3b4d-7e5f-8a6b-1c2d3e4f5a6b.jsonl'), lines }
    }
  },
  grok: {
    root: 'grokHome',
    async turns(walk) {
      const turns: IndexedTurn[] = []
      for (const s of walk.grok) {
        const parsed = await runParseJob({ kind: 'grok', file: s.file, projectKey: '', subagent: s.subagent })
        if (parsed !== null && parsed.agg.kind === 'grok') turns.push(...indexedTurns(s.file, parsed.agg.questions))
      }
      return { sessions: walk.grok.length, turns }
    },
    nearLimit(dir) {
      const ts = 1_795_000_000
      const line = (update: Record<string, unknown>): string =>
        JSON.stringify({ timestamp: ts, method: '_x.ai/session/update', params: { sessionId: 's', update } }) + '\n'
      const lines = nearLimitLines(
        line({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Why does the nightly build fail?' }, _meta: { promptIndex: 0 } }),
        // A message split across chunks mid-word, then the call
        (i) =>
          [
            line({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Read' } }),
            line({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `ing log ${i}.` } }),
            line({
              sessionUpdate: 'tool_call',
              toolCallId: `call_${i}`,
              title: 'read_file',
              rawInput: { target_file: `/srv/ci/build-${i}.log` },
              _meta: { 'x.ai/tool': { name: 'read_file', label: 'Read' } }
            })
          ].join(''),
        (i, text) =>
          line({ sessionUpdate: 'tool_call_update', toolCallId: `call_${i}`, status: 'completed', content: [{ type: 'content', content: { type: 'text', text } }] })
      )
      // Grok's own layout, a session's stream in a directory of its own (sessions/<cwd>/<session id>/updates.jsonl)
      const session = join(dir, 'sessions', encodeURIComponent('/srv/ci'), 'near-limit')
      mkdirSync(session, { recursive: true })
      return { file: join(session, 'updates.jsonl'), lines }
    }
  }
}

function turnSide(name: string | undefined): TurnSide {
  if (name === 'claude' || name === 'codex' || name === 'grok') return name
  throw new Error(`the turn modes measure the sides ${Object.keys(TURN_SIDES).join(' and ')}, not "${name ?? ''}"`)
}

/** The session `bench` writes into `dir`, indexed: its one turn, checked to be a little under the turn limit */
async function writeNearLimitTurn(bench: TurnSideBench, dir: string): Promise<IndexedTurn> {
  const { file, lines } = bench.nearLimit(dir)
  writeFileSync(file, lines.join(''))
  const walk: SessionWalk = { claude: [], codex: [], grok: [], antigravity: [], held: { claude: [], codex: [], grok: [], antigravity: [] } }
  if (bench.root === 'claudeHome') walk.claude.push({ file, dir, nested: false })
  else if (bench.root === 'codexHome') {
    const meta = threadEngineModule().sessionMeta('codex', file)
    if (meta === null) throw new Error(`${file} gives no Codex session`)
    walk.codex.push(meta)
  } else walk.grok.push({ file, cwd: '/srv/ci', subagent: false, mtimeMs: statSync(file).mtimeMs })
  const { turns: [turn, ...more] } = await bench.turns(walk)
  if (!turn || more.length > 0) throw new Error(`${file} should index as one turn`)
  if (bodyBytes(turn) > TURN_LIMIT || bodyBytes(turn) < TURN_LIMIT - 1024 * 1024)
    throw new Error(`${file}'s body is ${bodyBytes(turn)} bytes, not a little under the limit of ${TURN_LIMIT}`)
  return turn
}

async function turnIndex(args: string[]): Promise<void> {
  if (args.length !== 2) throw new Error('turn-index mode needs the side and the directory to write its constructed turn into')
  const side = turnSide(args[0])
  const bench = TURN_SIDES[side]
  const home = realRoots()
  // The side's sessions alone: every other side's root is an empty directory, Claude Code's registry file one that is
  // not there
  const empty = mkdtempSync(join(tmpdir(), 'agentshed-bench-empty-'))
  const roots: ScanRoots = {
    ...home,
    claudeHome: empty,
    claudeConfigFile: join(empty, 'none.json'),
    codexHome: empty,
    geminiHome: empty,
    grokHome: empty,
    antigravityHome: empty,
    agentsSkillsDir: empty,
    [bench.root]: home[bench.root]
  }
  const t0 = performance.now()
  const { sessions, turns } = await bench.turns(walkSessions(roots))
  const within = turns.filter((t) => bodyBytes(t) <= TURN_LIMIT).sort((a, b) => bodyBytes(b) - bodyBytes(a))
  const cold = within.filter((t) => isColdRollout(t.file))
  console.log(
    `[turn-index] ${side}: ${sessions} sessions, ${turns.length} turns (${turns.filter((t) => isColdRollout(t.file)).length} of cold rollouts), ${turns.length - within.length} over the turn limit, indexed in ${since(t0)}`
  )
  for (const t of within.filter((t) => !isColdRollout(t.file)).slice(0, 3)) console.log(`[turn-index] ${mb(bodyBytes(t))} MB body: ${turnArgs(side, t)}`)
  if (cold.length > 0) console.log(`[turn-index] ${mb(bodyBytes(cold[0]))} MB body, the largest of a cold rollout: ${turnArgs(side, cold[0])}`)
  const made = await writeNearLimitTurn(bench, args[1])
  console.log(`[turn-index] ${mb(bodyBytes(made))} MB body, constructed: ${turnArgs(side, made)}`)
}

async function turnFetch(args: string[]): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('turn reads the footprint with macOS `footprint`, so it runs on macOS only')
  const [name, file, ...numbers] = args
  const side = turnSide(name)
  const rec = numbers.map(Number)
  if (args.length !== 5 || !rec.every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error('turn mode needs <side> <file> <question start> <question end> <turn end>, as turn-index prints them')
  const before = footprint()
  // getSessionTurn's steps from the question index's record on (src/main/index.ts)
  const t0 = performance.now()
  const source = sessionReadSource(realRoots(), file)
  const identity = sourceIdentity(source)
  const read = await readTurnRanges((s, question, body) => readSessionTurn(side, s, question, body), source, [rec[0], rec[1], rec[2]], TURN_LIMIT)
  questionRevision(identity, file, rec[0], rec[1], read.question)
  if (sourceIdentity(source) !== identity) throw new Error(`${file} changed during the read`)
  if (read.body === null) throw new Error(`the turn's body, ${read.bodyBytes} bytes, is over the turn limit`)
  const turn: SessionTurn = { blocks: bodyBlocks(side, read.body), bytesRead: read.bytesRead }
  if (!turnKept(read.bodyBytes, TURN_KEEP)) turn.unkept = true
  assertSessionTurn(turn)
  const ms = performance.now() - t0
  const after = footprint()
  console.log(
    `[turn] ${JSON.stringify({
      file,
      bodyBytes: read.bodyBytes,
      blocks: turn.blocks.length,
      ms: Math.round(ms),
      footprintBefore: before.now,
      peak: after.peak,
      peakReachedInFetch: after.peak > before.peak
    })}`
  )
}

async function main(): Promise<void> {
  console.log(`[runtime] ${isElectron ? `electron ${process.versions['electron']}` : `node ${process.version}`}`)
  // The engine module on this thread, as the app's threads load it before they parse: the scans this thread runs
  // itself parse through it
  loadEngineModule(engineSource())
  const [mode = 'cold', ...rest] = process.argv.slice(2)
  if (mode === 'file') {
    if (rest.length === 0) throw new Error('file mode needs at least one path')
    for (const f of rest) timeFile(f)
    return
  }
  if (mode === 'workers') {
    await workersScan()
    return
  }
  if (mode === 'grow') {
    if (rest.length !== 1) throw new Error('grow mode needs one rollout path')
    await growScan(rest[0])
    return
  }
  if (mode === 'cold' || mode === 'warm') {
    await fullScan(mode)
    return
  }
  if (mode === 'rescan') {
    await rescan(rest)
    return
  }
  if (mode === 'page') {
    if (rest.length !== 1) throw new Error('page mode needs one rollout path')
    await pageRead(rest[0])
    return
  }
  if (mode === 'search-index') {
    if (rest.length !== 0) throw new Error('search-index mode takes no arguments')
    await searchIndex()
    return
  }
  if (mode === 'search') {
    await searchRun(rest)
    return
  }
  if (mode === 'turn-index') {
    await turnIndex(rest)
    return
  }
  if (mode === 'turn') {
    await turnFetch(rest)
    return
  }
  throw new Error(
    `unknown mode "${mode}": expected cold, warm, rescan, grow <rollout>, page <rollout>, workers, file <path>…, search-index, search <index dir> <project path> <needle> [--full-text], turn-index <side> <dir>, or turn <side> <file> <question start> <question end> <turn end>`
  )
}

async function start(): Promise<void> {
  if (!isElectron) {
    await main()
    return
  }
  const { app } = (await import('electron')) as typeof import('electron')
  // A benchmark has no window and must not steal the foreground (the same reason the app's test
  // silencing exists, see src/main/index.ts)
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory')
    app.dock?.hide()
  }
  await app.whenReady()
  // app.exit ends the process with the code it is given, whatever process.exitCode holds, so it is given that code: 1
  // once a check has failed or the mode has thrown
  try {
    await main()
  } catch (e) {
    fail(e)
  }
  app.exit(Number(process.exitCode ?? 0))
}

function fail(e: unknown): void {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
}

start().catch((e: unknown) => {
  fail(e)
  if (isElectron) void import('electron').then(({ app }) => app.exit(1))
})
