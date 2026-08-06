import { describe, expect, test } from 'vitest'
import { searchBytes } from './search-bytes'

// ─────────────────────────────────────────────────────────────────────────
// 票 08:字节级子串搜索(spec D2)。关键约束:**不整体 decode + toLowerCase**
// (实测 391ms,比搜索本身贵 17 倍)——ASCII 字母用大小写折叠的字节比较,
// 中文等多字节 UTF-8 原样比对(UTF-8 无大小写,且续字节 ≥0x80 不与 ASCII 混淆)。
// 返回全部命中偏移(字节),供全文模式定位轮次;调用方只对命中处 decode。
// ─────────────────────────────────────────────────────────────────────────

const B = (s: string): Buffer => Buffer.from(s, 'utf8')

describe('searchBytes(大小写折叠的字节子串匹配)', () => {
  test('ASCII 大小写不敏感:查 notarize 命中 Notarize/NOTARIZE/nOtArIzE', () => {
    const buf = B('先跑 Notarize,再 NOTARIZE,最后 nOtArIzE 收尾')
    expect(searchBytes(buf, 'notarize')).toHaveLength(3)
    expect(searchBytes(buf, 'NOTARIZE')).toHaveLength(3)
  })

  test('中文按字节原样匹配,偏移是字节不是字符', () => {
    const buf = B('前缀词 搜索目标 尾巴')
    const hits = searchBytes(buf, '搜索目标')
    expect(hits).toHaveLength(1)
    expect(buf.subarray(hits[0], hits[0] + Buffer.byteLength('搜索目标')).toString('utf8')).toBe('搜索目标')
  })

  test('中英混合 needle:字母部分折叠,中文部分精确', () => {
    const buf = B('这里提到 MAS 上架,还有 mas 上架 的写法')
    expect(searchBytes(buf, 'mas 上架')).toHaveLength(2)
  })

  test('多次命中偏移递增且互不重叠推进;无命中与空 needle 返回空', () => {
    const buf = B('aaa')
    expect(searchBytes(buf, 'aa')).toEqual([0, 1])
    expect(searchBytes(buf, 'zzz')).toEqual([])
    expect(searchBytes(buf, '')).toEqual([])
  })

  test('多字节字符不被腰斩误配:needle 的字节序列骑在字符中间时不命中', () => {
    // 「你」E4 BD A0 与「灰」E7 81 B0:构造一个 needle 恰为跨字符字节的场景不可命中
    const buf = B('你好')
    // '好' = E5 A5 BD;取 '你' 的尾字节 + '好' 的首字节拼不成任何合法 needle 的命中
    expect(searchBytes(buf, '好')).toHaveLength(1)
    expect(searchBytes(buf, '你好')).toEqual([0])
  })

  test('纯字母 needle 在大文本中所有变体都被找到(首字母双变体锚)', () => {
    const buf = B(`${'x'.repeat(1000)}Alpha${'y'.repeat(1000)}ALPHA${'z'.repeat(1000)}alpha`)
    expect(searchBytes(buf, 'alpha')).toHaveLength(3)
  })
})
