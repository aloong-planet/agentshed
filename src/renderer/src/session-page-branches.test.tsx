// @vitest-environment jsdom
// The session page's branches on less common data, which nothing else checks (ADR-0040). A real component tree over a
// fake of the renderer's one boundary to the main process; every payload passes the contract the preload applies, and
// a method the page was not expected to call throws.
//
// Known gaps, because no provider produces these states (add a case when one does): a sub block with inner steps
// (session-view C3), and a Codex page marked stripped with no parent file (stripReplayPrefix says uncertain there).
import { StrictMode, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionPage, SessionTurn } from '@shared/domain'
import { contractError, validateSessionPage, validateSessionTurn, type ValidateResult } from '@shared/validate'
import { DisplayClock } from './DisplayClock'
import { LanguageProvider } from './language'
import { createQueryClient } from './query-client'
import { SessionPane } from './SessionPane'
import { StartupContext } from './StartupHint'

function checked<T>(name: string, v: T, validate: (v: unknown) => ValidateResult): T {
  const r = validate(v)
  if (!r.ok) throw contractError(name, r.failure)
  return v
}

async function open(page: SessionPage, turns: SessionTurn[] = []): Promise<void> {
  checked('sessionPage', page, validateSessionPage)
  for (const t of turns) checked('sessionTurn', t, validateSessionTurn)
  const api: Record<string, unknown> = {
    getSessionPage: () => Promise.resolve(page),
    sessionFresh: () => Promise.resolve(true),
    getSessionTurn: ({ i }: { i: number }) => Promise.resolve(turns[i])
  }
  window.agentshed = new Proxy(api, {
    get: (target, key: string) => {
      if (key in target) return target[key]
      throw new Error(`the fake window.agentshed has no ${key}`)
    }
  }) as unknown as typeof window.agentshed
  render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <DisplayClock>
          <LanguageProvider lang="en">
            <StartupContext.Provider value="ready">
              <Suspense fallback={null}>
                <SessionPane file={page.file} projectName="demo-proj" projectDir="/home/u/demo-proj" stale={false} now={Date.now()} onBack={() => {}} />
              </Suspense>
            </StartupContext.Provider>
          </LanguageProvider>
        </DisplayClock>
      </QueryClientProvider>
    </StrictMode>
  )
  await waitFor(() => expect(all('.qlist .q').length).toBeGreaterThan(0))
}

const all = (selector: string, root: ParentNode = document): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(selector)]
const words = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

const AT = new Date(2026, 9, 14, 12).getTime()
const question = (i: number, over: Partial<SessionPage['questions'][number]> = {}): SessionPage['questions'][number] => ({
  revision: `q${i}`, i, text: `Q${i}`, at: AT, tools: 0, subagents: 0, ...over
})
const page = (over: Partial<SessionPage> = {}): SessionPage => ({
  revision: 'r', file: '/home/u/.claude/projects/-home-u-p/a.jsonl', side: 'claude', title: 'T', at: AT, tokens: 1, bytes: 1,
  forkState: 'none', forkPoints: 0, forkParentTitle: null, forkParentFile: null, sessionId: 'a',
  questions: [question(1)], ...over
})

afterEach(cleanup)

describe('the session page on less common data', () => {
  it('a row counts subagents only when its turn dispatched some', async () => {
    await open(page({ questions: [question(1), question(2, { subagents: 1 })] }))
    expect(all('.qlist .q').map(words)).toEqual(['02Q20 1 12:00', '01Q10 12:00'])
  })

  it('a question with no time shows a dash', async () => {
    await open(page({ questions: [question(1, { at: null })] }))
    expect(all('.q .tm').map(words)).toEqual(['—'])
  })

  it('a session has the branch banner only when it has branch points', async () => {
    await open(page({ forkPoints: 0 }))
    expect(all('.banner')).toHaveLength(0)
    cleanup()
    await open(page({ forkPoints: 1 }))
    expect(all('.banner.info').map(words).join()).toContain('This session has 1 fork point')
  })

  it('one question with no time makes the list flat, and newest first opens the turn of the row clicked', async () => {
    const answer = (body: string): SessionTurn => ({ blocks: [{ kind: 'text', role: 'assistant', at: null, body }], bytesRead: 1 })
    await open(page({ questions: [question(1), question(2, { at: null })] }), [answer('answer one'), answer('answer two')])
    expect(all('.daygrp')).toHaveLength(0)
    const [newest] = all('.qlist .q')
    expect(words(newest)).toContain('02Q2')
    fireEvent.click(newest)
    await waitFor(() => expect(all('.turn .ans').map(words)).toEqual(['answer two']))
  })

  it('a tool that returned nothing shows an empty output, and one with no record says so', async () => {
    const tool = (output: string | null): SessionTurn['blocks'][number] => ({ kind: 'tool', at: AT, name: 'exec', summary: 's', input: 'i', output, truncated: false })
    await open(page(), [{ blocks: [tool(''), tool(null)], bytesRead: 1 }])
    fireEvent.click(all('.qlist .q')[0])
    await waitFor(() => expect(all('.turn .blk')).toHaveLength(2))
    all('.turn .bh').forEach((header) => fireEvent.click(header))
    const [empty, unrecorded] = all('.turn .blk')
    expect(all('pre', empty).map(words)).toEqual(['i', ''])
    expect(all('.mnote', empty)).toHaveLength(0)
    expect(all('pre', unrecorded).map(words)).toEqual(['i'])
    expect(all('.mnote', unrecorded).map(words)).toEqual(['(no output recorded)'])
  })
})
