// The body of the parity command (src/main/engine-parity.ts; ADR-0045). scripts/engine-parity.mjs builds the engine
// module, bundles this file with esbuild and runs it under Node: a comparison of results, not a measurement, so it
// needs no Electron.
//
//   pnpm engine:parity --side <side>         every file of the scan of a side both parsers parse, parsed by both and
//                                            compared
//   pnpm engine:parity <file>…               the given session files, whichever side
//   pnpm engine:parity --walk                the session walk, the module's against the TypeScript one, and the
//                                            single-file reads that share its source (#431; removed with the
//                                            TypeScript walk)
//
// --side repeats, and files, sides and --walk combine. AGENTSHED_HOME_OVERRIDE points it at another home, as it does the app
// (src/main/roots.ts). It exits 0 when every file was compared equal, 1 when one differs, failed or was not met, and 2
// when it cannot start: no file asked for, or a side the two parsers do not both parse. pnpm reports every failure as 1;
// `node scripts/engine-parity.mjs` passes the code on as it is. A relative file path is taken from the repository root.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ENGINE_BUILD, loadEngineModule } from '../src/main/engine-module'
import { MODULE_PARSES, TYPESCRIPT_WALK, moduleWalk, parityExitCode, runParity, runWalkParity, walkParityExitCode, type ParseSide } from '../src/main/engine-parity'
import { runParseJob, type ParseJob } from '../src/main/providers/token-stats'
import { realRoots } from '../src/main/roots'

const SIDES: readonly ParseSide[] = ['claude', 'codex', 'grok', 'antigravity']

async function main(): Promise<number> {
  const sides: ParseSide[] = []
  const files: string[] = []
  let walk = false
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--walk') {
      walk = true
      continue
    }
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
  if (sides.length === 0 && files.length === 0 && !walk) {
    console.error('usage: pnpm engine:parity [--walk] [--side claude|codex|grok|antigravity]… [session file]…')
    return 2
  }
  const parsed = Object.keys(MODULE_PARSES)
  const notParsed = sides.filter((side) => !MODULE_PARSES[side])
  if (notParsed.length > 0) {
    console.error(`the parity command compares a side both the TypeScript parser and the engine module parse, and ${notParsed.join(', ')} is not one; it compares ${parsed.length > 0 ? parsed.join(', ') : 'no side now'}`)
    return 2
  }
  const path = process.env['AGENTSHED_PARITY_ENGINE_MODULE']
  if (!path) throw new Error('AGENTSHED_PARITY_ENGINE_MODULE is not set: run through scripts/engine-parity.mjs')
  const module = loadEngineModule({ path, build: ENGINE_BUILD })
  let walkCode = 0
  if (walk) {
    const report = runWalkParity(realRoots(), TYPESCRIPT_WALK, moduleWalk(module))
    for (const { what, entries } of report.compared) if (what.startsWith('walk ') || what.startsWith('remembered walk ')) console.log(`[parity] ${what}: ${entries} entries`)
    for (const { what, before, after } of report.differing) console.log(`[parity] differs at ${before} (the reading before) and ${after} (the reading after): ${what}`)
    for (const what of report.moved) console.log(`[parity] equal to the reading after only, changed while compared: ${what}`)
    for (const { what, message } of report.failed) console.log(`[parity] failed, ${message}: ${what}`)
    const metas = (kind: string): number => report.compared.filter((c) => c.what.startsWith(`${kind} meta `)).length
    console.log(
      `[parity] walk: ${report.compared.length} compared (${metas('codex')} Codex rollouts' and ${metas('grok')} Grok streams' single-file reads among them), ` +
        `${report.compared.length - report.differing.length} equal, ${report.differing.length} differing, ${report.moved.length} moved, ${report.failed.length} failed`
    )
    walkCode = walkParityExitCode(report)
    if (sides.length === 0 && files.length === 0) return walkCode
  }
  const moduleParse = (job: ParseJob): ReturnType<typeof runParseJob> => {
    const parse = MODULE_PARSES[job.kind]
    if (!parse) return Promise.reject(new Error(`the parity command does not compare ${job.kind} files`))
    return parse(module, job)
  }
  const cacheDir = mkdtempSync(join(tmpdir(), 'agentshed-parity-'))
  try {
    const report = await runParity({ roots: realRoots(), sides, files, typescript: runParseJob, module: moduleParse, cacheDir, engine: { path, build: ENGINE_BUILD }, concurrency: 4 })
    for (const { file, at } of report.differing) console.log(`[parity] differs at ${at}: ${file}`)
    for (const { file, message } of report.failed) console.log(`[parity] failed, ${message}: ${file}`)
    for (const file of report.missing) console.log(`[parity] not in the scan: ${file}`)
    console.log(
      `[parity] ${report.compared.length} compared, ${report.compared.length - report.differing.length} equal, ` +
        `${report.differing.length} differing, ${report.failed.length} failed, ${report.missing.length} not in the scan`
    )
    return Math.max(walkCode, parityExitCode(report))
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
