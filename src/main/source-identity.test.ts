import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, mkdirSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sourceIdentity, questionRevision, regularTarget } from './source-identity'

it('refuses substituted symlinks and non-files while keeping a directory check distinct', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-identity-'))
  try {
    const file = join(root, 'source'), link = join(root, 'link'), dir = join(root, 'dir')
    writeFileSync(file, 'source')
    symlinkSync(file, link)
    mkdirSync(dir)
    expect(regularTarget(file)).toBe(true)
    expect(regularTarget(link)).toBe(false)
    expect(regularTarget(dir)).toBe(false)
    expect(regularTarget(dir, true)).toBe(true)
    expect(() => sourceIdentity(link)).toThrow()
    expect(() => sourceIdentity(dir)).toThrow()
    expect(() => sourceIdentity(join(root, 'missing'))).toThrow('session-file-unreadable')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('identifies the same selected question across appends but rejects an ordinal reused by another question', () => {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-identity-'))
  try {
    const file = join(root, 'source')
    writeFileSync(file, 'first question\nanswer\n')
    const before = sourceIdentity(file)
    const revision = questionRevision(before, file, 0, 15, 'first question\n')
    writeFileSync(file, 'first question\nanswer\nsecond question\n')
    expect(questionRevision(sourceIdentity(file), file, 0, 15, 'first question\n')).toBe(revision)
    expect(questionRevision(sourceIdentity(file), file, 0, 15, 'other question\n')).not.toBe(revision)
    const st = statSync(file)
    const beforeRewrite = sourceIdentity(file)
    writeFileSync(file, 'other question\nanswer\nsecond question\n')
    utimesSync(file, st.atime, st.mtime)
    expect(sourceIdentity(file)).not.toBe(beforeRewrite)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
