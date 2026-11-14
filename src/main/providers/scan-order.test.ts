// Scan order (token-stats, Implementation Decisions, Scan order): the one comparator every walk orders a directory's
// entries by, and the order of session files it gives. The names are the ones JavaScript's string order and a whole-path
// order each get wrong. What every side's walk gives is in token-stats.test.ts ("scan order").
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareNames, compareScanOrder } from './scan-order'
import type { ScanRoots } from './types'

const roots: ScanRoots = {
  claudeHome: '/h/.claude',
  claudeConfigFile: '/h/.claude.json',
  codexHome: '/h/.codex',
  geminiHome: '/h/.gemini',
  grokHome: '/h/.grok',
  antigravityHome: '/h/.gemini/antigravity-cli',
  agentsSkillsDir: '/h/.agents/skills'
}

describe('compareNames', () => {
  it('orders names by their UTF-8 bytes', () => {
    const names = ['zeta', 'Mike', '9', '10', '_x', 'alpha', 'a', 'a-b', 'a.d', 'bravo', 'é', '\u{1F600}', '\u{FF5E}']
    // Digits, then capitals, then `_`, then lower case; a prefix before what extends it; then two-, three- and four-byte
    // characters: U+FF5E (three bytes, EF …) before U+1F600 (four, F0 …), which UTF-16's order has the other way round
    expect([...names].sort(compareNames)).toEqual(['10', '9', 'Mike', '_x', 'a', 'a-b', 'a.d', 'alpha', 'bravo', 'zeta', 'é', '\u{FF5E}', '\u{1F600}'])
    expect(['\u{FF5E}', '\u{1F600}'].sort(), 'the order JavaScript gives, which is not the walk\'s').toEqual(['\u{1F600}', '\u{FF5E}'])
  })
})

describe('compareScanOrder', () => {
  const order = compareScanOrder(roots)

  it('takes a directory\'s files at the directory\'s place, component by component, not by the whole path', () => {
    const projects = '/h/.claude/projects'
    const files = [join(projects, 'a-b', 'x.jsonl'), join(projects, 'a', 'y.jsonl'), join(projects, 'a', 'one.jsonl'), join(projects, 'a', 'one', 'agent.jsonl')]
    // `a/…` before `a-b/…` although `-` is below `/`; directory `one` before the file `one.jsonl`
    expect([...files].sort(order)).toEqual([
      join(projects, 'a', 'one', 'agent.jsonl'),
      join(projects, 'a', 'one.jsonl'),
      join(projects, 'a', 'y.jsonl'),
      join(projects, 'a-b', 'x.jsonl')
    ])
  })

  it('takes the roots in the order a scan walks them, Codex\'s sessions before its archived sessions', () => {
    const files = [
      '/h/.gemini/antigravity-cli/conversations/a.db',
      '/h/.grok/sessions/a/s/updates.jsonl',
      '/h/.codex/archived_sessions/rollout-a.jsonl',
      '/h/.codex/sessions/2026/07/30/rollout-z.jsonl',
      '/h/.claude/projects/z/s.jsonl',
      '/elsewhere/s.jsonl'
    ]
    expect([...files].sort(order)).toEqual([
      '/h/.claude/projects/z/s.jsonl',
      '/h/.codex/sessions/2026/07/30/rollout-z.jsonl',
      '/h/.codex/archived_sessions/rollout-a.jsonl',
      '/h/.grok/sessions/a/s/updates.jsonl',
      '/h/.gemini/antigravity-cli/conversations/a.db',
      '/elsewhere/s.jsonl'
    ])
  })
})
