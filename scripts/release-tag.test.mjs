// The release workflow's tag check (mac-distribution Failure A1): a tag whose version differs from the package
// version fails the run before anything is submitted to Apple. Where the check sits in the workflow is asserted
// by scripts/release-workflow.test.mjs; this file covers what the check accepts and refuses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkReleaseTag } from './release-tag.mjs'

const SCRIPT = fileURLToPath(new URL('./release-tag.mjs', import.meta.url))

test('a tag matching the package version passes and gives the version', () => {
  assert.equal(checkReleaseTag('v0.2.0', '0.2.0'), '0.2.0')
  assert.equal(checkReleaseTag('v0.1.0-beta.2', '0.1.0-beta.2'), '0.1.0-beta.2')
})

test('a tag that differs from the package version fails, naming the tag the version needs', () => {
  assert.throws(() => checkReleaseTag('v0.1.1', '0.1.0'), /the tag v0\.1\.1 does not match the package version 0\.1\.0 \(its tag is v0\.1\.0\)/)
  assert.throws(() => checkReleaseTag('0.1.0', '0.1.0'), /the tag 0\.1\.0 does not match the package version 0\.1\.0 \(its tag is v0\.1\.0\)/)
})

// The workflow tells a pre-release by a `-` in the tag (scripts/release-workflow.test.mjs), which is semver's
// pre-release only when the version is semver and carries no build metadata (whose identifiers may hold a `-`)
test('a version with build metadata, or one that is not semver, is refused even when the tag matches', () => {
  assert.throws(() => checkReleaseTag('v0.1.0+5', '0.1.0+5'), /0\.1\.0\+5 carries build metadata/)
  assert.throws(() => checkReleaseTag('v0.1.0+build-5', '0.1.0+build-5'), /carries build metadata/)
  assert.throws(() => checkReleaseTag('v0.1', '0.1'), /0\.1 is not a semver version/)
})

// The command the workflow runs: the tag from GITHUB_REF_NAME, the version from package.json in the working directory
test('the command passes a matching tag, and fails with both versions on a mismatch or with no tag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-tag-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.1.0' }))
    const run = (ref) => {
      const env = { ...process.env }
      delete env.GITHUB_REF_NAME
      if (ref !== undefined) env.GITHUB_REF_NAME = ref
      return spawnSync(process.execPath, [SCRIPT], { cwd: dir, env, encoding: 'utf8' })
    }
    const pass = run('v0.1.0')
    assert.equal(pass.status, 0, pass.stderr)
    const mismatch = run('v0.1.1')
    assert.equal(mismatch.status, 1)
    assert.match(mismatch.stderr, /the tag v0\.1\.1 does not match the package version 0\.1\.0/)
    const none = run(undefined)
    assert.equal(none.status, 1)
    assert.match(none.stderr, /GITHUB_REF_NAME is not set/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
