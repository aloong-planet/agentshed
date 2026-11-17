// The turn limit (session-view, the in-turn fetch states): a turn whose body is over the limit is never read, measured
// by the index's own byte positions. The read is injected, so what is read is recorded at the read's own seam.
// Known gap: that the turn channel reads through this alone is not observable by outcome, since a second read of the
// body before the reason is thrown would show the same row. A case for it needs a seam that counts the channel's reads.
import { describe, expect, it } from 'vitest'
import type { ByteRange } from './providers/range-read'
import { readTurnRanges, turnLimitBytes } from './turn-limit'

/** A read that records every range asked for and answers each with as many dots as the range is long, capped */
function recordingRead(): { read: (source: string, ranges: readonly ByteRange[]) => Promise<{ texts: string[]; bytesRead: number }>; asked: ByteRange[][] } {
  const asked: ByteRange[][] = []
  return {
    asked,
    read: (_source, ranges) => {
      asked.push(ranges.map((r) => ({ ...r })))
      const texts = ranges.map((r) => '.'.repeat(Math.min(8, r.end - r.start)))
      return Promise.resolve({ texts, bytesRead: texts.join('').length })
    }
  }
}

describe('turnLimitBytes', () => {
  it('is 64 MiB unless the test seam lowers it to a positive number', () => {
    expect(turnLimitBytes(undefined)).toBe(67_108_864)
    expect(turnLimitBytes('')).toBe(67_108_864)
    expect(turnLimitBytes('not a number')).toBe(67_108_864)
    expect(turnLimitBytes('0')).toBe(67_108_864)
    expect(turnLimitBytes('-5')).toBe(67_108_864)
    expect(turnLimitBytes('300')).toBe(300)
  })
})

describe('readTurnRanges', () => {
  it('reads the question and the body of a turn whose body is exactly the limit', async () => {
    const { read, asked } = recordingRead()
    const got = await readTurnRanges(read, 'source', [100, 140, 140 + 67_108_864], 67_108_864)
    expect(asked).toEqual([[{ start: 100, end: 140 }, { start: 140, end: 140 + 67_108_864 }]])
    expect(got).toEqual({ question: '........', body: '........', bodyBytes: 67_108_864, bytesRead: 16 })
  })

  it('reads only the question of a turn whose body is one byte over, and never a byte past the question', async () => {
    const { read, asked } = recordingRead()
    const got = await readTurnRanges(read, 'source', [100, 140, 140 + 67_108_865], 67_108_864)
    expect(asked).toEqual([[{ start: 100, end: 140 }]])
    expect(got).toEqual({ question: '........', body: null, bodyBytes: 67_108_865, bytesRead: 8 })
  })
})
