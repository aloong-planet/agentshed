// 按字节区间读文件(spec C2/D2b):点提问取该轮、列提问取文本、搜索回读,
// 全走这一条通路——**绝不整读**,133MB 的会话与 3MB 的会话读取量同量级。
//
// 并发上限默认 4(spec D2b:🔬 待测确认项)。热缓存实测拐点在 8,取 4 的理由是
// 它等于 Node libuv 线程池默认大小,超过 4 需同时提 UV_THREADPOOL_SIZE 才兑现;
// 冷盘数据出来前不动这个值(归宿 .scratch/scan-cold-start/)。
import { open } from 'node:fs/promises'

/** 共享的有界并发 map:结果按输入顺序返回,与完成顺序无关 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

export interface ByteRange {
  start: number
  /** 开区间上界(与 QuestionRec 的 [start, end) 同口径) */
  end: number
}

/**
 * 读出各区间的 UTF-8 文本。`bytesRead` 是实际读取的总字节数——它是"没有整读"
 * 的**证据**,测试按它断言而不是按墙钟(墙钟受页缓存影响会飘)。
 * 越过文件末尾的区间按实际可读截断;文件打不开则整体拒绝,由调用方降级。
 */
export async function readRanges(
  file: string,
  ranges: readonly ByteRange[],
  limit = 4
): Promise<{ texts: string[]; bytesRead: number }> {
  const fd = await open(file, 'r')
  let bytesRead = 0
  try {
    const texts = await mapLimit(ranges, limit, async (g) => {
      const len = Math.max(0, g.end - g.start)
      if (len === 0) return ''
      const buf = Buffer.alloc(len)
      const r = await fd.read(buf, 0, len, g.start)
      bytesRead += r.bytesRead
      return buf.subarray(0, r.bytesRead).toString('utf8')
    })
    return { texts, bytesRead }
  } finally {
    await fd.close()
  }
}
