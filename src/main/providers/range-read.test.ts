import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapLimit, readRangeBuffers, readRanges } from './range-read'

function withFile<T>(content: Buffer | string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'rr-'))
  const file = join(dir, 'f.jsonl')
  writeFileSync(file, content)
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('mapLimit (bounded concurrency, the shared utility of spec D2b)', () => {
  test('results come back in input order, regardless of completion order', async () => {
    const delays = [30, 5, 20, 1]
    const out = await mapLimit(delays, 2, async (d) => {
      await new Promise((r) => setTimeout(r, d))
      return d * 10
    })
    expect(out).toEqual([300, 50, 200, 10])
  })

  test('concurrency never exceeds the cap (the peak is measured, not taken on trust)', async () => {
    let now = 0
    let peak = 0
    await mapLimit(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      now++
      peak = Math.max(peak, now)
      await new Promise((r) => setTimeout(r, 10))
      now--
    })
    expect(peak).toBeLessThanOrEqual(4)
    // A reverse check against a vacuous pass: the cap really is being used (running serially would peg
    // the peak at 1)
    expect(peak).toBeGreaterThan(1)
  })

  test('one item throwing rejects the whole call without hanging the remaining tasks', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/require-await -- see #196
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      })
    ).rejects.toThrow('boom')
  })

  test('empty input returns an empty array', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- see #196
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
  })
})

describe('readRanges (reading by byte range, never reading whole)', () => {
  test('never reads whole: 3 small ranges from a 12 MB file read exactly the sum of those ranges', async () => {
    // Ticket 04's acceptance stated mechanically: the reason the duration is independent of file size is
    // that the volume read is independent of file size.
    // The byte count is asserted rather than wall-clock time — wall clock drifts with the page cache (as
    // the ticket states explicitly).
    const chunk = Buffer.alloc(1024 * 1024, 0x61) // 'a'
    const big = Buffer.concat(Array.from({ length: 12 }, () => chunk))
    const marks: Array<[number, string]> = [
      [0, '→head'],
      [6 * 1024 * 1024, '→mid'],
      [12 * 1024 * 1024 - 5, '→end']
    ]
    for (const [pos, text] of marks) big.write(text, pos, 'utf8')
    await withFile(big, async (file) => {
      const ranges = marks.map(([pos]) => ({ start: pos, end: Math.min(pos + 8, big.length) }))
      const r = await readRanges(file, ranges)
      expect(r.bytesRead).toBe(ranges.reduce((n, g) => n + (g.end - g.start), 0))
      expect(r.bytesRead).toBeLessThan(64) // Only tens of bytes read out of a 12 MB file
      expect(r.texts[0].startsWith('→head')).toBe(true)
      expect(r.texts[1].startsWith('→mid')).toBe(true)
    })
  })

  test('a range is a byte range: a multi-byte character slices back verbatim by offset', async () => {
    // '→' is 3-byte UTF-8: without a multi-byte character, byte offsets and character offsets coincide and
    // this case could not tell them apart.
    const line = JSON.stringify({ t: '→multi→byte→content→' })
    await withFile(line, async (file) => {
      const r = await readRanges(file, [{ start: 0, end: Buffer.byteLength(line) }])
      expect(JSON.parse(r.texts[0])).toEqual({ t: '→multi→byte→content→' })
    })
  })

  test('a range past the end of the file is truncated to what is readable, without throwing or zero-padding', async () => {
    await withFile('abcdef', async (file) => {
      const r = await readRanges(file, [{ start: 4, end: 100 }])
      expect(r.texts[0]).toBe('ef')
      expect(r.bytesRead).toBe(2)
    })
  })

  test('several ranges keep their input order', async () => {
    await withFile('0123456789', async (file) => {
      const r = await readRanges(file, [
        { start: 8, end: 10 },
        { start: 0, end: 2 },
        { start: 4, end: 6 }
      ])
      expect(r.texts).toEqual(['89', '01', '45'])
    })
  })

  test('a missing file: refused rather than a silent empty array', async () => {
    await expect(readRanges(join(tmpdir(), 'no-such-rr', 'x.jsonl'), [{ start: 0, end: 1 }])).rejects.toThrow()
  })
})

describe('mapLimit\'s error convergence (the unhandledRejection hole review found)', () => {
  test('after one item throws, the rejection waits for every in-flight task to settle — leaving no dangling promise with no listener', async () => {
    let active = 0
    let stillRunningAtReject = -1
    await mapLimit([0, 1], 2, async (n) => {
      active++
      try {
        if (n === 0) {
          await new Promise((r) => setTimeout(r, 1))
          throw new Error('boom')
        }
        await new Promise((r) => setTimeout(r, 40))
        return n
      } finally {
        active--
      }
    }).catch(() => {
      stillRunningAtReject = active
    })
    // By the time the rejection propagates, the other task must have finished: otherwise its later failure
    // (an EBADF because finally already closed the fd,
    // say) is an unhandledRejection — and smoke's error grep catches exactly that word
    expect(stillRunningAtReject).toBe(0)
  })
})

describe('a cold rollout (.jsonl.zst): ranges are served from one streaming decompression per call (spec session-view C2)', () => {
  /** A plain file and its compressed twin side by side; the ranges are the plain file's byte ranges */
  function withTwins<T>(fn: (plain: string, cold: string, size: number) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'rr-cold-'))
    const lines: string[] = []
    for (let i = 0; i < 4000; i++) lines.push(JSON.stringify({ i, text: 'line ' + i + ' ' + 'x'.repeat(i % 97) }))
    const content = Buffer.from(lines.join('\n') + '\n')
    const plain = join(dir, 'f.jsonl')
    const cold = join(dir, 'f.jsonl.zst')
    writeFileSync(plain, content)
    writeFileSync(cold, zstdCompressSync(content))
    return fn(plain, cold, content.length).finally(() => rmSync(dir, { recursive: true, force: true }))
  }

  test('the bytes of several ranges equal the plain twin\'s, in input order, and the call traverses exactly up to the last range\'s end', async () => {
    await withTwins(async (plain, cold, size) => {
      // Ranges out of order and one near the end: served in input order from one pass
      const ranges = [{ start: 150000, end: 150200 }, { start: 10, end: 60 }, { start: size - 300, end: size - 100 }, { start: 90000, end: 90050 }]
      const p = await readRangeBuffers(plain, ranges)
      const c = await readRangeBuffers(cold, ranges)
      expect(c.bufs.map((b) => b.toString('utf8'))).toEqual(p.bufs.map((b) => b.toString('utf8')))
      // One pass: the decompressed bytes traversed are exactly the last end, not the sum of the ranges and not several passes
      expect(c.bytesRead).toBe(size - 100)
    })
  })

  test('a range past the end of a cold rollout is truncated to what is readable, like a plain one', async () => {
    await withTwins(async (_plain, cold, size) => {
      const c = await readRangeBuffers(cold, [{ start: size - 50, end: size + 1000 }])
      expect(c.bufs[0].length).toBe(50)
    })
  })
})
