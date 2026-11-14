// The archive restore (token-stats C16) against an archive a newer build wrote in its own format
// (token-stats::REQ-006/AC-01) and one it cannot read (token-stats C8): the run says it cannot write and writes nothing.
// And from a snapshot, a copy of the token store: a dry run and an apply write what a scan of its entries would, the
// snapshot left as it was; a JSON cache file is refused. Run through its runner, the way a developer runs it; the runner
// builds the engine module and bundles the entry with esbuild, and needs no Electron. The snapshots here are made by the
// module itself, the way the application makes its store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { buildEngine } from './build-engine.mjs'
import { engineBuildDefine } from './lib/engine-build.mjs'

const RUNNER = fileURLToPath(new URL('./restore-archive.mjs', import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

const restore = (snapshot, userData, ...more) => spawnSync(process.execPath,
  [RUNNER, '--snapshot', snapshot, '--side', 'claude', '--from', '2026-01-01', '--to', '2026-01-31', '--user-data', userData, ...more],
  { encoding: 'utf8' })

/**
 * A copy of a token store holding one Claude session's entry: 7 input tokens on 2026-01-05, as the module writes the
 * store for the application (engine/src/exports/cache_entries.rs). Made in a directory of its own and copied out, so
 * that the copy is the store's file alone.
 */
function storeSnapshot(dir, version) {
  const module = { exports: {} }
  process.dlopen(module, buildEngine({ quiet: true }))
  const storeDir = join(dir, 'store')
  const store = new module.exports.TokenStore(storeDir, version)
  const file = join(dir, 'p', 's.jsonl')
  const agg = { kind: 'claude', file, projectKey: '/p', listed: true, title: 'a question', at: Date.parse('2026-01-05T02:00:00Z'), questions: [], forkPoints: 0,
    entries: [['m1', 'r1', 0, 7, 0, 0, 0, 'claude-fable-5', '2026-01-05']] }
  assert.equal(store.write([{ path: file, sig: '1:1', agg: JSON.stringify(agg) }], []), null)
  const snapshot = join(dir, 'snapshot', 'token-store.sqlite')
  mkdirSync(join(dir, 'snapshot'))
  writeFileSync(snapshot, readFileSync(join(storeDir, 'token-store.sqlite')))
  return snapshot
}

/** The cache structure version the runner's build reads, taken from the source the way the runner bundles it rather
 * than from a literal that a version bump would leave behind */
async function currentCacheVersion(dir) {
  const outfile = join(dir, 'cache-version.cjs')
  await build({
    stdin: { contents: "export { CACHE_VERSION } from './src/main/providers/token-stats'", resolveDir: REPO, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', tsconfig: join(REPO, 'tsconfig.node.json'), define: engineBuildDefine(), outfile, logLevel: 'warning'
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
    const snapshot = join(dir, 'token-store.sqlite')
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
    const snapshot = join(dir, 'token-store.sqlite')
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

test("a dry run into this build's own archive format reports the snapshot's figures and writes nothing, and an apply writes them (C16)", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-restore-test-'))
  try {
    const userData = join(dir, 'user-data')
    mkdirSync(userData)
    const bytes = JSON.stringify({ version: 2, rows: [], stamps: {}, observed: {}, superseded: [] })
    writeFileSync(join(userData, 'usage-archive.json'), bytes)
    const snapshot = storeSnapshot(dir, await currentCacheVersion(dir))
    const taken = readFileSync(snapshot)
    const dry = restore(snapshot, userData)
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /side claude, days 2026-01-01 … 2026-01-31: 1 day\(s\), 1 row\(s\)/)
    assert.match(dry.stdout, /2026-01-05 +0 +7/)
    assert.match(dry.stdout, /dry run — nothing written/)
    assert.equal(readFileSync(join(userData, 'usage-archive.json'), 'utf8'), bytes)

    const applied = restore(snapshot, userData, '--apply')
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /written 1 \(day, side\) pair\(s\)/)
    const archived = JSON.parse(readFileSync(join(userData, 'usage-archive.json'), 'utf8'))
    assert.deepEqual(archived.rows.map((r) => [r.day, r.side, r.projectKey, r.model, r.total]), [['2026-01-05', 'claude', '/p', 'claude-fable-5', 7]])
    // The snapshot is read without anything written to it or beside it
    assert.ok(readFileSync(snapshot).equals(taken))
    assert.deepEqual(readdirSync(join(dir, 'snapshot')), ['token-store.sqlite'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a JSON cache file is no snapshot: the run refuses it and writes nothing (C16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentshed-restore-test-'))
  try {
    const userData = join(dir, 'user-data')
    mkdirSync(userData)
    const bytes = JSON.stringify({ version: 2, rows: [], stamps: {}, observed: {}, superseded: [] })
    writeFileSync(join(userData, 'usage-archive.json'), bytes)
    const version = await currentCacheVersion(dir)
    const snapshot = join(dir, 'token-cache.json')
    writeFileSync(snapshot, JSON.stringify({ version, files: {} }))
    const r = restore(snapshot, userData, '--apply')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, new RegExp(`cache snapshot is version none, this build reads version ${version}`))
    assert.doesNotMatch(r.stdout, /dry run|written/)
    assert.equal(readFileSync(join(userData, 'usage-archive.json'), 'utf8'), bytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
