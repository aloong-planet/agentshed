// @vitest-environment jsdom
// The session page's branches for less common data (a spike beside the pilot in the test-layers spec): each of
// these went unnoticed by every other test when broken on purpose.
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionPage, SessionTurn } from '@shared/domain'
import { all, cleanup, click, installFakeApi, mountSessionPage, one, soon, text, texts, withText } from './testing/fake-app'

const FILE = '/home/u/.claude/projects/-home-u-p/a.jsonl'
const AT = new Date(2026, 9, 14, 12).getTime()
const base: SessionPage = {
  revision: 'r', file: FILE, side: 'claude', title: 'T', at: AT, tokens: 1, bytes: 1, forkState: 'none', forkPoints: 0,
  forkParentTitle: null, forkParentFile: null, sessionId: 'a',
  questions: [{ revision: 'q1', i: 1, text: 'First', at: AT, tools: 0, subagents: 0 }]
}
async function open(page: SessionPage, turns: SessionTurn[] = []): Promise<void> {
  installFakeApi({ pages: [page], turns: { [page.file]: turns } })
  mountSessionPage(page.file, undefined)
  await soon(() => expect(all('.qlist .q').length).toBeGreaterThan(0))
}
afterEach(cleanup)

describe('the session page on less common data', () => {
  it('a row with no subagents shows no count for them', async () => {
    await open(base)
    expect(all('.q .c')).toHaveLength(1)
    expect(text('.q')).toBe('01First0 12:00')
  })

  it('a question with no time shows a dash, and a session that never forked has no banner', async () => {
    await open({ ...base, questions: [{ ...base.questions[0], at: null }] })
    expect(text('.q .tm')).toBe('—')
    expect(all('.banner')).toHaveLength(0)
  })

  it('a flat list, newest first, opens the turn of the row clicked', async () => {
    const q = (i: number): SessionPage['questions'][number] => ({ revision: `q${i}`, i, text: `Q${i}`, at: null, tools: 0, subagents: 0 })
    const turn = (body: string): SessionTurn => ({ blocks: [{ kind: 'text', role: 'assistant', at: null, body }], bytesRead: 1 })
    await open({ ...base, questions: [q(1), q(2)] }, [turn('answer one'), turn('answer two')])
    click(withText('.qlist .q', 'Q2'))
    await soon(() => expect(texts('.turn .ans')).toEqual(['answer two']))
  })

  it('a Codex fork whose parent is gone names it without a link', async () => {
    installFakeApi({ pages: [{ ...base, side: 'codex', forkState: 'stripped', forkParentTitle: 'Parent' }] })
    mountSessionPage(FILE, undefined, () => {})
    await soon(() => expect(text('.banner.info')).toContain('Parent'))
    expect(all('.banner.info a')).toHaveLength(0)
  })

  it('a tool that returned nothing shows empty output, and a subagent with one step shows it', async () => {
    await open(base, [{ blocks: [
      { kind: 'tool', at: AT, name: 'exec', summary: 's', input: 'i', output: '', truncated: false },
      { kind: 'sub', at: AT, name: 'worker', prompt: 'p', steps: [{ kind: 'tool', label: 'the one step' }], result: 'r', unlinked: false }
    ], bytesRead: 1 }])
    click(one('.qlist .q'))
    await soon(() => expect(all('.turn .blk')).toHaveLength(2))
    all('.turn .bh').forEach(click)
    expect(all('.turn .blk')[0].querySelectorAll('pre')).toHaveLength(2)
    expect(text('.turn .step')).toContain('the one step')
    expect(all('.turn .blk.sub .warn')).toHaveLength(0)
  })
})
