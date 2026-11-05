// E2E: a side card's project count and the project list it opens (agents-overview::REQ-007, projects-list::REQ-002),
// under the built Electron app, over a fixture home.
//
// Known gaps, recorded rather than faked:
//   - "A scan lands between reading the card and activating the control" (agents-overview::REQ-007) has no driver for
//     the exact race: the card and the handler read the same snapshot from one render. The scan case asserts that the
//     card and the rows agree once a scan has landed.
//   - The arrival's own supersede of a pending search jump (projects-list::REQ-002) has no reachable state today: the
//     rail, the only way from the search page to the agents page, has already superseded it. The search spec's case
//     goes red only when both are gone. Re-test when another way reaches the agents page with a jump pending.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { callRecord, encodeTrajectoryMetadata, settingsJson, writeConversation } from '../src/main/testing/agy-fixture'

interface Launched {
  app: ElectronApplication
  win: Page
  errors: string[]
  userData: string
}

/** The same launcher as support/launch.ts: an isolated userData, a fixture home, the window not shown, English */
async function launch(
  home: string,
  extraEnv: Record<string, string> = {},
  userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-link-')),
  options: { colorScheme?: null } = {}
): Promise<Launched> {
  const errors: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    ...options,
    env: { ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US', ...extraEnv }
  })
  app.process().stderr?.on('data', (b: Buffer) => {
    const t = b.toString()
    if (/Error occurred in handler|UnhandledPromiseRejection|TypeError|agentshed-error:|\[parse-pool\]/.test(t)) errors.push(t.trim())
  })
  return { app, win: await app.firstWindow(), errors, userData }
}

async function close(l: Launched, home: string): Promise<void> {
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}

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
function mkLinkHome(fillers = 0): { home: string; liveA: string; liveB: string } {
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

const CLAUDE_LINE = '3 projects · 1 global skill · 1 subagent'
const CODEX_LINE = '1 project · 0 global skills · 0 subagents'
const ZERO_LINE = '0 projects · 0 global skills · 0 subagents'

const card = (win: Page, badge: 'cl' | 'cx' | 'gk' | 'ag'): Locator =>
  win.locator('.pane-head .stats .stat', { has: win.locator(`.badge.${badge}`) })
const countOf = (win: Page, badge: 'cl' | 'cx' | 'gk' | 'ag'): Locator => card(win, badge).locator('.s .stat-link')
const toAgents = (win: Page): Promise<void> => win.locator('.rail .ri').nth(0).click()
const toProjects = (win: Page): Promise<void> => win.locator('.rail .ri').nth(1).click()
const dropdown = (win: Page): Locator => win.locator('.opts .dd-trigger')
const toggle = (win: Page): Locator => win.locator('.side input[type="checkbox"]')
const search = (win: Page): Locator => win.locator('.sh-field input')
const rows = (win: Page): Locator => win.locator('.side .row .nm')
const counter = (win: Page): Locator => win.locator('.opts .cnt')
const selectedRow = (win: Page): Locator => win.locator('.side .row.sel .nm')
const guidance = (win: Page): Locator => win.locator('.startup-project-placeholder .empty')

async function chooseSide(win: Page, name: string): Promise<void> {
  await dropdown(win).click()
  await win.locator('.side-pop .dd-opt', { hasText: name }).click()
}

// agents-overview::REQ-007/AC-01 (pointer), B2 and its boundaries for coming back and the time window;
// projects-list::REQ-002/AC-01, AC-02, AC-03, AC-07 and its boundaries for another side and for unticking.
test('a side card\'s count opens that side\'s projects, the controls work from there, and the rail opens all sides', async () => {
  const { home } = mkLinkHome()
  const l = await launch(home)
  const { win } = l
  try {
    await expect(card(win, 'cl').locator('.s')).toHaveText(CLAUDE_LINE)
    await expect(card(win, 'cx').locator('.s')).toHaveText(CODEX_LINE)

    // An earlier visit leaves a search behind
    await toProjects(win)
    await search(win).fill('zzz')
    await expect(rows(win)).toHaveCount(0)
    await toAgents(win)

    // A window and a tab of the page's own: the count depends on neither, and neither survives the switch
    await win.locator('.tot-c').nth(1).click()
    await expect(win.locator('.tot-c').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    await expect(card(win, 'cl').locator('.s')).toHaveText(CLAUDE_LINE)

    // A side with a stale project: its rows are every project the card counts, so the toggle is on with no counter
    await countOf(win, 'cl').click()
    await expect(win.locator('.app')).toHaveClass(/dim-projects/)
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
    await expect(toggle(win)).toBeChecked()
    await expect(search(win)).toHaveValue('')
    await expect(counter(win)).toHaveCount(0)

    // From there: another side keeps the toggle as it is
    await chooseSide(win, 'Codex')
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).toBeChecked()
    await chooseSide(win, 'Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
    // Unticking hides the stale project and C9's counter shows it
    await toggle(win).uncheck()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveText('1 stale project filtered out')
    // The side, the toggle and search stack (C1)
    await search(win).fill('live-b')
    await expect(rows(win)).toHaveText(['live-b'])
    await expect(dropdown(win)).toHaveText('Claude Code')

    // Back on the agents page: Token and the all-history window, as after any departure
    await toAgents(win)
    await expect(win.locator('.pane-head .tabs .tab.on')).toHaveText('Token')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')

    // A side with no stale project: the toggle is off and there is nothing for a counter to count
    await countOf(win, 'cx').click()
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).not.toBeChecked()
    await expect(search(win)).toHaveValue('')
    await expect(counter(win)).toHaveCount(0)

    // Judged on arrival only: another side with a stale project leaves the toggle off, and C9 counts it
    await chooseSide(win, 'Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(toggle(win)).not.toBeChecked()
    await expect(counter(win)).toHaveText('1 stale project filtered out')

    // Leaving and coming back by the rail: all sides with the toggle off
    await toAgents(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(toggle(win)).not.toBeChecked()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveText('1 stale project filtered out')

    // The count activated and another dimension chosen before that update lands: the list never mounted, and its next
    // way in still opens on all sides. Two click events dispatched in one task, which is what puts the rail's update first.
    await toAgents(win)
    await expect(countOf(win, 'cx')).toBeVisible()
    await win.evaluate(() => {
      document.querySelector<HTMLElement>('.pane-head .stats .stat:has(.badge.cx) .stat-link')?.click()
      document.querySelectorAll<HTMLElement>('.rail .ri')[2]?.click()
    })
    await expect(win.locator('.app')).toHaveClass(/dim-search/)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(toggle(win)).not.toBeChecked()

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

/** The theme's token values, spelled out: the default colour scheme of theme.css */
const LOOK = {
  light: { secondary: 'rgb(120, 119, 116)', strongLine: 'rgb(217, 220, 224)', primary: 'rgb(55, 53, 47)', accent: 'rgb(138, 103, 171)' },
  dark: { secondary: 'rgb(155, 154, 151)', strongLine: 'rgb(52, 55, 60)', primary: 'rgb(230, 230, 229)', accent: 'rgb(160, 132, 199)' }
} as const

const paint = (link: Locator): Promise<{ color: string; line: string; underline: string; thickness: string; outline: string; width: string; outlineColor: string; focusVisible: boolean }> =>
  link.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color,
      line: s.textDecorationLine,
      underline: s.textDecorationColor,
      thickness: s.textDecorationThickness,
      outline: s.outlineStyle,
      width: s.outlineWidth,
      outlineColor: s.outlineColor,
      focusVisible: el.matches(':focus-visible')
    }
  })

// agents-overview::REQ-007/AC-01 (keyboard), AC-02, AC-03, AC-04, AC-05.
test('the count\'s look in light and dark, its keyboard path, plain text at zero, and a card measuring the same', async () => {
  const { home } = mkLinkHome()
  const l = await launch(home, {}, undefined, { colorScheme: null })
  const { win } = l
  try {
    const link = countOf(win, 'cl')
    await expect(link).toHaveText('3 projects')

    for (const mode of ['light', 'dark'] as const) {
      await win.evaluate((m) => window.agentshed.setMode(m), mode)
      await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(mode === 'dark')
      const look = LOOK[mode]

      // At rest: the line's secondary colour and a thin underline in the strong line colour
      await win.mouse.move(5, 5)
      await expect.poll(() => paint(link)).toMatchObject({ color: look.secondary, line: 'underline', underline: look.strongLine, thickness: 'auto', outline: 'none' })
      // The line around it has that same colour: the control does not stand out from its line at rest
      expect(await card(win, 'cl').locator('.s').evaluate((el) => getComputedStyle(el).color)).toBe(look.secondary)

      // On hover: the text and the underline both take the primary colour
      await link.hover()
      await expect.poll(() => paint(link)).toMatchObject({ color: look.primary, underline: look.primary })
      await win.mouse.move(5, 5)

      // A keyboard focus: Tab reaches it and draws the ring
      for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++) await win.keyboard.press('Tab')
      await expect.poll(() => paint(link)).toMatchObject({ focusVisible: true, outline: 'solid', width: '2px', outlineColor: look.accent })

      // Enter activates it
      await win.keyboard.press('Enter')
      await expect(dropdown(win)).toHaveText('Claude Code')
      await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
      await toAgents(win)
      await expect(link).toBeVisible()
    }

    // A zero count is plain text, whether the side registered nothing or is not detected, hit-tested at the words
    // themselves. The same test on the control finds it, so the test can see one.
    const hitAt = (badge: string, from: number, to: number): Promise<string | null> =>
      win.evaluate(([b, a, z]) => {
        const line = document.querySelector(`.pane-head .stats .stat:has(.badge.${b}) .s`)
        if (!line) throw new Error('no third line')
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        let at = 0
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const len = (n.textContent ?? '').length
          if (at + len > a) {
            range.setStart(n, a - at)
            range.setEnd(n, Math.min(z - at, len))
            break
          }
          at += len
        }
        const r = range.getBoundingClientRect()
        if (r.width === 0) throw new Error('the words have no box')
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return el?.closest('button')?.className ?? null
      }, [badge, from, to] as const)
    await expect(card(win, 'gk').locator('.k')).toContainText('Detected')
    await expect(card(win, 'gk').locator('.s')).toHaveText(ZERO_LINE)
    await expect(card(win, 'ag').locator('.k')).toContainText('Not detected')
    await expect(card(win, 'ag').locator('.s')).toHaveText(ZERO_LINE)
    expect(await hitAt('gk', 0, '0 projects'.length)).toBeNull()
    expect(await hitAt('ag', 0, '0 projects'.length)).toBeNull()
    expect(await card(win, 'gk').locator('button').count()).toBe(0)
    expect(await card(win, 'ag').locator('button').count()).toBe(0)
    expect(await hitAt('cl', 0, '3 projects'.length)).toBe('stat-link')

    // Only the project count is a control: the skill and subagent counts, here one each, stay text
    expect(await card(win, 'cl').locator('.s button').count()).toBe(1)
    expect(await hitAt('cl', '3 projects · '.length, '3 projects · 1 global skill'.length)).toBeNull()
    expect(await hitAt('cl', '3 projects · 1 global skill · '.length, CLAUDE_LINE.length)).toBeNull()

    // The card measures the same with a link as with plain text. `.stats` stretches its cards to one height, so
    // comparing them as drawn is always equal: the third lines are measured directly, and the cards with the stretch
    // off. The width is measured on one line, the control swapped for its own text and put back in the same call.
    const measured = await win.evaluate(() => {
      const stats = document.querySelector<HTMLElement>('.pane-head .stats')
      const stat = (b: string): HTMLElement => {
        const el = document.querySelector<HTMLElement>(`.pane-head .stats .stat:has(.badge.${b})`)
        if (!el) throw new Error(`no card ${b}`)
        return el
      }
      const line = (b: string): HTMLElement => {
        const el = stat(b).querySelector<HTMLElement>('.s')
        if (!el) throw new Error(`no line ${b}`)
        return el
      }
      if (!stats) throw new Error('no stats')
      stats.style.alignItems = 'flex-start'
      const heights = { linkCard: stat('cl').getBoundingClientRect().height, zeroCard: stat('gk').getBoundingClientRect().height, linkLine: line('cl').getBoundingClientRect().height, zeroLine: line('gk').getBoundingClientRect().height }
      stats.style.alignItems = ''
      const widthOf = (el: HTMLElement): number => {
        const r = document.createRange()
        r.selectNodeContents(el)
        return r.getBoundingClientRect().width
      }
      const clLine = line('cl')
      const button = clLine.querySelector('button')
      if (!button) throw new Error('no control')
      const withControl = { width: widthOf(clLine), height: clLine.getBoundingClientRect().height, card: stat('cl').getBoundingClientRect().height }
      const text = document.createTextNode(button.textContent ?? '')
      button.replaceWith(text)
      const withText = { width: widthOf(clLine), height: clLine.getBoundingClientRect().height, card: stat('cl').getBoundingClientRect().height }
      text.replaceWith(button)
      return { heights, withControl, withText }
    })
    expect(measured.heights.linkLine).toBeGreaterThan(0)
    expect(measured.heights.linkLine).toBe(measured.heights.zeroLine)
    expect(measured.heights.linkCard).toBe(measured.heights.zeroCard)
    expect(measured.withControl.width).toBeGreaterThan(0)
    expect(measured.withControl).toEqual(measured.withText)

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// agents-overview::REQ-007, the startup skeleton: its third line is a placeholder, so there is no control until the
// first scan fills it.
test('the startup skeleton has no control, and the count is one once the first scan has filled the card', async () => {
  const { home } = mkLinkHome()
  const l = await launch(home, { AGENTSHED_SCAN_DELAY_MS: '3000' })
  const { win } = l
  try {
    await expect(win.locator('.pane-head .stats .stat')).toHaveCount(4)
    // Both read at one moment, so the count of controls is known to come from the skeleton
    const skeleton = await win.evaluate(() => ({
      placeholders: document.querySelectorAll('.pane-head .stats .sk-ph').length,
      controls: document.querySelectorAll('.pane-head .stats button').length
    }))
    expect(skeleton.placeholders).toBeGreaterThan(0)
    expect(skeleton.controls).toBe(0)
    await expect(win.locator('.pane-head .stats button')).toHaveText(['3 projects', '1 project'], { timeout: 15000 })
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// agents-overview::REQ-007, the third line replaced by an error or by the unreadable count: the line has no project
// count, so no control, even when the side has a project; the side can still be chosen in the dropdown.
test('a third line showing an error or the unreadable count has no control, and the dropdown still offers the side', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-link-agy-'))
  const proj = join(home, 'trusted-proj')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const agy = join(home, '.gemini', 'antigravity-cli')
  const conversations = join(agy, 'conversations')
  mkdirSync(conversations, { recursive: true })
  writeFileSync(join(agy, 'settings.json'), '{ not json')
  // A conversation in a format this build does not read: the shape the Antigravity usage cases use
  const at = Date.now()
  const { step, gen } = callRecord({ conversationId: 'c-new', stepIdx: 1, genIdx: 0, usage: { messageId: 'e-new', input: 50 }, createdAt: at - 5_000, completedAt: at, responseModel: 'gemini-3.6-flash' })
  writeConversation(conversations, 'c-new', encodeTrajectoryMetadata({ folders: [proj], conversationId: 'c-new' }), { steps: [step], gens: [gen], userVersion: 2 })
  const l = await launch(home, { AGENTSHED_RESCAN_MS: '250' })
  const { win } = l
  try {
    const ag = card(win, 'ag')
    await expect(ag.locator('.stat-err')).toBeVisible()
    await expect(countOf(win, 'cl')).toHaveText('1 project')
    expect(await ag.locator('button').count()).toBe(0)

    // Repaired, trusting a folder: the side now has a project, and the line shows the unreadable count instead
    writeFileSync(join(agy, 'settings.json'), settingsJson([proj]))
    await expect(ag.locator('.side-warn')).toHaveText('1 conversation couldn’t be read')
    expect(await ag.locator('button').count()).toBe(0)

    await toProjects(win)
    await chooseSide(win, 'Antigravity')
    await expect(rows(win)).toHaveText(['trusted-proj'])
    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// projects-list::REQ-002/AC-04, AC-05 and the boundaries for a kept stale project and a cleared open session.
test('a selection registered on that side stays on the stage, and one that is not is cleared', async () => {
  const { home } = mkLinkHome()
  const l = await launch(home)
  const { win } = l
  const title = win.locator('.det-title h1')
  const sessionTitle = win.locator('.pane-head .stitle')
  const openSession = async (question: string): Promise<void> => {
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.pane-body .card .se', { hasText: question }).click()
    await expect(sessionTitle).toHaveText(question)
  }
  try {
    // Kept: its project page
    await toProjects(win)
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await expect(title).toHaveText('live-b')
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(selectedRow(win)).toHaveText('live-b')
    await expect(title).toHaveText('live-b')
    await expect(guidance(win)).toHaveCount(0)

    // Kept: its open session page
    await openSession('Question in live-b')
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(selectedRow(win)).toHaveText('live-b')
    await expect(sessionTitle).toHaveText('Question in live-b')

    // Kept, and stale: the side has a stale project, so the toggle is on and its row and note page show
    await win.locator('.side .row', { hasText: 'ghost-a' }).click()
    await expect(win.locator('.stale-note')).toBeVisible()
    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(toggle(win)).toBeChecked()
    await expect(selectedRow(win)).toHaveText('ghost-a')
    await expect(win.locator('.stale-note')).toBeVisible()

    // Cleared: not registered on that side. No row is selected and the guidance shows, as with no selection at all
    await toAgents(win)
    await countOf(win, 'cx').click()
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(guidance(win)).toHaveText('Select a project to see its details')
    await expect(selectedRow(win)).toHaveCount(0)
    await expect(win.locator('.stale-note')).toHaveCount(0)

    // It stays cleared: the rail back to the list shows the guidance over all sides
    await toAgents(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(guidance(win)).toBeVisible()
    await expect(selectedRow(win)).toHaveCount(0)

    // Cleared with its open session page
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await openSession('Question in live-b')
    await toAgents(win)
    await countOf(win, 'cx').click()
    await expect(guidance(win)).toHaveText('Select a project to see its details')
    await expect(sessionTitle).toHaveCount(0)
    await expect(selectedRow(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// projects-list::REQ-002, the kept row below the fold and a side with only stale projects.
test('a kept row below the fold leaves the list at its top, and a side with only stale projects shows them all', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-link-many-'))
  const projects: Record<string, object> = {}
  for (let i = 0; i < 40; i++) {
    const p = join(home, `proj-${String(i).padStart(2, '0')}`)
    mkdirSync(p)
    projects[p] = {}
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))
  mkdirSync(join(home, '.grok'))
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${join(home, 'grok-ghost')}"]\ntrusted = true\n`)
  const l = await launch(home)
  const { win } = l
  const list = win.locator('.side .list')
  const scrollTop = (): Promise<number> => list.evaluate((el) => el.scrollTop)
  try {
    await toProjects(win)
    await expect(win.locator('.side .row')).toHaveCount(40)
    await win.locator('.side .row').last().click()
    const kept = await selectedRow(win).innerText()
    expect(await scrollTop(), 'the row was reached by scrolling').toBeGreaterThan(0)

    await toAgents(win)
    await countOf(win, 'cl').click()
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(selectedRow(win)).toHaveText(kept)
    expect(await scrollTop()).toBe(0)
    await expect(win.locator('.side .row.sel')).not.toBeInViewport()

    // A side with only stale projects: the card's count, every row struck through, the toggle on and no counter
    await toAgents(win)
    await expect(countOf(win, 'gk')).toHaveText('1 project')
    await countOf(win, 'gk').click()
    await expect(rows(win)).toHaveText(['grok-ghost'])
    expect(await rows(win).evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('line-through')
    await expect(toggle(win)).toBeChecked()
    await expect(counter(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

/** Everything an arrival must get right, read off the page */
interface Frame {
  dim: string | undefined
  side: string | null
  stale: boolean | null
  rows: number
  selected: string | null
  stage: 'note' | 'session' | 'project' | 'guidance' | 'none'
}

/**
 * Starts recording a frame on every change to the page, replacing any earlier recording. "No frame shows all sides" is
 * a claim over every moment, so it is recorded in the page and read afterwards rather than polled.
 */
const startRecording = (win: Page): Promise<void> =>
  win.evaluate(() => {
    const g = globalThis as unknown as { __frames: string[]; __recorder?: MutationObserver }
    g.__recorder?.disconnect()
    g.__frames = []
    const read = (): void => {
      const frame: Frame = {
        dim: [...(document.querySelector('.app')?.classList ?? [])].find((c) => c.startsWith('dim-')),
        side: document.querySelector('.opts .dd-trigger')?.textContent ?? null,
        stale: document.querySelector<HTMLInputElement>('.side input[type="checkbox"]')?.checked ?? null,
        rows: document.querySelectorAll('.side .row').length,
        selected: document.querySelector('.side .row.sel .nm')?.textContent ?? null,
        stage: document.querySelector('.stale-note') ? 'note'
          : document.querySelector('.pane-head .stitle') ? 'session'
          : document.querySelector('.det-title') ? 'project'
          : document.querySelector('.startup-project-placeholder') ? 'guidance'
          : 'none'
      }
      g.__frames.push(JSON.stringify(frame))
    }
    g.__recorder = new MutationObserver(read)
    g.__recorder.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
  })

/** The distinct frames recorded under the Projects dimension, in order */
const projectFrames = async (win: Page): Promise<Frame[]> => {
  const all = await win.evaluate(() => (globalThis as unknown as { __frames: string[] }).__frames)
  return [...new Set(all)].map((f) => JSON.parse(f) as Frame).filter((f) => f.dim === 'dim-projects')
}

// projects-list::REQ-002/AC-06 and its technical prerequisite: the first frame is already the filtered list, and the
// dimension, the list and the detail area change in one update. The rail's run is the positive case: it does draw all
// sides and a project's page, so the recording can see what the arrivals must never show. The list is long on purpose:
// over three rows, a filter set in an effect after mounting stayed green here, and over this one it goes red (measured
// 2026-11-03, the first implementation's review).
test('arriving is one update: no frame shows all sides or the wrong stage, recorded over every moment', async () => {
  const { home } = mkLinkHome(400)
  const l = await launch(home)
  const { win } = l
  const arrive = async (badge: 'cl' | 'cx'): Promise<Frame[]> => {
    await toAgents(win)
    await expect(countOf(win, badge)).toBeVisible()
    await startRecording(win)
    await countOf(win, badge).click()
    await expect(dropdown(win)).toHaveText(badge === 'cl' ? 'Claude Code' : 'Codex')
    const frames = await projectFrames(win)
    expect(frames.length).toBeGreaterThan(0)
    return frames
  }
  try {
    await toProjects(win)
    await win.locator('.side .row', { hasText: 'live-b' }).click()
    await expect(win.locator('.det-title h1')).toHaveText('live-b')

    // A selection on that side: the filtered list and its project page from the first frame
    for (const f of await arrive('cl')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Claude Code', stale: true, rows: 403, selected: 'live-b', stage: 'project' })
    }

    // The positive case: the rail's way in does show all sides and that page, and the recording sees them
    await toAgents(win)
    await expect(countOf(win, 'cl')).toBeVisible()
    await startRecording(win)
    await toProjects(win)
    await expect(dropdown(win)).toHaveText('All')
    await expect(win.locator('.det-title h1')).toHaveText('live-b')
    expect(await projectFrames(win)).toContainEqual({ dim: 'dim-projects', side: 'All', stale: false, rows: 402, selected: 'live-b', stage: 'project' })

    // The same with its session page open
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.pane-body .card .se', { hasText: 'Question in live-b' }).click()
    await expect(win.locator('.pane-head .stitle')).toHaveText('Question in live-b')
    for (const f of await arrive('cl')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Claude Code', stale: true, rows: 403, selected: 'live-b', stage: 'session' })
    }

    // A selection off that side: the filtered list and the guidance from the first frame, never the old session page
    for (const f of await arrive('cx')) {
      expect(f).toEqual({ dim: 'dim-projects', side: 'Codex', stale: false, rows: 1, selected: null, stage: 'guidance' })
    }

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// projects-list::REQ-002 and agents-overview::REQ-007, a scan landing: rows update in place, the dropdown and the toggle
// stay, and a side gaining its first stale project shows it through C9. Afterwards the card and a new arrival agree.
test('a scan landing while the list is open keeps its filters, and the card and the rows agree afterwards', async () => {
  const { home, liveA, liveB } = mkLinkHome()
  const l = await launch(home, { AGENTSHED_RESCAN_MS: '250' })
  const { win } = l
  try {
    await countOf(win, 'cx').click()
    await expect(rows(win)).toHaveText(['live-a'])
    await expect(toggle(win)).not.toBeChecked()

    // The side's registry gains a project: the row arrives in place
    writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${liveA}"]\ntrust_level = "trusted"\n[projects."${liveB}"]\ntrust_level = "trusted"\n`)
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(toggle(win)).not.toBeChecked()

    // The side's first stale project does not turn the toggle on: C9's counter shows it
    rmSync(liveA, { recursive: true, force: true })
    await expect(counter(win)).toHaveText('1 stale project filtered out')
    await expect(rows(win)).toHaveText(['live-b'])
    await expect(dropdown(win)).toHaveText('Codex')
    await expect(toggle(win)).not.toBeChecked()

    // The card reads the scan's count, and a new arrival is judged afresh, so its rows equal that count
    await toAgents(win)
    await expect(card(win, 'cx').locator('.s')).toHaveText('2 projects · 0 global skills · 0 subagents')
    await countOf(win, 'cx').click()
    await expect(toggle(win)).toBeChecked()
    await expect(rows(win)).toHaveText(['live-a', 'live-b'])
    await expect(counter(win)).toHaveCount(0)

    expect(l.errors).toEqual([])
  } finally {
    await close(l, home)
  }
})

// agents-overview::REQ-007, a restored snapshot during the first scan: the control works from the restored data and the
// list shows that same data. The registry gained a project between the launches and the scan is held, so only the
// restored copy can give three.
test('during the first scan the count works from the restored snapshot, and the list shows that same data', async () => {
  const { home } = mkLinkHome()
  const first = await launch(home)
  const later = join(home, 'later-proj')
  let second: Launched | undefined
  try {
    await expect(countOf(first.win, 'cl')).toHaveText('3 projects')
    await closeApp(first.app)
    mkdirSync(later)
    const registry = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')) as { projects: Record<string, object> }
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { ...registry.projects, [later]: {} } }))

    second = await launch(home, { AGENTSHED_SCAN_DELAY_MS: '20000' }, first.userData)
    const { win } = second
    await expect(countOf(win, 'cl')).toHaveText('3 projects', { timeout: 5000 })
    await countOf(win, 'cl').click()
    await expect(dropdown(win)).toHaveText('Claude Code')
    await expect(rows(win)).toHaveText(['live-a', 'live-b', 'ghost-a'])
    await expect(toggle(win)).toBeChecked()
    expect(await win.locator('.startup-display-hint').getAttribute('data-state'), 'the first scan is still held').not.toBe('ready')
    expect(first.errors).toEqual([])
    expect(second.errors).toEqual([])
  } finally {
    if (second) await closeApp(second.app).catch(() => {})
    rmSync(first.userData, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})
