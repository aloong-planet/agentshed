#!/usr/bin/env node
// The archive restore runner (spec C16): bundles scripts/restore-archive.entry.ts with esbuild and runs it
// under Node. It needs no Electron — the archive is a JSON file — but the accounting stamp needs the
// application version, which only package.json knows, so the runner passes it in.
//
//   pnpm restore:archive --snapshot <token-cache.json> --side codex --from 2026-08-11 --to 2026-09-08
//   pnpm restore:archive ... --apply          write; without it the run is a dry run
//   pnpm restore:archive ... --user-data <dir> the app's userData; defaults to the macOS location
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

const outfile = join(mkdtempSync(join(tmpdir(), 'agentshed-restore-build-')), 'restore-archive.cjs')
await build({
  entryPoints: [join(here, 'restore-archive.entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: join(repo, 'tsconfig.node.json'),
  outfile,
  logLevel: 'warning'
})

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const env = { ...process.env, AGENTSHED_APP_VERSION: pkg.version, AGENTSHED_APP_NAME: pkg.name }
const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit', env, cwd: repo })
process.exit(result.status ?? 1)
