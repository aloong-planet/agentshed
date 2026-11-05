import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication } from '@playwright/test'
import { mkEmptyProjectHome } from './support/homes'
import { launch, close, launchAppearance } from './support/launch'
import { type Win, type Rgb, pixelAt, paintedBackground, rgb, near, effectiveDark } from './support/colors'

/** A scrolling area's vertical scrollbar, measured: how far its content overflows, how wide the scrollbar is (the
 * box less the client area less the borders), the column the scrollbar occupies, where its thumb is at the current
 * scroll position, and the colour the area paints beneath it (the first painted background up its ancestors) */
async function scrollArea(win: Win, selector: string): Promise<{
  overflow: number
  width: number
  columnX: number
  thumbY: number
  trackY: number
  background: Rgb
}> {
  return win.locator(selector).evaluate((node) => {
    const el = node as HTMLElement
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const bl = parseFloat(cs.borderLeftWidth)
    const br = parseFloat(cs.borderRightWidth)
    const bt = parseFloat(cs.borderTopWidth)
    const bb = parseFloat(cs.borderBottomWidth)
    const width = el.offsetWidth - el.clientWidth - bl - br
    const top = r.top + bt
    const thumbLength = (el.clientHeight * el.clientHeight) / el.scrollHeight
    const thumbTop = top + (el.scrollTop / el.scrollHeight) * el.clientHeight
    return {
      overflow: el.scrollHeight - el.clientHeight,
      width,
      columnX: r.right - br - width / 2,
      thumbY: thumbTop + thumbLength / 2,
      // Below the thumb when it sits at the top, on the empty part of the scrollbar's column
      trackY: r.bottom - bb - 3
    }
  }).then(async (measured) => ({ ...measured, background: await paintedBackground(win.locator(selector)) }))
}

/** A colour at the given opacity laid over a background: the expected thumb, from the spec's literal values */
function over(channel: 0 | 255, alpha: number, background: Rgb): Rgb {
  return background.map((b) => Math.round(b * (1 - alpha) + channel * alpha)) as Rgb
}

// appearance ticket 02: the settings dimension + the three appearance choices; data-theme applies
// immediately and entering and leaving settings does not lose the selection
test('settings: the three appearance choices change data-theme, and entering and leaving settings keeps the selected project', async () => {
  // The delay (query layer, ADR-0028) makes a fresh fetch observably slower than a cached visit,
  // which is what the return-to-Projects assertion below (project-detail T9) needs to distinguish.
  const l = await launch(undefined, mkEmptyProjectHome(), { AGENTSHED_FETCH_DELAY_MS: '500' })
  const win = await l.app.firstWindow()
  await expect(win.locator('.rail .ri').first()).toBeVisible()
  // Purple by default (no prefs, or purple); html carries data-theme
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('purple')

  // Go to Projects and select the only project
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row').first()).toBeVisible()
  await win.locator('.side .row').first().click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  // Let the first visit's detail arrive before leaving — the assertion below is about the *return*
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible()

  // The settings dimension
  await win.getByTitle('Settings').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')
  await expect(win.locator('.theme-card')).toHaveCount(3)
  // The settings page now has two footnotes (language / appearance), located by meaning rather than class
  // name — the class name is no longer unique
  await expect(win.getByTestId('appearance-foot')).toContainText('Follow')

  // Click mist blue → data-theme=blue
  await win.locator('[data-theme-option="blue"]').click()
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')
  await expect(win.locator('[data-theme-option="blue"]')).toHaveAttribute('aria-checked', 'true')

  // Back to Projects: the selection is still there and the theme is still blue (app-wide). Leaving
  // the dimension unmounts the detail pane, but the query layer's cache survives it (project-detail
  // T9): the body is visible well inside the 500ms delay, proving this is a cached visit, not a
  // fresh fetch.
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row.sel')).toHaveCount(1)
  await expect(win.locator('.pane-body .tot-sides')).toBeVisible({ timeout: 200 })
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')
  // Back on the Agents main area it is still blue
  await win.locator('.rail .ri').first().click()
  await expect(win.locator('.pane-head h1')).toHaveText('Agents')
  await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe('blue')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Appearance mode (i18n ticket 04).
 *
 * **What is and is not tested here**: it tests "choosing a mode changes the effective light/dark" and the
 * UI form;
 * it **does not test** "after locking, later system appearance changes do not affect the UI" — the test
 * environment cannot change the real system appearance, and using
 * themeSource itself to simulate a "system change" is circular (it tests the value we just set). That one
 * is accepted by hand.
 */

/** Each theme card's **paper sample** (the first swatch = --card), read back from the computed CSS */
async function paperSwatches(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<string[]> {
  return win.evaluate(() =>
    [...document.querySelectorAll('[data-theme-option]')].map((card) => {
      const sw = card.querySelector('.theme-sw')
      return sw ? getComputedStyle(sw).backgroundColor : ''
    })
  )
}

/** rgb(...) → a rough relative luminance (0=black, 1=white); used only to tell a light sample from a dark
 * one */
function luminance(rgb: string): number {
  const m = rgb.match(/\d+/g)
  if (!m || m.length < 3) return NaN
  const [r, g, b] = m.slice(0, 3).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

test('appearance: one card with two rows (mode + theme); the theme cards keep only a swatch and a name', async () => {
  const l = await launch(undefined, mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // One card with two rows: mode on top, theme below
  const field = win.getByTestId('appearance-field')
  await expect(field.locator('.frow')).toHaveCount(2)
  const rows = field.locator('.frow')
  await expect(rows.nth(0).getByTestId('mode-seg').locator('button')).toHaveCount(3)
  await expect(rows.nth(1).locator('[data-theme-option]')).toHaveCount(3)

  // The theme cards **carry no full-sentence description**: a card's visible text equals the theme name
  // exactly.
  // toHaveText for exact equality rather than "does not contain some sentence" — the latter can only rule
  // out the one sentence I happened to think of
  await expect(win.locator('[data-theme-option="purple"]')).toHaveText('Purple')
  await expect(win.locator('[data-theme-option="blue"]')).toHaveText('Mist Blue')
  await expect(win.locator('[data-theme-option="amber"]')).toHaveText('Amber Brown')

  // "Purple is the default" moved into the closing explanation
  await expect(win.getByTestId('appearance-foot')).toContainText('Purple')

  expect(l.errors).toEqual([])
  await close(l)
})

test('appearance mode: locking light or dark changes the effective light/dark, and the palette samples follow', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  // "Follow system" is selected by default
  await expect(win.locator('[data-mode-option="system"]')).toHaveAttribute('aria-checked', 'true')

  // ── Why the swatches are polled rather than read once the media query has flipped ──
  // They are not CSS: SettingsPane picks them out of a table keyed on the effective light/dark, and that
  // key is React state fed by a matchMedia listener. So `matchMedia(...).matches` (what effectiveDark
  // reads) flips a render **before** the swatches do, and reading them right after it leaves a window in
  // which the previous mode's table is still on screen.
  //
  // That window is narrower than one CDP round-trip, so it almost never opens — it was seen once, as a
  // light-mode assertion receiving luminance 0.1286, which is exactly THEME_SWATCH.dark.purple[0]
  // (#1f2124) under the helper below. Polling the quantity actually asserted, rather than the signal
  // upstream of it, removes the window instead of making it less likely.
  //
  // Locking dark → the effective light/dark is dark
  await win.locator('[data-mode-option="dark"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(true)
  await expect(win.locator('[data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
  await expect
    .poll(async () => Math.max(...(await paperSwatches(win)).map(luminance)))
    .toBeLessThan(0.3)
  const dark = await paperSwatches(win)

  // Locking light → the effective light/dark is light
  await win.locator('[data-mode-option="light"]').click()
  await expect.poll(async () => effectiveDark(win)).toBe(false)
  await expect
    .poll(async () => Math.min(...(await paperSwatches(win)).map(luminance)))
    .toBeGreaterThan(0.9)
  const light = await paperSwatches(win)

  // Pin down that the set is non-empty first: if the two loops below iterated an empty array, their bodies
  // would never run,
  // every assertion would fall through and it would still be green — both have to be guarded, or one of
  // them passes for free
  expect(dark).toHaveLength(3)
  expect(light).toHaveLength(3)

  // The samples follow the effective light/dark: in dark mode the paper sample must be dark rather than
  // still showing the light set.
  // The assertion targets the **paper sample** (the first swatch) only, not "no swatch is near-white in
  // dark mode" —
  // the fourth swatch takes --text, which should be near-white in dark mode, and that is not a bug
  for (const c of dark) expect(luminance(c)).toBeLessThan(0.3)
  for (const c of light) expect(luminance(c)).toBeGreaterThan(0.9)
  expect(dark).not.toEqual(light)

  expect(l.errors).toEqual([])
  await close(l)
})

test('appearance: all six combinations of 3 themes × 2 effective light/dark hold', async () => {
  const l = await launchAppearance(mkEmptyProjectHome())
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.getByTitle('Settings').click()

  /**
   * The floating layers' shadow, sampled per state. It is checked by name because "every variable
   * resolves" cannot see the failure that matters for it: defined for light and forgotten for dark, it
   * would inherit the light value and stay resolvable while being visibly wrong — a shadow tuned for a
   * pale backdrop disappears against a dark one.
   *
   * Named rather than generalised to "every colour variable must differ between light and dark", because
   * four functional colours (danger, tip) deliberately do not — so that rule would need an exception list
   * to maintain. See the delivery notes for that trade-off.
   */
  const floatShadowByState = new Map<string, string>()
  const scrollThumbByState = new Map<string, string>()

  for (const mode of ['light', 'dark'] as const) {
    await win.locator(`[data-mode-option="${mode}"]`).click()
    await expect.poll(async () => effectiveDark(win)).toBe(mode === 'dark')
    for (const theme of ['purple', 'blue', 'amber'] as const) {
      await win.locator(`[data-theme-option="${theme}"]`).click()
      await expect.poll(async () => win.locator('html').getAttribute('data-theme')).toBe(theme)
      const vars = await win.evaluate(() => {
        // Enumerate the variables the **theme blocks** declare, rather than naming a few by hand. A
        // hand-written list only ever covers the variables someone thought of on the day, so a variable
        // added later and missed in one block goes unnoticed — the failure being that it silently falls
        // back to whatever it inherits, or to nothing at all.
        //
        // Scoped to `:root` and the palette blocks on purpose: a few variables belong to a component
        // instead (`--chrome-w` lives on the app shell), and those are not expected to resolve here.
        const declared = new Set<string>()
        const collect = (rules: CSSRuleList): void => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSMediaRule) collect(rule.cssRules)
            else if (rule instanceof CSSStyleRule) {
              // A theme block is the root element itself — no descendant combinator. Matching merely
              // "starts with :root" also catches rules like `:root[data-theme='dark'] .qlist .q`, whose
              // variables are scoped to a component and are correctly absent from the root.
              const sel = rule.selectorText
              if (/\s/.test(sel) || !/^(:root|html\[data-theme)/.test(sel)) continue
              for (const prop of Array.from(rule.style)) {
                if (prop.startsWith('--')) declared.add(prop)
              }
            }
          }
        }
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            collect(sheet.cssRules)
          } catch {
            // A cross-origin sheet cannot be read; there are none of ours, so nothing is lost
          }
        }
        const cs = getComputedStyle(document.documentElement)
        const body = getComputedStyle(document.body)
        return {
          declaredCount: declared.size,
          unresolved: [...declared].filter((n) => cs.getPropertyValue(n).trim() === ''),
          floatShadow: cs.getPropertyValue('--float-shadow').trim(),
          scrollThumb: `${cs.getPropertyValue('--scroll-thumb').trim()} / ${cs.getPropertyValue('--scroll-thumb-hover').trim()}`,
          bodyBg: body.backgroundColor,
          bodyFg: body.color
        }
      })
      // Guard the set is non-empty first: an empty enumeration would make the next assertion pass for
      // free, which is the shape this whole check exists to prevent
      expect(vars.declaredCount).toBeGreaterThan(20)
      // Every theme variable resolves in this combination.
      //
      // **What this does and does not catch.** It catches a variable that resolves nowhere — typically a
      // new one nobody defined, or a renamed one whose users were not updated. It does **not** catch a
      // variable defined for light and forgotten for dark: custom properties inherit, so the dark state
      // silently picks up the light value. Resolving is therefore necessary, not sufficient. Verified by
      // mutation — deleting the dark definition of a variable leaves this green.
      expect(vars.unresolved).toEqual([])
      floatShadowByState.set(`${theme}/${mode}`, vars.floatShadow)
      scrollThumbByState.set(`${theme}/${mode}`, vars.scrollThumb)
      // The foreground and background are distinguishable (otherwise this combination gives invisible text)
      expect(Math.abs(luminance(vars.bodyBg) - luminance(vars.bodyFg))).toBeGreaterThan(0.3)
    }
  }

  // The floating shadow must actually change with light/dark, and must not change with the palette —
  // it is a neutral shadow, so three palettes sharing one value is correct rather than an oversight
  expect(floatShadowByState.size).toBe(6)
  const lightShadows = new Set(
    [...floatShadowByState].filter(([k]) => k.endsWith('/light')).map(([, v]) => v)
  )
  const darkShadows = new Set(
    [...floatShadowByState].filter(([k]) => k.endsWith('/dark')).map(([, v]) => v)
  )
  expect(lightShadows.size).toBe(1)
  expect(darkShadows.size).toBe(1)
  expect([...lightShadows][0]).not.toBe([...darkShadows][0])
  expect([...lightShadows][0]).not.toBe('')

  // The scrollbar thumb and its hover shade likewise (appearance::REQ-001/AC-04, C2): a neutral grey laid over the
  // surface, one value per appearance, the same in every theme
  expect(scrollThumbByState.size).toBe(6)
  const lightThumbs = new Set([...scrollThumbByState].filter(([k]) => k.endsWith('/light')).map(([, v]) => v))
  const darkThumbs = new Set([...scrollThumbByState].filter(([k]) => k.endsWith('/dark')).map(([, v]) => v))
  expect([...lightThumbs], 'one light thumb in every theme').toHaveLength(1)
  expect([...darkThumbs], 'one dark thumb in every theme').toHaveLength(1)
  expect([...lightThumbs][0]).not.toBe([...darkThumbs][0])
  expect([...lightThumbs][0]).not.toMatch(/^ \/ |\/ $/)

  expect(l.errors).toEqual([])
  await close(l)
})

/** A home with 40 registered projects: enough rows to overflow the project list at a 1000×600 window */
function manyProjectsHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-scroll-'))
  const projects: Record<string, object> = {}
  for (let i = 0; i < 40; i++) {
    const p = join(home, `proj-${String(i).padStart(2, '0')}`)
    mkdirSync(p, { recursive: true })
    projects[p] = {}
  }
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects }))
  return home
}

/**
 * Scrollbars (spec appearance.md, appearance::REQ-001 and sequence F), on the project list: 40 projects overflow it
 * at this window size. Which scrollbar macOS itself would draw here depends on the machine (its setting and whether a
 * mouse is attached: the overlay one or the classic 15px one with a track); the app draws its own either way, and the
 * next case drives both of macOS's styles.
 */
test('scrollbars: every scrolling area draws a 6px thumb on no track, in light and in dark (appearance::REQ-001)', async () => {
  const l = await launch(undefined, manyProjectsHome())
  const win = await l.app.firstWindow()
  await win.setViewportSize({ width: 1000, height: 600 })
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(40)
  const LIST = '.side .list'

  // AC-01, AC-03: the list overflows with nothing scrolled, and its scrollbar is 6px wide
  const light = await scrollArea(win, LIST)
  expect(light.overflow, 'the list must overflow, or its scrollbar width measures 0 whatever the rule').toBeGreaterThan(0)
  // Soft from here: each part of the drawing reports on its own
  expect.soft(light.width, 'the scrollbar is 6px wide').toBe(6)
  // AC-02: no track — below the thumb, the scrollbar's column shows the list's own background
  // The pointer away from the list first, so the thumb is read at rest
  await win.mouse.move(5, 5)
  const lightTrack = await pixelAt(win, light.columnX, light.trackY)
  expect.soft(near(lightTrack, light.background), `the track shows the list's background ${rgb(light.background)}, got ${rgb(lightTrack)}`).toBe(true)
  // AC-04: the thumb is black at 25% over that background, and it is where it was measured (not the track's colour)
  const lightThumb = await pixelAt(win, light.columnX, light.thumbY)
  expect.soft(lightThumb, 'the thumb is sampled, not the track').not.toEqual(lightTrack)
  expect.soft(near(lightThumb, over(0, 0.25, light.background)), `the thumb is black at 25% over ${rgb(light.background)}, got ${rgb(lightThumb)}`).toBe(true)
  await win.locator('.side').screenshot({ path: 'e2e-out/scrollbars-list-light.png' })

  // In dark (#281: a light strip beside a dark list), with no reload
  await win.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(async () => (await scrollArea(win, LIST)).background).not.toEqual(light.background)
  const dark = await scrollArea(win, LIST)
  expect.soft(dark.width, 'the scrollbar is 6px wide in dark').toBe(6)
  const darkTrack = await pixelAt(win, dark.columnX, dark.trackY)
  expect.soft(near(darkTrack, dark.background), `the track shows the list's dark background ${rgb(dark.background)}, got ${rgb(darkTrack)}`).toBe(true)
  const darkThumb = await pixelAt(win, dark.columnX, dark.thumbY)
  expect.soft(near(darkThumb, over(255, 0.22, dark.background)), `the thumb is white at 22% over ${rgb(dark.background)}, got ${rgb(darkThumb)}`).toBe(true)
  await win.locator('.side').screenshot({ path: 'e2e-out/scrollbars-list-dark.png' })

  // F6: scrolling behaves as before — a click where the track was pages down, the thumb drags, the wheel turns
  const scrollTop = (): Promise<number> => win.locator(LIST).evaluate((el) => el.scrollTop)
  const toTop = (): Promise<number> => win.locator(LIST).evaluate((el) => { el.scrollTop = 0; return el.scrollTop })
  expect(await toTop()).toBe(0)
  let at = await scrollArea(win, LIST)
  await win.mouse.click(at.columnX, at.trackY)
  await expect.poll(scrollTop, 'a click below the thumb pages the list down').toBeGreaterThan(0)
  expect(await toTop()).toBe(0)
  at = await scrollArea(win, LIST)
  await win.mouse.move(at.columnX, at.thumbY)
  await win.mouse.down()
  await win.mouse.move(at.columnX, at.thumbY + 40, { steps: 4 })
  await win.mouse.up()
  await expect.poll(scrollTop, 'dragging the thumb scrolls the list').toBeGreaterThan(0)
  expect(await toTop()).toBe(0)
  await win.mouse.move(at.columnX - 60, at.thumbY)
  await win.mouse.wheel(0, 200)
  await expect.poll(scrollTop, 'the wheel scrolls the list').toBeGreaterThan(0)
  await win.mouse.move(5, 5)

  // AC-03, F5: a window tall enough for all 40 rows leaves the list nothing to scroll, and no scrollbar takes room;
  // made short again, the list overflows and the scrollbar is back
  await win.setViewportSize({ width: 1000, height: 1800 })
  await expect.poll(async () => (await scrollArea(win, LIST)).overflow, 'the 40 rows fit a tall window').toBe(0)
  expect((await scrollArea(win, LIST)).width, 'no scrollbar when the content fits').toBe(0)
  await win.setViewportSize({ width: 1000, height: 600 })
  await expect.poll(async () => (await scrollArea(win, LIST)).overflow).toBeGreaterThan(0)
  expect((await scrollArea(win, LIST)).width, 'the scrollbar is back once the list overflows').toBe(6)

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * The thumb darkens under the pointer (appearance::REQ-001/AC-05), on macOS, where the app ships. On CI's ubuntu
 * (measured 2026-10-23), a synthetic pointer on the thumb reaches the page — a row beside it takes its hover — but
 * Chromium does not take the scrollbar as hovered: the list does not match :hover and the thumb keeps its resting shade.
 */
test('scrollbars: the thumb darkens under the pointer, in light and in dark (appearance::REQ-001/AC-05)', async () => {
  test.skip(process.platform !== 'darwin', 'on ubuntu, Chromium leaves a scrollbar under a synthetic pointer unhovered (measured); the app ships for macOS')
  const l = await launch(undefined, manyProjectsHome())
  const win = await l.app.firstWindow()
  await win.setViewportSize({ width: 1000, height: 600 })
  await win.locator('.rail .ri').nth(1).click()
  await expect(win.locator('.side .row')).toHaveCount(40)
  const LIST = '.side .list'
  // The pointer comes in from the list in steps, as a hand would; the poll returns the pixel read when it is not the
  // expected one, so a failure shows its colour
  const underPointer = async (channel: 0 | 255, alpha: number): Promise<string> => {
    const a = await scrollArea(win, LIST)
    await win.mouse.move(5, 5)
    await win.mouse.move(a.columnX - 40, a.thumbY)
    await win.mouse.move(a.columnX, a.thumbY, { steps: 5 })
    let read = ''
    await expect.poll(async () => {
      const got = await pixelAt(win, a.columnX, a.thumbY)
      read = rgb(got)
      return near(got, over(channel, alpha, a.background)) ? 'expected' : read
    }).toBe('expected')
    return read
  }
  await underPointer(0, 0.4)
  await win.mouse.move(5, 5)
  const light = await paintedBackground(win.locator(LIST))
  await win.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => paintedBackground(win.locator(LIST))).not.toEqual(light)
  await underPointer(255, 0.36)
  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * The same scrollbar under both of macOS's styles (appearance F1, F2): the app is launched with a per-process
 * `-AppleShowScrollBars` argument, which macOS reads for that process only, leaving the machine's setting alone —
 * `WhenScrolling` gives the overlay scrollbar a trackpad-only Mac draws, `Always` the classic one. A control block given
 * the standard `scrollbar-width` makes Chromium draw the platform's own scrollbar for it, which shows the argument took
 * effect (0 wide when overlay, wider when classic); the project list keeps its 6px scrollbar under both, its thumb in
 * view with nothing scrolling. macOS's third setting, automatic, resolves to one of these two (overlay with only a
 * trackpad, classic with a mouse), so it needs no launch of its own.
 */
test('scrollbars: the same 6px scrollbar whether macOS draws overlay or classic ones (appearance F1, F2)', async () => {
  test.skip(process.platform !== 'darwin', 'the -AppleShowScrollBars argument is read by macOS only')
  for (const [setting, overlay] of [['WhenScrolling', true], ['Always', false]] as const) {
    const l = await launch(undefined, manyProjectsHome(), undefined, ['-AppleShowScrollBars', setting])
    const win = await l.app.firstWindow()
    await win.setViewportSize({ width: 1000, height: 600 })
    await win.locator('.rail .ri').nth(1).click()
    await expect(win.locator('.side .row')).toHaveCount(40)
    const platform = await win.evaluate(() => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;left:400px;top:100px;width:200px;height:200px;overflow:auto;scrollbar-width:thin'
      d.innerHTML = '<div style="height:1200px"></div>'
      document.body.appendChild(d)
      const width = d.offsetWidth - d.clientWidth
      d.remove()
      return width
    })
    if (overlay) expect(platform, `${setting}: the platform's own scrollbar is an overlay one`).toBe(0)
    else expect(platform, `${setting}: the platform's own scrollbar is a classic one`).toBeGreaterThan(0)
    const list = await scrollArea(win, '.side .list')
    expect(list.overflow, 'the list must overflow').toBeGreaterThan(0)
    expect(list.width, `${setting}: the list's scrollbar is the app's 6px one`).toBe(6)
    // The thumb is painted at rest, the pointer away and nothing scrolled; the 6px above is what rules out an overlay
    // scrollbar, which takes no width
    await win.mouse.move(5, 5)
    const thumb = await pixelAt(win, list.columnX, list.thumbY)
    expect(near(thumb, over(0, 0.25, list.background)),
      `${setting}: the idle thumb is black at 25% over ${rgb(list.background)}, got ${rgb(thumb)}`).toBe(true)
    expect(l.errors).toEqual([])
    await close(l)
  }
})
