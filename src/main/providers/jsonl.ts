// jsonl 逐行读取,并给出每行在文件里的**字节**区间。
//
// 为什么不用 readline:它只交还字符串,拿不到字节偏移;而"点提问按需取回整轮"的
// 前提正是能对源文件做 createReadStream({ start, end })(spec C2),偏移必须是字节。
// 事后用 Buffer.byteLength(line) 补算也不行——readline 吃掉了行尾(\n 还是 \r\n
// 无从分辨),补出来的偏移会逐行累积漂移。
//
// 按 0x0A 切分对 UTF-8 是安全的:多字节序列的每个续字节恒 ≥ 0x80,\n 不可能出现在
// 某个字符内部。因此只在换行处切 Buffer、整行到齐才 decode,多字节字符跨读取块也不会腰斩。
import { createReadStream } from 'node:fs'

const NEWLINE = 0x0a

/**
 * @param onLine 每条**能解析成对象**的行调用一次。
 *   `start` = 该行首字节偏移;`end` = 行尾符之后的偏移(末行无行尾符时即文件长度)。
 *   即 [start, end) 切出来是"整行 + 它的行尾符",相邻两行首尾相接、不重不漏。
 *   空行、坏行、顶层非对象的行一律跳过(活跃会话可能正写到半行),但它们占的字节
 *   照常计入偏移——跳过只自伤,不打乱其后各行。
 * @throws 文件打不开时抛出,由调用方决定降级(整份文件弃用还是记零)。
 */
export async function eachJsonlLine(
  file: string,
  onLine: (obj: Record<string, unknown>, start: number, end: number) => void
): Promise<void> {
  const emit = (line: Buffer, start: number, end: number): void => {
    if (line.length === 0) return
    const text = line.toString('utf8')
    if (!text.trim()) return
    try {
      const obj: unknown = JSON.parse(text)
      if (typeof obj === 'object' && obj !== null) onLine(obj as Record<string, unknown>, start, end)
    } catch {
      // 坏行跳过(活跃会话写入中/损坏)
    }
  }

  let pending: Buffer | null = null
  /** pending 首字节在文件中的偏移 */
  let base = 0
  const stream: AsyncIterable<Buffer> = createReadStream(file)
  for await (const chunk of stream) {
    const buf: Buffer = pending === null ? chunk : Buffer.concat([pending, chunk])
    let from = 0
    for (;;) {
      const nl = buf.indexOf(NEWLINE, from)
      if (nl === -1) break
      emit(buf.subarray(from, nl), base + from, base + nl + 1)
      from = nl + 1
    }
    pending = from < buf.length ? buf.subarray(from) : null
    base += from
  }
  if (pending !== null) emit(pending, base, base + pending.length)
}
