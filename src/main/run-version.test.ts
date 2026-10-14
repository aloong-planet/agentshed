// The first run after the app's version went up (app-update::REQ-004/AC-04, Failures C7–C9): the run
// compares its version with the one the previous run recorded in userData, then records its own.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { recordRunVersion } from './run-version'

describe('recordRunVersion', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-version-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  const seed = (content: string): void => writeFileSync(join(dir, 'last-run-version.json'), content)

  it('a run whose version is newer than the recorded one is the first run after an update (C7, C9)', () => {
    seed(JSON.stringify({ version: '0.1.0-beta' }))
    expect(recordRunVersion(dir, '0.1.0')).toBe(true)
  })

  it('a newer pre-release, and a formal release after its pre-releases, count as going up (E1, E2)', () => {
    seed(JSON.stringify({ version: '0.1.0-beta' }))
    expect(recordRunVersion(dir, '0.1.0-beta.2')).toBe(true)
    expect(recordRunVersion(dir, '0.1.0')).toBe(true)
  })

  it('a fresh installation, the same version and a version that went down show no post-update line (C8)', () => {
    expect(recordRunVersion(dir, '0.1.0')).toBe(false)
    expect(recordRunVersion(dir, '0.1.0')).toBe(false)
    expect(recordRunVersion(dir, '0.0.9')).toBe(false)
  })

  it('only the first run after the version went up is one: the record follows every launch', () => {
    seed(JSON.stringify({ version: '0.1.0' }))
    expect(recordRunVersion(dir, '0.2.0')).toBe(true)
    expect(recordRunVersion(dir, '0.2.0')).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'last-run-version.json'), 'utf8'))).toEqual({ version: '0.2.0' })
  })

  it.each(['', 'not json', 'null', '"0.1.0"', '{}', '{"version":7}', '{"version":"v0.1"}'])(
    'an unreadable record %j counts as missing, and is replaced by this run\'s version',
    (content) => {
      seed(content)
      expect(recordRunVersion(dir, '0.2.0')).toBe(false)
      expect(JSON.parse(readFileSync(join(dir, 'last-run-version.json'), 'utf8'))).toEqual({ version: '0.2.0' })
    }
  )

  it('a record that cannot be written does not stop the launch, and the answer still stands', () => {
    seed(JSON.stringify({ version: '0.1.0' }))
    // A directory at the temporary-file path makes the write fail for real
    mkdirSync(join(dir, `.last-run-version.json.tmp-${process.pid}`))
    expect(recordRunVersion(dir, '0.2.0')).toBe(true)
  })
})
