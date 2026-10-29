import type {} from '../src/renderer/src/env'
// Real Electron lifecycle: the display is earned by reading, then restored independently of indexing.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { emptySnapshot } from '../src/shared/domain'

test('restart restores viewed project, questions and read answer before a new scan finishes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-restore-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-restore-data-'))
  const proj = join(home, 'restore-project')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const cdir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(cdir, { recursive: true })
  const timestamp = new Date().toISOString()
  writeFileSync(join(cdir, 'saved.jsonl'), [
    { type: 'user', timestamp, message: { role: 'user', content: 'Saved question' } },
    { type: 'assistant', timestamp, message: { model: 'claude-fable-5', content: [{ type: 'text', text: 'Saved answer' }], usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: 'user', timestamp, message: { role: 'user', content: 'Unread question' } },
    { type: 'assistant', timestamp, message: { content: [{ type: 'text', text: 'Unread answer' }] } }
  ].map(x => JSON.stringify(x)).join('\n') + '\n')
  mkdirSync(join(cdir, 'memory'))
  writeFileSync(join(cdir, 'memory', 'topic.md'), 'Saved memory body')
  const skill = join(proj, '.claude', 'skills', 'restore-skill')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '---\ndescription: Restore fixture\n---\nSaved skill body')
  writeFileSync(join(proj, 'CONTEXT.md'), '# Saved artifact\nSaved artifact body')
  async function previews(win: Page, timeout = 5000): Promise<void> {
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'topic.md' }).click()
    // A restored body opens in the memory file drawer's preview like a fresh read (memory-view E1)
    await expect(win.locator('.file-drawer .md-preview-body.preview')).toContainText('Saved memory body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
    await win.locator('.it.ai', { hasText: 'Saved artifact' }).click()
    await expect(win.locator('.reader .md')).toContainText('Saved artifact body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    const row = win.locator('.sk', { hasText: 'restore-skill' })
    await row.locator('.sk-head').click()
    await expect(row.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible({ timeout })
    await row.locator('.files button', { hasText: 'SKILL.md' }).click()
    await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Saved skill body', { timeout })
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }
  let app: ElectronApplication | undefined
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: {
    ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home,
    AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US',
    ...(app ? { AGENTSHED_SCAN_DELAY_MS: '20000', AGENTSHED_FETCH_DELAY_MS: '1000' } : {})
  } })
  try {
    app = await launch()
    let win = await app.firstWindow()
    win.on('pageerror', e => console.error('RENDERER', e))
    win.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()) })
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'restore-project' }).click()
    await previews(win)
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.se', { hasText: 'Saved question' }).click()
    await win.locator('.qlist .q', { hasText: 'Saved question' }).click()
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'])
    await win.locator('.rail .ri').nth(0).click()
    await expect(win.locator('.tot-c').nth(1)).toContainText('2k')
    await win.locator('.trend-span-options').getByRole('button', { name: '90', exact: true }).click()
    await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText('Last 90 days')
    const observedAt = await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))
    await win.clock.install({ time: new Date('2030-01-01T00:30:00Z') })
    await win.clock.fastForward(61_000)
    // The display clock's once-a-second timer was set before this fake clock, so it keeps real time: the card turns
    // at its next real tick, up to a second after the jump, and then renders. Only the display clock reads the wall
    // clock and no scan comes within the window, so the card can only turn through it.
    await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0')
    const cdp = await win.context().newCDPSession(win)
    await win.locator('.tot-c').nth(1).click()
    for (const [timezoneId, day] of [['Pacific/Honolulu', '2029-12-31'], ['Asia/Shanghai', '2030-01-01']]) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId })
      await win.clock.fastForward(1000)
      await expect(win.locator('.chart .col').last()).toHaveAttribute('data-day', day)
      await expect(win.locator('.chart .col:not(.out)')).toHaveCount(1)
      await expect(win.locator('.chart .col:not(.out)')).toHaveAttribute('data-day', day)
      await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0')
      await expect(win.locator('.tot-c').nth(3).locator('.v')).toHaveText('0')
      await expect(win.locator('.chart .col')).toHaveCount(90)
    }
    expect(await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))).toBe(observedAt)
    await cdp.detach()
    await closeApp(app)
    writeFileSync(join(userData, 'token-cache.json'), JSON.stringify({ version: -1 }))
    const skillBody = readFileSync(join(skill, 'SKILL.md'), 'utf8')
    unlinkSync(join(skill, 'SKILL.md'))
    app = await launch()
    win = await app.firstWindow()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents', { timeout: 5000 })
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 1000 })
    await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText('90')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'restore-project' }).click()
    await expect(win.locator('.det-title h1')).toHaveText('restore-project', { timeout: 1000 })
    await previews(win, 500)
    writeFileSync(join(skill, 'SKILL.md'), skillBody)
    await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
    await win.locator('.se', { hasText: 'Saved question' }).click()
    await expect(win.locator('.qlist .q', { hasText: 'Saved question' })).toBeVisible({ timeout: 1000 })
    await expect(win.locator('.turn')).toHaveCount(0)
    await win.locator('.qlist .q', { hasText: 'Saved question' }).click()
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'], { timeout: 500 })
    const reads = await win.evaluate(() => window.agentshed.getStartup().then(r => r.display.reads))
    expect(reads.filter(r => r.kind === 'turnContent')).toHaveLength(1)
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-restored.png' })
    // A restored registration never authorizes an arbitrary path or a substituted symlink.
    const artifact = join(proj, 'CONTEXT.md'), outside = join(home, 'outside.md')
    writeFileSync(outside, 'Unregistered secret')
    const denied = (file: string) => win.evaluate(async f => {
      try { await window.agentshed.readArtifact(f); return false } catch { return true }
    }, file)
    expect(await denied(outside)).toBe(true)
    const original = readFileSync(artifact, 'utf8')
    unlinkSync(artifact)
    symlinkSync(outside, artifact)
    expect(await denied(artifact)).toBe(true)
    unlinkSync(artifact)
    writeFileSync(artifact, original)
    // Showing a session's record file in Finder before the first scan (session-view::US-001/AC-07): the allow-list is
    // still the restored one, whose entries are shown only while they are regular files. Finder's call is recorded
    // at the process boundary, so the run opens no Finder; the startup state, read before and after, proves the scan
    // is still held.
    if (!app) throw new Error('the second launch is not running')
    const running = app
    const hint = win.locator('.startup-display-hint')
    expect(await hint.getAttribute('data-state')).not.toBe('ready')
    await running.evaluate(({ shell }) => {
      const g = globalThis as unknown as { __revealed: string[] }
      g.__revealed = []
      shell.showItemInFolder = (p: string) => {
        g.__revealed.push(p)
      }
    })
    const revealed = (): Promise<string[]> => running.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed)
    const reveal = (file: string) => win.evaluate(async f => {
      try { await window.agentshed.revealSessionFile(f); return 'shown' } catch { return 'refused' }
    }, file)
    // The file is moved aside and back by rename, so it keeps its inode: the case's later steps, the in-place rewrite
    // among them, run on the setup they had before this check.
    const session = join(cdir, 'saved.jsonl'), aside = join(home, 'saved-aside.jsonl')
    const inode = statSync(session).ino
    renameSync(session, aside)
    symlinkSync(aside, session)
    expect(await reveal(session)).toBe('refused')
    expect(await revealed()).toEqual([])
    unlinkSync(session)
    renameSync(aside, session)
    expect(statSync(session).ino, 'the session file is back under its own inode').toBe(inode)
    expect(await reveal(session)).toBe('shown')
    expect(await revealed()).toEqual([session])
    // An old question never shows a new answer after an in-place rewrite (session-view::REQ-001/AC-04). When the held
    // scan completes, its snapshot refetches the open turn with the saved page's question identity while the page
    // itself waits out the fetch delay, so for that second the list shows the saved question over whatever the turn
    // channel accepts. The rewrite keeps the question line's length, so its byte range is the same and only its text
    // tells it from the saved one. An observer, installed while the scan is still held, records every question row
    // the list shows with its open turn's answer.
    await win.evaluate(() => {
      const g = globalThis as unknown as { __pairs: string[] }
      g.__pairs = []
      const record = (): void => {
        for (const row of document.querySelectorAll('.qlist .q')) {
          const turn = row.nextElementSibling
          if (!turn?.classList.contains('turn')) continue
          const answer = [...turn.querySelectorAll('.ans')].map((a) => a.textContent).join(' | ')
          const pair = `${row.querySelector('.txt')?.textContent ?? ''} → ${answer}`
          if (!g.__pairs.includes(pair)) g.__pairs.push(pair)
        }
      }
      record()
      new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    expect(await hint.getAttribute('data-state')).not.toBe('ready')
    const source = join(cdir, 'saved.jsonl')
    writeFileSync(source, readFileSync(source, 'utf8').replaceAll('Saved question', 'Fresh question').replaceAll('Saved answer', 'Fresh answer'))
    // The complete saved page remains usable until a current mapping arrives.
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'])
    await expect(win.locator('.stitle')).toHaveText('Fresh question', { timeout: 25000 })
    await expect(win.locator('.turn .ans')).toHaveText(['Fresh answer'])
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
    const pairs = await win.evaluate(() => (globalThis as unknown as { __pairs: string[] }).__pairs)
    expect(pairs, 'the observer read the saved page').toContain('Saved question → Saved answer')
    expect(pairs, 'the observer read the rewritten page').toContain('Fresh question → Fresh answer')
    expect(pairs, 'the saved question never shows the rewritten answer').not.toContain('Saved question → Fresh answer')
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-refreshed.png' })
    // A question moved without changing its line (one line put before it, a record shape seen before the first
    // question of a real Claude Code file) changes the question mapping, so the identity read before the move is
    // refused (session-view::REQ-001, opening restored content). Asserted at the turn channel: on screen the moved
    // question would show its own answer either way. The page re-read after the move gives an identity the channel
    // accepts, so the refusal is the identity's.
    const turn = (revision: string): Promise<string> => win.evaluate(async ([file, r]) => {
      try { return JSON.stringify((await window.agentshed.getSessionTurn({ file, i: 0, revision: r })).blocks) } catch (e) { return String((e as Error).message) }
    }, [source, revision] as const)
    const first = (p: { questions: { revision?: string }[] }): string => {
      const revision = p.questions[0]?.revision
      if (revision === undefined) throw new Error('the page gives its first question no identity')
      return revision
    }
    const current = await win.evaluate(f => window.agentshed.getSessionPage(f), source)
    writeFileSync(source, JSON.stringify({ type: 'permission-mode', permissionMode: 'default', sessionId: 'restore-session' }) + '\n' + readFileSync(source, 'utf8'))
    expect(await turn(first(current))).toContain('session-not-indexed')
    const moved = await win.evaluate(f => window.agentshed.getSessionPage(f), source)
    expect(moved.questions.map(q => q.text)).toEqual(['Fresh question', 'Unread question'])
    expect(await turn(first(moved))).toContain('Fresh answer')
    // A current detail listing retires the old exact artifact registration.
    unlinkSync(artifact)
    await win.evaluate(path => window.agentshed.getProjectDetail(path), proj)
    expect(await denied(artifact)).toBe(true)
    // Remove Playwright's default light emulation before testing Electron's appearance preference.
    await win.emulateMedia({ colorScheme: null })
    await win.evaluate(() => window.agentshed.setMode('dark'))
    await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-dark.png' })

  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

// agents-overview::REQ-004 across an update: a display cache written by the version before configuration entries
// carried their paths — its snapshot's global layer as this machine's cache held it on 2026-10-29, `claudeGlobalMd` and
// `codexAgentsMd` as contents beside a `codexConfigSummary` — restores before the first scan, each file under the path
// the main process knows it by. The scan is held, so the saved copy is the only source of what the section shows.
test('a snapshot saved before configuration entries carried their paths restores with them, before the first scan', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-cfg-restore-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-cfg-restore-data-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Live rules\n')
  const current = emptySnapshot(1)
  current.sides.claude.detected = true
  current.sides.codex.detected = true
  const global: Record<string, unknown> = {
    ...current.global,
    claudeGlobalMd: { text: '# Saved rules\n', truncated: false },
    codexAgentsMd: { text: '# Saved codex notes\n', truncated: false },
    codexConfigSummary: { model: 'gpt-5.5-codex', projectCount: 0, mcpCount: 0 }
  }
  delete global.claudeMd
  delete global.agentsMd
  writeFileSync(join(userData, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    snapshot: { ...current, global }, stats: [], sessionFiles: [], registrations: [], reads: []
  } }))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: {
      ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1',
      AGENTSHED_SYSTEM_LANGUAGES: 'en-US', AGENTSHED_SCAN_DELAY_MS: '20000'
    } })
    const win = await app.firstWindow()
    const paths = win.locator('.pane-body .cfg-path')
    await win.locator('.pane-head .tabs .tab', { hasText: 'Config' }).click()
    await expect(paths).toHaveText([join(home, '.claude', 'CLAUDE.md')], { timeout: 5000 })
    await expect(win.locator('.pane-body .md')).toContainText('Saved rules')
    await win.locator('.pane-body .cfg-switch button', { hasText: 'AGENTS.md' }).click()
    await expect(paths).toHaveText([join(home, '.codex', 'AGENTS.md')])
    await expect(win.locator('.pane-body .md')).toContainText('Saved codex notes')
    expect(await win.locator('.startup-display-hint').getAttribute('data-state'), 'the first scan is still held').not.toBe('ready')
  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})

test('a failed startup scan keeps the saved display and retries automatically with a stopped status', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-retry-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-retry-data-'))
  const first = join(home, 'first-project'), second = join(home, 'second-project')
  mkdirSync(first)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [first]: {} } }))
  let app: ElectronApplication | undefined
  const launch = (env: Record<string, string> = {}) => electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: {
    ...process.env, NODE_ENV: 'production', AGENTSHED_HOME_OVERRIDE: home, AGENTSHED_NO_FOREGROUND: '1', AGENTSHED_SYSTEM_LANGUAGES: 'en-US', ...env
  } })
  try {
    app = await launch()
    let win = await app.firstWindow()
    await win.locator('.trend-span-options').getByRole('button', { name: '60', exact: true }).click()
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    await closeApp(app)
    app = await launch({ AGENTSHED_SCAN_FAILURES: '2', AGENTSHED_SCAN_DELAY_MS: '500', AGENTSHED_RESCAN_MS: '4000' })
    win = await app.firstWindow()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'waiting', { timeout: 2000 })
    await expect(win.locator('.startup-display-hint')).toContainText('Showing previous data')
    await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText('60')
    await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText('Last 60 days')
    expect(await win.locator('.startup-display-hint svg').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    mkdirSync(second)
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [first]: {}, [second]: {} } }))
    await expect(win.locator('.side .row')).toHaveCount(2, { timeout: 12000 })
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
  } finally {
    if (app) await closeApp(app).catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})
