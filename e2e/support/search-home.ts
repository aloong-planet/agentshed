// The global search fixture home, the search page's controls and the ways from a hit that cases of several features share
// (global-search, session-view, project-detail, token-stats, projects-list).
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type ElectronApplication, type Page } from '@playwright/test'

const DAY = 86_400_000
/** A moment `days` days and `min` minutes before now, an hour past the day boundary so "N days ago" holds */
const ago = (days: number, min = 0): Date => new Date(Date.now() - days * DAY - 3_600_000 + min * 60_000)
/** A moment `min` minutes after the local midnight that begins the day `days` days back, before it when negative */
function sinceMidnight(days: number, min: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return new Date(d.getTime() + min * 60_000)
}

/**
 * A Claude session in a real session's line shape (a parent/uuid chain). Question k is asked at `at(k)` and answered a
 * minute later.
 */
export function claude(home: string, cwd: string, name: string, questions: string[], days: number, at = (k: number): Date => ago(days, k * 2)): string {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, { recursive: true })
  let parent: string | null = null
  const lines = questions.flatMap((q, k) => {
    const u = `${name}-${k}`
    const a = `${name}-${k}a`
    const out = [
      JSON.stringify({ parentUuid: parent, isSidechain: false, type: 'user', message: { role: 'user', content: q }, uuid: u, timestamp: at(k).toISOString(), cwd, sessionId: name }),
      JSON.stringify({ parentUuid: u, isSidechain: false, type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, uuid: a, timestamp: new Date(at(k).getTime() + 60_000).toISOString(), cwd, sessionId: name })
    ]
    parent = a
    return out
  })
  const f = join(dir, `${name}.jsonl`)
  writeFileSync(f, lines.join('\n') + '\n')
  // The project list orders by the session file's time: an old file keeps its project low in the list
  utimesSync(f, ago(days), ago(days))
  return f
}

/** Continue a Claude session's chain with a new question, as a live session grows */
export function appendQuestion(file: string, q: string): void {
  const last = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').pop() as string) as Record<string, unknown>
  appendFileSync(file, JSON.stringify({ parentUuid: last['uuid'], isSidechain: false, type: 'user', message: { role: 'user', content: q }, uuid: `${String(last['uuid'])}-n`, timestamp: new Date().toISOString(), cwd: last['cwd'], sessionId: last['sessionId'] }) + '\n')
}

const LONG = `notarize ${'the release build, the helper tools and every nested framework, '.repeat(6)}end`

/**
 * The global search home. "notarize" hits 10 questions in 6 sessions of 5 projects; the letter x hits only the
 * 150 questions of one session (no other fixture text holds an x). Those straddle a local midnight 20 days back whatever
 * the hour: xenon 1-20 fall on the earlier day and xenon 21-150 on the later. 30 listed sessions in 27 projects.
 */
export function mkHome(): { home: string; files: Record<string, string>; paths: Record<string, string> } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gs-home-'))
  const p = (n: string): string => join(home, 'work', n)
  const paths = {
    target: p('target-proj'),
    fork: p('fork-proj'),
    stale: p('stale-proj'), // registered, never created
    twinA: join(home, 'work', 'a', 'twin'),
    twinB: join(home, 'work', 'b', 'twin'),
    empty: p('empty-proj'),
    loose: p('loose-dir') // sessions, but no registry records it
  }
  const fillers = Array.from({ length: 22 }, (_, k) => p(`filler-${String(k + 1).padStart(2, '0')}`))
  for (const d of [paths.target, paths.fork, paths.twinA, paths.twinB, paths.empty, paths.loose, ...fillers]) mkdirSync(d, { recursive: true })
  const registered = [paths.target, paths.stale, paths.twinA, paths.twinB, paths.empty, ...fillers]
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: Object.fromEntries(registered.map((r) => [r, {}])) }))
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${paths.fork}"]\ntrust_level = "trusted"\n`)

  const files: Record<string, string> = {}
  fillers.forEach((f, k) => { files[`filler${k + 1}`] = claude(home, f, `filler-${k + 1}`, [`filler question ${k + 1}`], 0) })
  files.t1 = claude(home, paths.target, 't1', [
    'How do I notarize the app?',
    'Second step after Notarize — notarize again?',
    '<b>bold</b> & <img src=y onerror=alert(1)> about notarize',
    'line one about notarize\nline two',
    LONG
  ], 20)
  // Every two minutes, never on the boundary: xenon 20 is asked 90 seconds before midnight and xenon 21 30 seconds after
  files.many = claude(home, paths.target, 'many', Array.from({ length: 150 }, (_, k) => `xenon ${k + 1}`), 20, (k) => sinceMidnight(20, (k - 20) * 2 + 0.5))
  files.stale = claude(home, paths.stale, 'stale-1', ['Notarize the stale build'], 10)
  files.twinA = claude(home, paths.twinA, 'twin-a', ['twin asks to notarize'], 15)
  files.twinB = claude(home, paths.twinB, 'twin-b', ['twin asks to notarize'], 16)
  claude(home, paths.loose, 'loose-1', ['notarize from a loose directory'], 3)

  // Codex: a parent, its fork replaying the parent's question (stripped) and an orphan fork (uncertain strip),
  // in the shape mkForkHome in session-view.spec.ts uses
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const q = (at: Date, message: string): string => JSON.stringify({ timestamp: at.toISOString(), type: 'event_msg', payload: { type: 'user_message', message } })
  const meta = (at: Date, id: string, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'session_meta', payload: { cwd: paths.fork, id, ...extra } })
  const usage = (at: Date): string =>
    JSON.stringify({ timestamp: at.toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 9, total_tokens: 59 } } } })
  const PARENT = '019fb0c0-aaaa-7af3-af7d-8505cedf1ec9'
  const CHILD = '019fb0c0-bbbb-7af3-af7d-8505cedf1ec9'
  const ORPHAN = '019fb0c0-cccc-7af3-af7d-8505cedf1ec9'
  files.parent = join(sdir, `rollout-${PARENT}.jsonl`)
  writeFileSync(files.parent, [meta(ago(4), PARENT), q(ago(4, 1), 'Parent question about signing'), usage(ago(4, 2))].join('\n') + '\n')
  files.child = join(sdir, `rollout-${CHILD}.jsonl`)
  writeFileSync(files.child, [meta(ago(2), CHILD, { forked_from_id: PARENT }), q(ago(2), 'Parent question about signing'), q(ago(2, 5), 'Child asks to notarize the fork'), usage(ago(2, 6))].join('\n') + '\n')
  files.orphan = join(sdir, `rollout-${ORPHAN}.jsonl`)
  writeFileSync(files.orphan, [meta(ago(1), ORPHAN, { forked_from_id: '019fb0c0-dead-7af3-af7d-8505cedf1ec9' }), q(ago(1, 1), 'Orphan asks to notarize too'), usage(ago(1, 2))].join('\n') + '\n')
  return { home, files, paths }
}

export const searchItem = (win: Page) => win.locator('.rail .ri').nth(2)
export const box = (win: Page) => win.locator('.gsearch .sbar input')
export const body = (win: Page) => win.locator('.gsearch .pane-body')
export const NOTARIZE_HEADER = 'Found 10 hits · 6 sessions · 5 projects'

export const exits = (win: Page) => win.locator('.pane-head .exits .sback')

/** From the search page, open the hit holding `text` and wait for its session page */
export async function openHit(win: Page, keyword: string, text: string): Promise<void> {
  await searchItem(win).click()
  await box(win).fill(keyword)
  await body(win).locator('.hit', { hasText: text }).first().click()
  await expect(win.locator('.qlist .q.located .txt')).toHaveText(text, { timeout: 15000 })
}

/** Clicks "Search Sessions…" the way the menu does: its own click handler, in the main process */
export async function clickSearchSessions(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('searchSessions')
    if (!item) throw new Error('no "Search Sessions…" item in the application menu')
    // Electron types the item's click as a bare Function; it takes no argument the handler reads
    ;(item.click as () => void)()
  })
}
