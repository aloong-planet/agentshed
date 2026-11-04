// Known gaps of the session read guards, readSessionRanges and recordFileBytes. No state a test can reach through the app
// makes these fail, so no e2e case drives them: a read failing after a good open, a close failing, a cold stream breaking
// under an unchanged signature, and the record file's stat failing after the identity check. So replacing recordFileBytes
// in getSessionPage with a bare stat leaves every test green. Below, the guards are driven at their own seam: a directory
// for the read, a file that is not zstd for the stream, a missing file for the stat. A failing close is not driven at all;
// it shares the read's catch. A case through the app needs a read seam that can inject a fault, or a delay that lets a test
// remove the file between the two calls.
import { expect, it } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync, symlinkSync, rmSync, mkdirSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeAppError } from '@shared/errors'
import { sourceIdentity, questionRevision, recordFileBytes, readSessionRanges, regularTarget } from './source-identity'

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

it('reads a session\'s ranges and its size, and any failure of either is the code, with no path in it (session-view P6)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agentshed-identity-'))
  try {
    const file = join(root, 'source.jsonl')
    writeFileSync(file, 'first\nsecond\n')
    expect(await readSessionRanges(file, [{ start: 0, end: 5 }, { start: 6, end: 12 }])).toEqual({ texts: ['first', 'second'], bytesRead: 11 })
    expect(recordFileBytes(file)).toBe(13)
    const locked = join(root, 'locked.jsonl')
    writeFileSync(locked, 'first\n')
    chmodSync(locked, 0o000)
    // A directory opens and then fails its read; a file that is not zstd fails in the cold reader's decoder
    const dir = join(root, 'dir.jsonl')
    mkdirSync(dir)
    const notZstd = join(root, 'rollout.jsonl.zst')
    writeFileSync(notZstd, 'not zstd\n')
    for (const failing of [join(root, 'missing.jsonl'), locked, dir, notZstd]) {
      const thrown: unknown = await readSessionRanges(failing, [{ start: 0, end: 5 }]).catch((e: unknown) => e)
      expect(decodeAppError(thrown)?.code, failing).toBe('session-file-unreadable')
      expect((thrown as Error).message).not.toContain(root)
    }
    let gone: unknown
    try {
      recordFileBytes(join(root, 'missing.jsonl'))
    } catch (e) {
      gone = e
    }
    expect(decodeAppError(gone)?.code).toBe('session-file-unreadable')
    expect((gone as Error).message).not.toContain(root)
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
