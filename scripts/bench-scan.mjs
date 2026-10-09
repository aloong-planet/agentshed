#!/usr/bin/env node
// The startup-scan benchmark runner: bundles scripts/bench-scan.entry.ts with esbuild and runs the
// bundle under the Electron binary, so the numbers are main-process numbers. That is the whole point
// — the CONTEXT.md invariant "Main-process file I/O is measured under Electron, never under Node"
// exists because the same reader measured twelve times faster under Node, and every scan timing
// recorded before 2026-09-09 had been taken there.
//
//   pnpm bench:scan                    cold scan under Electron
//   pnpm bench:scan warm               against a copy of the app's cache
//   pnpm bench:scan file <path>…       time the line reader over specific files
//   pnpm bench:scan --node cold        the same bundle under plain Node, for the comparison
//   pnpm bench:scan workers            a cold scan on the main thread, then one on the parse pool
//
// AGENTSHED_HOME_OVERRIDE points the scan at a fixture home, exactly as it does for the app.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const args = process.argv.slice(2)
const useNode = args.includes('--node')
const passThrough = args.filter((a) => a !== '--node')

const outDir = mkdtempSync(join(tmpdir(), 'agentshed-bench-build-'))
const outfile = join(outDir, 'bench-scan.cjs')
// The parse worker is bundled beside the entry, as electron-vite builds it beside the app's main
const workerFile = join(outDir, 'parse-worker.cjs')
await build({
  entryPoints: [join(repo, 'src/main/parse-worker.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: join(repo, 'tsconfig.node.json'),
  outfile: workerFile,
  logLevel: 'warning'
})
await build({
  entryPoints: [join(here, 'bench-scan.entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // The Electron binary provides `electron`; under --node the entry never imports it
  external: ['electron'],
  tsconfig: join(repo, 'tsconfig.node.json'),
  outfile,
  logLevel: 'warning'
})

// require('electron') from Node resolves to the path of the Electron executable
const electronBin = createRequire(import.meta.url)('electron')
const bin = useNode ? process.execPath : electronBin
const env = { ...process.env }
// Electron reads this to run as plain Node; it must not be inherited into the Electron run
if (!useNode) delete env['ELECTRON_RUN_AS_NODE']
// The app's name decides where Electron looks for its userData (the live cache, for warm mode);
// a bare script under the Electron binary would otherwise be named "Electron"
env['AGENTSHED_BENCH_APP_NAME'] = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).name
env['AGENTSHED_BENCH_PARSE_WORKER'] = workerFile
const result = spawnSync(bin, [outfile, ...passThrough], { stdio: 'inherit', env, cwd: repo })
process.exit(result.status ?? 1)
