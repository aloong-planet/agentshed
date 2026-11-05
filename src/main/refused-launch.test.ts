// A launch the single-instance lock refused (#367): the decision and the sentence, over real directories. The expected
// sentences are written out here, so a wrong dictionary entry or a system error in the sentence fails them.
//
// Gaps, by reading only (the ticket's Evidence): the native dialog, a real full disk, and the focus of a first instance.
// e2e/refused-launch.spec.ts reads the exit code and the sentence through index.ts.
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { refusedLaunch } from './refused-launch'

const en = (dir: string): object => ({
  title: 'Agentshed can’t start',
  message: `Agentshed can’t write to its settings directory, which may be read-only or on a full disk:\n\n${dir}`
})
const zh = (dir: string): object => ({
  title: 'Agentshed 无法启动',
  message: `Agentshed 无法写入设置目录，这个目录可能是只读的，或所在磁盘已满：\n\n${dir}`
})

/** What the store writes: all five fields, and the others differ from the defaults, as a real user's file would */
const stored = (language: string): string =>
  JSON.stringify({ theme: 'blue', language, mode: 'dark', trendSpan: 90, autoCheckUpdates: false }, null, 2)

describe('refusedLaunch', () => {
  let dir: string
  beforeEach(() => {
    // A space and a CJK segment, as a real home directory can have
    dir = mkdtempSync(join(tmpdir(), 'refused launch 目录-'))
  })
  afterEach(() => {
    chmodSync(dir, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a writable directory reads as a second instance, and the probe leaves nothing behind', () => {
    expect(refusedLaunch(dir, () => ['en-US'])).toBeNull()
    expect(readdirSync(dir)).toEqual([])
  })

  it('a writable directory with a stored language still reads as a second instance, the file left alone', () => {
    writeFileSync(join(dir, 'prefs.json'), stored('zh'))
    expect(refusedLaunch(dir, () => ['en-US'])).toBeNull()
    expect(readdirSync(dir)).toEqual(['prefs.json'])
    expect(readFileSync(join(dir, 'prefs.json'), 'utf8')).toBe(stored('zh'))
  })

  describe.skipIf(process.getuid?.() === 0)('a directory that cannot be written', () => {
    it('names it in the stored English, over a Chinese system, and leaves nothing behind', () => {
      writeFileSync(join(dir, 'prefs.json'), stored('en'))
      chmodSync(dir, 0o555)
      expect(refusedLaunch(dir, () => ['zh-CN'])).toEqual(en(dir))
      expect(readdirSync(dir)).toEqual(['prefs.json'])
    })

    it('names it in the stored Chinese, over an English system', () => {
      writeFileSync(join(dir, 'prefs.json'), stored('zh'))
      chmodSync(dir, 0o555)
      expect(refusedLaunch(dir, () => ['en-US'])).toEqual(zh(dir))
    })

    it('uses the system\'s language with no preference file', () => {
      chmodSync(dir, 0o555)
      expect(refusedLaunch(dir, () => ['zh-CN'])).toEqual(zh(dir))
      expect(refusedLaunch(dir, () => ['en-US'])).toEqual(en(dir))
    })

    it('uses the system\'s language when the preference file cannot be read: what it stores is not reached', () => {
      const file = join(dir, 'prefs.json')
      writeFileSync(file, stored('en'))
      chmodSync(file, 0o000)
      chmodSync(dir, 0o555)
      expect(refusedLaunch(dir, () => ['zh-CN'])).toEqual(zh(dir))
    })

    it.each(['not-json', stored('system'), stored('fr')])('uses the system\'s language for a file holding %s', (content) => {
      writeFileSync(join(dir, 'prefs.json'), content)
      chmodSync(dir, 0o555)
      expect(refusedLaunch(dir, () => ['zh-CN'])).toEqual(zh(dir))
    })

    it('names a directory that does not exist under a parent that refuses', () => {
      const missing = join(dir, 'Agentshed')
      chmodSync(dir, 0o555)
      expect(refusedLaunch(missing, () => ['en-US'])).toEqual(en(missing))
    })
  })

  it('a path that is a file answers the sentence, with no write possible beneath it', () => {
    const file = join(dir, 'not-a-directory')
    writeFileSync(file, '')
    const under = join(file, 'Agentshed')
    expect(refusedLaunch(under, () => ['en-US'])).toEqual(en(under))
  })
})
