// `isAbsent`: what tells a path that is not there from one that could not be looked at. `chmod` can only arrange EACCES, and
// macOS privacy protection cannot be arranged at all, so the other refusals come through a stubbed `statSync`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAbsent } from './read-utils'

const refused = vi.hoisted(() => ({ code: null as string | null }))

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    statSync: (path: string) => {
      if (refused.code !== null) throw Object.assign(new Error(`${refused.code}: refused`), { code: refused.code })
      return fs.statSync(path)
    }
  }
})

describe('isAbsent', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentshed-absent-'))
  })
  afterEach(() => {
    refused.code = null
    rmSync(dir, { recursive: true, force: true })
  })

  it('a directory that is there is not absent', () => {
    mkdirSync(join(dir, 'here'))
    expect(isAbsent(join(dir, 'here'))).toBe(false)
  })

  it('one never created is absent', () => {
    expect(isAbsent(join(dir, 'never'))).toBe(true)
  })

  it('a path under a file is absent', () => {
    writeFileSync(join(dir, 'a-file'), '')
    expect(isAbsent(join(dir, 'a-file', 'under'))).toBe(true)
  })

  // EPERM is the code macOS privacy protection is expected to give, not measured (projects-list.spec.ts's header), and EIO a failing
  // volume's: neither says the path is gone
  it.each(['EACCES', 'EPERM', 'EIO'])('a stat refused with %s is not absent: it could not look', (code) => {
    refused.code = code
    expect(isAbsent(join(dir, 'anything'))).toBe(false)
  })
})
