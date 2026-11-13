// The body of the parity command (src/main/engine-parity.ts; ADR-0045). scripts/engine-parity.mjs builds the engine
// module, bundles this file with esbuild and runs it under Node: a comparison of results, not a measurement, so it
// needs no Electron.
//
//   pnpm engine:parity --side codex          every Codex rollout of the scan, parsed by both and compared
//   pnpm engine:parity <file>…               the given session files, whichever side
//
// --side repeats, and files and sides combine. AGENTSHED_HOME_OVERRIDE points it at another home, as it does the app
// (src/main/roots.ts). It exits 0 when every file was compared equal, 1 when one differs, failed or was not met, and 2
// when it cannot start: no file asked for, or a side the module does not parse yet. pnpm reports every failure as 1;
// `node scripts/engine-parity.mjs` passes the code on as it is. A relative file path is taken from the repository root.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ENGINE_BUILD, loadEngineModule } from '../src/main/engine-module'
import { MODULE_PARSES, parityExitCode, runParity, type ParseSide } from '../src/main/engine-parity'
import { runParseJob, type ParseJob } from '../src/main/providers/token-stats'
import { realRoots } from '../src/main/roots'

const SIDES: readonly ParseSide[] = ['claude', 'codex', 'grok', 'antigravity']

async function main(): Promise<number> {
  const sides: ParseSide[] = []
  const files: string[] = []
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--side') {
      files.push(resolve(args[i]))
      continue
    }
    const side = args[++i] as ParseSide
    if (!SIDES.includes(side)) {
      console.error(`--side takes one of ${SIDES.join(', ')}, not ${side ?? 'nothing'}`)
      return 2
    }
    sides.push(side)
  }
  if (sides.length === 0 && files.length === 0) {
    console.error('usage: pnpm engine:parity [--side claude|codex|grok|antigravity]… [session file]…')
    return 2
  }
  const parsed = Object.keys(MODULE_PARSES)
  const notParsed = sides.filter((side) => !MODULE_PARSES[side])
  if (notParsed.length > 0) {
    console.error(`the engine module does not parse ${notParsed.join(', ')} files yet; it parses ${parsed.length > 0 ? parsed.join(', ') : 'no side yet'}`)
    return 2
  }
  const path = process.env['AGENTSHED_PARITY_ENGINE_MODULE']
  if (!path) throw new Error('AGENTSHED_PARITY_ENGINE_MODULE is not set: run through scripts/engine-parity.mjs')
  const module = loadEngineModule({ path, build: ENGINE_BUILD })
  const moduleParse = (job: ParseJob): ReturnType<typeof runParseJob> => {
    const parse = MODULE_PARSES[job.kind]
    if (!parse) return Promise.reject(new Error(`the engine module does not parse ${job.kind} files yet`))
    return parse(module, job)
  }
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-parity-'))
  try {
    const report = await runParity({ roots: realRoots(), sides, files, typescript: runParseJob, module: moduleParse, cacheDir, concurrency: 4 })
    for (const { file, at } of report.differing) console.log(`[parity] differs at ${at}: ${file}`)
    for (const { file, message } of report.failed) console.log(`[parity] failed, ${message}: ${file}`)
    for (const file of report.missing) console.log(`[parity] not in the scan: ${file}`)
    console.log(
      `[parity] ${report.compared.length} compared, ${report.compared.length - report.differing.length} equal, ` +
        `${report.differing.length} differing, ${report.failed.length} failed, ${report.missing.length} not in the scan`
    )
    return parityExitCode(report)
  } finally {
    rmSync(cacheDir, { recursive: true, force: true })
  }
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
)
