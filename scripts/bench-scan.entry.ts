// The body of the startup-scan benchmark. scripts/bench-scan.mjs bundles this file with esbuild and
// runs the bundle under the Electron binary (the main process) or, with --node, under plain Node —
// the same code in both, so the only variable is the runtime. Why that matters is the AGENTS.md
// invariant on main-process measurements.
//
// Modes (the first argument):
//   cold          a full scan into an empty cache directory — what a first launch or a
//                 CACHE_VERSION bump costs
//   warm          a full scan against a copy of the app's own cache — what a routine launch costs
//                 (Electron only: the copy is taken from app.getPath('userData'))
//   file <path>…  eachJsonlLine over the given files, one at a time
//   grow <rollout> a Codex rollout copied into a scratch home, scanned whole, then grown by about 1 MB
//                 of its own last lines and scanned again — the rescan a live session costs (#158). The
//                 grown scan is checked against a cold scan of the same file.
//   workers       a cold scan parsed on the main thread, then one parsed on the parse pool (#159): the
//                 time of each, the main thread's longest event-loop stall during each (how long an IPC
//                 call could wait), and whether the two caches agree entry by entry.
//                 `workers --pool-only` runs the pool's scan alone, for a peak-memory figure that is
//                 not stacked on the main-thread run's.
//   rescan        two scans in one process against a copy of the app's cache, as the app runs them: on
//                 the scan worker, with the archive merge on the main process (Electron only). What a
//                 scan costs once the run's first is behind it, and what token-stats::QR-001 is judged
//                 by: for the second scan, the main process's longest event-loop stall, whether the
//                 token cache file was written, and where the scan ran — the scan worker, or the main
//                 process when the worker failed. A file an agent writes between the two scans is
//                 parsed, and the cache is then written.
//                 `rescan --main` runs both scans on the main process instead, by the scanner the app
//                 falls back to once its scan worker has failed, and counts the files parsed.
//                 `rescan --grow` appends to the newest Claude session file its own last line between
//                 the two scans, so the second has a file to parse and a cache to write. It writes to
//                 the scanned home, so it runs only when AGENTSHED_HOME_OVERRIDE points at a copy of
//                 one, and starts from an empty cache: the app's cache knows none of the copy's paths.
//
// Nothing here writes to the app's userData: every cache lands in a fresh temporary directory.
// AGENTSHED_HOME_OVERRIDE is honoured the way the app honours it (see src/main/roots.ts).
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { availableParallelism } from 'node:os'
import { scan, walkSessions } from '../src/main/providers/scan'
import { TokenEngine, type ParseRunner } from '../src/main/providers/token-stats'
import { ParsePool } from '../src/main/parse-pool'
import { Scanner, settleScan, type ScanOutput } from '../src/main/providers/scanner'
import { startScans } from '../src/main/scan-client'
import { UsageArchive } from '../src/main/providers/archive'
import type { ScanRoots } from '../src/main/providers/types'
import { eachJsonlLine } from '../src/main/providers/jsonl'
import { realRoots } from '../src/main/roots'
import { mergeKey } from '../src/shared/path-key'

const isElectron = typeof process.versions['electron'] === 'string'

function since(t0: number): string {
  return `${(performance.now() - t0).toFixed(0)} ms`
}

async function timeFile(file: string): Promise<void> {
  const size = statSync(file).size
  let lines = 0
  const t0 = performance.now()
  await eachJsonlLine(file, () => {
    lines++
  })
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

/** A fresh cache directory holding a copy of the app's token cache and archive */
async function warmCacheDir(mode: string): Promise<string> {
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
  const from = await userDataDir()
  if (from === null) throw new Error(`${mode} needs the app cache, which only the Electron run can locate: drop --node`)
  const cache = join(from, 'token-cache.json')
  // No cache is not a warm run at all; saying so beats reporting a cold run under the wrong label
  if (!existsSync(cache)) throw new Error(`${mode} needs the app cache and none exists at ${cache}: launch the app once first`)
  copyFileSync(cache, join(cacheDir, 'token-cache.json'))
  console.log(`[${mode}] token-cache.json ${(statSync(cache).size / 1e6).toFixed(1)} MB copied from ${from}`)
  const archive = join(from, 'usage-archive.json')
  if (existsSync(archive)) copyFileSync(archive, join(cacheDir, 'usage-archive.json'))
  return cacheDir
}

async function fullScan(mode: 'cold' | 'warm'): Promise<void> {
  const cacheDir = mode === 'warm' ? await warmCacheDir(mode) : mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
  console.log(`[mode] ${mode}, cache dir ${cacheDir}`)
  const roots = realRoots()

  // The app's order: one walk of the Codex, Grok and Antigravity session lists, shared by scan() and build()
  let t0 = performance.now()
  const sessions = walkSessions(roots)
  console.log(`[walkSessions] codex=${sessions.codex.length}, grok=${sessions.grok.length}, antigravity=${sessions.antigravity.length}: ${since(t0)}`)

  t0 = performance.now()
  const snap = await scan(roots, { now: () => Date.now(), sessions })
  console.log(`[scan()] registries, activity, global layer, memory: ${since(t0)} (projects=${snap.projects.length})`)

  t0 = performance.now()
  const engine = new TokenEngine(cacheDir)
  console.log(`[TokenEngine] load cache: ${since(t0)}`)

  // The stamp only matters for the archive's conflict rule, which a benchmark never exercises twice
  const archive = new UsageArchive(cacheDir, { stamp: 'bench' })
  const claudePaths = snap.projects.filter((p) => p.sides.includes('claude')).map((p) => p.path)
  const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
  t0 = performance.now()
  const built = await engine.build(roots, claudePaths, registered, sessions)
  console.log(
    `[TokenEngine.build] cache lookups, parses, combine, persist: ${since(t0)} (rows=${built.rows.length}, sessionFiles=${built.sessionFiles.size})`
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
      new TokenEngine(dirName).build(roots, [], undefined, walkSessions(roots))
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
  const claudePaths = snap.projects.filter((p) => p.sides.includes('claude')).map((p) => p.path)
  const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
  const run = async (label: string, runner?: ParseRunner): Promise<string> => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
    let took = ''
    const stall = await longestStall(async () => {
      const t0 = performance.now()
      await new TokenEngine(cacheDir, runner).build(roots, claudePaths, registered, sessions)
      took = since(t0)
    })
    console.log(`[workers] ${label}: ${took}; main-thread event-loop stall max ${stall.max} ms, p99 ${stall.p99} ms`)
    return cacheDir
  }
  if (process.argv.includes('--pool-only')) {
    const pool = new ParsePool(script, poolSize())
    await run(`parse pool of ${pool.concurrency}`, pool)
    pool.close()
    return
  }
  const inlineDir = await run('main thread')
  const pool = new ParsePool(script, poolSize())
  const poolDir = await run(`parse pool of ${pool.concurrency}`, pool)
  pool.close()
  const files = (d: string): Record<string, unknown> =>
    (JSON.parse(readFileSync(join(d, 'token-cache.json'), 'utf8')) as { files: Record<string, unknown> }).files
  const a = files(inlineDir)
  const b = files(poolDir)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let differ = 0
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) differ++
  console.log(`[workers] cache entries: ${keys.size}, differing between the two: ${differ}`)
  if (differ > 0) process.exitCode = 1
}

/** The token cache file's identity: a write replaces the file, so a new inode or time is a write */
function cacheFileId(cacheDir: string): string {
  const st = statSync(join(cacheDir, 'token-cache.json'))
  return `${st.ino}:${st.mtimeMs}`
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

/** The app's way: the scan on the scan worker */
function rescanThroughWorker(cacheDir: string, roots: ScanRoots, archive: UsageArchive, scanScript: string, parseScript: string): RescanRun {
  const scans = startScans({ script: scanScript, parseScript, cacheDir, poolSize: poolSize() })
  const where = (): string => (scans.servedOn === 'worker' ? 'on the scan worker' : 'on the main process, the scan worker having failed')
  return { once: (label) => timedScan(label, () => scans.scan(roots), archive, where), counted: () => '', close: () => scans.close() }
}

/** The scan on the main process, by the scanner the app falls back to once its scan worker has failed, its parses counted */
function rescanOnMain(cacheDir: string, roots: ScanRoots, archive: UsageArchive, parseScript: string): RescanRun {
  const pool = new ParsePool(parseScript, poolSize())
  let parsed = 0
  const scanner = new Scanner(cacheDir, {
    concurrency: pool.concurrency,
    run: (job) => {
      parsed++
      return pool.run(job)
    },
    close: () => pool.close()
  })
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
    const before = cacheFileId(cacheDir)
    const stall = await longestStall(() => run.once('second'))
    console.log(
      `[rescan] second scan: main-process event-loop stall max ${stall.max} ms; ${run.counted()}token cache file written: ${cacheFileId(cacheDir) === before ? 'no' : 'yes'}`
    )
  } finally {
    await run.close()
  }
}

async function main(): Promise<void> {
  console.log(`[runtime] ${isElectron ? `electron ${process.versions['electron']}` : `node ${process.version}`}`)
  const [mode = 'cold', ...rest] = process.argv.slice(2)
  if (mode === 'file') {
    if (rest.length === 0) throw new Error('file mode needs at least one path')
    for (const f of rest) await timeFile(f)
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
  throw new Error(`unknown mode "${mode}": expected cold, warm, rescan, grow <rollout>, workers, or file <path>…`)
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
  try {
    await main()
  } finally {
    app.exit(0)
  }
}

start().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
  if (isElectron) void import('electron').then(({ app }) => app.exit(1))
})
