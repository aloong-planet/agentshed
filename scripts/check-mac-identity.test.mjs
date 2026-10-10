// Tests for check-mac-identity.mjs: the parser on the real `security find-identity` output shape, and the
// CLI's exit code through a stub `security` placed first on PATH.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { developerIdIdentities } from './check-mac-identity.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-mac-identity.mjs')
const HASH = 'A'.repeat(40)
// The shape `security find-identity -v -p codesigning` prints: one numbered line per valid identity, then a count
const line = (n, name) => `  ${n}) ${HASH} "${name}"`
const DEVELOPER_ID = 'Developer ID Application: Example Dev (TEAM123456)'
const WITH_DEVELOPER_ID = [
  line(1, DEVELOPER_ID),
  line(2, 'Apple Development: Example Dev (DEVTEAM999)'),
  line(3, 'Apple Distribution: Example Dev (TEAM123456)'),
  '     3 valid identities found'
].join('\n')
const OTHER_IDENTITIES_ONLY = [
  line(1, 'Apple Development: Example Dev (DEVTEAM999)'),
  line(2, 'Apple Distribution: Example Dev (TEAM123456)'),
  '     2 valid identities found'
].join('\n')

test('finds the Developer ID Application identity among other signing identities', () => {
  assert.deepEqual(developerIdIdentities(WITH_DEVELOPER_ID), [DEVELOPER_ID])
})

test('other identity kinds do not count: development, distribution and installer certificates', () => {
  assert.deepEqual(developerIdIdentities(OTHER_IDENTITIES_ONLY), [])
  assert.deepEqual(developerIdIdentities(line(1, 'Developer ID Installer: Example Dev (TEAM123456)')), [])
})

test('no valid identities', () => {
  assert.deepEqual(developerIdIdentities('     0 valid identities found'), [])
})

/** Run the CLI with a stub `security` that prints `out` and exits with `code`. */
function runWithStub(out, code = 0) {
  const bin = mkdtempSync(join(tmpdir(), 'mac-identity-'))
  const stub = join(bin, 'security')
  writeFileSync(stub, `#!/bin/sh\ncat <<'OUT'\n${out}\nOUT\nexit ${code}\n`)
  chmodSync(stub, 0o755)
  return spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' })
}

test('CLI passes when a Developer ID Application identity is present', () => {
  const r = runWithStub(WITH_DEVELOPER_ID)
  assert.equal(r.status, 0, r.stderr)
})

test('CLI fails with install guidance when only other identities exist', () => {
  const r = runWithStub(OTHER_IDENTITIES_ONLY)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Developer ID Application/)
  assert.match(r.stderr, /security find-identity -v/)
})

test('CLI fails when the keychain query itself fails, rather than reading the empty output as "none"', () => {
  const r = runWithStub('security: SecKeychainSearchCopyNext: The specified item could not be found', 2)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /could not query the keychain/)
})
