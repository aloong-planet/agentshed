import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'
import { launchWithLangs } from './support/launch'

test('UI language: following the system resolves against the whole list, at launch and when chosen in settings', async () => {
  // [ko, ja, zh, en]: Korean and Japanese are unsupported (ADR-0035), so it should carry on to Chinese — not
  // fall back to English because the first entry missed (i18n::REQ-002/AC-01).
  // A single-element list cannot tell the two implementations apart, so this has to use several.
  const l = await launchWithLangs('ko-KR,ja-JP,zh-Hans-CN,en-US')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  // The default preference is "follow system", so the UI should be Chinese
  await expect(win.locator('.ri.set')).toHaveAttribute('title', '设置')
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('zh-CN')

  // Chosen in settings, the window resolves the list it was handed rather than asking the main process, so that list
  // has to arrive whole as well
  await win.locator('.ri.set').click()
  const trig = win.getByTestId('language-trigger')
  const pop = win.getByTestId('language-pop')
  await trig.click()
  await pop.locator('[data-lang="en"]').click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'en')
  await trig.click()
  // The first item is the follow-system policy
  await pop.locator('.lang-opt').first().click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(win.locator('.ri.set')).toHaveAttribute('title', '设置')

  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('UI language: a stored preference naming a removed language reads as follow system (i18n::REQ-003)', async () => {
  // A development machine's preference file can still hold `fr` from a build before ADR-0035. It is an
  // invalid value now, so the language follows the system — Chinese here — with no notice, and the other
  // preferences keep their stored values. The file has a real one's shape.
  const l = await launchWithLangs('zh-Hans-CN', undefined, {
    theme: 'blue', language: 'fr', mode: 'light', trendSpan: 90, autoCheckUpdates: true
  })
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await expect(win.locator('.ri.set')).toHaveAttribute('title', '设置')
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'blue')
  await win.locator('.ri.set').click()
  const trig = win.getByTestId('language-trigger')
  await expect(trig).toContainText('跟随系统')
  await expect(trig).toContainText('简体中文')
  // Counted once, not retried: a retried "no toast" waits out a toast's 3.2 s and then passes. A notice shown at
  // startup is still on screen here
  expect(await win.locator('.toast').count()).toBe(0)
  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('the language selector: three items including follow-system and the divider, with a switch applying immediately', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()

  // The language section comes before appearance: assert the DOM order rather than eyeballing a screenshot
  // This case deliberately launches with a Chinese system language, so the section
  // titles it asserts on are the Chinese UI copy — not an untranslated leftover.
  const secs = win.locator('.settings-sec-t')
  await expect(secs.first()).toHaveText('语言')
  await expect(secs.nth(1)).toHaveText('外观')

  // The trigger shows "follow system" plus the current resolution
  const trig = win.getByTestId('language-trigger')
  await expect(trig).toContainText('跟随系统')
  await expect(trig).toContainText('简体中文')

  await trig.click()
  const pop = win.getByTestId('language-pop')
  // Follow system, then the two languages (i18n::REQ-001/AC-01)
  await expect(pop.locator('.lang-opt')).toHaveCount(3)
  await expect(pop.locator('.lang-sep')).toHaveCount(1)
  // The first item is a policy showing the resolved language; it is not "a language"
  await expect(pop.locator('.lang-opt').first()).toContainText('跟随系统')
  await expect(pop.locator('.lang-opt').first()).toContainText('简体中文')
  // Each language in its own script, with its English name beside it
  await expect(pop.locator('.lang-opt').nth(1)).toHaveAttribute('data-lang', 'zh')
  await expect(pop.locator('.lang-opt').nth(1)).toContainText('简体中文')
  await expect(pop.locator('.lang-opt').nth(1)).toContainText('Chinese (Simplified)')
  await expect(pop.locator('.lang-opt').nth(2)).toHaveAttribute('data-lang', 'en')
  await expect(pop.locator('.lang-opt').nth(2)).toContainText('English')

  // The overlay is not clipped by the settings page's overflow:auto: hit tests at all four corners and the
  // centre, since an attribute existing does not count
  const visible = await win.evaluate(() => {
    const pop = document.querySelector('[data-testid="language-pop"]') as HTMLElement
    const r = pop.getBoundingClientRect()
    const hit = (x: number, y: number): boolean => pop.contains(document.elementFromPoint(x, y))
    return (
      hit(r.left + r.width / 2, r.top + r.height / 2) &&
      hit(r.left + 6, r.top + 6) &&
      hit(r.right - 6, r.top + 6) &&
      hit(r.left + 6, r.bottom - 6) &&
      hit(r.right - 6, r.bottom - 6)
    )
  })
  expect(visible).toBe(true)

  // Switch to English: the whole page changes language immediately, sidebar tooltips included
  await pop.locator('[data-lang="en"]').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')
  await expect(win.locator('.ri.set')).toHaveAttribute('title', 'Settings')
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('en')

  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('the language selector by keyboard: opening leaves the highlight on the current selection rather than moving an extra step', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()

  // **Switch to a non-first item first**, then verify where the highlight sits: if the current selection
  // were item 0,
  // "the highlight stays on the selection" and "the highlight was never set" would both give 0, and the
  // assertion could not tell them apart
  const trig = win.getByTestId('language-trigger')
  await trig.click()
  await win.getByTestId('language-pop').locator('[data-lang="en"]').click()
  await expect(win.locator('.settings-h1')).toHaveText('Settings')

  // Move the mouse away before testing the keyboard: the previous step selected with the mouse and the
  // pointer is still where the overlay was,
  // so reopening the overlay would land on an item, trigger a hover highlight and displace the keyboard
  // cursor —
  // which is correct mouse behaviour but would make this keyboard assertion test the wrong thing
  await win.mouse.move(0, 0)
  await trig.focus()
  await win.keyboard.press('ArrowDown')
  const pop = win.getByTestId('language-pop')
  await expect(pop).toBeVisible()
  // English's index in OPTIONS is 2 (system + zh en)
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'en')

  // ↑ one step to Chinese, then Enter to select
  await win.keyboard.press('ArrowUp')
  await expect(pop.locator('.lang-opt.cursor')).toHaveAttribute('data-lang', 'zh')
  await win.keyboard.press('Enter')
  await expect(win.locator('.settings-h1')).toHaveText('设置')

  // Esc closes without changing the language
  await trig.click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('language-pop')).toHaveCount(0)
  await expect(win.locator('.settings-h1')).toHaveText('设置')

  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

// ── Dedicated i18n cases (ticket 14) ─────────────────────────────────
// The division of labour with the existing cases: the existing e2e pins the language and guards
// **behaviour**; these guard
// **i18n itself** — a switch taking effect, both languages loading, and neither language bursting the
// layout.

test('i18n: both languages load, with the key nodes non-empty', async () => {
  // Not overlapping with typecheck: typecheck guarantees the keys are complete, and this guarantees **a
  // value really is obtained at runtime** —
  // for instance, if one language's dictionary failed to import entirely, the keys would be complete while
  // runtime read undefined
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  const trig = win.getByTestId('language-trigger')
  for (const code of ['en', 'zh']) {
    await trig.click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    // The key nodes: the page title, the sidebar tooltips, and the settings page's two section titles
    await expect(win.locator('.settings-h1')).not.toBeEmpty()
    await expect(win.locator('.ri.set')).not.toHaveAttribute('title', '')
    const secs = win.locator('.settings-sec-t')
    await expect(secs.first()).not.toBeEmpty()
    await expect(secs.nth(1)).not.toBeEmpty()
    expect(await win.evaluate(() => document.documentElement.lang)).not.toBe('')
  }
  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: switching languages applies immediately, changing several areas at once', async () => {
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  const before = {
    title: await win.locator('.settings-h1').textContent(),
    rail: await win.locator('.ri.set').getAttribute('title'),
    sec: await win.locator('.settings-sec-t').first().textContent()
  }
  await win.getByTestId('language-trigger').click()
  await win.getByTestId('language-pop').locator('[data-lang="en"]').click()
  // **Assert three areas together**: asserting one cannot distinguish "the whole page changed language" from
  // "only this one place is wired to the dictionaries"
  await expect(win.locator('.settings-h1')).not.toHaveText(before.title ?? '')
  await expect(win.locator('.ri.set')).not.toHaveAttribute('title', before.rail ?? '')
  await expect(win.locator('.settings-sec-t').first()).not.toHaveText(before.sec ?? '')
  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: key layouts do not overflow horizontally in either language', async () => {
  // Both languages are measured rather than the one assumed longest: which language is longer differs
  // between short labels and prose, and the two burst different containers (i18n::QR-001/AC-01).
  const l = await launchWithLangs('zh-Hans-CN')
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')
  await win.locator('.ri.set').click()
  for (const code of ['zh', 'en']) {
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()
    const overflow = await win.evaluate(() => {
      // The settings page's fixed-width containers must not be burst by their content. The document itself is not
      // measured: `body` hides horizontal overflow, so it never reports any (measured 2026-10-21)
      const boxes = [...document.querySelectorAll('.settings, .field, .settings-foot')]
      return { boxes: boxes.length, boxOverflows: boxes.filter((b) => b.scrollWidth > b.clientWidth + 1).length }
    })
    expect(overflow.boxes, `${code}: no settings container was found to measure`).toBeGreaterThan(0)
    expect(overflow.boxOverflows, `${code}: a fixed-width container was burst`).toBe(0)
  }
  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
})

test('i18n: no label in the project-detail tab row or the skills rows wraps to a second line', async () => {
  // The pre-existing overflow test covers the **settings page** only (`.settings`, `.field`,
  // `.settings-foot`). Two of the tightest rows were unguarded, and both hold copy that varies a lot in
  // width: the nine-tab row in project detail, and the `.sk-head` rows whose `.pill`s are `flex: none`.
  //
  // **What the failure actually looks like, measured rather than assumed.** The obvious guess — the row
  // bursts its container and the page scrolls sideways — is wrong here, and every check built on it is
  // vacuous:
  //   - `.tabs` is width-auto, so its `scrollWidth` equals its `clientWidth` while its tabs can shrink to fit, which an
  //     over-long label lets them do by wrapping. At the minimum window a project's nine tabs cannot, and the row runs
  //     past the pane (project-detail::REQ-004); this case runs at the default window.
  //   - `body` is `overflow-x: hidden`, so `documentElement.scrollWidth > clientWidth` never fires.
  //   - `.tab` is `white-space: normal` with `flex: 0 1 auto`, so an over-long label does not clip or
  //     overflow its box. It **wraps and grows the row vertically** — measured at 34px → 268px for a label
  //     14× too long, with `.pane-head` going 98px → 332px.
  // So the property asserted is single-line-ness: in a healthy row every item is one line and therefore the
  // same height, and any item whose text wrapped is taller than its siblings. That is resolution- and
  // font-independent, and it is what actually changes when the copy gets too long.
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-ovf-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // A project-level skill and a symlinked global one: between them the rows render the widest pill sets.
  mkdirSync(join(demo, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(join(demo, '.claude', 'skills', 'tdd', 'SKILL.md'), '---\ndescription: d\n---\nx\n')
  const linkTarget = join(home, 'repo', 'skills', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '---\ndescription: d\n---\nx\n')
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
  symlinkSync(linkTarget, join(home, '.claude', 'skills', 'linked-skill'))

  const l = await launchWithLangs('en-US', home)
  const win = await l.app.firstWindow()
  await win.waitForSelector('.rail')

  // Both languages: full-width Chinese labels grow differently from long English words — the same reason
  // the settings test measures both (i18n::QR-001/AC-01).
  for (const code of ['zh', 'en']) {
    await win.locator('.ri.set').click()
    await win.getByTestId('language-trigger').click()
    await win.getByTestId('language-pop').locator(`[data-lang="${code}"]`).click()
    await expect(win.locator('.settings-h1')).not.toBeEmpty()

    await win.locator('.rail .ri').nth(1).click()
    await win.locator('.side .row', { hasText: 'demo-proj' }).click()
    await expect(win.locator('.pane-head .tabs .tab').first()).toBeVisible()
    // "Skills" is a proper noun and is untranslated in every language, so this locator works throughout
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    await expect(win.locator('.pane-body .sk').first()).toBeVisible()

    const wrapped = await win.evaluate(() => {
      // Count **line boxes**, not heights. Comparing an item's height against its siblings' looks right and
      // is not: these rows are flex containers with the default `align-items: stretch`, so one wrapped label
      // grows every sibling to the same height and a height comparison reports nothing. A Range over the
      // element's contents yields one client rect per line box, which stretching does not affect.
      const wraps = (items: HTMLElement[]): string[] =>
        items
          .filter((e) => {
            const r = document.createRange()
            r.selectNodeContents(e)
            return r.getClientRects().length > 1
          })
          .map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 40))
      const q = (sel: string): HTMLElement[] => [...document.querySelectorAll(sel)] as HTMLElement[]
      return {
        tabCount: q('.pane-head .tabs .tab').length,
        pillCount: q('.pane-body .sk-head .pill').length,
        tabs: wraps(q('.pane-head .tabs .tab')),
        pills: wraps(q('.pane-body .sk-head .pill'))
      }
    })
    // An empty set would pass the two assertions below with nothing measured
    expect(wrapped.tabCount, `${code}: no tab was found to measure`).toBeGreaterThan(0)
    expect(wrapped.pillCount, `${code}: no skills-row pill was found to measure`).toBeGreaterThan(0)
    expect(wrapped.tabs, `${code}: a tab label wrapped onto a second line`).toEqual([])
    expect(wrapped.pills, `${code}: a skills-row pill wrapped onto a second line`).toEqual([])
  }
  expect(l.errors).toEqual([])
  await closeApp(l.app)
  rmSync(l.userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})
