// 字节级子串搜索(票 08,spec D2):在原始 UTF-8 Buffer 上找 needle 的全部命中,
// ASCII 字母大小写不敏感——**不整体 decode + toLowerCase**(实测 391ms,比搜索
// 本身贵 17 倍)。做法:
// - needle 无 ASCII 字母 → 直接 Buffer.indexOf 循环(SIMD 快路径,实测 27ms/92MB);
// - 有字母 → 选**锚**做 indexOf 粗筛,再对候选位置做大小写折叠的逐字节精确比较。
//   锚选 needle 中最长的"无字母"字节段(中文/数字/符号,大小写无关可直接 indexOf);
//   全字母 needle 用首字母的大小写两个变体各自 indexOf 扫描。
// UTF-8 安全:多字节字符的每个字节 ≥0x80,折叠只动 0x41-0x5A/0x61-0x7A,
// 不会把中文字节误折;needle 与文本都是合法 UTF-8,跨字符字节序列不构成合法 needle。
const A = 0x41
const Z = 0x5a
const a = 0x61
const z = 0x7a

const isUpper = (b: number): boolean => b >= A && b <= Z
const isAlpha = (b: number): boolean => isUpper(b) || (b >= a && b <= z)
const fold = (b: number): number => (isUpper(b) ? b + 32 : b)

/** 候选位置精确比较:buf[pos..] 与已折叠的 needle 逐字节折叠比对 */
function foldEq(buf: Buffer, pos: number, needleFolded: Buffer): boolean {
  if (pos < 0 || pos + needleFolded.length > buf.length) return false
  for (let i = 0; i < needleFolded.length; i++) {
    if (fold(buf[pos + i]) !== needleFolded[i]) return false
  }
  return true
}

/** needle 中最长的连续"无 ASCII 字母"字节段(作大小写无关的 indexOf 锚) */
function bestAnchor(needle: Buffer): { start: number; len: number } {
  let bestStart = 0
  let bestLen = 0
  let runStart = 0
  let runLen = 0
  for (let i = 0; i <= needle.length; i++) {
    if (i < needle.length && !isAlpha(needle[i])) {
      if (runLen === 0) runStart = i
      runLen++
    } else {
      if (runLen > bestLen) {
        bestLen = runLen
        bestStart = runStart
      }
      runLen = 0
    }
  }
  return { start: bestStart, len: bestLen }
}

/**
 * 返回 needle 在 buf 中的全部命中字节偏移(允许重叠,逐字节推进)。
 * ASCII 字母大小写不敏感;空 needle 返回空。
 */
export function searchBytes(buf: Buffer, needle: string): number[] {
  if (needle === '') return []
  const nRaw = Buffer.from(needle, 'utf8')
  const nFolded = Buffer.from(nRaw.map((b) => fold(b)))
  const out: number[] = []

  const anchor = bestAnchor(nRaw)
  if (anchor.len === nRaw.length) {
    // 全程无字母:直接 SIMD indexOf 快路径
    let from = 0
    for (;;) {
      const i = buf.indexOf(nRaw, from)
      if (i === -1) break
      out.push(i)
      from = i + 1
    }
    return out
  }

  if (anchor.len > 0) {
    // 用无字母段做锚:indexOf 粗筛 → 折叠精确比较
    const anchorBuf = nRaw.subarray(anchor.start, anchor.start + anchor.len)
    let from = 0
    for (;;) {
      const i = buf.indexOf(anchorBuf, from)
      if (i === -1) break
      const pos = i - anchor.start
      if (foldEq(buf, pos, nFolded)) out.push(pos)
      from = i + 1
    }
    return out
  }

  // 全字母 needle:首字母大小写双变体各自扫描,合并去重后精确比较
  const lo = nFolded[0]
  const hi = isUpper(lo - 32) ? lo - 32 : lo
  const candidates: number[] = []
  for (const first of hi === lo ? [lo] : [lo, hi]) {
    const one = Buffer.from([first])
    let from = 0
    for (;;) {
      const i = buf.indexOf(one, from)
      if (i === -1) break
      candidates.push(i)
      from = i + 1
    }
  }
  candidates.sort((x, y) => x - y)
  let prev = -1
  for (const pos of candidates) {
    if (pos === prev) continue
    prev = pos
    if (foldEq(buf, pos, nFolded)) out.push(pos)
  }
  return out
}
