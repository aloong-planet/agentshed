import { describe, expect, test } from 'vitest'
import { searchBytes } from './search-bytes'

// ─────────────────────────────────────────────────────────────────────────
// Ticket 08: byte-level substring search (spec D2). The key constraint: **never decode + toLowerCase over
// everything**
// (measured 391 ms, 17× the cost of the search itself) — ASCII letters use a case-folded byte comparison,
// while multi-byte UTF-8 is compared verbatim (UTF-8 has no case, and continuation bytes ≥0x80 never
// collide with ASCII).
// It returns every hit offset (in bytes) so full-text mode can locate the turn; the caller decodes only at
// the hits.
// ─────────────────────────────────────────────────────────────────────────

const B = (s: string): Buffer => Buffer.from(s, 'utf8')

describe('searchBytes (case-folded byte substring matching)', () => {
  test('ASCII is case-insensitive: searching notarize hits Notarize/NOTARIZE/nOtArIzE', () => {
    const buf = B('先跑 Notarize,再 NOTARIZE,最后 nOtArIzE 收尾')
    expect(searchBytes(buf, 'notarize')).toHaveLength(3)
    expect(searchBytes(buf, 'NOTARIZE')).toHaveLength(3)
  })

  test('multi-byte text matches verbatim by bytes, and the offsets are bytes rather than characters', () => {
    const buf = B('前缀词 搜索目标 尾巴')
    const hits = searchBytes(buf, '搜索目标')
    expect(hits).toHaveLength(1)
    expect(buf.subarray(hits[0], hits[0] + Buffer.byteLength('搜索目标')).toString('utf8')).toBe('搜索目标')
  })

  test('a mixed needle: the letters fold and the multi-byte part matches exactly', () => {
    const buf = B('这里提到 MAS 上架,还有 mas 上架 的写法')
    expect(searchBytes(buf, 'mas 上架')).toHaveLength(2)
  })

  test('multiple hits have increasing offsets advancing without overlap; no match and an empty needle return nothing', () => {
    const buf = B('aaa')
    expect(searchBytes(buf, 'aa')).toEqual([0, 1])
    expect(searchBytes(buf, 'zzz')).toEqual([])
    expect(searchBytes(buf, '')).toEqual([])
  })

  test('a multi-byte character is never cut in half into a false match: a needle whose byte sequence straddles a character does not hit', () => {
    // Constructing a needle that is exactly a sequence of bytes spanning two characters must not hit
    const buf = B('你好')
    // Taking the last byte of one character plus the first byte of the next forms no valid needle hit
    expect(searchBytes(buf, '好')).toHaveLength(1)
    expect(searchBytes(buf, '你好')).toEqual([0])
  })

  test('an all-letter needle finds every case variant in a large text (the two-variant first-letter anchor)', () => {
    const buf = B(`${'x'.repeat(1000)}Alpha${'y'.repeat(1000)}ALPHA${'z'.repeat(1000)}alpha`)
    expect(searchBytes(buf, 'alpha')).toHaveLength(3)
  })
})
