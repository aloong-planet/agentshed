// @vitest-environment jsdom
// The session page's own behaviour, below the e2e seam (the test-layers spec). The fixtures' shapes are copied
// from payloads the real app returned; the path from a click to a real answer stays with the e2e cases.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionPage, SessionTurn } from '@shared/domain'
import { all, cleanup, click, installFakeApi, mountSessionPage, one, soon, text, texts, withText } from './testing/fake-app'

const CLAUDE = '/home/u/.claude/projects/-home-u-demo-proj/a.jsonl'
const CODEX = '/home/u/.codex/sessions/2026/01/01/rollout-019fb0c0-1111-7af3-af7d-8505cedf1ec2.jsonl'
const DAY1 = new Date(2026, 9, 14, 12).getTime()
const DAY2 = new Date(2026, 9, 15, 12).getTime()

const page = (file: string, side: SessionPage['side'], title: string, questions: SessionPage['questions'], sessionId: string | null): SessionPage => ({
  revision: 'r', file, side, title, at: DAY2, tokens: 3100, bytes: 2464,
  forkState: 'none', forkPoints: 0, forkParentTitle: null, forkParentFile: null, sessionId, questions
})
const claudePage = page(CLAUDE, 'claude', 'Sample question', [
  { revision: 'q1', i: 1, text: 'Sample question', at: DAY1, tools: 1, subagents: 1 },
  { revision: 'q2', i: 2, text: 'Second question', at: DAY2, tools: 0, subagents: 0 }
], 'a')
const codexPage = page(CODEX, 'codex', 'Codex side question', [
  { revision: 'q1', i: 1, text: 'Codex side question', at: DAY1, tools: 1, subagents: 1 }
], null)
const claudeTurns: SessionTurn[] = [
  {
    blocks: [
      { kind: 'think', at: DAY1, body: 'Take a look at the directory layout' },
      { kind: 'text', role: 'assistant', at: DAY1, body: 'This is the first turn reply body' },
      { kind: 'tool', at: DAY1, name: 'Bash', summary: '{ "command": "ls -la src" }', input: '{\n  "command": "ls -la src"\n}', output: '12 files in total\noutput saved to: /x/tool-results/e2e.txt', truncated: true },
      { kind: 'sub', at: DAY1, name: 'debugger', prompt: 'Check today logs', steps: [], result: 'Logs are clean, nothing unusual', unlinked: true },
      { kind: 'unknown', count: 1, types: ['agent_snapshot'] }
    ],
    bytesRead: 1944
  },
  { blocks: [], bytesRead: 520 }
]
const codexTurns: SessionTurn[] = [{
  blocks: [
    { kind: 'reason', at: DAY1, titles: ['Compare both sides directory conventions', 'Confirm the field differences'] },
    { kind: 'tool', at: DAY1, name: 'exec', summary: 'rg skills -l', input: 'rg skills -l', output: '7 files', truncated: false },
    { kind: 'sub', at: DAY1, name: 'spawn_agent', prompt: '{"task_name":"migration check"}', steps: [], result: 'Sub-task created', unlinked: true },
    { kind: 'text', role: 'assistant', at: DAY1, body: 'The two sides use different directory conventions; see the comparison.' },
    { kind: 'unknown', count: 1, types: ['event_msg/exotic_event'] }
  ],
  bytesRead: 1868
}]

async function open(file: string, onBack?: () => void): Promise<void> {
  installFakeApi({ pages: [claudePage, codexPage], turns: { [CLAUDE]: claudeTurns, [CODEX]: codexTurns } })
  mountSessionPage(file, onBack)
  await soon(() => expect(all('.qlist .q').length).toBeGreaterThan(0))
}
const question = (t: string): HTMLElement => withText('.qlist .q', t)
const answers = (): string[] => texts('.turn .ans')

afterEach(cleanup)

describe('the session page', () => {
  it('lists every question with its fields, newest first, with no paging, and back asks to leave', async () => {
    const onBack = vi.fn()
    await open(CLAUDE, onBack)
    expect(text('.pane-head .badge.cl')).toBe('CC')
    expect(text('.pane-head .stitle')).toBe('Sample question')
    expect(text('.smeta')).toContain('2 questions')
    expect(text('.smeta')).toContain('tok')
    expect(texts('.qlist .q .idx')).toEqual(['02', '01'])
    expect(texts('.qlist .q .txt')).toEqual(['Second question', 'Sample question'])
    expect(text('.qlist .q .tm')).not.toBe('—')
    expect(text('.qbar .grp-t')).toContain('Questions (main line) · 2')
    expect(text('.pane-body')).not.toContain('Loading')
    expect(text('.pane-body')).not.toContain('more')
    click(one('.sback'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('starts collapsed; a click expands that whole turn with its footnote, independently, and a second click collapses it', async () => {
    await open(CLAUDE)
    expect(all('.turn')).toHaveLength(0)
    click(question('Sample question'))
    await soon(() => expect(answers()).toEqual(['This is the first turn reply body']))
    expect(text('.qlist .q.open .txt')).toBe('Sample question')
    expect(text('.turn .fetched')).toContain('read only this turn’s byte range')
    click(question('Second question'))
    await soon(() => expect(all('.turn .fetched')).toHaveLength(2))
    expect(all('.qlist .q.open')).toHaveLength(2)
    expect(all('.turn .ans')).toHaveLength(1)
    click(question('Sample question'))
    expect(all('.turn')).toHaveLength(1)
    expect(texts('.qlist .q.open .txt')).toEqual(['Second question'])
  })

  it('groups by day, sorts both ways keeping numbers and expansion, and folding keeps what was expanded', async () => {
    await open(CLAUDE)
    expect(all('.daygrp')).toHaveLength(2)
    expect(texts('.dayhd').every((h) => h.includes(' · 1'))).toBe(true)
    expect(text('.qbar .grp-t')).toContain('2 days')
    expect(text('.qlist .q .idx')).toBe('02')
    click(question('Sample question'))
    await soon(() => expect(answers()).toEqual(['This is the first turn reply body']))
    click(withText('.qbar .seg button', 'Oldest first'))
    expect(texts('.qlist .q .idx')).toEqual(['01', '02'])
    expect(texts('.qlist .q.open .idx')).toEqual(['01'])
    expect(answers()).toEqual(['This is the first turn reply body'])
    const day = one('.dayhd', all('.daygrp').find((g) => g.querySelector('.q.open')))
    const label = (day.textContent ?? '').split(' · ')[0].trim()
    click(day)
    expect(all('.q.open')).toHaveLength(0)
    expect(all('.turn')).toHaveLength(0)
    click(withText('.dayhd', label))
    expect(all('.q.open')).toHaveLength(1)
    expect(answers()).toEqual(['This is the first turn reply body'])
    click(one('.qbar .lnk'))
    expect(all('.qlist .q')).toHaveLength(0)
    expect(text('.qbar .lnk')).toBe('Expand all')
    click(one('.qbar .lnk'))
    expect(all('.qlist .q')).toHaveLength(2)
  })

  it('Claude rich content: blocks start collapsed and open to their full text and labels, and unknown records leave a trace', async () => {
    await open(CLAUDE)
    click(question('Sample question'))
    await soon(() => expect(answers()).toEqual(['This is the first turn reply body']))
    expect(all('.turn .blk')).toHaveLength(3)
    expect(all('.turn .bb')).toHaveLength(0)
    const think = one('.turn .blk.think')
    expect(text('.nm', think)).toBe('Thinking')
    click(one('.bh', think))
    expect(text('.bb', think)).toContain('Take a look at the directory layout')
    const tool = withText('.turn .blk', 'Bash')
    expect(text('.sum', tool)).toContain('ls -la src')
    click(one('.bh', tool))
    expect(texts('pre', tool)[0]).toContain('ls -la src')
    expect(texts('pre', tool)[1]).toContain('12 files in total')
    expect(text('.warn', tool)).toContain('only stored a truncated version')
    const sub = one('.turn .blk.sub')
    expect(text('.nm', sub)).toContain('debugger')
    click(one('.bh', sub))
    expect(texts('pre', sub)[0]).toContain('Check today logs')
    expect(all('.step', sub)).toHaveLength(0)
    expect(text('.warn', sub)).toContain('stable reference chain')
    expect(texts('pre', sub)[1]).toContain('Logs are clean')
    expect(text('.turn .unknown')).toContain('1 unrecognised record')
    expect(text('.turn .unknown')).toContain('agent_snapshot')
  })

  it('Codex rich content: reasoning headings with the encrypted label, tool pairing, the unattributed spawn, and unknown events', async () => {
    await open(CODEX)
    click(question('Codex side question'))
    await soon(() => expect(text('.turn .ans')).toContain('The two sides use different directory conventions'))
    const reason = one('.turn .blk.think')
    expect(text('.sum', reason)).toContain('only 2 headings')
    click(one('.bh', reason))
    expect(text('.warn', reason)).toContain('encrypted_content')
    expect(all('.rt', reason)).toHaveLength(2)
    const tool = withText('.turn .blk', 'exec')
    click(one('.bh', tool))
    expect(texts('pre', tool)[0]).toContain('rg skills -l')
    expect(texts('pre', tool)[1]).toContain('7 files')
    const sub = one('.turn .blk.sub')
    click(one('.bh', sub))
    expect(text('.warn', sub)).toContain('stable reference chain')
    expect(texts('pre', sub)[1]).toContain('Sub-task created')
    expect(text('.turn .unknown')).toContain('event_msg/exotic_event')
  })
})
