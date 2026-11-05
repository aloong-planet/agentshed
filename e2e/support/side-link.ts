// What the cases on a side card's project count and the list it opens share (agents-overview::REQ-007,
// projects-list::REQ-002).
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'

const DAY = 86_400_000

/** A Claude session in a real session's line shape (a parent/uuid chain, as the other specs' homes keep it) */
function claudeSession(home: string, cwd: string, name: string, question: string, days: number): void {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, { recursive: true })
  const at = new Date(Date.now() - days * DAY - 3_600_000)
  const file = join(dir, `${name}.jsonl`)
  writeFileSync(file, [
    JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: question }, uuid: `${name}-q`, timestamp: at.toISOString(), cwd, sessionId: name }),
    JSON.stringify({ parentUuid: `${name}-q`, isSidechain: false, type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, uuid: `${name}-a`, timestamp: at.toISOString(), cwd, sessionId: name })
  ].join('\n') + '\n')
  // The list orders by the session file's time
  utimesSync(file, at, at)
}

/**
 * Claude registers live-a (a session a day ago), live-b (a session two days ago) and ghost-a (never on disk), and holds
 * one global skill and one subagent, so the other two counts are one or more; Codex registers live-a alone; Grok's data
 * directory exists with nothing registered (detected, zero); Antigravity has no data directory (not detected, zero).
 * `fillers` adds that many live projects on Claude alone, for a list long enough to take its time mounting.
 */
export function mkLinkHome(fillers = 0): { home: string; liveA: string; liveB: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-link-home-'))
  const liveA = join(home, 'live-a')
  const liveB = join(home, 'live-b')
  const ghostA = join(home, 'ghost-a')
  mkdirSync(liveA)
  mkdirSync(liveB)
  const extra = Array.from({ length: fillers }, (_, i) => join(home, `filler-${String(i).padStart(3, '0')}`))
  for (const p of extra) mkdirSync(p)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: Object.fromEntries([liveA, liveB, ghostA, ...extra].map((p) => [p, {}])) }))
  claudeSession(home, liveA, 'a1', 'Question in live-a', 1)
  claudeSession(home, liveB, 'b1', 'Question in live-b', 2)
  const skill = join(home, '.claude', 'skills', 'one-skill')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: one-skill\ndescription: A skill\n---\n\nBody\n')
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true })
  writeFileSync(join(home, '.claude', 'agents', 'one-agent.md'), '---\ndescription: A subagent\n---\nPersona.\n')
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${liveA}"]\ntrust_level = "trusted"\n`)
  mkdirSync(join(home, '.grok'), { recursive: true })
  return { home, liveA, liveB }
}

export const CLAUDE_LINE = '3 projects · 1 global skill · 1 subagent'

export const card = (win: Page, badge: 'cl' | 'cx' | 'gk' | 'ag'): Locator =>
  win.locator('.pane-head .stats .stat', { has: win.locator(`.badge.${badge}`) })
export const countOf = (win: Page, badge: 'cl' | 'cx' | 'gk' | 'ag'): Locator => card(win, badge).locator('.s .stat-link')
export const toAgents = (win: Page): Promise<void> => win.locator('.rail .ri').nth(0).click()
export const toProjects = (win: Page): Promise<void> => win.locator('.rail .ri').nth(1).click()
export const dropdown = (win: Page): Locator => win.locator('.opts .dd-trigger')
export const toggle = (win: Page): Locator => win.locator('.side input[type="checkbox"]')
export const rows = (win: Page): Locator => win.locator('.side .row .nm')

export async function chooseSide(win: Page, name: string): Promise<void> {
  await dropdown(win).click()
  await win.locator('.side-pop .dd-opt', { hasText: name }).click()
}
