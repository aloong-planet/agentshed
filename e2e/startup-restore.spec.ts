/// <reference path="../src/renderer/src/env.d.ts" />
// Real Electron lifecycle: the display is earned by reading, then restored independently of indexing.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

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
    await expect(win.locator('.drawer .raw')).toContainText('Saved memory body', { timeout })
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
    await expect(win.locator('.skill-drawer .md-preview-body')).toContainText('Saved skill body', { timeout })
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
    const observedAt = await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))
    await win.clock.install({ time: new Date('2030-01-01T00:30:00Z') })
    await win.clock.fastForward(61_000)
    await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0', { timeout: 1000 })
    const cdp = await win.context().newCDPSession(win)
    await win.locator('.tot-c').nth(1).click()
    for (const [timezoneId, day] of [['Pacific/Honolulu', '2029-12-31'], ['Asia/Shanghai', '2030-01-01']]) {
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId })
      await win.clock.fastForward(1000)
      await expect(win.locator('.chart .col').last()).toHaveAttribute('data-day', day)
      await expect(win.locator('.chart .col:not(.out)')).toHaveCount(1)
      await expect(win.locator('.chart .col:not(.out)')).toHaveAttribute('data-day', day)
      await expect(win.locator('.tot-c').nth(1).locator('.v')).toHaveText('0')
    }
    expect(await win.evaluate(() => window.agentshed.getSnapshot().then(s => s.scannedAt))).toBe(observedAt)
    await cdp.detach()
    await app.close()
    writeFileSync(join(userData, 'token-cache.json'), JSON.stringify({ version: -1 }))
    const skillBody = readFileSync(join(skill, 'SKILL.md'), 'utf8')
    unlinkSync(join(skill, 'SKILL.md'))
    app = await launch()
    win = await app.firstWindow()
    await expect(win.locator('.pane-head h1')).toHaveText('Agents', { timeout: 5000 })
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 1000 })
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
    const source = join(cdir, 'saved.jsonl')
    writeFileSync(source, readFileSync(source, 'utf8').replaceAll('Saved question', 'Rewritten question').replaceAll('Saved answer', 'Rewritten answer'))
    // The complete saved page remains usable until a current mapping arrives.
    await expect(win.locator('.turn .ans')).toHaveText(['Saved answer'])
    await expect(win.locator('.stitle')).toHaveText('Rewritten question', { timeout: 25000 })
    await expect(win.locator('.turn .ans')).toHaveText(['Rewritten answer'])
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
    await win.screenshot({ path: 'docs/.workings/startup-restore/session-refreshed.png' })
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
    await app?.close().catch(() => {})
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
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    await app.close()
    app = await launch({ AGENTSHED_SCAN_FAILURES: '2', AGENTSHED_SCAN_DELAY_MS: '500', AGENTSHED_RESCAN_MS: '4000' })
    win = await app.firstWindow()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'waiting', { timeout: 2000 })
    await expect(win.locator('.startup-display-hint')).toContainText('Showing previous data')
    expect(await win.locator('.startup-display-hint svg').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(1)
    mkdirSync(second)
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [first]: {}, [second]: {} } }))
    await expect(win.locator('.side .row')).toHaveCount(2, { timeout: 12000 })
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready')
  } finally {
    await app?.close().catch(() => {})
    rmSync(home, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
})
