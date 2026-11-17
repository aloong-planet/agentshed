// Known gap: a read the system interrupts with a signal (EINTR) is taken again by the engine module's reader, which a
// cold rollout's ranges are read through (`take` in engine/src/read/mod.rs), and no seam makes a read be interrupted,
// so no case here drives that retry. Add one when a seam that interrupts a read exists.
// Known gap: a cold read whose thread cannot be started throws as it is asked for, and gives up its place among the
// reads that run at once (`readColdRanges` in cold-rollout.ts) as a read that fails does; no seam makes a thread fail to
// start, so no case drives it. Add one when such a seam exists.
// Known gap: the cold-read cases catch a read held on the thread that asked or in libuv's pool at the hold seam, which a
// read meets on its own thread before it opens the file (`before_range_read` in engine/src/seams.rs). Work the engine
// module might do on the asking thread before it starts the read's thread never meets that gate, and no case bounds it:
// a bound on its time would order by time, which these cases do not. Add one when a seam can hold that work.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEngineModule, threadEngineModule } from '../engine-module'
import { TEST_ENGINE, type HoldSeam, type PanicSeam } from '../testing/engine'
import { searchFullText } from './full-text'
import { mapLimit, readRangeBuffers, readRanges, type ByteRange } from './range-read'

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
      mapLimit([1, 2, 3], 2, (n) => (n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n)))
    ).rejects.toThrow('boom')
  })

  test('empty input returns an empty array', async () => {
    expect(await mapLimit([], 4, (x) => Promise.resolve(x))).toEqual([])
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

describe('a cold rollout (.jsonl.zst): ranges are served from one pass through its decompressed stream per call, every frame of it (spec session-view C2)', () => {
  beforeAll(() => {
    loadEngineModule(TEST_ENGINE)
  })

  const MiB = 1024 * 1024
  /** Lines past 2 MiB in all, so that the reads' 1 MiB chunks end inside lines */
  const content = Buffer.from(Array.from({ length: 32000 }, (_, i) => JSON.stringify({ i, text: 'line ' + i + ' ' + 'x'.repeat(i % 97) }) + '\n').join(''))
  /** Where a second frame begins: the line end nearest the middle */
  const middle = content.indexOf(0x0a, content.length >> 1) + 1

  /**
   * A plain file and its compressed twin side by side, the twin in one zstd frame or two. A zstd stream may hold any
   * number of frames; every cold rollout on this machine holds one (2026-11-16, 3001 files), so the second is built,
   * not sampled. The ranges are the plain file's byte ranges.
   */
  function withTwins<T>(frames: number, fn: (plain: string, cold: string, size: number) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'rr-cold-'))
    const plain = join(dir, 'f.jsonl')
    const cold = join(dir, 'f.jsonl.zst')
    writeFileSync(plain, content)
    writeFileSync(cold, frames === 1 ? zstdCompressSync(content)
      : Buffer.concat([zstdCompressSync(content.subarray(0, middle)), zstdCompressSync(content.subarray(middle))]))
    return fn(plain, cold, content.length).finally(() => rmSync(dir, { recursive: true, force: true }))
  }

  /** A file of these bytes under a cold rollout's name */
  function withCold<T>(bytes: Buffer, fn: (cold: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'rr-cold-'))
    const cold = join(dir, 'f.jsonl.zst')
    writeFileSync(cold, bytes)
    return fn(cold).finally(() => rmSync(dir, { recursive: true, force: true }))
  }

  test('in two frames: the bytes of several ranges equal the plain twin\'s, in input order, and the call traverses exactly up to the last range\'s end', async () => {
    expect(content.length).toBeGreaterThan(2 * MiB)
    await withTwins(2, async (plain, cold, size) => {
      // Out of order: one across the first chunk's end, one near the stream's end, one across the frame boundary, one
      // inside the second frame; served in input order from one pass
      const ranges = [{ start: MiB - 100, end: MiB + 100 }, { start: 10, end: 60 }, { start: size - 300, end: size - 100 },
        { start: middle - 50, end: middle + 50 }, { start: middle + 500, end: middle + 700 }]
      const p = await readRangeBuffers(plain, ranges)
      const c = await readRangeBuffers(cold, ranges)
      expect(c.bufs.map((b) => b.toString('utf8'))).toEqual(p.bufs.map((b) => b.toString('utf8')))
      // One pass: the decompressed bytes traversed are exactly the last end, not the sum of the ranges and not several passes
      expect(c.bytesRead).toBe(size - 100)
    })
  })

  test('a read stops once its last range has passed, inside a line: it is served, though the stream is cut further on (only a read that reaches the stream\'s end is judged by the byte it ends on)', async () => {
    // One line of 3 MiB of letters that barely compress; the compressed bytes cut at four fifths, so the stream ends
    // inside that line, about 2.4 MiB in. Wherever past its first MiB the read stops, it stops inside that line too.
    let x = 2463534242
    const letters = Buffer.alloc(3 * MiB)
    for (let i = 0; i < letters.length; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      letters[i] = 0x61 + ((x >>> 0) % 26)
    }
    const long = Buffer.concat([Buffer.from('{"i":0}\n{"text":"'), letters, Buffer.from('"}\n')])
    const compressed = zstdCompressSync(long)
    expect(compressed.length).toBeGreaterThan(long.length / 2)
    await withCold(compressed.subarray(0, Math.floor(compressed.length * 0.8)), async (cold) => {
      const at = MiB + 1000
      const c = await readRangeBuffers(cold, [{ start: 0, end: 8 }, { start: at, end: at + 10 }])
      expect(c.bufs.map((b) => b.toString('utf8'))).toEqual(['{"i":0}\n', long.subarray(at, at + 10).toString('utf8')])
      expect(c.bytesRead).toBe(at + 10)
    })
  })

  const full = zstdCompressSync(content)

  /** A long cold rollout: the content's frame written 128 times over, a stream of 128 copies of the content */
  const COPIES = 128
  let longDir = ''
  let long = ''
  beforeAll(() => {
    longDir = mkdtempSync(join(tmpdir(), 'rr-cold-long-'))
    long = join(longDir, 'long.jsonl.zst')
    writeFileSync(long, Buffer.concat(Array.from({ length: COPIES }, () => full)))
  })
  afterAll(() => rmSync(longDir, { recursive: true, force: true }))
  /**
   * Six cold rollouts, the content's frame each, so that the hold seam names each read alone (engine/src/seams.rs). The
   * order reads run and settle in is decided at its gate, where each read waits on its own thread until the case
   * releases it, never by how long a read takes.
   */
  let gateDir = ''
  let gated: string[] = []
  beforeAll(() => {
    gateDir = mkdtempSync(join(tmpdir(), 'rr-cold-gate-'))
    gated = Array.from({ length: 6 }, (_, k) => join(gateDir, `g${k}.jsonl.zst`))
    for (const file of gated) writeFileSync(file, full)
  })
  afterAll(() => rmSync(gateDir, { recursive: true, force: true }))
  const seam = (): HoldSeam => threadEngineModule() as HoldSeam
  /**
   * Each case's gated reads, as they settle. The places are the module's, shared by every case here: a case that fails
   * still lets its reads go, and waits for them, so that none of them holds a place in the next case.
   */
  const asked: Array<Promise<unknown>> = []
  function settling<T>(outcomes: Promise<T>): Promise<T> {
    asked.push(outcomes)
    return outcomes
  }
  afterEach(async () => {
    seam().seamReleaseReadsOf(null)
    await Promise.all(asked.splice(0))
    vi.restoreAllMocks()
  })
  /** Long enough for a read that panics at the seam's five-second valve, four times over, with a case's own steps */
  const GATED_CASE = 30_000
  /** Under the valve: a read not at the gate by then never came to it */
  const AT_THE_GATE = { timeout: 4000 }

  /** Ten bytes of the content, each read its own */
  const tenAt = (k: number): ByteRange => ({ start: 1000 * (k + 1) + k, end: 1000 * (k + 1) + k + 10 })
  const tenOf = (k: number): string => content.subarray(tenAt(k).start, tenAt(k).end).toString('utf8')
  /** Found once in the content, on its last line, outside any turn: a search of it finds one folded hit */
  const ONCE = 'line 31999 '

  /** Each read handed to the engine module from now on, by the file it reads, in the order handed */
  function watchHanded(): string[] {
    const engine = threadEngineModule()
    const handed: string[] = []
    const read = engine.readRanges.bind(engine)
    const search = engine.searchFullText.bind(engine)
    vi.spyOn(engine, 'readRanges').mockImplementation((kind, file, ranges) => {
      handed.push(file)
      return read(kind, file, ranges)
    })
    vi.spyOn(engine, 'searchFullText').mockImplementation((side, file, needle, turns) => {
      handed.push(file)
      return search(side, file, needle, turns)
    })
    return handed
  }

  /** Once the turns a settled read handed out have run: with every other read held, nothing else moves until a release */
  const quiet = (): Promise<void> => new Promise((go) => setImmediate(go))

  /**
   * Six cold reads, each held at the gate, asked in this order: three range reads, a full-text search, a second search
   * and a range read. Only the first four, the first search among them, are handed to the engine module as they are
   * asked; each one released, a range read or a search, hands its place to the first one waiting, in the order asked,
   * the second search before the range read asked after it; every read then serves what it was asked for.
   */
  async function fourPlaces(handed: string[]): Promise<void> {
    const [l1, l2, l3, s4, s5, r6] = gated
    for (const file of gated) seam().seamHoldReadsOf(file)
    const from = handed.length
    const ranges = [l1, l2, l3].map((file, k) => readRangeBuffers(file, [tenAt(k)]))
    const searches = [s4, s5].map((file) => searchFullText('codex', file, ONCE, []))
    const last = readRangeBuffers(r6, [tenAt(5)])
    const outcomes = settling(Promise.allSettled([...ranges, last, ...searches]))
    expect(handed.slice(from)).toEqual([l1, l2, l3, s4])
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual([l1, l2, l3, s4].sort())
    seam().seamReleaseReadsOf(l1)
    await ranges[0]
    await quiet()
    expect(handed.slice(from)).toEqual([l1, l2, l3, s4, s5])
    seam().seamReleaseReadsOf(s4)
    await searches[0]
    await quiet()
    expect(handed.slice(from)).toEqual([l1, l2, l3, s4, s5, r6])
    for (const file of [l2, l3, s5, r6]) seam().seamReleaseReadsOf(file)
    const settled = await outcomes
    expect(settled.slice(0, 4).map((o) => o.status === 'fulfilled' && 'bufs' in o.value && o.value.bufs.map((b) => b.toString('utf8'))))
      .toEqual([0, 1, 2, 5].map((k) => [tenOf(k)]))
    expect(settled.slice(4)).toEqual(Array(2).fill({ status: 'fulfilled', value: { folded: 1, body: [] } }))
  }

  test('at most four cold reads run at once on a thread, range reads and full-text searches alike, the others waiting their turn in the order asked (spec session-view C2)', async () => {
    const handed = watchHanded()
    await fourPlaces(handed)
    // The same once places have been handed over: still four
    await fourPlaces(handed)
  }, GATED_CASE)

  test('a cold read that fails gives up its place: after more failed reads than run at once, four places are left', async () => {
    const handed = watchHanded()
    const missing = Array.from({ length: 5 }, (_, k) => join(gateDir, `missing-${k}.jsonl.zst`))
    for (const file of missing) seam().seamHoldReadsOf(file)
    const failing = missing.map((file) => readRangeBuffers(file, [{ start: 0, end: 10 }]))
    const outcomes = settling(Promise.allSettled(failing))
    expect(handed).toEqual(missing.slice(0, 4))
    await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual(missing.slice(0, 4).sort())
    seam().seamReleaseReadsOf(missing[0])
    await expect(failing[0]).rejects.toThrow(/could not be read as far as its ranges go/)
    await quiet()
    expect(handed).toEqual(missing)
    seam().seamReleaseReadsOf(null)
    // Each fails as a missing file does, not at the valve
    expect((await outcomes).map((o) => o.status === 'rejected' && /could not be read as far as its ranges go/.test(String(o.reason))))
      .toEqual(Array(5).fill(true))
    await fourPlaces(handed)
  }, GATED_CASE)

  test('a cold read holds neither the thread that asked nor the thread pool the main process\'s file reads wait on: while four cold reads wait at the gate, a timer set before them fires and a file read asked after them settles (spec session-view C2)', async () => {
    await withFile('{"i":0}\n', async (small) => {
      const four = gated.slice(0, 4)
      for (const file of four) seam().seamHoldReadsOf(file)
      // Set before the reads are asked: a read held on this thread holds the timer back as long
      const timer = new Promise((go) => setTimeout(go, 0))
      // As many reads as run at once, and as libuv's pool has threads: held there, they would keep the file read waiting
      // until the first of them was let go
      const reads = four.map((file, k) => readRangeBuffers(file, [tenAt(k)]))
      const outcomes = settling(Promise.allSettled(reads))
      expect(await readFile(small, 'utf8')).toBe('{"i":0}\n')
      await timer
      // Still waiting at the gate, neither released nor given up at its valve
      await expect.poll(() => seam().seamReadsHeld().sort(), AT_THE_GATE).toEqual([...four].sort())
      for (const file of four) seam().seamReleaseReadsOf(file)
      expect((await outcomes).map((o) => o.status === 'fulfilled' && o.value.bufs.map((b) => b.toString('utf8'))))
        .toEqual([0, 1, 2, 3].map((k) => [tenOf(k)]))
    })
  }, GATED_CASE)

  test('memory follows the bytes in flight, never the file: a small range from each copy of a 300 MiB stream grows a fresh process\'s peak by a few MiB (spec session-view C2)', () => {
    const size = COPIES * content.length
    expect(size).toBeGreaterThan(300 * MiB)
    // In a process of its own, so that the peak it reports is this read's alone; 100 bytes of each copy, each in another
    // of the reader's chunks
    const script = `
      const module = { exports: {} }
      process.dlopen(module, process.argv[1])
      const [file, step, copies] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])]
      const ranges = Array.from({ length: copies }, (_, k) => ({ start: k * step + 10, end: k * step + 110 }))
      const before = process.resourceUsage().maxRSS
      module.exports.readRanges('codex', file, ranges).then((r) => {
        const grewKiB = process.resourceUsage().maxRSS - before
        console.log(JSON.stringify({ grewKiB, served: r.bufs.map((b) => b.toString('utf8')) }))
      })`
    const run = spawnSync(process.execPath, ['-e', script, TEST_ENGINE.path, long, String(content.length), String(COPIES)], { encoding: 'utf8' })
    expect(run.stderr).toBe('')
    const { grewKiB, served } = JSON.parse(run.stdout) as { grewKiB: number; served: string[] }
    expect(served).toEqual(Array(COPIES).fill(content.subarray(10, 110).toString('utf8')))
    // A reader that kept the stream, or a whole chunk for each range it serves, would grow it by a hundred MiB or more
    expect(grewKiB * 1024).toBeLessThan(32 * MiB)
  })

  test.each([
    ['whose stream is cut inside a line', full.subarray(0, full.length >> 1)],
    ['that is not zstd', Buffer.from('{"type":"session_meta"}\nnot zstd at all\n')]
  ])('a cold rollout %s: a read that reaches its stream\'s end rejects (spec token-stats B12)', async (_what, bytes) => {
    await withCold(bytes, async (cold) => {
      await expect(readRangeBuffers(cold, [{ start: 0, end: 10 }, { start: content.length - 10, end: content.length + 1000 }])).rejects.toThrow(/could not be read as far as its ranges go/)
    })
  })

  test('a missing cold rollout: its ranges are refused', async () => {
    const missing = join(tmpdir(), `rr-missing-${process.pid}.jsonl.zst`)
    await expect(readRangeBuffers(missing, [{ start: 0, end: 10 }])).rejects.toThrow(/could not be read as far as its ranges go/)
  })

  test('a cold rollout cut exactly at a line end reads as the shorter stream: a whole first frame, then a frame cut inside its header (spec token-stats B12)', async () => {
    const first = content.subarray(0, middle)
    await withCold(Buffer.concat([zstdCompressSync(first), zstdCompressSync(content.subarray(middle)).subarray(0, 5)]), async (cold) => {
      const c = await readRangeBuffers(cold, [{ start: 0, end: 10 }, { start: middle - 20, end: middle + 1000 }])
      expect(c.bufs.map((b) => b.toString('utf8'))).toEqual([first.subarray(0, 10).toString('utf8'), first.subarray(middle - 20).toString('utf8')])
      expect(c.bytesRead).toBe(middle)
    })
  })

  test('a panic while reading one cold rollout rejects that read alone: a read of another, started with it, is served', async () => {
    await withTwins(1, async (plain, cold) => {
      const seam = threadEngineModule() as PanicSeam
      seam.seamPanicWhileReading(cold)
      try {
        // The other rollout: the same twin under another cold name
        const other = `${plain}.other.jsonl.zst`
        writeFileSync(other, readFileSync(cold))
        const [hit, spared] = await Promise.allSettled([readRangeBuffers(cold, [{ start: 0, end: 10 }]), readRangeBuffers(other, [{ start: 0, end: 10 }])])
        expect(hit.status === 'rejected' && String(hit.reason)).toMatch(/reading .* panicked/)
        expect(spared.status === 'fulfilled' && spared.value.bufs[0].toString('utf8')).toBe(content.subarray(0, 10).toString('utf8'))
      } finally {
        seam.seamPanicWhileReading(null)
      }
    })
  })
})
