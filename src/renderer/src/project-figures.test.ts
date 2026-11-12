// Which statistics a project's page shows (project-detail::REQ-005): the pure choice between what the window holds
// from a scan and what the page's own copy carries. That the window is handed each scan's figures, and that the
// page draws what this returns, is e2e's (e2e/project-detail.spec.ts).
import { describe, expect, it } from 'vitest'
import { emptyTokenStats, type ProjectStats, type SessionMeta } from '@shared/domain'
import { figuresFor, NO_FIGURES, windowFigures } from './project-figures'

const session = (file: string): SessionMeta => ({ side: 'claude', title: file, at: 1, tokens: 1, file, questionCount: 1, forkState: 'none' })
const stats = (file: string): ProjectStats => ({ tokens: emptyTokenStats(), sessions: [session(file)] })
const OF_A = stats('/a.jsonl')
const OF_B = stats('/b.jsonl')
const COPY = stats('/copy.jsonl')

describe('figuresFor', () => {
  it('each of two projects gets its own, from a completed scan and from saved figures alike, and not its copy\'s', () => {
    for (const scanned of [true, false]) {
      const held = windowFigures([['/work/a', OF_A], ['/work/b', OF_B]], scanned)
      expect(figuresFor(held, '/work/a', COPY), `scanned: ${scanned}`).toBe(OF_A)
      expect(figuresFor(held, '/work/b', COPY), `scanned: ${scanned}`).toBe(OF_B)
    }
  })

  it('a path that differs from the key only as the project list merges paths, by case or a trailing slash, gets that project\'s', () => {
    const held = windowFigures([['/work/proj', OF_A], ['/work/other', OF_B]], true)
    expect(figuresFor(held, '/Work/Proj/', COPY)).toBe(OF_A)
  })

  it('before any scan has completed, a project the window holds nothing for shows its copy\'s, and never another project\'s', () => {
    expect(figuresFor(windowFigures([['/work/b', OF_B]], false), '/work/a', COPY)).toBe(COPY)
    expect(figuresFor(NO_FIGURES, '/work/a', COPY)).toBe(COPY)
    expect(figuresFor(NO_FIGURES, '/work/a', null)).toBeNull()
  })

  it('once a scan has completed, a project it holds nothing for has no figures, whatever its copy carries', () => {
    expect(figuresFor(windowFigures([['/work/b', OF_B]], true), '/work/a', COPY)).toBeNull()
    expect(figuresFor(windowFigures([], true), '/work/a', COPY)).toBeNull()
  })
})
