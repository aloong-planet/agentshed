#!/usr/bin/env node
// The parity command's runner (ADR-0045): builds the engine module, bundles scripts/engine-parity.entry.ts with esbuild
// against the same build, and runs it under Node. The entry's header says what it compares and how it exits.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEngine } from './build-engine.mjs'
import { engineBuildDefine } from './lib/engine-build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

const engineModule = buildEngine({ quiet: true })
const outfile = join(mkdtempSync(join(tmpdir(), 'agentshed-parity-build-')), 'engine-parity.cjs')
await build({
  entryPoints: [join(here, 'engine-parity.entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: join(repo, 'tsconfig.node.json'),
  define: engineBuildDefine(),
  outfile,
  logLevel: 'warning'
})

const env = { ...process.env, AGENTSHED_PARITY_ENGINE_MODULE: engineModule }
const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit', env })
process.exit(result.status ?? 1)
