import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eachJsonlLine } from './jsonl'

function withFile<T>(bytes: Buffer | string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-'))
  const file = join(dir, 'a.jsonl')
  writeFileSync(file, bytes)
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

interface Hit {
  obj: Record<string, unknown>
  start: number
  end: number
}

async function collect(file: string): Promise<Hit[]> {
  const hits: Hit[] = []
  await eachJsonlLine(file, (obj, start, end) => hits.push({ obj, start, end }))
  return hits
}

/**
 * The anchor of this suite: every hit's [start,end) sliced out of the original file must decode back into
 * **its own line**.
 * That single property pins down both "offsets are bytes, not characters" and "the range includes the
 * line ending" — one byte off and
 * the slice no longer parses into the same object.
 */
function assertRoundTrip(file: string, hits: Hit[]): void {
  const raw = readFileSync(file)
  for (const h of hits) {
    const slice = raw.subarray(h.start, h.end).toString('utf8')
    expect(JSON.parse(slice.trim())).toEqual(h.obj)
  }
}

describe('eachJsonlLine — byte offsets', () => {
  test('offsets count bytes, not characters: multi-byte content does not shift the following lines', async () => {
    // '—' and '→' are 3-byte UTF-8; the emoji is 4-byte. Multi-byte characters are what this suite is about,
    // so the fixtures use non-ASCII deliberately.
    const lines = [{ i: 0, t: '—question—' }, { i: 1, t: 'ascii' }, { i: 2, t: 'emoji 🚀 mixed' }]
    const text = lines.map((o) => JSON.stringify(o)).join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1, 2])
      assertRoundTrip(file, hits)
      // The first line's start must be 0 and the last line's end must be the file length — no holes in
      // between
      expect(hits[0].start).toBe(0)
      expect(hits[hits.length - 1].end).toBe(Buffer.byteLength(text))
      // Counting characters would make the second line's start 24 (the character count) rather than the
      // byte count
      expect(hits[1].start).toBe(Buffer.byteLength(JSON.stringify(lines[0])) + 1)
    })
  })

  test('the ranges meet end to end, with no overlap and no gap', async () => {
    const text = [1, 2, 3, 4].map((i) => JSON.stringify({ i, t: '→←'.repeat(i) })).join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      for (let i = 1; i < hits.length; i++) expect(hits[i].start).toBe(hits[i - 1].end)
    })
  })

  // A 3-byte character sitting exactly on a read chunk boundary is the shape most easily cut in half.
  // highWaterMark is an implementation detail that drifts with the Node
  // version, so we do not gamble on its value — every candidate chunk size is constructed in turn, and one
  // of them is the real one.
  test.each([16 * 1024, 32 * 1024, 64 * 1024, 128 * 1024])(
    'a multi-byte character sitting exactly on the %i-byte boundary is not cut in half',
    async (boundary) => {
      const prefix = '{"t":"'
      const head = boundary - 1 - prefix.length // The second line's start
      const filler = `{"p":"${'a'.repeat(head - 9)}"}\n` // {"p":""} takes 8 bytes + \n
      expect(Buffer.byteLength(filler)).toBe(head)
      const second = `${prefix}${'→'.repeat(50)}"}\n`
      // This character's first byte lands at boundary-1 and its remaining two bytes land in the next chunk
      expect(Buffer.byteLength(filler + prefix)).toBe(boundary - 1)
      await withFile(filler + second, async (file) => {
        const hits = await collect(file)
        expect(hits).toHaveLength(2)
        expect(hits[1].obj['t']).toBe('→'.repeat(50))
        assertRoundTrip(file, hits)
      })
    }
  )

  test('a long file whose line lengths vary byte by byte: every line slices back verbatim', async () => {
    const lines: string[] = []
    for (let i = 0; i < 12000; i++) lines.push(JSON.stringify({ i, t: '→'.repeat(i % 37) + 'x'.repeat(i % 7) }))
    const text = lines.join('\n') + '\n'
    expect(Buffer.byteLength(text)).toBeGreaterThan(800_000)
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits).toHaveLength(12000)
      expect(hits.map((h) => h.obj['i'])).toEqual(lines.map((_, i) => i))
      assertRoundTrip(file, hits)
    })
  })

  test('CRLF line endings: the offsets include \\r\\n and the content still parses', async () => {
    const text = [{ i: 0, t: '→' }, { i: 1 }].map((o) => JSON.stringify(o)).join('\r\n') + '\r\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits).toHaveLength(2)
      assertRoundTrip(file, hits)
      expect(hits[hits.length - 1].end).toBe(Buffer.byteLength(text))
    })
  })

  test('a last line with no newline: still emitted, with its end at the file length', async () => {
    const text = JSON.stringify({ i: 0 }) + '\n' + JSON.stringify({ i: 1, t: 'last line, no newline' })
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1])
      expect(hits[1].end).toBe(Buffer.byteLength(text))
      assertRoundTrip(file, hits)
    })
  })

  test('empty and bad lines are skipped without disturbing the offsets of the lines after them', async () => {
    const good0 = JSON.stringify({ i: 0 })
    const bad = '{ not JSON'
    const good1 = JSON.stringify({ i: 1, t: 'after the bad line' })
    const text = `${good0}\n\n${bad}\n   \n${good1}\n`
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1])
      assertRoundTrip(file, hits)
      // A bad line only hurts itself: the offset of the line after it must still be exact
      expect(hits[1].start).toBe(
        Buffer.byteLength(`${good0}\n`) + 1 + Buffer.byteLength(`${bad}\n`) + Buffer.byteLength('   \n')
      )
    })
  })

  test('a valid JSON line whose top level is not an object does not reach the callback', async () => {
    const text = ['123', '"str"', 'null', JSON.stringify({ i: 0 })].join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0])
    })
  })

  test('a missing file throws, leaving the caller to degrade', async () => {
    await expect(eachJsonlLine(join(tmpdir(), 'no-such-dir-xyz', 'a.jsonl'), () => {})).rejects.toThrow()
  })
})
