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
 * 本套测试的锚:每条命中的 [start,end) 从原文件切出来,必须能 decode 回**它自己那一行**。
 * 这一条同时钉死"偏移是字节不是字符"与"区间含行尾"两件事——只要偏移错一个字节,
 * 切片就 parse 不出同一个对象。
 */
function assertRoundTrip(file: string, hits: Hit[]): void {
  const raw = readFileSync(file)
  for (const h of hits) {
    const slice = raw.subarray(h.start, h.end).toString('utf8')
    expect(JSON.parse(slice.trim())).toEqual(h.obj)
  }
}

describe('eachJsonlLine — 字节偏移', () => {
  test('偏移按字节计,不按字符:多字节内容不会让后续行错位', async () => {
    const lines = [{ i: 0, t: '中文提问' }, { i: 1, t: 'ascii' }, { i: 2, t: 'emoji 🚀 混排' }]
    const text = lines.map((o) => JSON.stringify(o)).join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1, 2])
      assertRoundTrip(file, hits)
      // 首行起点必为 0,末行终点必为文件长度——中间不许有洞
      expect(hits[0].start).toBe(0)
      expect(hits[hits.length - 1].end).toBe(Buffer.byteLength(text))
      // 若按字符计,第二行起点会是 24(字符数)而不是字节数
      expect(hits[1].start).toBe(Buffer.byteLength(JSON.stringify(lines[0])) + 1)
    })
  })

  test('区间首尾相接,不重不漏', async () => {
    const text = [1, 2, 3, 4].map((i) => JSON.stringify({ i, t: '内容'.repeat(i) })).join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      for (let i = 1; i < hits.length; i++) expect(hits[i].start).toBe(hits[i - 1].end)
    })
  })

  // 3 字节字符恰好骑在读取块边界上是最容易腰斩的形态。highWaterMark 是会随 Node
  // 版本漂移的实现细节,故不赌它的值——把候选块大小逐个构造一遍,总有一个是真的。
  test.each([16 * 1024, 32 * 1024, 64 * 1024, 128 * 1024])(
    '多字节字符恰好骑在 %i 字节边界上时不被腰斩',
    async (boundary) => {
      const prefix = '{"t":"'
      const head = boundary - 1 - prefix.length // 第二行的起点
      const filler = `{"p":"${'a'.repeat(head - 9)}"}\n` // {"p":""} 占 8 字节 + \n
      expect(Buffer.byteLength(filler)).toBe(head)
      const second = `${prefix}${'中'.repeat(50)}"}\n`
      // 这个「中」的第一个字节落在 boundary-1,余下两字节落进下一块
      expect(Buffer.byteLength(filler + prefix)).toBe(boundary - 1)
      await withFile(filler + second, async (file) => {
        const hits = await collect(file)
        expect(hits).toHaveLength(2)
        expect(hits[1].obj['t']).toBe('中'.repeat(50))
        assertRoundTrip(file, hits)
      })
    }
  )

  test('长文件、行长逐字节变化:全部行都能原样切回', async () => {
    const lines: string[] = []
    for (let i = 0; i < 12000; i++) lines.push(JSON.stringify({ i, t: '中'.repeat(i % 37) + 'x'.repeat(i % 7) }))
    const text = lines.join('\n') + '\n'
    expect(Buffer.byteLength(text)).toBeGreaterThan(800_000)
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits).toHaveLength(12000)
      expect(hits.map((h) => h.obj['i'])).toEqual(lines.map((_, i) => i))
      assertRoundTrip(file, hits)
    })
  })

  test('CRLF 行尾:偏移含 \\r\\n,内容照样解析', async () => {
    const text = [{ i: 0, t: '中' }, { i: 1 }].map((o) => JSON.stringify(o)).join('\r\n') + '\r\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits).toHaveLength(2)
      assertRoundTrip(file, hits)
      expect(hits[hits.length - 1].end).toBe(Buffer.byteLength(text))
    })
  })

  test('末行无换行符:仍出且终点为文件长度', async () => {
    const text = JSON.stringify({ i: 0 }) + '\n' + JSON.stringify({ i: 1, t: '末行无换行' })
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1])
      expect(hits[1].end).toBe(Buffer.byteLength(text))
      assertRoundTrip(file, hits)
    })
  })

  test('空行与坏行跳过,但不打乱其后各行的偏移', async () => {
    const good0 = JSON.stringify({ i: 0 })
    const bad = '{ 这不是 JSON'
    const good1 = JSON.stringify({ i: 1, t: '坏行之后' })
    const text = `${good0}\n\n${bad}\n   \n${good1}\n`
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0, 1])
      assertRoundTrip(file, hits)
      // 坏行只自伤:它之后那条的偏移必须仍然精确
      expect(hits[1].start).toBe(
        Buffer.byteLength(`${good0}\n`) + 1 + Buffer.byteLength(`${bad}\n`) + Buffer.byteLength('   \n')
      )
    })
  })

  test('顶层非对象的合法 JSON 行不入回调', async () => {
    const text = ['123', '"str"', 'null', JSON.stringify({ i: 0 })].join('\n') + '\n'
    await withFile(text, async (file) => {
      const hits = await collect(file)
      expect(hits.map((h) => h.obj['i'])).toEqual([0])
    })
  })

  test('文件不存在时抛出,由调用方降级', async () => {
    await expect(eachJsonlLine(join(tmpdir(), 'no-such-dir-xyz', 'a.jsonl'), () => {})).rejects.toThrow()
  })
})
