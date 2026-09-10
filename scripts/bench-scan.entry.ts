// The body of the startup-scan benchmark. scripts/bench-scan.mjs bundles this file with esbuild and
// runs the bundle under the Electron binary (the main process) or, with --node, under plain Node —
// the same code in both, so the only variable is the runtime. Why that matters is the CONTEXT.md
// invariant "Main-process file I/O is measured under Electron, never under Node".
//
// Modes (the first argument):
//   cold          a full scan into an empty cache directory — what a first launch or a
//                 CACHE_VERSION bump costs
//   warm          a full scan against a copy of the app's own cache — what a routine launch costs
//                 (Electron only: the copy is taken from app.getPath('userData'))
//   file <path>…  eachJsonlLine over the given files, one at a time
//
// Nothing here writes to the app's userData: every cache lands in a fresh temporary directory.
// AGENTSHED_HOME_OVERRIDE is honoured the way the app honours it (see src/main/roots.ts).
import { copyFileSync, existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { scan } from '../src/main/providers/scan'
import { TokenEngine } from '../src/main/providers/token-stats'
import { UsageArchive } from '../src/main/providers/archive'
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

async function fullScan(mode: 'cold' | 'warm'): Promise<void> {
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-'))
  if (mode === 'warm') {
    const from = await userDataDir()
    if (from === null) throw new Error('warm needs the app cache, which only the Electron run can locate: drop --node')
    const cache = join(from, 'token-cache.json')
    // No cache is not a warm run at all; saying so beats reporting a cold run under the wrong label
    if (!existsSync(cache)) throw new Error(`warm needs the app cache and none exists at ${cache}: launch the app once first`)
    copyFileSync(cache, join(cacheDir, 'token-cache.json'))
    console.log(`[warm] token-cache.json ${(statSync(cache).size / 1e6).toFixed(1)} MB copied from ${from}`)
    const archive = join(from, 'usage-archive.json')
    if (existsSync(archive)) copyFileSync(archive, join(cacheDir, 'usage-archive.json'))
  }
  console.log(`[mode] ${mode}, cache dir ${cacheDir}`)
  const roots = realRoots()

  let t0 = performance.now()
  const snap = await scan(roots, { now: () => Date.now() })
  console.log(`[scan()] registries, activity, global layer, memory: ${since(t0)} (projects=${snap.projects.length})`)

  t0 = performance.now()
  const engine = new TokenEngine(cacheDir)
  console.log(`[TokenEngine] load cache: ${since(t0)}`)

  // The stamp only matters for the archive's conflict rule, which a benchmark never exercises twice
  const archive = new UsageArchive(cacheDir, { stamp: 'bench' })
  const claudePaths = snap.projects.filter((p) => p.sides.includes('claude')).map((p) => p.path)
  const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
  t0 = performance.now()
  const built = await engine.build(roots, claudePaths, registered)
  console.log(
    `[TokenEngine.build] cache lookups, parses, combine, persist: ${since(t0)} (rows=${built.rows.length}, sessionFiles=${built.sessionFiles.size})`
  )

  t0 = performance.now()
  archive.merge(built.rows, Date.now())
  console.log(`[archive.merge] ${since(t0)}`)
}

async function main(): Promise<void> {
  console.log(`[runtime] ${isElectron ? `electron ${process.versions['electron']}` : `node ${process.version}`}`)
  const [mode = 'cold', ...rest] = process.argv.slice(2)
  if (mode === 'file') {
    if (rest.length === 0) throw new Error('file mode needs at least one path')
    for (const f of rest) await timeFile(f)
    return
  }
  if (mode === 'cold' || mode === 'warm') {
    await fullScan(mode)
    return
  }
  throw new Error(`unknown mode "${mode}": expected cold, warm, or file <path>…`)
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
