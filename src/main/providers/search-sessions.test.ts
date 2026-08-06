import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionMeta } from '@shared/domain'
import { TokenEngine } from './token-stats'
import { searchProjectSessions } from './search-sessions'
import type { ScanRoots } from './types'

// ─────────────────────────────────────────────────────────────────────────
// 票 08:本项目会话搜索(spec D1-D4)。
// - 提问模式:按偏移逐区间读原始字节粗筛,只对命中区间 decode+parse(D2);
//   剥离后的提问集天然不含 fork 重放副本(03b),无需折叠。
// - 全文模式:整读 + 字节匹配;命中按偏移归轮;落在展示区间之外的命中
//   (fork 已剥前缀 / 被放弃分支 / 首问前噪声区)计入 folded,不冒充可达命中(D3)。
// - 大小写:searchBytes 字节折叠(不整体 decode+toLowerCase);命中后用解析出的
//   文本复验,防 JSON 转义序列造成的字节级假命中。
// ─────────────────────────────────────────────────────────────────────────

let dir = ''
let proj = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-search-'))
  proj = join(dir, 'work', 'p1')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const roots = (): ScanRoots => ({
  claudeHome: join(dir, '.claude'),
  claudeConfigFile: join(dir, '.claude.json'),
  codexHome: join(dir, '.codex'),
  agentsSkillsDir: join(dir, '.agents', 'skills')
})

const enc = (): string => proj.replace(/[^a-zA-Z0-9]/g, '-')

function mkClaude(file: string, lines: string[]): string {
  const d = join(dir, '.claude', 'projects', enc())
  mkdirSync(d, { recursive: true })
  const f = join(d, file)
  writeFileSync(f, lines.join('\n') + '\n')
  return f
}

const TS = '2026-07-30T02:00:00.000Z'
const uL = (t: string): string =>
  JSON.stringify({ type: 'user', timestamp: TS, message: { role: 'user', content: t } })
const aL = (t: string): string =>
  JSON.stringify({ type: 'assistant', timestamp: TS, message: { role: 'assistant', content: [{ type: 'text', text: t }] } })

async function run(
  needle: string,
  fullText: boolean
): Promise<Awaited<ReturnType<typeof searchProjectSessions>>> {
  const e = new TokenEngine(join(dir, 'cache'))
  const t = await e.build(roots(), [proj])
  const sessions: SessionMeta[] = t.perProject.get(proj.toLowerCase())?.sessions ?? []
  return searchProjectSessions(e, roots(), sessions, needle, fullText)
}

describe('提问模式(默认):只搜提问,命中按会话分组', () => {
  it('命中分组、序号与文本;无命中的会话不出组;大小写不敏感', async () => {
    mkClaude('a.jsonl', [uL('帮我看下 Notarize 配置'), aL('好的'), uL('第二个问题与此无关')])
    mkClaude('b.jsonl', [uL('别的话题')])
    const r = await run('notarize', false)
    expect(r.sessionCount).toBe(1)
    expect(r.totalHits).toBe(1)
    expect(r.folded).toBe(0)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].hits[0]).toMatchObject({ i: 1, inBody: false })
    expect(r.groups[0].hits[0].text).toContain('Notarize 配置')
  })

  it('正文里的词在提问模式不命中(默认只搜提问)', async () => {
    mkClaude('a.jsonl', [uL('一个提问'), aL('回答里有 notarize 这个词')])
    const r = await run('notarize', false)
    expect(r.totalHits).toBe(0)
    expect(r.groups).toHaveLength(0)
  })

  it('空 needle 返回空结果,不报错', async () => {
    mkClaude('a.jsonl', [uL('提问')])
    const r = await run('  ', false)
    expect(r.totalHits).toBe(0)
  })
})

describe('全文模式:整读匹配,命中归轮,展示区间外折叠', () => {
  it('正文命中归到所在轮:inBody 标记 + snippet 含关键词', async () => {
    mkClaude('a.jsonl', [uL('问一'), aL('答案正文里藏着 magicword 这个词'), uL('问二'), aL('无关')])
    const r = await run('magicword', true)
    expect(r.totalHits).toBe(1)
    const hit = r.groups[0].hits[0]
    expect(hit.i).toBe(1)
    expect(hit.inBody).toBe(true)
    expect(hit.text).toContain('问一')
    expect(hit.snippet).toContain('magicword')
  })

  it('同轮"提问命中 + 正文命中"各一条;同轮多处正文命中只报一条', async () => {
    mkClaude('a.jsonl', [uL('magicword 在提问里'), aL('正文也有 magicword'), aL('再来一次 magicword')])
    const r = await run('magicword', true)
    expect(r.groups[0].hits).toHaveLength(2)
    expect(r.groups[0].hits.map((h) => h.inBody).sort()).toEqual([false, true])
  })

  it('Codex fork 已剥前缀里的命中计入 folded,不冒充可达命中(D3)', async () => {
    const d = join(dir, '.codex', 'sessions', '2026', '07', '30')
    mkdirSync(d, { recursive: true })
    const q = (ts: string, m: string): string =>
      JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message: m } })
    const meta = (ts: string, id: string, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: proj, id, ...extra } })
    const PARENT = '019f0000-aaaa-7000-8000-000000000041'
    const CHILD = '019f0000-bbbb-7000-8000-000000000042'
    writeFileSync(
      join(d, `rollout-${PARENT}.jsonl`),
      [meta('2026-07-30T01:00:00Z', PARENT), q('2026-07-30T01:00:01Z', 'magicword 在父会话里')].join('\n') + '\n'
    )
    writeFileSync(
      join(d, `rollout-${CHILD}.jsonl`),
      [
        meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
        q('2026-07-30T02:00:00Z', 'magicword 在父会话里'), // 重放副本
        q('2026-07-30T02:00:05Z', '子会话的新问')
      ].join('\n') + '\n'
    )
    const r = await run('magicword', true)
    // 父会话命中 1 条真提问;子会话的重放副本折叠——同一句话不在 fork 链每代各报一次
    expect(r.totalHits).toBe(1)
    expect(r.folded).toBe(1)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].file).toContain(PARENT)
  })
})
