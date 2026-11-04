// The archive restore (token-stats C16) against an archive a newer build wrote in its own format
// (token-stats::REQ-006/AC-01) and one it cannot read (token-stats C8): the run says it cannot write and writes nothing.
// Run through its runner, the way a developer runs it; the runner bundles the entry with esbuild and needs no Electron.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const RUNNER = fileURLToPath(new URL('./restore-archive.mjs', import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

const restore = (snapshot, userData) => spawnSync(process.execPath,
  [RUNNER, '--snapshot', snapshot, '--side', 'claude', '--from', '2026-01-01', '--to', '2026-01-31', '--user-data', userData],
  { encoding: 'utf8' })

/** The cache structure version the runner's build reads, taken from the source the way the runner bundles it rather
 * than from a literal that a version bump would leave behind */
async function currentCacheVersion(dir) {
  const outfile = join(dir, 'cache-version.cjs')
  await build({
    stdin: { contents: "export { CACHE_VERSION } from './src/main/providers/token-stats'", resolveDir: REPO, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', tsconfig: join(REPO, 'tsconfig.node.json'), outfile, logLevel: 'warning'
  })
  return createRequire(import.meta.url)(outfile).CACHE_VERSION
}

test('a restore into an archive of a newer format refuses before reading the snapshot and leaves the archive as it is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-restore-test-'))
  try {
    const userData = join(dir, 'user-data')
    mkdirSync(userData)
    // A whole number far above any format version this build writes, so the case never turns into the current one
    const bytes = JSON.stringify({ version: 1_000_000, rows: [], unknownToThisBuild: true })
    writeFileSync(join(userData, 'usage-archive.json'), bytes)
    // Not a snapshot at all: reading it would fail with another error, so the refusal has to come first
    const snapshot = join(dir, 'token-cache.json')
    writeFileSync(snapshot, 'not a snapshot')
    const r = restore(snapshot, userData)
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, /usage-archive\.json is of a newer format than this build writes: nothing can be restored into it/)
    assert.doesNotMatch(r.stdout, /dry run|written/)
    assert.equal(readFileSync(join(userData, 'usage-archive.json'), 'utf8'), bytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a restore into an archive it cannot read refuses before reading the snapshot, and the file is as it was (C8)', { skip: process.getuid?.() === 0 ? 'root ignores the file mode' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-restore-test-'))
  const file = join(dir, 'user-data', 'usage-archive.json')
  try {
    mkdirSync(join(dir, 'user-data'))
    const bytes = JSON.stringify({ version: 2, rows: [], stamps: {}, observed: {}, superseded: [] })
    writeFileSync(file, bytes)
    chmodSync(file, 0o000)
    // Not a snapshot at all: reading it would fail with another error, so the refusal has to come first
    const snapshot = join(dir, 'token-cache.json')
    writeFileSync(snapshot, 'not a snapshot')
    const r = restore(snapshot, join(dir, 'user-data'))
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, /usage-archive\.json cannot be read: nothing can be restored into it/)
    assert.doesNotMatch(r.stdout, /dry run|written/)
    chmodSync(file, 0o644)
    assert.equal(readFileSync(file, 'utf8'), bytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a dry run into this build's own archive format still reports and writes nothing (C16)", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-restore-test-'))
  try {
    const userData = join(dir, 'user-data')
    mkdirSync(userData)
    const bytes = JSON.stringify({ version: 2, rows: [{ day: '2026-01-05', side: 'claude', projectKey: '/p', model: 'm', input: 7,
      output: 0, cacheRead: 0, cacheWrite: 0, total: 7 }], stamps: {}, observed: {}, superseded: [] })
    writeFileSync(join(userData, 'usage-archive.json'), bytes)
    const snapshot = join(dir, 'token-cache.json')
    writeFileSync(snapshot, JSON.stringify({ version: await currentCacheVersion(dir), files: {} }))
    const r = restore(snapshot, userData)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /dry run — nothing written/)
    assert.equal(readFileSync(join(userData, 'usage-archive.json'), 'utf8'), bytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
