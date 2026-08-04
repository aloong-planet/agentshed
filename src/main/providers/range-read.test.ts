import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapLimit, readRanges } from './range-read'

function withFile<T>(content: Buffer | string, fn: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'rr-'))
  const file = join(dir, 'f.jsonl')
  writeFileSync(file, content)
  return fn(file).finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('mapLimit(有界并发,spec D2b 共享工具)', () => {
  test('结果顺序与输入一致,与完成顺序无关', async () => {
    const delays = [30, 5, 20, 1]
    const out = await mapLimit(delays, 2, async (d) => {
      await new Promise((r) => setTimeout(r, d))
      return d * 10
    })
    expect(out).toEqual([300, 50, 200, 10])
  })

  test('并发数不超过上限(实测峰值,不是信文档)', async () => {
    let now = 0
    let peak = 0
    await mapLimit(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      now++
      peak = Math.max(peak, now)
      await new Promise((r) => setTimeout(r, 10))
      now--
    })
    expect(peak).toBeLessThanOrEqual(4)
    // 反向防空过:上限真的被用起来了(串行的话峰值恒 1)
    expect(peak).toBeGreaterThan(1)
  })

  test('某项抛错则整体拒绝,但不吊死其余任务', async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      })
    ).rejects.toThrow('boom')
  })

  test('空输入返回空数组', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
  })
})

describe('readRanges(按字节区间读,绝不整读)', () => {
  test('不整读:12MB 文件读 3 个小区间,读取字节数 == 区间之和', async () => {
    // 票 04 验收的机制化表述:耗时与文件大小无关的原因是读取量与文件大小无关。
    // 断言字节数而非墙钟——墙钟受页缓存影响会飘(票里明写)。
    const chunk = Buffer.alloc(1024 * 1024, 0x61) // 'a'
    const big = Buffer.concat(Array.from({ length: 12 }, () => chunk))
    const marks: Array<[number, string]> = [
      [0, '开头'],
      [6 * 1024 * 1024, '中段'],
      [12 * 1024 * 1024 - 5, '结尾']
    ]
    for (const [pos, text] of marks) big.write(text, pos, 'utf8')
    await withFile(big, async (file) => {
      const ranges = marks.map(([pos]) => ({ start: pos, end: Math.min(pos + 6, big.length) }))
      const r = await readRanges(file, ranges)
      expect(r.bytesRead).toBe(ranges.reduce((n, g) => n + (g.end - g.start), 0))
      expect(r.bytesRead).toBeLessThan(64) // 12MB 文件只读了几十字节
      expect(r.texts[0].startsWith('开头')).toBe(true)
      expect(r.texts[1].startsWith('中段')).toBe(true)
    })
  })

  test('区间即字节区间:多字节字符按偏移原样切回', async () => {
    const line = JSON.stringify({ t: '中文提问内容' })
    await withFile(line, async (file) => {
      const r = await readRanges(file, [{ start: 0, end: Buffer.byteLength(line) }])
      expect(JSON.parse(r.texts[0])).toEqual({ t: '中文提问内容' })
    })
  })

  test('越过文件末尾的区间按实际可读截断,不抛也不补零', async () => {
    await withFile('abcdef', async (file) => {
      const r = await readRanges(file, [{ start: 4, end: 100 }])
      expect(r.texts[0]).toBe('ef')
      expect(r.bytesRead).toBe(2)
    })
  })

  test('多区间保持输入顺序', async () => {
    await withFile('0123456789', async (file) => {
      const r = await readRanges(file, [
        { start: 8, end: 10 },
        { start: 0, end: 2 },
        { start: 4, end: 6 }
      ])
      expect(r.texts).toEqual(['89', '01', '45'])
    })
  })

  test('文件不存在:拒绝而非静默空数组', async () => {
    await expect(readRanges(join(tmpdir(), 'no-such-rr', 'x.jsonl'), [{ start: 0, end: 1 }])).rejects.toThrow()
  })
})

describe('mapLimit 的错误收敛(review 发现的 unhandledRejection 口)', () => {
  test('某项抛错后,拒绝要等全部在飞任务落定——不留无人监听的悬空 promise', async () => {
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
    // 拒绝传出时另一个任务必须已经结束:否则它随后的失败(如 fd 已被 finally 关闭
    // 导致的 EBADF)就是 unhandledRejection——smoke 的错误 grep 恰好抓这个词
    expect(stillRunningAtReject).toBe(0)
  })
})
