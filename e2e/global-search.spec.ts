// E2E: global search (docs/specs/global-search.md) under the built Electron app, over a fixture home — the
// rail item and the page, typing and the grouped results, the reading state, a hit opening its session
// inside its project, the page kept for the run, the results following the data, the session page's two
// exits from a hit — back to the results as left, or on into the project — each kept on one line, and ⌘⇧F with
// the Edit menu's "Search Sessions…" opening the page with the focus in its box.
//
// Known gaps, recorded rather than faked:
//   - The untitled fallback (US-001/AC-06) is unreachable: every listed session has a title, since the
//     indexers fall back to the file name.
//   - A reading that fails as a whole (S15) has no seam in the running app; the results area's branch for it is
//     the presentation unit's, the main side the corpus's.
//   - The key press ⌘⇧F itself: in the test's window neither Playwright's key press nor
//     webContents.sendInputEvent reaches the application menu (measured 2026-10-20 with the existing ⌘, item).
//     The binding is asserted on the installed item, and the handler is run through the item's own click, as the
//     application menu's e2e runs its items. Re-test: by hand, ⌘⇧F in a running app from settings, a session page
//     and the search page itself shows the page with the cursor in the box; automate it once a key event reaches
//     the menu in the test's window.
//   - A hit row with no width yet (session-view's hit-row failure item) is unreachable: the search page and the
//     Sessions tab unmount when left, and no hit row is mounted hidden. Re-test once a page keeps hit rows mounted
//     while hidden: show it and assert its rows are judged.
//   - The hit-row case's "in view" measure lays out an ellipsis probe in the row and compares overflow, as the
//     component does, so a mis-measured ellipsis common to both would not show; its independent anchor is the
//     window sized from the highlight's own box and an ellipsis measured another way, on a canvas given the row's
//     font (the highlight left 1–2px inside that ellipsis from the edge).
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { ERR } from '../src/shared/errors'

interface Launched {
  app: ElectronApplication
  win: Page
  errors: string[]
  userData: string
}

/** The same launcher as app.spec.ts: an isolated userData, a fixture home, the window not shown, English */
async function launch(home: string, extraEnv: Record<string, string> = {}, userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gs-'))): Promise<Launched> {
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US', ...extraEnv }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:|\[parse-pool\]/.test(t)) errors.push(t.trim())
  })
  return { app, win: await app.firstWindow(), errors, userData }
}

const DAY = 86_400_000
/** A moment `days` days and `min` minutes before now, an hour past the day boundary so "N days ago" holds */
const ago = (days: number, min = 0): Date => new Date(Date.now() - days * DAY - 3_600_000 + min * 60_000)

/** A Claude session in a real session's line shape (a parent/uuid chain, as app.spec.ts's homes keep it) */
function claude(home: string, cwd: string, name: string, questions: string[], days: number): string {
  const dir = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, { recursive: true })
  let parent: string | null = null
  const lines = questions.flatMap((q, k) => {
    const u = `${name}-${k}`
    const a = `${name}-${k}a`
    const out = [
      JSON.stringify({ parentUuid: parent, isSidechain: false, type: 'user', message: { role: 'user', content: q }, uuid: u, timestamp: ago(days, k * 2).toISOString(), cwd, sessionId: name }),
      JSON.stringify({ parentUuid: u, isSidechain: false, type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, uuid: a, timestamp: ago(days, k * 2 + 1).toISOString(), cwd, sessionId: name })
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
function appendQuestion(file: string, q: string): void {
  const last = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').pop() as string) as Record<string, unknown>
  appendFileSync(file, JSON.stringify({ parentUuid: last['uuid'], isSidechain: false, type: 'user', message: { role: 'user', content: q }, uuid: `${String(last['uuid'])}-n`, timestamp: new Date().toISOString(), cwd: last['cwd'], sessionId: last['sessionId'] }) + '\n')
}

const LONG = `notarize ${'the release build, the helper tools and every nested framework, '.repeat(6)}end`

/**
 * The global search home. "notarize" hits 10 questions in 6 sessions of 5 projects; the letter x hits only the
 * 150 questions of one session (no other fixture text holds an x). 30 listed sessions in 27 projects.
 */
function mkHome(): { home: string; files: Record<string, string>; paths: Record<string, string> } {
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
  files.many = claude(home, paths.target, 'many', Array.from({ length: 150 }, (_, k) => `xenon ${k + 1}`), 20)
  files.stale = claude(home, paths.stale, 'stale-1', ['Notarize the stale build'], 10)
  files.twinA = claude(home, paths.twinA, 'twin-a', ['twin asks to notarize'], 15)
  files.twinB = claude(home, paths.twinB, 'twin-b', ['twin asks to notarize'], 16)
  claude(home, paths.loose, 'loose-1', ['notarize from a loose directory'], 3)

  // Codex: a parent, its fork replaying the parent's question (stripped) and an orphan fork (uncertain strip),
  // in the shape mkForkHome in app.spec.ts uses
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

async function close(l: Launched, ...dirs: string[]): Promise<void> {
  await closeApp(l.app)
  for (const d of [l.userData, ...dirs]) rmSync(d, { recursive: true, force: true })
}

const searchItem = (win: Page) => win.locator('.rail .ri').nth(2)
const box = (win: Page) => win.locator('.gsearch .sbar input')
const body = (win: Page) => win.locator('.gsearch .pane-body')
const headings = (win: Page) => win.locator('.gsearch .ph .pn')
const NOTARIZE_HEADER = 'Found 10 hits · 6 sessions · 5 projects'

test('the global search page: the rail item, typing, results grouped by project, sorting, and every answer the results area gives', async () => {
  const { home, paths } = mkHome()
  const l = await launch(home)
  const { win } = l
  try {
    // The rail's top group: Agents, Projects, Search (appearance D1, US-001/AC-01)
    await expect(win.locator('.rail .ri')).toHaveCount(4)
    await expect(searchItem(win)).toHaveAttribute('title', 'Search')
    await searchItem(win).click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(searchItem(win)).toHaveClass(/\bon\b/)
    await expect(win.locator('.gsearch .pane-head h1')).toHaveText('Search')
    // The Agents page's frame: no project column (REQ-005)
    await expect(win.locator('.side')).toHaveCount(0)
    // 30 listed sessions in 27 projects with a session: the empty project and the unregistered directory are not counted
    await expect(box(win)).toHaveAttribute('placeholder', 'Search the questions in 30 sessions across 27 projects…')
    await expect(body(win).locator('.gs-note')).toContainText('Search what you asked in every project’s sessions.')

    // As you type, no Enter (US-001/AC-02)
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toHaveText(`${NOTARIZE_HEADER}Newest firstOldest first`)
    await expect(body(win).locator('.shead b')).toHaveText('10')
    // Grouped by project, newest first: the forks (1–2 days), the stale project (10), the twins (15, 16), the target (20)
    await expect(headings(win)).toHaveText(['fork-proj', 'stale-proj', 'twin', 'twin', 'target-proj'])
    await expect(win.locator('.gsearch .ph svg')).toHaveCount(5)
    await expect(win.locator('.gsearch .ph.stale .pn')).toHaveText('stale-proj')
    await expect(win.locator('.gsearch .ph.stale .stale-tag')).toHaveText('Stale')
    const stalePn = await win.locator('.gsearch .ph.stale .pn').evaluate((el) => getComputedStyle(el).textDecorationLine)
    expect(stalePn).toBe('line-through')
    // Two projects with one name, told apart by the path tooltip (S14)
    expect(await win.locator('.gsearch .ph', { hasText: 'twin' }).evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual([paths.twinA, paths.twinB])
    await expect(win.locator('.gsearch .ph', { hasText: 'target-proj' }).locator('.pc')).toHaveText('1 session · 5 hits')

    // The cards (US-001/AC-06): side badge, title, fork markers, hit count
    const card = (title: string) => win.locator('.gsearch .grp', { has: win.locator('.gh .t', { hasText: title }) })
    await expect(card('Child asks to notarize the fork').locator('.pill.fork')).toContainText('fork')
    await expect(card('Child asks to notarize the fork').locator('.badge.cx')).toBeVisible()
    await expect(card('Orphan asks to notarize too').locator('.pill.forkq')).toContainText('uncertain strip')
    const t1 = card('How do I notarize the app?')
    await expect(t1.locator('.badge.cl')).toBeVisible()
    await expect(t1.locator('.gh .d')).toHaveText('5 hits')
    // The rows: original turn numbers, every occurrence marked, relative time
    await expect(t1.locator('.hit .idx')).toHaveText(['01', '02', '03', '04', '05'])
    await expect(t1.locator('.hit').nth(1).locator('mark')).toHaveText(['Notarize', 'notarize'])
    await expect(t1.locator('.hit .d').first()).toHaveText('20 days ago')
    // Introduced content: a question holding HTML shows its characters and creates no element (the spec's last entry)
    await expect(t1.locator('.hit').nth(2).locator('.t')).toHaveText('<b>bold</b> & <img src=y onerror=alert(1)> about notarize')
    await expect(t1.locator('.hit .t b, .hit .t img')).toHaveCount(0)
    // One line per question (S8): a question written over several lines reads on one line, its breaks as spaces,
    // and a long one does not wrap but is cut — every row keeps one height
    const heights = await t1.locator('.hit').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    expect(new Set(heights).size, `row heights ${heights.join(', ')}`).toBe(1)
    const long = await t1.locator('.hit').nth(4).locator('.t').evaluate((el) => ({ cut: el.scrollWidth > el.clientWidth, overflow: getComputedStyle(el).textOverflow }))
    expect(long).toEqual({ cut: true, overflow: 'ellipsis' })
    await win.screenshot({ path: 'e2e-out/global-search-results-light.png' })

    // Oldest first reverses both layers (US-001/AC-07)
    await win.locator('.gsearch .shead .seg button', { hasText: 'Oldest first' }).click()
    await expect(headings(win)).toHaveText(['target-proj', 'twin', 'twin', 'stale-proj', 'fork-proj'])
    await expect(win.locator('.gsearch .grp .gh .t').filter({ hasText: /Child|Orphan/ })).toHaveText(['Child asks to notarize the fork', 'Orphan asks to notarize too'])
    await win.locator('.gsearch .shead .seg button', { hasText: 'Newest first' }).click()
    await expect(headings(win)).toHaveText(['fork-proj', 'stale-proj', 'twin', 'twin', 'target-proj'])

    // Clearing shows the idle hint at once; a keyword of spaces is empty (S3, S4)
    await box(win).fill('')
    await expect(body(win).locator('.gs-note')).toBeVisible({ timeout: 150 })
    await box(win).fill('   ')
    await expect(body(win).locator('.gs-note')).toContainText('Search what you asked')
    // No hit (US-001/AC-08)
    await box(win).fill('kubernetes')
    await expect(body(win).locator('.shead')).toHaveText('No hits. Only questions are searched here — to search answers and tool output, open the project and switch its “Sessions” tab to “Full text”.')
    // Over 200 characters the main process refuses the search: the failure line, never "no hits" (S4, REQ-003/AC-01);
    // changing the keyword searches again (REQ-003/AC-02)
    await box(win).fill('a'.repeat(201))
    await expect(body(win).locator('.shead')).toHaveText('This search could not be completed. Change the keyword to try again.')
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toContainText(NOTARIZE_HEADER)

    // Every hit, no cap (US-001/AC-09)
    await box(win).fill('x')
    await expect(body(win).locator('.shead').first()).toContainText('Found 150 hits · 1 session · 1 project')
    await expect(body(win).locator('.hit')).toHaveCount(150)
    // The box stays in view while the results scroll (REQ-005)
    const before = await box(win).boundingBox()
    await body(win).evaluate((el) => { el.scrollTop = el.scrollHeight })
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
    expect(await box(win).boundingBox()).toEqual(before)
    await expect(box(win)).toBeInViewport()
    await win.screenshot({ path: 'e2e-out/global-search-scrolled-light.png' })

    // From anywhere in the app the Search item shows the page as left (US-003/AC-05): through settings and back
    const scrolled = await body(win).evaluate((el) => el.scrollTop)
    await win.locator('.ri.set').click()
    await expect(win.locator('.ri.set')).toHaveClass(/\bon\b/)
    await searchItem(win).click()
    await expect(box(win)).toHaveValue('x')
    await expect(body(win).locator('.hit')).toHaveCount(150)
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBe(scrolled)
    // The dark appearance, for the evidence screenshots: the launcher pins light, as every launcher here does
    const lightCard = await body(win).locator('.grp').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    await win.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => body(win).locator('.grp').first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(lightCard)
    await win.screenshot({ path: 'e2e-out/global-search-scrolled-dark.png' })
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toContainText(NOTARIZE_HEADER)
    await body(win).evaluate((el) => { el.scrollTop = 0 })
    await win.screenshot({ path: 'e2e-out/global-search-results-dark.png' })

    // The one handler error is the refused 201-character keyword
    expect(l.errors).toHaveLength(1)
    expect(l.errors[0]).toContain(ERR.badArgs)
  } finally {
    await close(l, home)
  }
})

test('reading the question texts: the header hint while it runs, nothing in the results area, then the results for the latest keyword', async () => {
  const { home } = mkHome()
  const l = await launch(home, { AGENTSHED_FETCH_DELAY_MS: '3000' })
  const { win } = l
  try {
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await searchItem(win).click()
    // Showing the page starts the reading, before anything is typed (REQ-002/AC-01); the hint slot says so in place
    // of the startup hint (REQ-002/AC-02), and the idle hint still shows for an empty keyword
    const hint = win.locator('.gsearch .reading-hint')
    await expect(hint).toHaveText('Reading the sessions’ questions…')
    await expect(win.locator('.gsearch .startup-display-hint')).toHaveCount(0)
    await expect(body(win).locator('.gs-note')).toContainText('Search what you asked')
    await win.screenshot({ path: 'e2e-out/global-search-reading.png' })
    // A keyword typed meanwhile: nothing in the results area, no "searching" state (S1), sampled inside the window
    await box(win).fill('notarize')
    await win.waitForTimeout(400)
    await expect(hint).toBeVisible()
    await expect(body(win)).toHaveText('')
    // Leaving and coming back while it runs: the reading goes on, the hint shows again (S16)
    await win.locator('.rail .ri').nth(0).click()
    await searchItem(win).click()
    await expect(hint).toBeVisible()
    await expect(box(win)).toHaveValue('notarize')
    // Then the results for the latest keyword, and the hint gone
    await box(win).fill('stale')
    await expect(body(win).locator('.shead').first()).toContainText('Found 1 hit · 1 session · 1 project', { timeout: 15000 })
    await expect(hint).toHaveCount(0)
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('going to a hit: the search page holds, then Projects with the project selected and in view and the session at that question; the page is kept for the run', async () => {
  const { home } = mkHome()
  let l = await launch(home, { AGENTSHED_FETCH_DELAY_MS: '1500' })
  let { win } = l
  try {
    await searchItem(win).click()
    await box(win).fill('xenon')
    await expect(body(win).locator('.hit')).toHaveCount(150, { timeout: 15000 })
    await win.locator('.gsearch .shead .seg button', { hasText: 'Oldest first' }).click()
    await body(win).evaluate((el) => { el.scrollTop = 400 })
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBe(400)

    // A hit: inside the delay the search page is still on screen (US-002/AC-03), then the stage switches at once
    const row = body(win).locator('.hit', { hasText: 'xenon 37' })
    await row.click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(win.locator('.gsearch')).toBeVisible()
    await expect(win.locator('.side')).toHaveCount(0)
    // The position the page is left at: the click scrolled the row into view first
    const left = await body(win).evaluate((el) => el.scrollTop)
    expect(left).toBeGreaterThan(400)
    await expect(win.locator('.pane-head .stitle')).toHaveText('xenon 1', { timeout: 10000 })
    await expect(win.locator('.app')).toHaveClass(/dim-projects/)
    // The project selected and scrolled into view: it sits below the list's fold (US-002/AC-01, projects-list C8)
    const sel = win.locator('.side .row.sel')
    await expect(sel.locator('.nm')).toHaveText('target-proj')
    await expect(sel).toBeInViewport()
    expect(await win.locator('.side .list').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    // The session page at that question with the arrival highlight (D4); its two exits (US-003/AC-01)
    const located = win.locator('.qlist .q.located.focused')
    await expect(located).toHaveCount(1)
    await expect(located.locator('.txt')).toHaveText('xenon 37')
    await expect(located).toBeInViewport()
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to target-proj · Sessions'])

    // The rail's Search item shows the page as left: keyword, sort, scroll position (US-003/AC-05)
    await searchItem(win).click()
    await expect(box(win)).toHaveValue('xenon')
    await expect(win.locator('.gsearch .shead .seg button.on')).toHaveText('Oldest first')
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBe(left)

    // A card header opens its session without locating a question; a session with a saved page opens at once (US-002/AC-02, AC-03)
    await body(win).locator('.grp .gh').first().click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('xenon 1', { timeout: 700 })
    await expect(win.locator('.qlist .q.located, .qlist .q.focused')).toHaveCount(0)
    // A card header's session is opened from the results too: it has the two exits (US-003/AC-01)
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to target-proj · Sessions'])

    // Two hits clicked before the first page arrives: the later click wins, the earlier page is kept (J9)
    await searchItem(win).click()
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toContainText(NOTARIZE_HEADER)
    await body(win).locator('.hit', { hasText: 'Child asks to notarize the fork' }).click()
    await body(win).locator('.hit', { hasText: 'Notarize the stale build' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('Notarize the stale build', { timeout: 10000 })
    // A stale project's hit: the project is selected, but the list hides stale rows by default (J2)
    await expect(win.locator('.side .row.sel')).toHaveCount(0)
    await expect(win.locator('.side .opts input[type="checkbox"]')).not.toBeChecked()
    await searchItem(win).click()
    await body(win).locator('.hit', { hasText: 'Child asks to notarize the fork' }).click()
    await expect(win.locator('.qlist .q.located .txt')).toHaveText('Child asks to notarize the fork', { timeout: 700 })

    // The two sorts are independent (S12, CON-002): global search is on oldest first; the project's Sessions tab
    // still opens newest first, and changing it leaves global search's alone
    await exits(win).nth(1).click()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await expect(win.locator('.pane-body .grp-t .seg button.on')).toHaveText('Newest first')
    await win.locator('.pane-body .grp-t .seg button', { hasText: 'Oldest first' }).click()
    await searchItem(win).click()
    await expect(win.locator('.gsearch .shead .seg button.on')).toHaveText('Oldest first')
    await win.locator('.gsearch .shead .seg button', { hasText: 'Newest first' }).click()
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'fork-proj' }).click()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await expect(win.locator('.pane-body .grp-t .seg button.on')).toHaveText('Oldest first')
    expect(l.errors).toEqual([])

    // After a restart the page starts empty (US-003/AC-05, CON-001)
    await closeApp(l.app)
    l = await launch(home, {}, l.userData)
    win = l.win
    await searchItem(win).click()
    await expect(box(win)).toHaveValue('')
    await expect(body(win).locator('.gs-note')).toContainText('Search what you asked')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('a hit whose session file is gone opens the session page to its own error, with no crash (J8)', async () => {
  const { home, files } = mkHome()
  const l = await launch(home)
  const { win } = l
  try {
    await searchItem(win).click()
    await box(win).fill('twin')
    await expect(body(win).locator('.hit')).toHaveCount(2)
    rmSync(files.twinA)
    await body(win).locator('.hit').first().click()
    await expect(win.locator('.pane-body .none')).toContainText('Cannot open this session')
    // The way back is there on the error page too (US-003/AC-01), and leads to the results as left
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to twin · Sessions'])
    await exits(win).first().click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).toHaveValue('twin')
    // The page's fetch is refused, which is the one handler error this case provokes
    expect(l.errors).toHaveLength(1)
    expect(l.errors[0]).toContain(ERR.sessionFileUnreadable)
  } finally {
    await close(l, home)
  }
})

test('the results follow the data: a rescan brings a new hit in by transfusion; with every session gone, the no-session state', async () => {
  const { home, files } = mkHome()
  const l = await launch(home, { AGENTSHED_RESCAN_MS: '1500' })
  const { win } = l
  try {
    await searchItem(win).click()
    await box(win).fill('xenon')
    await expect(body(win).locator('.hit')).toHaveCount(150)
    await win.locator('.gsearch .shead .seg button', { hasText: 'Oldest first' }).click()
    await body(win).evaluate((el) => { el.scrollTop = 300 })
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBe(300)
    // A session gains a matching question (REQ-004/AC-01, D1)
    appendQuestion(files.many, 'xenon newcomer')
    await expect(body(win).locator('.hit')).toHaveCount(151, { timeout: 15000 })
    await expect(body(win).locator('.hit').last().locator('.t')).toHaveText('xenon newcomer')
    await expect(box(win)).toHaveValue('xenon')
    await expect(win.locator('.gsearch .shead .seg button.on')).toHaveText('Oldest first')
    expect(await body(win).evaluate((el) => el.scrollTop)).toBe(300)
    // Everything goes (D4): the box and its keyword stay, the placeholder names no number
    rmSync(join(home, '.claude', 'projects'), { recursive: true, force: true })
    rmSync(join(home, '.codex', 'sessions'), { recursive: true, force: true })
    await expect(body(win).locator('.gs-note')).toContainText('No sessions to search yet.', { timeout: 15000 })
    await expect(box(win)).toHaveValue('xenon')
    await expect(box(win)).toHaveAttribute('placeholder', 'Search questions…')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('nothing to search: the box stays, its placeholder names no number, and the page says so (REQ-006)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gs-empty-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const l = await launch(home)
  const { win } = l
  try {
    await searchItem(win).click()
    await expect(box(win)).toBeVisible()
    await expect(box(win)).toHaveAttribute('placeholder', 'Search questions…')
    await expect(body(win).locator('.gs-note')).toHaveText('No sessions to search yet.Once an agent has had a conversation in a registered project, it can be searched here.')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('during the startup scan the search runs over the restored sessions, and the scan then keeps the results (S2)', async () => {
  const { home } = mkHome()
  const first = await launch(home)
  await expect(first.win.locator('.pane-head h1')).toHaveText('Agents')
  await expect(first.win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready', { timeout: 15000 })
  await closeApp(first.app)
  const l = await launch(home, { AGENTSHED_SCAN_DELAY_MS: '6000' }, first.userData)
  const { win } = l
  try {
    await searchItem(win).click()
    await box(win).fill('stale')
    await expect(body(win).locator('.shead').first()).toContainText('Found 1 hit · 1 session · 1 project')
    // The reading is done and the scan is still held: the hint slot is the startup hint's again
    await expect(win.locator('.gsearch .startup-display-hint')).toHaveAttribute('data-state', 'scanning')
    await expect(win.locator('.gsearch .startup-display-hint')).toHaveAttribute('data-state', 'ready', { timeout: 15000 })
    await expect(body(win).locator('.shead').first()).toContainText('Found 1 hit · 1 session · 1 project')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// ── #272: the way back to the results from a hit's session, or on into its project (US-003, J3–J7) ──

const exits = (win: Page) => win.locator('.pane-head .exits .sback')
const LEFT = 'm15 18-6-6 6-6'
const RIGHT = 'm9 18 6-6-6-6'

/** From the search page, open the hit holding `text` and wait for its session page */
async function openHit(win: Page, keyword: string, text: string): Promise<void> {
  await searchItem(win).click()
  await box(win).fill(keyword)
  await body(win).locator('.hit', { hasText: text }).first().click()
  await expect(win.locator('.qlist .q.located .txt')).toHaveText(text, { timeout: 15000 })
}

test('a session opened from a hit: back to the results as they were left, or on into its project', async () => {
  const { home, files } = mkHome()
  const l = await launch(home, { AGENTSHED_RESCAN_MS: '1500' })
  const { win } = l
  try {
    await searchItem(win).click()
    await box(win).fill('xenon')
    await expect(body(win).locator('.hit')).toHaveCount(150, { timeout: 15000 })
    await win.locator('.gsearch .shead .seg button', { hasText: 'Oldest first' }).click()
    await body(win).evaluate((el) => { el.scrollTop = 400 })
    // The row brought into view before the click, so the position the page is left at is measured, not raced
    const row = body(win).locator('.hit', { hasText: 'xenon 37' })
    await row.scrollIntoViewIfNeeded()
    const left = await body(win).evaluate((el) => el.scrollTop)
    expect(left).toBeGreaterThan(400)
    await row.click()
    await expect(win.locator('.qlist .q.located .txt')).toHaveText('xenon 37', { timeout: 15000 })

    // One row of two exits where the back control sits: back to the results (left chevron), then into the
    // project (right chevron) — US-003/AC-01, session-view P10
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to target-proj · Sessions'])
    expect(await exits(win).evaluateAll((els) => els.map((e) => e.querySelector('path')?.getAttribute('d')))).toEqual([LEFT, RIGHT])
    await win.screenshot({ path: 'e2e-out/global-search-exits-light.png' })
    const lightExit = await exits(win).first().evaluate((el) => getComputedStyle(el).color)
    await win.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => exits(win).first().evaluate((el) => getComputedStyle(el).color)).not.toBe(lightExit)
    await win.screenshot({ path: 'e2e-out/global-search-exits-dark.png' })
    await win.emulateMedia({ colorScheme: 'light' })

    // A rescan while the session is on screen (J3): the session gains a matching question
    appendQuestion(files.many, 'xenon newcomer')
    await expect(win.locator('.qlist .q')).toHaveCount(151, { timeout: 15000 })

    // Back to the results as they were left — keyword, sort, scroll — and current for the keyword (US-003/AC-02)
    await exits(win).first().click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).toHaveValue('xenon')
    await expect(win.locator('.gsearch .shead .seg button.on')).toHaveText('Oldest first')
    await expect(body(win).locator('.hit')).toHaveCount(151)
    await expect.poll(() => body(win).evaluate((el) => el.scrollTop)).toBe(left)
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('on into the project: its Sessions tab, or a stale project\'s note; a session reached from there or through the fork banner has the single back control', async () => {
  const { home } = mkHome()
  const l = await launch(home)
  const { win } = l
  try {
    // Into the project's Sessions tab (US-003/AC-03); a session opened there has the single back control (J4)
    await openHit(win, 'notarize', 'How do I notarize the app?')
    await exits(win).nth(1).click()
    await expect(win.locator('.pane-head h1')).toHaveText('target-proj')
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
    await win.locator('.pane-body .card .se', { hasText: 'xenon 1' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('xenon 1')
    await expect(win.locator('.pane-head .sback')).toHaveText(['Back to target-proj · Sessions'])

    // A stale project: the exit reads "Go to <project>" and lands on its stale note page (US-003/AC-03)
    await openHit(win, 'notarize', 'Notarize the stale build')
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to stale-proj'])
    await exits(win).nth(1).click()
    await expect(win.locator('.pane-head h1')).toHaveText('stale-proj')
    await expect(win.locator('.pane-head .stale-tag')).toBeVisible()
    await expect(win.locator('.pane-head .tabs')).toHaveCount(0)

    // The fork parent through the banner: the single back control, which leads to the project's Sessions tab
    // (US-003/AC-04, J5)
    await openHit(win, 'notarize', 'Child asks to notarize the fork')
    await expect(exits(win)).toHaveCount(2)
    // The child's located question is its question 01, so a focus carried into the parent would land on the
    // parent's question 01; the parent opens with none
    await expect(win.locator('.qlist .q.focused .idx')).toHaveText('01')
    await win.locator('.banner a').click()
    await expect(win.locator('.qlist .q .txt')).toHaveText(['Parent question about signing'])
    await expect(win.locator('.qlist .q.located, .qlist .q.focused')).toHaveCount(0)
    await expect(win.locator('.pane-head .sback')).toHaveText(['Back to fork-proj · Sessions'])
    await win.locator('.pane-head .sback').click()
    await expect(win.locator('.pane-head h1')).toHaveText('fork-proj')
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('leaving the session for the search page and coming back keeps it with its exits; selecting another project replaces it (J6, J7)', async () => {
  const { home } = mkHome()
  const l = await launch(home)
  const { win } = l
  try {
    await openHit(win, 'notarize', 'How do I notarize the app?')
    // J7: to the search page, a new keyword, back to Projects — the session is still there with its two exits,
    // and "Back to search results" shows the new results
    await searchItem(win).click()
    await box(win).fill('stale')
    await expect(body(win).locator('.shead').first()).toContainText('Found 1 hit · 1 session · 1 project')
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('How do I notarize the app?')
    await expect(exits(win)).toHaveText(['Back to search results', 'Go to target-proj · Sessions'])
    await exits(win).first().click()
    await expect(box(win)).toHaveValue('stale')
    await expect(body(win).locator('.hit')).toHaveCount(1)

    // J6: with the session on screen, another project selected in the list replaces it; the Search item still
    // shows the page as left, and Projects then shows that project
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('How do I notarize the app?')
    await win.locator('.side .row', { hasText: 'filler-01' }).click()
    await expect(win.locator('.pane-head h1')).toHaveText('filler-01')
    await searchItem(win).click()
    await expect(box(win)).toHaveValue('stale')
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.pane-head h1')).toHaveText('filler-01')
    await expect(win.locator('.pane-head .stitle')).toHaveCount(0)
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

/**
 * Each control in the session page's exits row: its text's line boxes (counted as settings-updates.spec counts
 * them), whether the text is cut and drawn with an ellipsis, and whether the control ends inside the header's
 * content box; with how many tops the controls sit on
 */
async function exitsFit(win: Page): Promise<{ controls: { lines: number; cut: boolean; overflow: string; inside: boolean }[]; tops: number }> {
  return win.evaluate(() => {
    const lines = (el: Element): number => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top)
      let count = 0
      let bottom = -Infinity
      for (const r of rects) {
        if (r.top >= bottom - 1) {
          count++
          bottom = r.bottom
        } else bottom = Math.max(bottom, r.bottom)
      }
      return count
    }
    const head = document.querySelector('.pane-head') as HTMLElement
    const contentRight = head.getBoundingClientRect().right - parseFloat(getComputedStyle(head).paddingRight)
    const buttons = [...document.querySelectorAll('.pane-head .exits .sback')]
    return {
      controls: buttons.map((b) => {
        const text = b.querySelector('span') as HTMLElement
        return { lines: lines(text), cut: text.scrollWidth > text.clientWidth, overflow: getComputedStyle(text).textOverflow, inside: b.getBoundingClientRect().right <= contentRight + 0.5 }
      }),
      tops: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size
    }
  })
}

test('a long project name at the window\'s minimum width: the two exits, and the single back control, each stay on one line, cut with an ellipsis (J11)', async () => {
  const { home } = mkHome()
  // A registered project whose directory name is longer than the header can show, in the shape real directory
  // names take; "quasar" is in no other fixture text
  const name = 'a-project-with-a-rather-long-directory-name-kept-for-the-quarterly-reports'
  const dir = join(home, 'work', name)
  mkdirSync(dir, { recursive: true })
  const registry = join(home, '.claude.json')
  const config = JSON.parse(readFileSync(registry, 'utf8')) as { projects: Record<string, object> }
  config.projects[dir] = {}
  writeFileSync(registry, JSON.stringify(config))
  claude(home, dir, 'long-1', ['quasar readings for the report'], 5)
  const l = await launch(home)
  const { win } = l
  try {
    // The narrowest window the app allows (its main window's minimum width)
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)

    // The two exits: one row, each text on one line and cut, the row inside the header
    await openHit(win, 'quasar', 'quasar readings for the report')
    await expect(exits(win)).toHaveText(['Back to search results', `Go to ${name} · Sessions`])
    const cut = { lines: 1, cut: true, overflow: 'ellipsis', inside: true }
    await expect.poll(() => exitsFit(win)).toEqual({ controls: [cut, cut], tops: 1 })
    await win.screenshot({ path: 'e2e-out/global-search-exits-long.png' })

    // The single back control, on a session opened inside that project: the same
    await exits(win).nth(1).click()
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Sessions')
    await win.locator('.pane-body .card .se', { hasText: 'quasar readings for the report' }).click()
    await expect(win.locator('.pane-head .sback')).toHaveText([`Back to ${name} · Sessions`])
    await expect.poll(() => exitsFit(win)).toEqual({ controls: [cut], tops: 1 })
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// ── #273: ⌘⇧F and the Edit menu's "Search Sessions…" (US-004, J10) ──

/** Clicks "Search Sessions…" the way the menu does: its own click handler, in the main process */
async function clickSearchSessions(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('searchSessions')
    if (!item) throw new Error('no "Search Sessions…" item in the application menu')
    // Electron types the item's click as a bare Function; it takes no argument the handler reads
    ;(item.click as () => void)()
  })
}

/** The installed Edit menu's last two entries: "separator", or the item's id, label, accelerator and the three
 * flags a click on the item's handler does not check */
async function editMenuTail(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items[1]?.submenu?.items ?? [])
      .slice(-2)
      .map((i) =>
        i.type === 'separator'
          ? 'separator'
          : `${i.id} | ${i.label} | ${i.accelerator ?? ''} | enabled ${String(i.enabled)} | visible ${String(i.visible)} | registerAccelerator ${String(i.registerAccelerator)}`
      )
  )
}

/** Every accelerator in the installed application menu, submenus included, as "id or role | accelerator" */
async function menuAccelerators(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ Menu }) => {
    const out: string[] = []
    const walk = (items: Electron.MenuItem[]): void => {
      for (const i of items) {
        if (i.accelerator) out.push(`${i.id || i.role || i.label} | ${i.accelerator}`)
        if (i.submenu) walk(i.submenu.items)
      }
    }
    walk(Menu.getApplicationMenu()?.items ?? [])
    return out
  })
}

/** A chord with its modifiers in one spelling and order: Cmd, Command, CmdOrCtrl, CommandOrControl, and Super and
 * Meta (which Electron's accelerator documentation maps to Cmd on macOS) as one */
const chord = (accelerator: string): string =>
  accelerator
    .split('+')
    .map((k) => k.toLowerCase())
    .map((k) =>
      ['cmd', 'command', 'cmdorctrl', 'commandorcontrol', 'super', 'meta'].includes(k) ? 'cmd' : k === 'control' ? 'ctrl' : k === 'option' ? 'alt' : k
    )
    .sort()
    .join('+')

test('⌘⇧F through the application menu: from settings, a session page and the search page itself, the page as left with the focus in its box; the item follows the language (US-004, J10)', async () => {
  const { home } = mkHome()
  const l = await launch(home)
  const { app, win } = l
  try {
    // The test window is never shown: focus emulation lets it hold a real focus, as token-span.spec.ts does
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    // The Edit menu ends with a separator and the item, bound to ⌘⇧F (US-004/AC-02)
    await win.waitForSelector('.rail')
    const item = 'enabled true | visible true | registerAccelerator true'
    expect(await editMenuTail(app)).toEqual(['separator', `searchSessions | Search Sessions… | CmdOrCtrl+Shift+F | ${item}`])
    // The chord is the item's alone, however another entry might spell it: the fold itself first, then every
    // accelerator installed — the roles' own included, as the undo role's shows
    expect(chord('Shift+CommandOrControl+F')).toBe(chord('CmdOrCtrl+Shift+F'))
    expect(chord('Super+Shift+F')).toBe(chord('CmdOrCtrl+Shift+F'))
    expect(chord('Control+Command+F')).not.toBe(chord('CmdOrCtrl+Shift+F'))
    const accelerators = await menuAccelerators(app)
    expect(accelerators).toContain('undo | CommandOrControl+Z')
    expect(accelerators.filter((a) => chord(a.split(' | ')[1]) === chord('CmdOrCtrl+Shift+F'))).toEqual(['searchSessions | CmdOrCtrl+Shift+F'])

    // From settings, a keyword typed before: the page as left, its box focused (US-004/AC-01, J10)
    await searchItem(win).click()
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toContainText(NOTARIZE_HEADER)
    await win.locator('.ri.set').click()
    await expect(win.locator('.app')).toHaveClass(/dim-settings/)
    await clickSearchSessions(app)
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).toHaveValue('notarize')
    await expect(box(win)).toBeFocused()

    // From a hit's session page (J10)
    await body(win).locator('.hit', { hasText: 'How do I notarize the app?' }).click()
    await expect(win.locator('.qlist .q.located .txt')).toHaveText('How do I notarize the app?', { timeout: 15000 })
    await clickSearchSessions(app)
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).toHaveValue('notarize')
    await expect(box(win)).toBeFocused()

    // On the search page itself, with the focus taken away by the sort switch: the box takes it back, and the page
    // is otherwise as left
    await win.locator('.gsearch .shead .seg button', { hasText: 'Oldest first' }).click()
    await expect(box(win)).not.toBeFocused()
    await clickSearchSessions(app)
    await expect(box(win)).toBeFocused()
    await expect(box(win)).toHaveValue('notarize')
    await expect(win.locator('.gsearch .shead .seg button.on')).toHaveText('Oldest first')

    // The item follows the in-app language, and still opens the page (US-004/AC-02)
    await win.locator('.ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="zh"]').click()
    await expect.poll(async () => (await editMenuTail(app))[1]).toBe(`searchSessions | 搜索会话… | CmdOrCtrl+Shift+F | ${item}`)
    await clickSearchSessions(app)
    await expect(win.locator('.gsearch .pane-head h1')).toHaveText('搜索')
    await expect(box(win)).toBeFocused()
    await expect(box(win)).toHaveValue('notarize')
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

test('Search Sessions… chosen while a hit\'s session is still on its way keeps the search page, and the session page is kept for later (US-004/AC-01, session-view P8 through P10)', async () => {
  const { home } = mkHome()
  const l = await launch(home, { AGENTSHED_FETCH_DELAY_MS: '1500' })
  const { app, win } = l
  try {
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await searchItem(win).click()
    await box(win).fill('notarize')
    await expect(body(win).locator('.shead').first()).toContainText(NOTARIZE_HEADER, { timeout: 15000 })
    // Left alone, a hit's jump lands once its session page has arrived, past the delay; how long it took sets the
    // wait below
    const clicked = Date.now()
    await body(win).locator('.hit', { hasText: 'Notarize the stale build' }).click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(win.locator('.pane-head .stitle')).toHaveText('Notarize the stale build', { timeout: 10000 })
    const landing = Date.now() - clicked

    // A hit in a session not seen yet, and the item chosen while the search page holds: past the delay the search
    // page is still there, its box focused, and no session page was drawn
    await searchItem(win).click()
    await body(win).locator('.hit', { hasText: 'How do I notarize the app?' }).click()
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).not.toBeFocused()
    await clickSearchSessions(app)
    await win.waitForTimeout(landing + 1000)
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await expect(box(win)).toBeFocused()
    await expect(win.locator('.pane-head .stitle')).toHaveCount(0)
    // The page that arrived meanwhile is kept: the same hit now opens at once (session-view P8)
    await body(win).locator('.hit', { hasText: 'How do I notarize the app?' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('How do I notarize the app?', { timeout: 700 })
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

/** A hit row's text, and whether its first highlighted occurrence lies wholly in view: inside the text box, and
 *  short of the ellipsis when the row overflows (the ellipsis measured in the row's own font) */
async function hitRows(scope: ReturnType<Page['locator']>): Promise<{ text: string; inView: boolean }[]> {
  return scope.locator('.hit .t').evaluateAll((els) =>
    els.map((el) => {
      const mark = el.querySelector('mark')
      const box = el.getBoundingClientRect()
      const probe = document.createElement('span')
      probe.textContent = '…'
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
      el.appendChild(probe)
      const ellipsis = probe.getBoundingClientRect().width
      probe.remove()
      const end = el.scrollWidth > el.clientWidth ? box.right - ellipsis : box.right
      const r = mark?.getBoundingClientRect()
      return { text: el.textContent ?? '', inView: !!r && r.left >= box.left - 0.5 && r.right <= end + 0.5 }
    })
  )
}

test('a hit row keeps its keyword in view: 20 characters before a far keyword, the keyword itself when that does not fit, a keyword under the ellipsis counted out of view, judged again on a resize and when shown again — in global search and in a project\'s Sessions tab (session-view::REQ-002)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gs-rows-'))
  const dir = join(home, 'work', 'rows-proj')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [dir]: {} } }))
  // The keyword 216 characters in; at the start; 66 characters in; and a 40-character keyword 108 characters in
  const FAR = 'Background for the planning call, '.repeat(6) + 'and now the quokka question itself'
  const NEAR = 'quokka at the very start of a short question'
  const MID = 'A middle-length question that mentions the zebu herd and then the quokka once more'
  const LONG_KEY = 'quokka-routing-table-for-the-narrow-rows'
  const WITH_LONG_KEY = `Notes on the deployment window, the on-duty handover and the rollback rules for the cluster, then later the ${LONG_KEY} entry`
  // A question in a real one's shape (most real questions hold CJK, many line breaks and runs of spaces): its
  // keyword, its own, about 100 characters in
  const CJK = '\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c\n   \u7136\u540e\u770b wombat \u7684\u95ee\u9898'
  claude(home, dir, 'rows-1', [FAR, NEAR, MID, WITH_LONG_KEY, CJK], 1)
  const l = await launch(home)
  const { win } = l
  try {
    // Global search at the window's default size (E1)
    await searchItem(win).click()
    await box(win).fill('quokka')
    await expect(body(win).locator('.hit')).toHaveCount(4)
    await expect.poll(async () => (await hitRows(body(win))).map((r) => [r.text.slice(0, 30), r.inView])).toEqual([
      ['…g call, and now the quokka qu', true],
      [NEAR.slice(0, 30), true],
      [MID.slice(0, 30), true],
      [WITH_LONG_KEY.slice(0, 30), true]
    ])
    await win.screenshot({ path: 'e2e-out/hit-rows-global-search.png' })

    // A question in a real one's shape: global search shows it on one line, its line break and run of spaces read as
    // one space, and the 20 characters before the keyword are counted on the text as shown (E8)
    await box(win).fill('wombat')
    await expect(body(win).locator('.hit')).toHaveCount(1)
    await expect.poll(async () => (await hitRows(body(win)))[0]).toEqual({ text: '\u2026\u6761\u7ebf\uff0c\u5148\u628a\u6784\u5efa\u811a\u672c\u62c6\u6210\u4e24\u6761\u7ebf\uff0c \u7136\u540e\u770b wombat \u7684\u95ee\u9898', inView: true })

    // A new keyword on the same row judges it again, both ways: the row stays mounted (its mark survives) while a
    // keyword in view leaves it at its beginning and one far in moves it (E7). "call" lies 28 characters in, so a row
    // that kept its moved start would show a 20-character window rather than its beginning. The whole list is read,
    // so the single row the previous keyword left cannot answer for this one
    await box(win).fill('call')
    await expect.poll(async () => await hitRows(body(win))).toEqual([{ text: FAR, inView: true }])
    await body(win).locator('.hit').first().evaluate((el) => { el.setAttribute('data-e2e-same-row', '1') })
    await box(win).fill('quokka question')
    await expect.poll(async () => (await hitRows(body(win)))[0]).toEqual({ text: '…g call, and now the quokka question itself', inView: true })
    await box(win).fill('call')
    await expect.poll(async () => (await hitRows(body(win)))[0]).toEqual({ text: FAR, inView: true })
    await expect(body(win).locator('.hit[data-e2e-same-row="1"]')).toHaveCount(1)
    await box(win).fill('quokka')
    await expect(body(win).locator('.hit')).toHaveCount(4)

    // Left for another page and shown again: the rows are drawn anew and judged anew (E5)
    await win.locator('.rail .ri').nth(1).click()
    await searchItem(win).click()
    await expect.poll(async () => (await hitRows(body(win)))[0]).toEqual({ text: expect.stringMatching(/^…g call, and now the quokka question itself/), inView: true })

    // A project's own Sessions tab, by question (E2)
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row').first().click()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.sbar input').fill('quokka')
    const tab = win.locator('.pane-body')
    await expect(tab.locator('.hit')).toHaveCount(4)
    await expect.poll(async () => (await hitRows(tab)).slice(0, 2).map((r) => [r.text.slice(0, 30), r.inView])).toEqual([
      ['…g call, and now the quokka qu', true],
      [NEAR.slice(0, 30), true]
    ])

    // The narrowest window the app allows: the middle question's keyword falls past the cut, and its row moves (E3)
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)
    await expect.poll(async () => (await hitRows(tab))[2]).toEqual({ text: '…u herd and then the quokka once more', inView: true })
    expect((await hitRows(tab)).every((r) => r.inView)).toBe(true)

    // A 40-character keyword: 20 characters before it do not fit beside it, so the row starts at the keyword (E4)
    await win.locator('.sbar input').fill(LONG_KEY)
    await expect(tab.locator('.hit')).toHaveCount(1)
    await expect.poll(async () => (await hitRows(tab))[0]).toEqual({ text: `…${LONG_KEY} entry`, inView: true })
    await win.screenshot({ path: 'e2e-out/hit-rows-long-keyword-800.png' })

    // Widened again: the middle question's row, moved at 800px, returns to its own beginning (E3). The tab draws
    // its results a moment after typing, so the moved row is awaited at 800px before the window widens
    await win.locator('.sbar input').fill('quokka')
    await expect(tab.locator('.hit')).toHaveCount(4)
    await expect.poll(async () => (await hitRows(tab))[2]).toEqual({ text: '…u herd and then the quokka once more', inView: true })
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(1400)
    await expect.poll(async () => (await hitRows(tab))[2]).toEqual({ text: MID, inView: true })
    expect((await hitRows(tab))[1].text).toBe(NEAR)

    // A keyword ending under the ellipsis is out of view (E6). In global search, size the window so that the fourth
    // question's highlight (its box, padding included, which is what is judged) ends 1.5px less than the ellipsis's
    // width before its row's right edge: inside the ellipsis by 1.5px, so the row has to move, and outside an
    // ellipsis measured 3px short (13px measured as 10px in this font on macOS). The ellipsis is measured on a
    // canvas given the row's font, not as the component and the helper measure it. The text box grows one pixel per
    // pixel of window, so the width follows from one measurement of the row unmoved; the keyword lies far enough in
    // that the width falls well inside the window's range (800px up to the 1100px it opens at) whatever the font
    await searchItem(win).click()
    await expect(body(win).locator('.hit')).toHaveCount(4)
    await expect.poll(async () => (await hitRows(body(win)))[3]).toEqual({ text: WITH_LONG_KEY, inView: true })
    const m = await body(win).locator('.hit .t').nth(3).evaluate((el) => {
      const box = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      return {
        markEnd: (el.querySelector('mark') as HTMLElement).getBoundingClientRect().right - box.left,
        boxW: box.width,
        winW: window.innerWidth,
        ellipsis: ctx.measureText('\u2026').width,
        canvasFont: ctx.font,
        fontSize: cs.fontSize
      }
    })
    // A canvas that rejects a font keeps its default 10px one, the very fault E6 guards against
    expect(m.canvasFont, "the canvas took the row's font").toContain(m.fontSize)
    const width = Math.round(m.winW - m.boxW + m.markEnd + m.ellipsis - 1.5)
    expect(width, `the window E6 needs (${JSON.stringify(m)}) lies within the app's range`).toBeGreaterThanOrEqual(800)
    expect(width, `the window E6 needs (${JSON.stringify(m)}) lies within the app's range`).toBeLessThan(1100)
    await l.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 900), width)
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(width)
    await expect.poll(async () => (await hitRows(body(win)))[3]).toEqual({ text: '…ter, then later the quokka-routing-table-for-the-narrow-rows entry', inView: true })
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})
