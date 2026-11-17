// The engine module's line reader (`each_line` in engine/src/read/mod.rs), which every parse of a session file and the
// full-text search read by, holds a line to a limit (token-stats A10): a line of exactly the limit is read, one byte
// over it fails the read of its file. Each reader entry point's case, a file with such a line failing under its side's
// rule, is with that entry point's tests (token-stats.test.ts, antigravity.test.ts, full-text.test.ts).
// Known gap: past the limit the read stops, at the limit and one byte, and reads the line no further. No outcome tells
// that apart from a reader that read on to the line's end and failed then: both fail the file, and the memory case
// below bounds what either holds, not how far it read. Add a case when a seam counts the bytes a read takes.
import { afterAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type LineLimitSeam } from '../testing/engine'

const MiB = 1024 * 1024
const dir = mkdtempSync(join(tmpdir(), 'line-reader-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0

/** A session file holding `content`, as a cold rollout's zstd stream when `cold` */
function fileOf(content: Buffer, cold: boolean): string {
  const file = join(dir, `f${files++}.jsonl${cold ? '.zst' : ''}`)
  writeFileSync(file, cold ? zstdCompressSync(content) : content)
  return file
}

const seam = (): LineLimitSeam => threadEngineModule() as LineLimitSeam

describe('a line is held to the line limit (token-stats A10)', () => {
  // A limit inside the reader's first read, and one past its second, so that the line is assembled over three reads
  // and the last of them takes only what it lacks; the line follows a short one, so it starts inside a read
  test.each([16, 2 * MiB + 5].flatMap((limit) =>
    [false, true].flatMap((cold) =>
      [true, false].flatMap((lineFeed) =>
        [0, 1].map((over) => ({ limit, cold, lineFeed, over, line: over ? 'one byte over the limit' : 'of exactly the limit' }))
      )
    )
  ))('limit $limit, cold $cold, line feed $lineFeed: a line $line', ({ limit, cold, lineFeed, over }) => {
    const content = Buffer.concat([Buffer.from('{"a":1}\n'), Buffer.alloc(limit + over, 0x78), Buffer.from(lineFeed ? '\n' : '')])
    const file = fileOf(content, cold)
    seam().seamLimitLinesOf(file, limit)
    try {
      if (over) expect(() => seam().seamEachLine(file, cold)).toThrow(/could not be read to its end/)
      else expect(seam().seamEachLine(file, cold)).toBe(2)
    } finally {
      seam().seamLimitLinesOf(file, null)
    }
  })

  test('the limit is 256 MiB: a line of 268,435,456 bytes is read, one of a byte more is not', () => {
    // Files of zero bytes with no disk behind them, then a line feed; read in a process of its own, so that the line's
    // 256 MiB is held there and not by the test's
    const at = join(dir, 'at-the-limit.jsonl')
    const over = join(dir, 'over-the-limit.jsonl')
    for (const [file, length] of [[at, 268_435_456], [over, 268_435_457]] as const) {
      const fd = openSync(file, 'w')
      try {
        writeSync(fd, '\n', length)
      } finally {
        closeSync(fd)
      }
    }
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const outcome = (file) => { try { return module.exports.seamEachLine(file, false) } catch (e) { return String(e.message) } }
      console.log(JSON.stringify([outcome(process.argv[2]), outcome(process.argv[3])]))`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, at, over], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    expect(JSON.parse(run.stdout)).toEqual([1, `${over} could not be read to its end`])
  })

  // The limit lowered to 24 MiB, a line of 64 MiB with no line feed. The buffer grows by doubling, 1 MiB to 16, then to
  // the limit and one byte, and the whole of it is zeroed, so the peak shows its capacity: 24 MiB. A buffer let double
  // once more holds 32 MiB, one let grow to the line 64 MiB or more. Above the buffer, the constant: the call's own
  // cost, about 1.2 MiB as a file of one short line measured it on 2026-11-17, and for the cold rollout the zstd
  // decoder's window, 2 MiB for this frame (`zstd -lv`), and its buffers; 6 MiB in all, measured at 1.8 MiB for the
  // plain file and 4.4 MiB for the cold rollout.
  test.each([false, true])('a line past the limit grows a fresh process\'s peak by the limit and a few MiB, never the line (cold %s)', (cold) => {
    const limit = 24 * MiB
    const file = fileOf(Buffer.alloc(64 * MiB, 0x78), cold)
    // In a process of its own, so that the peak it reports is this read's alone
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, cold, limit] = [process.argv[2], process.argv[3] === 'true', Number(process.argv[4])]
      module.exports.seamLimitLinesOf(file, limit)
      const before = process.resourceUsage().maxRSS
      let outcome
      try { outcome = module.exports.seamEachLine(file, cold) } catch (e) { outcome = String(e.message) }
      console.log(JSON.stringify({ grewKiB: process.resourceUsage().maxRSS - before, outcome }))`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, file, String(cold), String(limit)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, outcome } = JSON.parse(run.stdout) as { grewKiB: number; outcome: number | string }
    expect(outcome).toBe(`${file} could not be read to its end`)
    expect(grewKiB * 1024).toBeLessThan(limit + 6 * MiB)
  })
})
