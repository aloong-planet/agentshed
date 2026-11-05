import type {} from '../src/renderer/src/env'
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp } from './close-app'
import { AGENT_SIDES } from '../src/shared/validate'
import { localDayOffset } from './support/dates'
import { mkUsageHome, mkEmptyProjectHome } from './support/homes'
import { makeUserData, launch, close, launchAppearance, startApp, failOnMainErrors } from './support/launch'
import { effectiveDark } from './support/colors'
import { ERR } from '../src/shared/errors'

const mainErrors = failOnMainErrors()

test('the archive: a seeded historical archive file → the trend includes an archived span with a note, and the main process reports no errors', async () => {
  // Build a historical row whose source file is long gone (simulating the state after the agent cleaned up
  // old sessions)
  const userData = makeUserData()
  writeFileSync(
    join(userData, 'usage-archive.json'),
    JSON.stringify({
      version: 1,
      rows: [
        {
          day: '2020-01-01',
          side: 'claude',
          projectKey: '/legacy',
          model: 'claude-legacy',
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 12345
        }
      ]
    })
  )
  // A fixture home is mandatory: this case only cares about the archive file in userData, but without an
  // injected home it scanned
  // **the developer's real ~/.claude**; and since makeUserData() gives a fresh temporary directory every
  // time, the token cache
  // is always cold, so the first-paint time follows each person's data volume. CI stayed green because its
  // home is empty, while locally with 600MB+
  // of data it failed two runs out of three (2026-08-03, ticket 03a).
  const { app, errors } = await startApp({ userData, home: mkEmptyProjectHome() })
  const win = await app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // The archive note appears (that day's source file is absent → it counts toward archivedDays)
  await expect(win.locator('.arch-note')).toBeVisible()
  expect(errors).toEqual([])
  await closeApp(app)
  rmSync(userData, { recursive: true, force: true })
})

test('the archive retains a past day whose live figure fell under the same stamp (ADR-0026): the retained figure shows on both pages, with no hatching, while the archived-only day still hatches', async () => {
  // The fixture home has Claude usage of 1500 tokens two days ago. The seeded v2 archive holds 5,000,000
  // for that (day, side) under the app's own accounting stamp, so the scan's lower live figure is a
  // same-stamp decrease on a past day: retained, drawn like any other day (spec C10, G15). The 2020 row
  // has no live counterpart at all: archived-only, hatched and counted in the note (spec C6, C9).
  const home = mkUsageHome()
  const proj = join(home, 'demo-proj')
  const d = localDayOffset(2)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // The stamp the app composes: package.json version + the cache structure version. The cache version
  // is a literal here on purpose: a bump turns this case red (the seeded pair reads as another stamp and
  // the decrease is accepted) instead of silently passing — update it together with CACHE_VERSION.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
  const stamp = `${pkg.version}+c19`
  const retainedRow = {
    day,
    side: 'claude',
    projectKey: proj.toLowerCase(),
    model: 'claude-fable-5',
    input: 4_000_000,
    output: 1_000_000,
    cacheRead: 0,
    cacheWrite: 0,
    total: 5_000_000
  }
  const legacyRow = { day: '2020-01-01', side: 'claude', projectKey: '/legacy', model: 'claude-legacy', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 12345 }
  const userData = makeUserData()
  writeFileSync(
    join(userData, 'usage-archive.json'),
    JSON.stringify({
      version: 2,
      rows: [legacyRow, retainedRow],
      stamps: { [`${day}\u0000claude`]: stamp, ['2020-01-01\u0000claude']: stamp },
      observed: {},
      superseded: []
    })
  )
  const { app, errors } = await startApp({ userData, home })
  const win = await app.firstWindow()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  // Cross-project page: the retained day carries the archived figure and no hatching
  const bar = win.locator(`.chart .col[data-day="${day}"]`)
  await expect(bar).toHaveAttribute('data-tip', /Anthropic\s+5\.0M/)
  await expect(bar).not.toHaveClass(/\barch\b/)
  // The archived-only day still drives the note
  await expect(win.locator('.arch-note')).toBeVisible()
  // Project page: the same day derives from the same rows (spec G6)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  const projBar = win.locator(`.chart .col[data-day="${day}"]`)
  await expect(projBar).toHaveAttribute('data-tip', /Anthropic\s+5\.0M/)
  await expect(projBar).not.toHaveClass(/\barch\b/)
  expect(errors).toEqual([])
  await closeApp(app)
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

test('token-stats::REQ-005: an archive holding rows of a side this build does not know → the page loads with them left out of the figures and the note, and the file keeps them', async () => {
  // A newer build that adds a side archives its rows into the user-data directory this build reads. The side's
  // name is generated outside the set, so a side added later can never take it. Counted, the rows would raise the
  // all-history figure and make 2019-12-31 a second archived-only day — and before they were held apart, the scan
  // threw on them and the first-scan skeleton never left.
  let outside = 'side-from-a-newer-build'
  while (AGENT_SIDES.has(outside)) outside += '+'
  const row = (day: string, side: string, total: number): Record<string, unknown> =>
    ({ day, side, projectKey: '/legacy', model: 'gemini-3.8-flash-n', input: total, output: 0, cacheRead: 0, cacheWrite: 0, total })
  const theirs = [row('2019-12-31', outside, 5_000), row('2020-01-02', outside, 900_000)]
  const userData = makeUserData()
  writeFileSync(join(userData, 'usage-archive.json'),
    JSON.stringify({ version: 2, rows: [row('2020-01-02', 'claude', 12_000), ...theirs], stamps: {}, observed: {}, superseded: [] }))
  const home = mkEmptyProjectHome()
  const { app, errors, stderr } = await startApp({ userData, home })
  const win = await app.firstWindow()
  await expect(win.locator('.arch-note')).toContainText('For 1 of those days (earliest 2020-01-02)')
  await expect(win.locator('.sk-page')).toHaveCount(0)
  await expect(win.locator('.pane-head .tot-row .tot-c').first().locator('.v')).toHaveText('12k')
  expect(errors).toEqual([])
  expect(stderr.filter((t) => t.includes('scan failed'))).toEqual([])
  await closeApp(app)
  const file = JSON.parse(readFileSync(join(userData, 'usage-archive.json'), 'utf8')) as { rows: Array<{ side: string }> }
  expect(file.rows.filter((r) => r.side === outside)).toEqual(theirs)
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

test('the trend chart is stacked bars: segmented by provider within a bar, and switching to a single side leaves only that side\'s provider segments', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  // Combined mode: the fixture seeds usage on both sides → both the Anthropic and OpenAI segments should be
  // present
  const cols = win.locator('.chart .col')
  await expect(cols).toHaveCount(30)
  // Group titles render in sentence case, as written in the dictionary: innerText sees the rendered
  // (transformed) text, so an uppercase transform on .grp-t would turn this red
  await expect(win.getByRole('group', { name: 'Trend days' }).getByRole('button', { name: '30', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The all-history card is the bare window label — no parenthetical note trails it
  await expect(win.locator('.tot-row .tot-c .k').first()).toHaveText('Total · all history')
  const anthropicSegs = win.locator('.chart .col .sp.anthropic')
  await expect(anthropicSegs.first()).toBeVisible()
  // The legend is by provider (with at least an Anthropic entry)
  await expect(win.locator('.legend .lg .sw.anthropic')).toBeVisible()
  // Pin down "the OpenAI segment really exists before switching" first — otherwise the zeroing assertion
  // below would be tautologically true
  // with no Codex data and would test nothing (a hazard that existed back when it read the real home)
  expect(await win.locator('.chart .col .sp.openai').count()).toBeGreaterThan(0)
  // Switch to the Claude side: no OpenAI segment should remain
  await win.locator('.grp-t .seg button', { hasText: 'Claude' }).click()
  await expect(win.locator('.chart .col .sp.openai')).toHaveCount(0)
  // Switch back to combined and the legend returns
  await win.locator('.grp-t .seg button', { hasText: 'Total' }).click()
  await expect(win.locator('.legend')).toBeVisible()
  expect(l.errors).toEqual([])
  await close(l)
})

test('the provider colours apply: the segments and the legend match, with their own values in light and dark', async () => {
  const l = await launch(undefined, mkUsageHome())
  const win = await l.app.firstWindow()
  const read = async (): Promise<Record<string, string>> =>
    win.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return {
        anthropic: cs.getPropertyValue('--p-anthropic').trim(),
        openai: cs.getPropertyValue('--p-openai').trim(),
        google: cs.getPropertyValue('--p-google').trim()
      }
    })
  // Wait for the stylesheet to actually apply before reading CSS variables: reading directly gives an empty
  // string (the styles have not finished loading).
  // This race was always there and only surfaced reliably once app:// changed the load timing — a rendered
  // element is used as the gate.
  await expect(win.locator('.chart .col').first()).toBeVisible()
  const light = await read()
  expect(light.anthropic.toLowerCase()).toBe('#d97757')
  expect(light.openai.toLowerCase()).toBe('#10a37f')
  expect(light.google.toLowerCase()).toBe('#4285f4')
  // The segment and the legend take the same variable
  const segBg = await win.locator('.chart .col .sp.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const lgBg = await win.locator('.legend .lg .sw.anthropic').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(segBg).toBe(lgBg)
  // Dark mode has its own set (lightened)
  await win.emulateMedia({ colorScheme: 'dark' })
  const dark = await read()
  expect(dark.anthropic.toLowerCase()).not.toBe(light.anthropic.toLowerCase())
  expect(dark.openai.toLowerCase()).not.toBe(light.openai.toLowerCase())
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Every use site of the trend chart runs the same set of assertions.
 * A new use site only needs one more line in this list — avoiding "one place tested, another missed" (the
 * lesson of the 2026-07-30 missed edit).
 */
const TREND_MOUNTS = [
  {
    name: 'Agents page · Token tab',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
    }
  },
  {
    name: 'project detail · Overview tab',
    async goto(win: import('@playwright/test').Page) {
      await win.locator('.rail .ri').nth(1).click()
      const rows = win.locator('.side .row')
      // The fixture home guarantees exactly one project, so the "skip if this machine has no project" branch is
    // no longer needed
      await rows.first().waitFor({ state: 'visible', timeout: 8000 })
      await rows.first().click()
      await win.locator('.pane-head .tabs .tab', { hasText: 'Overview' }).click()
    }
  }
]

for (const mount of TREND_MOUNTS) {
  test(`the trend chart [${mount.name}]: the date axis is in place and the hover tooltip is not clipped by an ancestor`, async () => {
    // Fixture data is mandatory: with no data, "label count === data bar count" is 0 === 0 and
    // the whole geometric assertion set passes vacuously — it runs and verifies nothing. The project detail
    // one is even more direct:
    // with no project it was skipped, which in CI meant zero coverage.
    const l = await launch(undefined, mkUsageHome())
    const win = await l.app.firstWindow()
    await mount.goto(win)
    await expect(win.locator('.chart .col').first()).toBeVisible()
    await expect(win.locator('.chart .col')).toHaveCount(30)
    // Pin down that there really are data bars first, or the geometric checks below would be tautologically
    // true over an empty set
    expect(await win.locator('.chart .col .sp').count()).toBeGreaterThan(0)

    // (1) The x axis geometric check: the label set = the current view's data days (the default window width
    //     fits every label),
    //     with no overlap, nothing outside the axis container, and each label pinned to its bar centre (the
    //     clamped first and last being the exception).
    //     Using "the span count / the non-empty count" as a stand-in for visible is forbidden — overlapping
    //     and out-of-bounds labels are non-empty too.
    //     A known gap: the window-resize ResizeObserver wiring and resize-plus-refresh concurrency are not
    //     automated
    //     (the condition for covering them: a stable driver for electron setBounds; the thinning logic itself
    //     is covered by axis.test.ts).
    const checkAxis = (): Promise<string[]> => win.evaluate(() => {
      const axisEl = document.querySelector<HTMLElement>('.xaxis')
      const chartEl = document.querySelector<HTMLElement>('.chart')
      if (!axisEl || !chartEl) return ['no-mount']
      const problems: string[] = []
      const aR = axisEl.getBoundingClientRect()
      const spans = Array.from(axisEl.children) as HTMLElement[]
      const cols = Array.from(chartEl.children) as HTMLElement[]
      const dataCols = cols.filter((c) => c.querySelector('.sp'))
      if (spans.length !== dataCols.length)
        problems.push(`label count ${spans.length} ≠ data bar count ${dataCols.length}`)
      let prevRight = -Infinity
      for (const s of spans) {
        const r = s.getBoundingClientRect()
        if (r.left < prevRight + 1) problems.push(`overlap: ${s.textContent}`)
        prevRight = r.right
        if (r.left < aR.left - 0.5 || r.right > aR.right + 0.5) problems.push(`out of bounds: ${s.textContent}`)
        const day = s.getAttribute('data-day')
        const col = cols.find((c) => c.getAttribute('data-day') === day)
        if (!col) {
          problems.push(`no matching bar: ${s.textContent}`)
          continue
        }
        const cR = col.getBoundingClientRect()
        const off = Math.abs((cR.left + cR.right) / 2 - (r.left + r.right) / 2)
        const atEdge = r.left <= aR.left + 1.5 || r.right >= aR.right - 1.5
        if (off > 1 && !atEdge) problems.push(`offset ${off.toFixed(1)}px: ${s.textContent}`)
      }
      return problems
    })
    expect(await checkAxis()).toEqual([])

    // After a view switch the axis follows the current view's data days (combined → Claude → combined, with
    // no residue either way)
    for (const m of ['Claude', 'Total']) {
      await win.locator('.grp-t .seg button', { hasText: m }).click()
      expect(await checkAxis(), `after switching to ${m}`).toEqual([])
    }

    // (2) The **geometric check** on the hover tooltip: build a real element positioned the same way and walk
    //     the ancestors for a clipping box.
    //     Using "the data-tip attribute exists" as a stand-in for visible is forbidden — a clipped tooltip has
    //     the attribute too.
    const clipped = await win.evaluate(() => {
      const col = document.querySelectorAll('.chart .col')[15] as HTMLElement | undefined
      if (!col) return 'no-col'
      const probe = document.createElement('div')
      probe.textContent = col.getAttribute('data-tip') ?? ''
      probe.style.cssText =
        'position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%);white-space:pre;font-size:11px;padding:5px 9px'
      col.appendChild(probe)
      const pr = probe.getBoundingClientRect()
      let hit: string | null = null
      let el: HTMLElement | null = col.parentElement
      while (el && el !== document.body) {
        const cs = getComputedStyle(el)
        if (cs.overflow !== 'visible') {
          const er = el.getBoundingClientRect()
          if (pr.top < er.top || pr.left < er.left || pr.right > er.right) hit = el.className || el.tagName
        }
        el = el.parentElement
      }
      probe.remove()
      return hit
    })
    expect(clipped).toBeNull()

    // (3) The tooltip content is a multi-line breakdown (the total plus at least one provider row)
    const tip = await win.locator('.chart .col').nth(15).getAttribute('data-tip')
    expect(tip).toContain('total')

    expect(l.errors).toEqual([])
    await close(l)
  })
}

// Ticket grok-side/#124 (spec D1a): a side newly in use has volume only on recent days, and its
// share of a shared-scale bar is thin. Both single-side answers are asserted geometrically: the
// thin xAI segment measures a real height in combined mode rather than disappearing, and Grok mode
// labels only its own data days under D6.
test('a newly adopted side: the thin xAI segment survives, and Grok mode labels only its data days', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gktrend-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  // Claude: heavy volume on three days — the shared scale is what makes grok's segment thin
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  const cUsage = (at: Date, inTok: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at.toISOString(),
      message: {
        model: 'claude-fable-5',
        usage: { input_tokens: inTok, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      }
    })
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(3).toISOString(), message: { role: 'user', content: 'Q' } }),
      cUsage(localDayOffset(3), 100_000),
      cUsage(localDayOffset(1), 100_000),
      cUsage(localDayOffset(0), 100_000)
    ].join('\n') + '\n'
  )
  // Grok: registered, with small turns on two of the days (the real update-stream shape)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(proj), '019f-e2e-trend')
  mkdirSync(gdir, { recursive: true })
  writeFileSync(join(gdir, 'summary.json'), JSON.stringify({ info: { id: '019f-e2e-trend', cwd: proj } }))
  const gTurn = (at: Date, input: number, output: number): string =>
    JSON.stringify({
      timestamp: Math.floor(at.getTime() / 1000),
      method: '_x.ai/session/update',
      params: {
        sessionId: '019f-e2e-trend',
        update: {
          sessionUpdate: 'turn_completed',
          prompt_id: 'p',
          stop_reason: 'end_turn',
          usage: {
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            cachedReadTokens: 0,
            cacheCreationTokens: 0,
            costUsdTicks: 1234567,
            modelUsage: {
              'grok-4.5-build': { inputTokens: input, outputTokens: output, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1234567 }
            }
          }
        }
      }
    })
  writeFileSync(
    join(gdir, 'updates.jsonl'),
    [gTurn(localDayOffset(2), 2000, 500), gTurn(localDayOffset(0), 1500, 300)].join('\n') + '\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  await expect(win.locator('.chart .col').first()).toBeVisible()

  // The cross-project totals include the newly adopted side. Its figure now lives in that side's own
  // card rather than in a subtitle listing all three, so the assertion reads the card — the claim is
  // unchanged, only where the answer is rendered.
  const gkCard = win.locator('.pane-head .stats .stat', { has: win.locator('.badge.gk') })
  await expect(gkCard.locator('.v')).not.toHaveText('0')

  // Combined mode: the xAI segments exist on grok's two days and measure a real height at this
  // scale. The thinness is asserted too — a case where the segment happened to be tall would prove
  // nothing about the disappearing-thin-segment failure D1a names.
  const xaiHeights = await win
    .locator('.chart .sp.xai')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(xaiHeights.length).toBe(2)
  for (const h of xaiHeights) expect(h).toBeGreaterThan(0)
  expect(Math.max(...xaiHeights), 'the fixture must actually produce the thin case').toBeLessThan(10)

  // The legend lists xAI only because it appears in the window
  await expect(win.locator('.legend')).toContainText('xAI')

  // Grok mode: only that side's volume, so only its two data days carry segments and axis labels
  await win.locator('.grp-t .seg button', { hasText: 'Grok' }).click()
  await expect(win.locator('.chart .col .sp')).toHaveCount(2)
  expect(await win.locator('.chart .col .sp.xai').count()).toBe(2)
  await expect(win.locator('.xaxis span')).toHaveCount(2)

  expect(l.errors).toEqual([])
  await close(l)
})

// Ticket grok-side/#127 (closeout): the combinations no single ticket owns — one day where all
// three sides have volume, and one project whose session list mixes all three sides by time.
// (The third combination — a count-3 row's hover naming all three sides — is already pinned by the
// #123 badge e2e over the three-side fixture.)
test('three sides on one day segment together, and one project mixes all three sides\' sessions by time', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-tri-combo-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const enc = proj.replace(/[^a-zA-Z0-9]/g, '-')
  const cdir = join(home, '.claude', 'projects', enc)
  mkdirSync(cdir, { recursive: true })
  // Claude: one session, one question, volume today (newest)
  writeFileSync(
    join(cdir, 'a.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: localDayOffset(0).toISOString(), message: { role: 'user', content: 'Claude question' } }),
      JSON.stringify({ type: 'assistant', timestamp: localDayOffset(0).toISOString(), message: { model: 'claude-fable-5', usage: { input_tokens: 50_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
    ].join('\n') + '\n'
  )
  // Codex: one session, volume today (oldest of the three)
  const sdir = join(home, '.codex', 'sessions', '2026', '01', '01')
  mkdirSync(sdir, { recursive: true })
  const at = (h: number): string => { const d = localDayOffset(0); d.setHours(h); return d.toISOString() }
  writeFileSync(
    join(sdir, 'rollout-019fb0c0-2222-7af3-af7d-8505cedf1ec2.jsonl'),
    [
      JSON.stringify({ timestamp: at(1), type: 'session_meta', payload: { cwd: proj } }),
      JSON.stringify({ timestamp: at(1), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: proj } }),
      JSON.stringify({ timestamp: at(1), type: 'event_msg', payload: { type: 'user_message', message: 'Codex question' } }),
      JSON.stringify({ timestamp: at(1), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 30_000, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, total_tokens: 30_050 } } } })
    ].join('\n') + '\n'
  )
  // Grok: one session, volume today (middle)
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gdir = join(home, '.grok', 'sessions', encodeURIComponent(proj), '019f-combo')
  mkdirSync(gdir, { recursive: true })
  writeFileSync(join(gdir, 'summary.json'), JSON.stringify({ info: { id: '019f-combo', cwd: proj } }))
  const gts = (h: number): number => { const d = localDayOffset(0); d.setHours(h); return Math.floor(d.getTime() / 1000) }
  writeFileSync(
    join(gdir, 'updates.jsonl'),
    [
      JSON.stringify({ timestamp: gts(6), method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'Grok question' }, _meta: { promptIndex: 0 } } } }),
      JSON.stringify({ timestamp: gts(6), method: '_x.ai/session/update', params: { sessionId: 's', update: { sessionUpdate: 'turn_completed', usage: { inputTokens: 10_000, outputTokens: 20, totalTokens: 10_020, cachedReadTokens: 0, cacheCreationTokens: 0, costUsdTicks: 1, modelUsage: { 'grok-4.5-build': { inputTokens: 10_000, outputTokens: 20, cachedReadTokens: 0, cacheCreationTokens: 0 } } } } } })
    ].join('\n') + '\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  // (1) The trend: today's bar carries all three providers' segments, each with a real height
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  const today = win.locator('.chart .col').last()
  for (const cls of ['anthropic', 'openai', 'xai']) {
    const h = await today.locator(`.sp.${cls}`).evaluate((el) => el.getBoundingClientRect().height)
    expect(h, `today's ${cls} segment must measure a real height`).toBeGreaterThan(0)
  }
  await expect(win.locator('.legend')).toContainText('xAI')

  // (2) The session list mixes all three sides, newest first: Claude (today late) → Grok (06:00) → Codex (01:00)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  const rows = win.locator('.pane-body .card .se')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.t')).toHaveText('Claude question')
  await expect(rows.nth(1).locator('.t')).toHaveText('Grok question')
  await expect(rows.nth(2).locator('.t')).toHaveText('Codex question')
  await expect(rows.nth(0).locator('.badge.cl')).toHaveText('CC')
  await expect(rows.nth(1).locator('.badge.gk')).toHaveText('GK')
  await expect(rows.nth(2).locator('.badge.cx')).toHaveText('CX')

  expect(l.errors).toEqual([])
  await close(l)
})

test('the time window drives all four regions at once: side figures, composition, model rows and the dimmed span', async () => {
  // The failure this guards against is **partial** propagation — some figures following the selection
  // and others staying on the previous window. Reading the four regions one at a time would pass on a
  // page that is internally inconsistent, so each snapshot takes all four in a single pass (spec G3).
  const home = mkUsageHome()
  // A brisk rescan interval for the G13 check at the end: the automatic scan is the only refresh path
  // since the manual control was removed (2026-08-23)
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  await expect(win.locator('.chart .col').first()).toBeVisible()

  const readAll = (): Promise<{
    sides: string[]
    comp: string[]
    models: string[]
    dimmed: number
    bars: number
    selected: string
    modelTitle: string
  }> =>
    win.evaluate(() => {
      const txt = (sel: string): string[] =>
        Array.from(document.querySelectorAll(sel)).map((e) => (e.textContent ?? '').trim())
      return {
        sides: txt('.pane-head .stats .stat .v'),
        comp: txt('.comp-lg b'),
        models: txt('.models .m .num'),
        dimmed: document.querySelectorAll('.chart .col.out').length,
        bars: document.querySelectorAll('.chart .col').length,
        selected: (document.querySelector('.tot-c.on .k')?.textContent ?? '').trim(),
        // The heading that belongs to the model rows, taken structurally: the first .grp-t in the
        // pane is the trend chart's title, so an ordinal selector reads the wrong element
        modelTitle: (document.querySelector('.models')?.previousElementSibling?.textContent ?? '').trim()
      }
    })

  const all = await readAll()
  expect(all.bars, 'the chart keeps its own 30-day span whatever is selected (D10)').toBe(30)
  // A bucket at exactly zero must draw nothing: the minimum width that keeps a tiny non-zero segment
  // visible would otherwise render a sliver of usage that does not exist
  const zeroSegments = await win.evaluate(() => {
    const legend = Array.from(document.querySelectorAll('.comp-lg > span'))
    const zeroClasses = legend
      .filter((s) => /(^|\s)0(\.0+)?%/.test(s.textContent ?? ''))
      .map((s) => s.querySelector('i')?.className ?? '')
    return zeroClasses.filter((c) => c && document.querySelector(`.comp > i.${c}`))
  })
  expect(zeroSegments, 'a 0% bucket has a legend entry but no segment on the bar').toEqual([])
  expect(all.dimmed, 'nothing is dimmed under "all history"').toBe(0)
  expect(all.sides.length).toBe(4)
  expect(all.comp.length, 'three buckets in the legend').toBe(3)
  expect(all.models.length, 'the fixture must have model rows, or the comparison below is vacuous')
    .toBeGreaterThan(0)

  // "Today" rather than a wider window, and by position rather than by label: this fixture's usage
  // sits within the last three days, so `all` and a 7-day window hold the *same* rows — comparing them
  // would assert inequality between two identical values and could never fail. Position also keeps the
  // selector independent of the interface language.
  const daysWithBars = await win.locator('.chart .col .sp').evaluateAll(
    (els) => new Set(els.map((e) => e.parentElement?.getAttribute('data-day'))).size
  )
  expect(daysWithBars, 'the fixture must span more than one day, or "today ⊂ all" is vacuous')
    .toBeGreaterThan(1)

  await win.locator('.tot-c').nth(1).click()
  await expect(win.locator('.chart .col.out').first()).toBeVisible()
  const d7 = await readAll()
  expect(d7.selected, 'the clicked card is the selected one').not.toBe(all.selected)
  expect(d7.dimmed, 'today dims the other 29 of the 30 bars').toBe(29)
  expect(d7.sides, 'each side figure follows the window').not.toEqual(all.sides)
  expect(d7.comp, 'the composition follows the window').not.toEqual(all.comp)
  expect(d7.models, 'the model rows follow the window').not.toEqual(all.models)
  expect(d7.modelTitle, 'the by-model heading names the selected window').toContain(d7.selected)

  // And the selection survives leaving and returning to the tab (G11) — the side figures are rendered
  // outside the tab, so they must still be on the selected window when it is not visible
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const onOtherTab = await win.locator('.pane-head .stats .stat .v').allTextContents()
  expect(onOtherTab.map((s) => s.trim()), 'the side cards stay on the selected window').toEqual(d7.sides)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Token' }).click()
  const back = await readAll()
  expect(back.selected).toBe(d7.selected)
  expect(back.dimmed).toBe(29)

  // The window and the chart's side filter are independent controls that compose (G12): narrowing to
  // one side changes what the bars count, while the window keeps deciding which of them are in scope.
  // Neither may reset the other — the failure worth guarding is one control quietly clearing the other.
  await win.locator('.seg button').nth(1).click()
  await expect(win.locator('.seg button.on')).toHaveCount(1)
  const composed = await readAll()
  expect(composed.dimmed, 'the window still scopes the chart under a single-side filter').toBe(29)
  expect(composed.selected, 'and the window itself is untouched by the side filter').toBe(d7.selected)
  expect(composed.sides, 'the figures above the chart stay across all sides — the filter is the chart’s')
    .toEqual(d7.sides)
  await win.locator('.seg button').nth(0).click()

  // A refresh must not drop the selection (G13). The automatic backstop fires on a timer the user did
  // not ask for, so losing the window on every scan is exactly the visible defect — and since the
  // manual control was removed it is also the only refresh path there is. A newly registered project
  // proves a scan actually landed; without that, "the selection survived" would pass on a page that
  // never refreshed at all.
  const late = join(home, 'late-proj')
  mkdirSync(late, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [join(home, 'demo-proj')]: {}, [late]: {} } })
  )
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('2 projects')
  await expect(win.locator('.tot-c.on .k')).toHaveText(d7.selected)
  const afterRefresh = await readAll()
  expect(afterRefresh.dimmed, 'and the chart is still scoped to it').toBe(29)

  await win.screenshot({ path: 'e2e-out/token-window-today.png' })
})

// Selectable-span coverage uses the existing fixture-home seam and both public page entries.
// The fixture assistant/usage shape is shared with mkUsageHome's source-derived records.
for (const mount of TREND_MOUNTS) {
  test(`selectable trend span [${mount.name}]: history, independent filters, tabs and refresh`, async () => {
    const home = mkUsageHome()
    const proj = join(home, 'demo-proj')
    const cdir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
    const history = join(cdir, 'long-history.jsonl')
    const emptyProject = join(home, 'empty-project')
    mkdirSync(emptyProject, { recursive: true })
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {}, [emptyProject]: {} } }))
    const record = (ago: number, input: number) => JSON.stringify({
      type: 'assistant', timestamp: localDayOffset(ago).toISOString(),
      message: { model: 'claude-fable-5', usage: {
        input_tokens: input, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0
      } }
    })
    writeFileSync(history, Array.from({ length: 91 }, (_, ago) => record(ago, 100 + ago)).join('\n') + '\n')
    const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '1200' })
    try {
      const win = await l.app.firstWindow()
      await mount.goto(win)
      const selector = win.getByRole('group', { name: 'Trend days', exact: true })
      await expect(selector.locator('[aria-pressed="true"]')).toHaveText('30')
      const dayKey = (ago: number) => {
        const d = localDayOffset(ago)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const oldBar = win.locator(`.chart .col[data-day="${dayKey(75)}"]`)
      await expect(oldBar).toHaveCount(0)
      const cards = await win.locator('.tot-c').allTextContents()
      for (const span of ['60', '90', '30', '90']) {
        await selector.getByRole('button', { name: span, exact: true }).click()
        await expect(win.locator('.chart .col')).toHaveCount(Number(span))
        await expect(win.locator('.chart .col').last()).toHaveAttribute('data-day', dayKey(0))
        expect((await win.locator('.tot-c').allTextContents()).slice(0, 3)).toEqual(cards.slice(0, 3))
        await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
      }
      await expect(oldBar).toHaveAttribute('data-tip', /185/)
      await expect(win.locator('.chart .col').first()).toHaveAttribute('data-day', dayKey(89))
      await win.locator('.seg button', { hasText: 'Codex' }).click()
      await expect(selector.locator('[aria-pressed="true"]')).toHaveText('90')
      await expect(oldBar.locator('.sp')).toHaveCount(0)
      await win.locator('.tot-c').nth(2).click()
      await expect(win.locator('.chart .col.out')).toHaveCount(83)
      await selector.getByRole('button', { name: '60', exact: true }).click()
      await expect(win.locator('.chart .col.out')).toHaveCount(53)
      await expect(win.locator('.seg button.on')).toHaveText('Codex')
      await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
      await win.locator('.pane-head .tabs .tab', { hasText: mount.name.startsWith('Agents') ? 'Token' : 'Overview' }).click()
      await expect(selector.locator('[aria-pressed="true"]')).toHaveText('60')
      await selector.getByRole('button', { name: '90', exact: true }).click()
      await win.locator('.seg button', { hasText: 'Total' }).click()
      await win.locator('.tot-c').first().click()
      await expect(win.locator('.chart .col.out')).toHaveCount(0)
      appendFileSync(history, record(75, 100) + '\n')
      await expect(oldBar).toHaveAttribute('data-tip', /total 295\n/, { timeout: 15000 })
      await expect(selector.locator('[aria-pressed="true"]')).toHaveText('90')
      if (mount.name.startsWith('project')) {
        await win.locator('.side .row', { hasText: 'empty-project' }).click()
        await expect(selector.locator('[aria-pressed="true"]')).toHaveText('90')
        await expect(win.locator('.chart .col')).toHaveCount(90)
        await expect(win.locator('.chart .sp')).toHaveCount(0)
        await win.locator('.side .row', { hasText: 'demo-proj' }).click()
        await expect(selector.locator('[aria-pressed="true"]')).toHaveText('90')
        await expect(oldBar).toHaveAttribute('data-tip', /total 295\n/)
      }
      // Real geometry, nonempty dense data, at the application's minimum width.
      await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
      await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)
      const readGeometry = () => win.evaluate(() => {
        const axis = document.querySelector('.xaxis')!.getBoundingClientRect()
        const labels = [...document.querySelectorAll('.xaxis span')].map(e => e.getBoundingClientRect())
        const bars = [...document.querySelectorAll('.chart .col')].map(e => e.getBoundingClientRect())
        const control = document.querySelector('.trend-span-options')!.getBoundingClientRect()
        return { labels: labels.length, overlap: labels.slice(1).some((r,i) => r.left < labels[i].right),
          outside: labels.some(r => r.left < axis.left || r.right > axis.right),
          overflow: labels.map(r => ({ left: axis.left - r.left, right: r.right - axis.right })),
          minBar: Math.min(...bars.map(r=>r.width)), controlVisible: control.left >= 0 && control.right <= window.innerWidth }
      })
      // ResizeObserver runs after the viewport resize; poll the labels themselves, not innerWidth.
      await expect.poll(readGeometry).toMatchObject({ outside: false, overlap: false, controlVisible: true })
      const geometry = await readGeometry()
      expect(geometry.labels).toBeGreaterThan(1)
      expect(geometry.overlap).toBe(false)
      expect(geometry.outside, JSON.stringify(geometry)).toBe(false)
      expect(geometry.minBar).toBeGreaterThan(0)
      expect(geometry.controlVisible).toBe(true)
      expect(l.errors).toEqual([])
    } finally {
      await close(l)
    }
  })
}

test('selectable trend span: localized controls fit both pages in light and dark at minimum width', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const l = await launchAppearance(mkUsageHome())
  try {
    const win = await l.app.firstWindow()
    await win.waitForSelector('.rail')
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700))
    await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(800)
    const names = [['zh', '趋势天数'], ['en', 'Trend days']]
    for (const [lang, name] of names) {
      for (const mode of ['light', 'dark']) {
        for (const theme of ['purple', 'blue', 'amber']) {
        await win.locator('.ri.set').click()
        await win.locator(`[data-theme-option="${theme}"]`).click()
        await win.getByTestId('language-trigger').click()
        await win.getByTestId('language-pop').locator(`[data-lang="${lang}"]`).click()
        await win.locator(`[data-mode-option="${mode}"]`).click()
        await expect.poll(() => effectiveDark(win)).toBe(mode === 'dark')
        for (const page of [0, 1]) {
          await win.locator('.rail .ri').nth(page).click()
          if (page === 1) await win.locator('.side .row', { hasText: 'demo-proj' }).click()
          await win.locator('.pane-head .tabs .tab').first().click()
          const selector = win.getByRole('group', { name, exact: true })
          await selector.getByRole('button', { name: '90', exact: true }).click()
          await expect(win.locator('.chart .col')).toHaveCount(90)
          const geometry = await win.locator('.trend-heading').evaluate((heading) => {
            const box = heading.getBoundingClientRect()
            const children = [...heading.children].map(e => e.getBoundingClientRect())
            const control = heading.querySelector('[aria-pressed="true"]')!
            const style = getComputedStyle(control)
            return {
              clipped: children.some(r => r.left < box.left || r.right > box.right || r.bottom > box.bottom),
              overlap: children.some((a, i) => children.slice(i + 1).some(b =>
                a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
              height: box.height, background: style.backgroundColor, color: style.color
            }
          })
          expect(geometry.clipped, `${lang}/${mode}/${page}`).toBe(false)
          expect(geometry.overlap, `${lang}/${mode}/${page}`).toBe(false)
          expect(geometry.height).toBeLessThan(100)
          expect(geometry.color).not.toBe(geometry.background)
          const selected = selector.getByRole('button', { name: '90', exact: true })
          const style = await selected.evaluate(el => {
            const reference = document.createElement('span')
            reference.style.color = 'var(--accent)'
            document.body.append(reference)
            const accent = getComputedStyle(reference).color
            reference.remove()
            return ({
            weight: getComputedStyle(el).fontWeight,
            color: getComputedStyle(el).color,
            accent,
            rects: [...el.parentElement!.querySelectorAll('button')].map(b => ({ left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right }))
          })})
          expect(style.weight).toBe('700')
          expect(style.rects[0].right).toBeLessThan(style.rects[1].left)
          expect(style.rects[1].right).toBeLessThan(style.rects[2].left)
          await expect(selected).toHaveCSS('color', style.accent)
          await expect(win.locator('.tot-c').nth(3).locator('.k')).not.toContainText('30')
          if (theme === 'purple') {
            await expect(win.locator('.toast')).toHaveCount(0)
            await win.screenshot({ path: testInfo.outputPath(`trend-${lang}-${mode}-${page}.png`) })
          }
        }
      }
    }
    }
    expect(l.errors).toEqual([])
  } finally {
    await close(l)
  }
})

// The selectable trend span.
// Real isolated profiles, real IPC and filesystem failures; no owned-module mocks.
// Real assistant/message/usage keys were inspected in a local Claude JSONL sample; values and dates
// below are synthetic. Delayed initial preference reads are tested at the public backfill seam.
// This suite does not force IPC acknowledgement reordering: replies are ignored by the span owner.
// If that changes, add an external transport-delay seam and exercise reversed replies here.

function day(ago: number): string {
  const date = new Date()
  date.setDate(date.getDate() - ago)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function spanFixture(): { home: string; userData: string; project: string } {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-span-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-span-data-'))
  const project = join(home, 'alpha'), other = join(home, 'beta')
  mkdirSync(project); mkdirSync(other)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [project]: {}, [other]: {} } }))
  const add = (proj: string, records: [number, number, string][]) => {
    const dir = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(dir, { recursive: true })
    const source = join(dir, 'usage.jsonl')
    writeFileSync(source, records.map(([ago, input, model]) => JSON.stringify({
      type: 'assistant', timestamp: `${day(ago)}T12:00:00`,
      message: { model, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } }
    })).join('\n') + '\n')
  }
  // Literal sums: alpha 16/42/78; beta 46/102/168; global 62/144/246.
  add(project, [[0, 10, 'claude-recent'], [45, 20, 'claude-middle'], [75, 30, 'claude-oldest']])
  add(other, [[2, 40, 'claude-recent'], [35, 50, 'claude-middle'], [65, 60, 'claude-oldest']])
  return { home, userData, project }
}

function readPrefs(userData: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(userData, 'prefs.json'), 'utf8')) as Record<string, unknown>
}
async function launchSpan(f: ReturnType<typeof spanFixture>, env: Record<string, string> = {}): Promise<ElectronApplication> {
  return (await startApp({ userData: f.userData, home: f.home, errors: mainErrors.errors, env })).app
}
const choice = (win: Page, span: number) => win.locator('.trend-span-options').getByRole('button', { name: String(span), exact: true })
async function checkSpan(win: Page, span: number, total: string): Promise<void> {
  await expect(choice(win, span)).toHaveAttribute('aria-pressed', 'true')
  await expect(win.locator('.chart .col')).toHaveCount(span)
  await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
  await expect(win.locator('.tot-c').nth(3).locator('.v')).toHaveText(total)
}
function cleanup(f: ReturnType<typeof spanFixture>): void {
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}

/** Every toast from now on, whatever its lifetime, as "kind: text"; each call states the ones that appear next, and no more */
async function recordToasts(win: Page): Promise<(next: string[]) => Promise<void>> {
  await win.waitForSelector('.toasts', { state: 'attached' })
  await win.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __toasts: string[] }).__toasts = seen
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('toast')) seen.push(`${n.classList.contains('err') ? 'err' : 'ok'}: ${n.textContent ?? ''}`)
        }
      }
    }).observe(document.querySelector('.toasts') as Element, { childList: true })
  })
  let read = 0
  return async (next) => {
    await expect.poll(() => win.evaluate(() => [...(window as unknown as { __toasts: string[] }).__toasts]).then((all) => all.slice(read))).toEqual(next)
    read += next.length
  }
}
/** The application menu as built: each top-level menu's label and its first item's (what macOS draws is accepted by hand, i18n spec) */
function menuHeads(app: ElectronApplication): Promise<string[][]> {
  return app.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items ?? []).map((i) => [i.label, i.submenu?.items[0]?.label ?? '']))
}
const MENU_EN = [['Agentshed', 'About Agentshed'], ['Edit', 'Undo'], ['View', 'Reload'], ['Window', 'Minimize']]
const MENU_ZH = [['Agentshed', '关于 Agentshed'], ['编辑', '撤销'], ['显示', '重新载入'], ['窗口', '最小化']]
/** Reaching a control lower on the settings page scrolled it, and a scroll closes the language list (the i18n table): the list is opened again until the click lands */
async function chooseLanguage(win: Page, id: string): Promise<void> {
  await expect(async () => {
    if (!(await win.getByTestId('language-pop').isVisible())) await win.getByTestId('language-trigger').click()
    await win.locator(`.lang-opt[data-lang="${id}"]`).click({ timeout: 1000 })
  }).toPass()
}
const failedEn = (name: string): string => `err: Couldn’t save ${name}. It stays in effect until the app restarts, then goes back.`
const failedZh = (name: string): string => `err: 保存${name}失败。当前选择在重启前有效，重启后恢复。`

// The backfill rule itself is unit-tested; this pins the wiring around it — the app must hand the
// backfill the choices made since mount, not the values it mounted with (#61).
test('a theme chosen while the initial preference read is in flight survives that read landing', async () => {
  const f = spanFixture()
  writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan: 30 }))
  const app = await launchSpan(f, { AGENTSHED_PREFS_DELAY_MS: '5000' })
  try {
    const win = await app.firstWindow()
    await win.getByTitle('Settings').click()
    // Before the read lands the language preference is still the default, follow-system
    await expect(win.getByTestId('language-trigger')).toContainText('Follow')
    await win.locator('[data-theme-option="amber"]').click()
    await expect.poll(() => win.locator('html').getAttribute('data-theme')).toBe('amber')
    // The read lands: the untouched language takes its value, the touched theme keeps the user's choice
    await expect(win.getByTestId('language-trigger')).not.toContainText('Follow', { timeout: 10000 })
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'amber')
    await expect(win.locator('[data-theme-option="amber"]')).toHaveAttribute('aria-checked', 'true')
  } finally { await closeApp(app); cleanup(f) }
})

test('global span defaults an older or invalid preference without resetting valid appearance and language', async () => {
  for (const trendSpan of [undefined, 45, '60']) {
    const f = spanFixture()
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan }))
    const app = await launchSpan(f, { AGENTSHED_SYSTEM_LANGUAGES: 'fr-FR' })
    try {
      const win = await app.firstWindow()
      // Let Electron's saved appearance drive media queries instead of Playwright's light default.
      await win.emulateMedia({ colorScheme: null })
      await checkSpan(win, 30, '62')
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
      await expect.poll(() => win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
      await win.locator('.rail .ri').nth(1).click()
      await win.locator('.side .row', { hasText: 'alpha' }).click()
      await checkSpan(win, 30, '16')
      await choice(win, 60).click()
      // The file never held the update switch: it is written back on, the specified fallback, beside the rest
      await expect.poll(() => readPrefs(f.userData)).toEqual({
        theme: 'blue', language: 'en', mode: 'dark', trendSpan: 60, autoCheckUpdates: true
      })
    } finally { await closeApp(app); cleanup(f) }
  }
})

test('global span links exact totals and active breakdowns on both entries, and survives full restarts', async () => {
  const f = spanFixture()
  let app: ElectronApplication | undefined
  try {
    app = await launchSpan(f)
    let win = await app.firstWindow()
    await checkSpan(win, 30, '62')
    const unchanged = await win.locator('.tot-c .v').allTextContents()
    for (const [span, total, uncached, output, cached] of [[60, '144', '132', '4', '8'], [90, '246', '228', '6', '12'], [30, '62', '56', '2', '4']] as const) {
      await choice(win, span).click()
      await checkSpan(win, span, total)
      expect((await win.locator('.tot-c .v').allTextContents()).slice(0, 3)).toEqual(unchanged.slice(0, 3))
      await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
      await win.locator('.tot-c').nth(3).click()
      await expect(win.locator('.stats .stat').first().locator('.v')).toHaveText(total)
      await expect(win.locator('.comp-lg span').nth(0)).toHaveAttribute('title', `${cached} · input served from cache, never recomputed`)
      await expect(win.locator('.comp-lg span').nth(1)).toHaveAttribute('title', `${uncached} · cache writes included: everything the model read afresh this turn`)
      await expect(win.locator('.comp-lg span').nth(2)).toHaveAttribute('title', `${output} · tokens the model generated`)
      await expect(win.locator('.pane-body .grp-t').last()).toContainText(`Last ${span} days`)
      await expect(win.locator('.models .m')).toHaveCount(span / 30)
      await expect(win.locator('.chart .col.out')).toHaveCount(0)
      await win.locator('.tot-c').first().click()
    }
    // Keep the fourth card active across span changes; activation is identity, not a fixed 30-day range.
    await win.locator('.tot-c').nth(3).click()
    await choice(win, 60).click()
    await expect(win.locator('.tot-c').nth(3)).toHaveAttribute('aria-pressed', 'true')
    await expect(win.locator('.stats .stat').first().locator('.v')).toHaveText('144')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 60, '42')
    await win.locator('.tot-c').nth(3).click()
    await choice(win, 90).click()
    await checkSpan(win, 90, '78')
    await expect(win.locator('.tot-sides b').first()).toHaveText('78')
    await expect(win.locator('.models .num')).toHaveText(['36', '26', '16'])
    await win.locator('.side .row', { hasText: 'beta' }).click()
    await checkSpan(win, 90, '168')
    await win.locator('.rail .ri').first().click()
    await checkSpan(win, 90, '246')
    // Consecutive user events, followed by a real quit; the acknowledged final value is the persisted one.
    for (const span of [30, 90, 30, 60]) await choice(win, span).click()
    await expect.poll(() => readPrefs(f.userData).trendSpan).toBe(60)
    await closeApp(app)
    app = await launchSpan(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    win = await app.firstWindow()
    await checkSpan(win, 60, '144')
    await expect(win.locator('.pane-head h1')).toHaveText('Agents')
    await expect(win.locator('.tot-c').first()).toHaveAttribute('aria-pressed', 'true')
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'scanning')
    const before = await win.locator('.chart').boundingBox()
    await expect(win.locator('.startup-display-hint')).toHaveAttribute('data-state', 'ready', { timeout: 8000 })
    expect((await win.locator('.chart').boundingBox())?.y).toBe(before?.y)
    await choice(win, 90).click()
    await expect.poll(() => readPrefs(f.userData).trendSpan).toBe(90)
    await closeApp(app)
    app = await launchSpan(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    win = await app.firstWindow()
    await checkSpan(win, 90, '246')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '78')
  } finally {
    if (app) await closeApp(app).catch(() => {})
    cleanup(f)
  }
})

for (const [span, cache] of [[30, undefined], [60, 'broken'], [90, '{"version":-1,"data":{}}']] as const) {
  test(`global span ${span}: saved preference survives an unusable display cache and skeleton fill`, async () => {
    const f = spanFixture()
    writeFileSync(join(f.userData, 'prefs.json'), JSON.stringify({ theme: 'blue', language: 'en', mode: 'dark', trendSpan: span }))
    if (cache) writeFileSync(join(f.userData, 'display-cache.json'), cache)
    const app = await launchSpan(f, { AGENTSHED_SCAN_DELAY_MS: '3000' })
    try {
      const win = await app.firstWindow()
      const buttons = win.locator('.trend-span-choice')
      await expect(buttons).toHaveCount(3)
      for (const button of await buttons.all()) await expect(button).toBeDisabled()
      await expect(win.locator('.trend-span-choice[aria-pressed="true"]')).toHaveText(String(span))
      await expect(win.locator('.tot-c').nth(3).locator('.k')).toHaveText(`Last ${span} days`)
      const before = await win.locator('.trend-span-options').boundingBox()
      await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 8000 })
      await checkSpan(win, span, span === 30 ? '62' : span === 60 ? '144' : '246')
      expect((await win.locator('.trend-span-options').boundingBox())?.y).toBe(before?.y)
      await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
    } finally { await closeApp(app); cleanup(f) }
  })
}

test('global span save failure keeps live views consistent and reopens the last successful value', async () => {
  mainErrors.allow(/prefs-write-failed/)
  const f = spanFixture()
  // The automatic check's switch is available only with an update source; this is the scripted one
  const script = join(f.home, 'update.json')
  writeFileSync(script, JSON.stringify({ check: 'upToDate' }))
  let app: ElectronApplication | undefined
  try {
    app = await launchSpan(f, { AGENTSHED_UPDATE_SCRIPT: script })
    let win = await app.firstWindow()
    const toasts = await recordToasts(win)
    await choice(win, 60).click()
    await expect.poll(() => readPrefs(f.userData).trendSpan).toBe(60)
    const prefsBefore = readFileSync(join(f.userData, 'prefs.json'), 'utf8')
    const archiveBefore = readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')
    const configBefore = readFileSync(join(f.home, '.claude.json'), 'utf8')
    const pid = app.process().pid
    const blocked = join(f.userData, `.prefs.json.tmp-${pid}`)
    mkdirSync(blocked)
    await choice(win, 90).click()
    await toasts([failedEn('the trend span')])
    await checkSpan(win, 90, '246')
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '78')
    expect(readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')).toBe(archiveBefore)
    expect(readFileSync(join(f.home, '.claude.json'), 'utf8')).toBe(configBefore)
    expect(readPrefs(f.userData).trendSpan).toBe(60)

    // The other four, in English: one toast each, and the choice in effect
    const theme = (id: string) => win.locator(`[data-theme-option="${id}"]`)
    const mode = (id: string) => win.locator(`[data-mode-option="${id}"]`)
    const auto = (id: string) => win.getByTestId('auto-check-seg').locator(`[data-auto-option="${id}"]`)
    await win.locator('.ri.set').click()
    await theme('blue').click()
    await toasts([failedEn('the theme')])
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
    await mode('dark').click()
    await toasts([failedEn('the appearance mode')])
    await expect(mode('dark')).toHaveAttribute('aria-checked', 'true')
    await auto('off').click()
    await toasts([failedEn('the automatic update check setting')])
    await expect(auto('off')).toHaveAttribute('aria-checked', 'true')

    // The language: the window, its notices and the application menu all move together
    expect(await menuHeads(app)).toEqual(MENU_EN)
    await chooseLanguage(win, 'zh')
    await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await toasts(['ok: 界面语言已切换为 简体中文', failedZh('语言')])
    expect(await menuHeads(app)).toEqual(MENU_ZH)

    // The same four in Chinese
    await theme('amber').click()
    await toasts([failedZh('主题')])
    await mode('light').click()
    await toasts([failedZh('外观模式')])
    await auto('on').click()
    await toasts([failedZh('自动检查更新设置')])
    await win.locator('.rail .ri').nth(0).click()
    await choice(win, 30).click()
    await toasts([failedZh('趋势天数')])
    await expect(choice(win, 30)).toHaveAttribute('aria-pressed', 'true')

    // Writes in flight when the language changes: their notices use the new language (the i18n table). An IPC reply
    // needs a macrotask, so with only microtasks between the clicks no rejection can arrive before the switch
    await win.locator('.ri.set').click()
    await win.evaluate(async () => {
      for (const selector of ['[data-theme-option="blue"]', '[data-auto-option="off"]', '[data-testid="language-trigger"]', '.lang-opt[data-lang="en"]']) {
        const el = document.querySelector(selector)
        if (!(el instanceof HTMLElement)) throw new Error(`nothing to click at ${selector}`)
        el.click()
        await Promise.resolve()
      }
    })
    await expect(win.locator('html')).toHaveAttribute('lang', 'en')
    await toasts(['ok: Interface language switched to English', failedEn('the theme'), failedEn('the automatic update check setting'), failedEn('the language')])
    expect(await menuHeads(app)).toEqual(MENU_EN)

    // Left in Chinese, so the next launch's English is the disk's and not what the session ended on
    await chooseLanguage(win, 'zh')
    await toasts(['ok: 界面语言已切换为 简体中文', failedZh('语言')])
    expect(await menuHeads(app)).toEqual(MENU_ZH)

    // Nothing reached the disk, and the main process logged each failure by its code
    expect(readFileSync(join(f.userData, 'prefs.json'), 'utf8')).toBe(prefsBefore)
    expect(mainErrors.errors.length).toBeGreaterThan(0)
    for (const e of mainErrors.errors) expect(e.includes(ERR.prefsWriteFailed), `a handler error without the code:\n${e}`).toBe(true)

    rmSync(blocked, { recursive: true })
    await closeApp(app)
    app = await launchSpan(f, { AGENTSHED_UPDATE_SCRIPT: script })
    win = await app.firstWindow()
    await checkSpan(win, 60, '144')
    await expect(win.locator('html')).toHaveAttribute('lang', 'en')
    expect(await menuHeads(app)).toEqual(MENU_EN)
    await win.locator('.ri.set').click()
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'purple')
    await expect(mode('system')).toHaveAttribute('aria-checked', 'true')
    await expect(auto('on')).toHaveAttribute('aria-checked', 'true')
    await expect(win.getByTestId('language-trigger')).toContainText('Follow system')
  } finally { if (app) await closeApp(app).catch(() => {}); cleanup(f) }
})

test('global span includes archived and retained older rows in both charts and fourth cards', async () => {
  const f = spanFixture()
  const beta = join(f.home, 'beta')
  const stamp = `${(JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version}+c19`
  writeFileSync(join(f.userData, 'usage-archive.json'), JSON.stringify({
    version: 2, rows: [
      { day: day(75), side: 'claude', projectKey: f.project.toLowerCase(), model: 'claude-oldest', input: 90, output: 5, cacheRead: 2, cacheWrite: 3, total: 100 },
      { day: day(85), side: 'claude', projectKey: beta.toLowerCase(), model: 'claude-archived', input: 90, output: 10, cacheRead: 0, cacheWrite: 0, total: 100 }
    ], stamps: { [`${day(75)}\u0000claude`]: stamp, [`${day(85)}\u0000claude`]: stamp }, observed: {}, superseded: []
  }))
  const app = await launchSpan(f)
  try {
    const win = await app.firstWindow()
    await checkSpan(win, 30, '62')
    await choice(win, 90).click()
    await checkSpan(win, 90, '410')
    await expect(win.locator(`.col[data-day="${day(75)}"]`)).not.toHaveClass(/\barch\b/)
    await expect(win.locator(`.col[data-day="${day(75)}"]`)).toHaveAttribute('data-tip', /total 100\n/)
    await expect(win.locator(`.col[data-day="${day(85)}"]`)).toHaveClass(/\barch\b/)
    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'alpha' }).click()
    await checkSpan(win, 90, '142')
    await win.locator('.side .row', { hasText: 'beta' }).click()
    await checkSpan(win, 90, '268')
    await expect(win.locator(`.col[data-day="${day(85)}"] .sp`)).toHaveCSS('background-image', /repeating-linear-gradient/)
  } finally { await closeApp(app); cleanup(f) }
})

test('global span numeric choices support keyboard activation and retain every card and side identity', async () => {
  const f = spanFixture()
  const app = await launchSpan(f)
  try {
    const win = await app.firstWindow()
    // CDP enables real focus in the hidden Electron window; no synthetic click/key events.
    const cdp = await win.context().newCDPSession(win)
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    for (const entry of [0, 1]) {
      await win.locator('.rail .ri').nth(entry).click()
      if (entry) await win.locator('.side .row', { hasText: 'alpha' }).click()
      await choice(win, 30).focus()
      await win.keyboard.press('Tab')
      await expect(choice(win, 60)).toBeFocused()
      await expect(choice(win, 60)).toHaveCSS('outline-style', 'solid')
      await expect(choice(win, 60)).toHaveCSS('outline-offset', '-2px')
      await win.keyboard.press('Space')
      await checkSpan(win, 60, entry ? '42' : '144')
      await win.keyboard.press('Tab')
      await win.keyboard.press('Enter')
      await checkSpan(win, 90, entry ? '78' : '246')
      for (let card = 0; card < 4; card++) {
        await win.locator('.tot-c').nth(card).click()
        const unchangedModels = await win.locator('.models').textContent()
        for (const side of ['Total', 'Claude', 'Codex', 'Grok']) {
          await win.locator('.seg button', { hasText: side }).click()
          for (const span of [30, 60, 90]) {
            await choice(win, span).click()
            await expect(win.locator('.tot-c').nth(card)).toHaveAttribute('aria-pressed', 'true')
            await expect(win.locator('.seg button.on')).toHaveText(side)
            await expect(win.locator('.chart .col.out')).toHaveCount(card === 1 ? span - 1 : card === 2 ? span - 7 : 0)
            if (card < 3) expect(await win.locator('.models').textContent()).toBe(unchangedModels)
          }
        }
      }
    }
    await cdp.detach()
  } finally { await closeApp(app); cleanup(f) }
})

// A usage archive that cannot be written or read, in the running app (token-stats C4, C8, agents-overview A4d). The real
// failures: the settings directory made read-only while the app runs, a directory where the archive goes from before
// launch, and the archive's own mode from before launch.
//
// Gap: a real change of window focus is not driven, because Playwright emulates focus. The cases shadow
// document.hasFocus and dispatch the event, which are the two facts a real window was measured to give.

const EN = 'Usage history can’t be saved right now because its file in the settings directory can’t be read or written.'
const ZH = '用量历史暂时无法保存，因为设置目录中的历史文件无法读取或写入。'
/** A mode on a directory does not hold back root */
const ROOT = process.getuid?.() === 0
/** Holds the first scan until the record is running, on a machine under load too */
const HOLD_MS = '3000'
/** A past day, so the archive's own rule treats the row as history */
const AT = new Date(Date.now() - 90_000_000).toISOString()

interface Fixture { home: string; proj: string; sessions: string; userData: string }

function session(f: Fixture, name: string): void {
  writeFileSync(join(f.sessions, `${name}.jsonl`), [
    JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: `Question ${name}` }, uuid: `${name}-q`, timestamp: AT, cwd: f.proj, sessionId: name }),
    JSON.stringify({ parentUuid: `${name}-q`, isSidechain: false, type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, uuid: `${name}-a`, timestamp: AT, cwd: f.proj, sessionId: name })
  ].join('\n') + '\n')
}

function archiveFixture(): Fixture {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-archive-home-'))
  const userData = mkdtempSync(join(tmpdir(), 'agentshed-archive-data-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  const sessions = join(home, '.claude', 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(sessions, { recursive: true })
  const f = { home, proj, sessions, userData }
  session(f, 'first')
  return f
}

async function start(f: Fixture, env: Record<string, string> = {}): Promise<{ app: ElectronApplication; win: Page; stderr: string[] }> {
  const { app, stderr } = await startApp({ userData: f.userData, home: f.home, errors: mainErrors.errors, env: { AGENTSHED_RESCAN_MS: '300', ...env } })
  const win = await app.firstWindow()
  await win.waitForSelector('.toasts', { state: 'attached' })
  return { app, win, stderr }
}

function cleanUp(f: Fixture): void {
  chmodSync(f.userData, 0o755)
  rmSync(f.home, { recursive: true, force: true })
  rmSync(f.userData, { recursive: true, force: true })
}

/** Records every toast as it is added and counts the snapshots from now on: a toast is gone in seconds, and "one toast
 * however many scans" reads nothing until scans have happened */
async function watch(win: Page): Promise<void> {
  await win.evaluate(() => {
    const w = window as unknown as { toastsSeen: string[]; snapshotsSeen: number; agentshed: { onSnapshot: (f: () => void) => void } }
    w.toastsSeen = []
    w.snapshotsSeen = 0
    w.agentshed.onSnapshot(() => { w.snapshotsSeen++ })
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement && n.classList.contains('toast')) w.toastsSeen.push(n.textContent ?? '')
    }).observe(document.querySelector('.toasts') as Element, { childList: true })
  })
}
const toastsSeen = (win: Page): Promise<string[]> => win.evaluate(() => (window as unknown as { toastsSeen: string[] }).toastsSeen)
const snapshotsSeen = (win: Page): Promise<number> => win.evaluate(() => (window as unknown as { snapshotsSeen: number }).snapshotsSeen)
/** Waits for this many more scans to have gone out */
async function scansPass(win: Page, n = 5): Promise<void> {
  const from = await snapshotsSeen(win)
  await expect.poll(() => snapshotsSeen(win), { timeout: 15_000 }).toBeGreaterThanOrEqual(from + n)
}
/** What a failed write could leave in the directory */
const temporaries = (f: Fixture): string[] => readdirSync(f.userData).filter((n) => /^\.(usage-archive\.w|token-cache\.j)-/.test(n))
/** The all-history figure, the first totals card's */
const allHistory = (win: Page): ReturnType<Page['locator']> => win.locator('.pane-head .tot-row .tot-c').first().locator('.v')
const sessionRows = (win: Page): ReturnType<Page['locator']> => win.locator('.pane-body .card .se')
const openSessions = async (win: Page): Promise<void> => {
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Sessions' }).click()
  await expect(sessionRows(win)).toHaveCount(1, { timeout: 15_000 })
}

test('token-stats C4: the settings directory read-only after launch — a new session arrives, one toast in the run, and the file catches up', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = archiveFixture()
  const { app, win, stderr } = await start(f)
  try {
    await openSessions(win)
    await watch(win)
    chmodSync(f.userData, 0o555)
    session(f, 'second')
    await expect(sessionRows(win)).toHaveCount(2, { timeout: 15_000 })
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
    expect(temporaries(f)).toEqual([])
    expect(stderr.join('')).toContain('[usage-archive] save failed:')
    // The application menu's reload is a new document in the same run: it is not told again
    await win.reload()
    await win.waitForSelector('.toasts', { state: 'attached' })
    await watch(win)
    // A toast from the mount may have landed before the record began, and would still be on screen
    expect(await win.locator('.toast').count()).toBe(0)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    // Writable again, with no restart: the next scan writes both sessions
    chmodSync(f.userData, 0o755)
    await expect.poll(() => {
      const file = JSON.parse(readFileSync(join(f.userData, 'usage-archive.json'), 'utf8')) as { rows: Array<{ total: number }> }
      return file.rows.reduce((sum, r) => sum + r.total, 0)
    }, { timeout: 15_000 }).toBe(4)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    // A second failure in the same run: once told is once
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

for (const [language, sentence] of [['en-US', EN], ['zh-CN', ZH]] as const) {
  test(`agents-overview A4d, token-stats C4: the archive's rename blocked from launch — the first scan leaves the placeholder, and the toast is told in ${language}`, async () => {
    const f = archiveFixture()
    // A non-empty directory where the archive goes: the temporary file writes and the rename fails
    mkdirSync(join(f.userData, 'usage-archive.json', 'x'), { recursive: true })
    // The first scan held, so the record starts before the toast
    const { app, win, stderr } = await start(f, { AGENTSHED_SYSTEM_LANGUAGES: language, AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
    try {
      await watch(win)
      await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
      await expect(allHistory(win)).toHaveText('2')
      await expect(win.locator('.toast.err')).toHaveText(sentence)
      await scansPass(win)
      expect(await toastsSeen(win)).toEqual([sentence])
      expect(temporaries(f)).toEqual([])
      expect(stderr.join('')).toContain('[usage-archive] save failed:')
      expect(stderr.join('')).not.toContain('[startup] scan failed')
    } finally {
      await closeApp(app)
      cleanUp(f)
    }
  })
}

test('token-stats C8: the archive unreadable from launch — the figures are the live rows, nothing is written, and its history returns once it can be read', async () => {
  test.skip(ROOT, 'root ignores the file mode')
  const f = archiveFixture()
  const file = join(f.userData, 'usage-archive.json')
  const seeded = { day: '2020-01-02', side: 'claude', projectKey: '/legacy', model: 'claude-fable-5', input: 12_000, output: 0, cacheRead: 0, cacheWrite: 0, total: 12_000 }
  writeFileSync(file, JSON.stringify({ version: 2, rows: [seeded], stamps: {}, observed: {}, superseded: [] }))
  const before = statSync(file)
  chmodSync(file, 0o000)
  const { app, win, stderr } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
  try {
    await watch(win)
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
    await expect(allHistory(win)).toHaveText('2')
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
    expect([statSync(file).mtimeMs, statSync(file).size]).toEqual([before.mtimeMs, before.size])
    expect(temporaries(f)).toEqual([])
    expect(stderr.join('')).toContain('[usage-archive] read failed:')
    // Readable again, with no restart and no change to the file's signature
    chmodSync(file, 0o644)
    await expect(allHistory(win)).toHaveText('12k', { timeout: 15_000 })
    await expect.poll(() => (JSON.parse(readFileSync(file, 'utf8')) as { rows: Array<{ day: string }> }).rows.some((r) => r.day === seeded.day && r.day !== ''), { timeout: 15_000 }).toBe(true)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    chmodSync(file, 0o644)
    await closeApp(app)
    cleanUp(f)
  }
})

test('agents-overview REQ-002, token-stats C4: a relaunch over a saved display with the rename blocked — the saved figure shows, the scan replaces it, and the toast is told', async () => {
  const f = archiveFixture()
  const first = await start(f)
  await expect(allHistory(first.win)).toHaveText('2', { timeout: 15_000 })
  await closeApp(first.app)
  session(f, 'second')
  const file = join(f.userData, 'usage-archive.json')
  rmSync(file)
  mkdirSync(join(file, 'x'), { recursive: true })
  const { app, win } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS })
  try {
    await watch(win)
    await expect(allHistory(win)).toHaveText('2')
    await expect(win.locator('.scan-hint')).toBeVisible()
    await expect(allHistory(win)).toHaveText('4', { timeout: 15_000 })
    await expect(win.locator('.scan-hint')).not.toBeVisible()
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})

const loseFocus = (win: Page): Promise<void> => win.evaluate(() => { document.hasFocus = () => false })
const regainFocus = (win: Page): Promise<void> => win.evaluate(() => {
  delete (document as unknown as { hasFocus?: unknown }).hasFocus
  window.dispatchEvent(new Event('focus'))
})

/**
 * The launch where one ask alone can take the notice: the archive's rename blocked, the first scan held until the window has
 * no focus, and no other scan for ten minutes. So the one snapshot's ask is withheld, and what tells the user next is whichever
 * ask the case then makes possible, with no timed scan to do it instead.
 */
async function oneWithheldScan(f: Fixture): Promise<{ app: ElectronApplication; win: Page }> {
  mkdirSync(join(f.userData, 'usage-archive.json', 'x'), { recursive: true })
  const { app, win } = await start(f, { AGENTSHED_SCAN_DELAY_MS: HOLD_MS, AGENTSHED_RESCAN_MS: '600000' })
  await watch(win)
  await loseFocus(win)
  await expect.poll(() => snapshotsSeen(win), { timeout: 15_000 }).toBe(1)
  expect(await toastsSeen(win)).toEqual([])
  return { app, win }
}

test('token-stats C4: the window getting focus tells a waiting notice, with no scan to do it', async () => {
  const f = archiveFixture()
  const { app, win } = await oneWithheldScan(f)
  try {
    await regainFocus(win)
    await expect(win.locator('.toast.err')).toHaveText(EN)
    expect(await snapshotsSeen(win)).toBe(1)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a failure while the window has no focus waits for it, and is told in the language on screen then', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = archiveFixture()
  const { app, win } = await start(f)
  try {
    // Switched after the window's language was read at launch; the switch's own toast waited out, so the next is fresh
    await win.locator('.rail .ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator('[data-lang="zh"]').click()
    await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(win.locator('.toast.ok')).toBeVisible()
    await expect(win.locator('.toast.ok')).toHaveCount(0)
    await watch(win)
    await loseFocus(win)
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    await regainFocus(win)
    await expect(win.locator('.toast.err')).toHaveText(ZH)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([ZH])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a failure that clears before the window has focus tells nothing, and a later one still tells', async () => {
  test.skip(ROOT, 'root ignores the directory mode')
  const f = archiveFixture()
  const { app, win } = await start(f)
  try {
    await expect(win.locator('.sk-page')).toHaveCount(0, { timeout: 15_000 })
    await watch(win)
    await loseFocus(win)
    chmodSync(f.userData, 0o555)
    await scansPass(win)
    chmodSync(f.userData, 0o755)
    // Past any scan already under way, so the last one here wrote
    await scansPass(win)
    await regainFocus(win)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([])
    chmodSync(f.userData, 0o555)
    await expect(win.locator('.toast.err')).toHaveText(EN)
    await scansPass(win)
    expect(await toastsSeen(win)).toEqual([EN])
  } finally {
    chmodSync(f.userData, 0o755)
    await closeApp(app)
    cleanUp(f)
  }
})

test('token-stats C4: a window that subscribed after the failure is told when it mounts, with no scan to do it', async () => {
  const f = archiveFixture()
  const { app, win } = await oneWithheldScan(f)
  try {
    // A new document: its focus is the emulated one again, and it missed the snapshot that came with the failure
    await win.reload()
    await expect(win.locator('.toast.err')).toHaveText(EN)
  } finally {
    await closeApp(app)
    cleanUp(f)
  }
})
