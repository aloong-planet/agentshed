import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'
import { AGENT_SIDES } from '../src/shared/validate'
import { localDayOffset } from './support/dates'
import { mkUsageHome, mkEmptyProjectHome } from './support/homes'
import { makeUserData, launch, close, launchAppearance, startApp } from './support/launch'
import { effectiveDark } from './support/colors'

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
