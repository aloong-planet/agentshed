// Known gaps, unreachable through the UI today and so not driven here: the session page's focus reset
// when its focus prop changes without a remount (the page is keyed by file, and a hit always opens it
// fresh), and the file drawer's mode reset when its file changes while open — for skill and memory files
// alike, since one component carries both (the drawer switches files only from preview mode, through a link
// in the preview, so "the new file opens in preview" holds without the reset ever being exercised). Add a
// case when a path to either appears — a hit list beside an open session, or a file switch from raw mode.
// Also not driven: two reads in flight in one memory drawer (memory-view E2 — each read is keyed by its file,
// so an earlier read lands under its own key; add a case when a per-file read delay can be set to order two
// reads), and a language change while the drawer is open (E7 — today the language changes only on the settings
// page, which no drawer survives; add a case when it can change with a drawer open, such as from a menu).
// Copy follows the dictionary the language cases cover; the file, mode and scroll would survive because a
// language change remounts nothing in the drawer.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'
import { startApp } from './support/launch'
import { ERR } from '../src/shared/errors'
import { headingLadder, expectLadder, codeStyle, contentLineHeight, tableStyle, expectTableStyle, listIndent, expectCodeStyle } from './support/markdown-styles'
import { pixelAt, paintedBackground, rgb, near } from './support/colors'

/**
 * The v2 components (Subagents/Memory/Plugins): with a seeded fixture home (injected through
 * AGENTSHED_HOME_OVERRIDE),
 * assert F3's two-way scenario and the new tabs' rendering end to end — without depending on this
 * machine's real data.
 */
test('F3 plus the new sections: a project-scope plugin displays correctly both ways; the Subagents and Memory drawers work end to end', async () => {
  // Build the fixture home: a demo project + a project-scope plugin (with skills and hooks) + subagents on
  // both sides + memory
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // The plugin package (skills + hooks)
  const pkg = join(home, 'plug-pkg')
  mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(pkg, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: Ask before acting\n---\nx')
  mkdirSync(join(pkg, 'hooks'), { recursive: true })
  writeFileSync(
    join(pkg, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [
          { scope: 'project', version: '6.2.0', installPath: pkg, projectPath: demo }
        ]
      }
    })
  )
  mkdirSync(join(demo, '.claude'), { recursive: true })
  writeFileSync(join(demo, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }))
  // Subagents on both sides
  mkdirSync(join(home, '.claude', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'agents', 'code-reviewer.md'),
    '---\ndescription: Review code\ntools: Read, Grep\n---\nYou are a reviewer.'
  )
  mkdirSync(join(home, '.codex', 'agents'), { recursive: true })
  writeFileSync(
    join(home, '.codex', 'agents', 'code-reviewer.toml'),
    'name = "code-reviewer"\ndescription = "Review code"\ndeveloper_instructions = "You are a reviewer."\n'
  )
  // The demo project's artifact (docs/CONTEXT.md) carries the full heading ladder for the reader overlay
  mkdirSync(join(demo, 'docs'), { recursive: true })
  writeFileSync(
    join(demo, 'docs', 'CONTEXT.md'),
    '# Context ladder\n\nIntro.\n\n## Ladder h2\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
  )
  // The demo project's CLAUDE.md links to a listed artifact and to a path outside the list
  writeFileSync(
    join(demo, 'CLAUDE.md'),
    '# Demo instructions\n\ninstructions link probe: [open context](./docs/CONTEXT.md) · [missing doc](./docs/none.md)\n'
  )
  // The demo project's memory
  const enc = demo.replace(/[^A-Za-z0-9]/g, '-')
  mkdirSync(join(home, '.claude', 'projects', enc, 'memory'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'projects', enc, 'memory', 'MEMORY.md'),
    '# Memory main file\n- Key point A\n- [Pitfalls](pitfalls.md) valid relative link\n- [Deleted entry](gone.md) broken target\n\n## Ladder h2\n\nInline `probe` code.\n\n```\nfenced probe\n```\n\n| L | C | R |\n|:--|:-:|--:|\n| a1 | b1 | c1 |\n| a2 | b2 | c2 |\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
  )
  // A topic in the shape real memory files take (memory-view::US-001): front matter with a nested key, Why /
  // How sections, a [[name]] reference, and links to a sibling, to the index, to an unlisted file and outside.
  // The filler pushes the links below the fold, so following one starts from a scrolled body.
  const memDir = join(home, '.claude', 'projects', enc, 'memory')
  writeFileSync(
    join(memDir, 'pitfalls.md'),
    '---\nname: pitfalls\ndescription: Known traps in the demo project\nmetadata:\n  type: feedback\n---\n\n# Pitfalls\nUnique content B\n\n**Why:** a fixture for the memory drawer.\n\n**How to apply:**\n- first\n- second\n\n' +
      Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1}.`).join('\n\n') +
      '\n\nRecords go to docs/.workings/<slug>/ and stay.\n\nSee [[other-note]](read-the-index-first) · [the index](MEMORY.md) · [Second](second.md) · [Gone](gone.md) · [Docs](https://example.com/docs)\n'
  )
  // Long enough to scroll: a short file would sit at the top on its own, whether or not the drawer resets it
  writeFileSync(
    join(memDir, 'second.md'),
    '# Second\nUnique content S\n\n' + Array.from({ length: 40 }, (_, i) => `Second filler ${i + 1}.`).join('\n\n') + '\n'
  )
  writeFileSync(join(memDir, 'empty.md'), '')
  writeFileSync(join(memDir, 'vanish.md'), 'Removed after the scan\n')
  // Past the 500,000-character read cap (Codex's consolidated memory files run to several hundred thousand)
  writeFileSync(join(memDir, 'big.md'), 'Line of the big memory file.\n'.repeat(18_000))
  // Under the cap, in the shape of Codex's consolidated memory (headings, list items, a long prose line and an
  // unbroken file path, as real ones carry), plus a wide code line and a wide table that no real memory file here
  // has, so every wide branch of E5 is reached. Its last line sits past 300,000 characters, so a lower read cap
  // would cut it (memory-view E5).
  const prose = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ')
  const widePath = `rollout_summaries/${'x'.repeat(300)}.md`
  const wideCode = '```\nconst wide = "' + 'y'.repeat(400) + '"\n```'
  const wideTable =
    `| ${Array.from({ length: 12 }, (_, i) => `header-column-${i}`).join(' | ')} |\n|${'---|'.repeat(12)}\n` +
    `| ${Array.from({ length: 12 }, () => 'cell').join(' | ')} |`
  const items = Array.from({ length: 9_000 }, (_, i) => `- item ${i}: ${'z'.repeat(20)}`).join('\n')
  writeFileSync(
    join(memDir, 'wide.md'),
    `# Task Group: wide\n\n${prose}\n\n${widePath}\n\n${wideCode}\n\n${wideTable}\n\n## Items\n\n${items}\n\nThe last line of the wide file.\n`
  )
  // Codex's global memory: a top-level .md in its memories directory
  mkdirSync(join(home, '.codex', 'memories'), { recursive: true })
  writeFileSync(join(home, '.codex', 'memories', 'consolidated.md'), '# Consolidated\n\nCodex memory body\n')
  // A second project with only a topic at launch: its main file is written after the first scan, so only the
  // project's own read registration can admit it (memory-view, Implementation Decisions)
  const late = join(home, 'late-proj')
  mkdirSync(late, { recursive: true })
  const lateMem = join(home, '.claude', 'projects', late.replace(/[^A-Za-z0-9]/g, '-'), 'memory')
  mkdirSync(lateMem, { recursive: true })
  writeFileSync(join(lateMem, 't.md'), '# T\n\n[the main file](MEMORY.md)\n')
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {}, [late]: {} } }))

  const userData = mkdtempSync(join(tmpdir(), 'agentshed-e2e-'))
  const { app, errors } = await startApp({ userData, home })
  const win = await app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { __opened: string[] }).__opened = opened
    shell.openExternal = (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  })

  // (1) The Subagents tab: the same name on both sides merges onto one row, clicking it opens the drawer
  // directly, and the drawer switches sides
  await tab('Subagents').click()
  const row = win.locator('.it.row-btn', { hasText: 'code-reviewer' })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(win.locator('.drawer')).toBeVisible()
  await expect(win.locator('.drawer .kv')).toContainText('Read, Grep')
  await win.locator('.drawer .sideseg button', { hasText: 'Codex' }).click()
  await expect(win.locator('.drawer .kv')).toContainText('sandbox_mode')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // The drawer covers the window centre, so click the visible mask on the left

  // (2) Global Plugins: F3's first half — not enabled at the user layer; expanding gives category tabs,
  // with Skills by default and Hooks visible on switching
  await tab('Plugins').click()
  const plugRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(plugRow).toContainText('Not enabled')
  await plugRow.click()
  await expect(win.locator('.exp-area')).toContainText('superpowers:brainstorming')
  await win.locator('.exp-area .ptab', { hasText: 'Hooks' }).click()
  await expect(win.locator('.exp-area')).toContainText('SessionStart × 1')

  // (3) Global Memory: a row expands its file list, and clicking a file reads it on demand through the
  // allow-list into the file drawer (memory-view::US-001)
  await tab('Memory').click()
  const memRow = win.locator('.it.row-btn', { hasText: 'demo-proj' })
  await memRow.click()
  const memFile = (name: string) => win.locator('.sub-list .it.row-btn', { hasText: name })
  await expect(memFile('vanish.md')).toBeVisible()
  rmSync(join(memDir, 'vanish.md')) // listed by the scan, gone before it is read
  const fd = win.locator('.file-drawer')
  const fdBody = fd.locator('.md-preview-body')
  // second.md is read once first, so the link switch below lands on text that is already there: an unread file
  // passes through "Loading…", which would put any body at the top by itself
  await memFile('second.md').click()
  await expect(fdBody).toContainText('Unique content S')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await memFile('pitfalls.md').click()
  // AC-01: the memory's owner over side · file · time; the bar names the file and carries the switch
  await expect(fd.locator('.d-title')).toHaveText('demo-proj')
  await expect(fd.locator('.d-meta')).toHaveText('Claude · pitfalls.md · today')
  await expect(fd.locator('.md-preview-name')).toHaveText('pitfalls.md')
  // AC-02: preview by default, the front matter as a card with the nested key folded into its parent
  await expect(fd.locator('.md-preview-seg button.on')).toHaveText('Preview')
  await expect(fdBody).toHaveClass(/preview/)
  await expect(fdBody).toContainText('Unique content B')
  await expect(fd.locator('.md-fm-row', { hasText: 'metadata' }).locator('.md-fm-v')).toHaveText('type: feedback')
  // AC-04 and CON-002: [[name]] stays text, with a remark written straight after it; a placeholder that is not
  // an HTML element shows as written
  await expect(fdBody).toContainText('[[other-note]](read-the-index-first)')
  await expect(fdBody.locator('a', { hasText: 'other-note' })).toHaveCount(0)
  await expect(fdBody).toContainText('Records go to docs/.workings/<slug>/ and stay.')
  // AC-03: raw shows the file as written, front matter included; preview comes back
  await fd.locator('.md-preview-seg button', { hasText: 'Raw' }).click()
  await expect(fdBody).toHaveClass(/raw/)
  expect(await fdBody.textContent()).toMatch(/^---\nname: pitfalls\n/)
  await fd.locator('.md-preview-seg button', { hasText: 'Preview' }).click()
  await expect(fd.locator('.md-fm')).toBeVisible()
  // AC-06: a file the directory does not list → the error toast, the drawer stays on its file, the window does
  // not navigate (the external link is checked at the end of this test, see (8))
  const memUrl = win.url()
  await fdBody.locator('a', { hasText: 'Gone' }).click()
  await expect(win.locator('.toast.err')).toHaveText('The link target is outside the readable scope')
  await expect(fd.locator('.md-preview-name')).toHaveText('pitfalls.md')
  expect(win.url(), 'memory drawer links must not navigate').toBe(memUrl)
  // AC-05: a sibling link (below the fold) switches the drawer: title stays, the new file in preview at the top
  const scrolled = await fdBody.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    return el.scrollTop
  })
  expect(scrolled, 'the links sit below the fold, so the body is scrolled when one is clicked').toBeGreaterThan(0)
  await fdBody.locator('a', { hasText: 'Second' }).click()
  await expect(fd.locator('.md-preview-name')).toHaveText('second.md')
  await expect(fd.locator('.d-title')).toHaveText('demo-proj')
  await expect(fd.locator('.d-meta')).toContainText('Claude · second.md · ')
  await expect(fdBody).toContainText('Unique content S')
  await expect(fdBody).toHaveClass(/preview/)
  // The new file can scroll, so a top position is the drawer's reset rather than a short file's clamp
  expect(await fdBody.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  expect(await fdBody.evaluate((el) => el.scrollTop)).toBe(0)
  // AC-08: Esc closes
  await win.keyboard.press('Escape')
  await expect(fd).toHaveCount(0)
  // AC-05: the index link opens the main file in the drawer
  await memFile('pitfalls.md').click()
  await fdBody.locator('a', { hasText: 'the index' }).click()
  await expect(fd.locator('.md-preview-name')).toHaveText('MEMORY.md')
  await expect(fdBody).toContainText('Key point A')
  // AC-08: the close button closes
  await fd.locator('.drawer-close').click()
  await expect(fd).toHaveCount(0)
  // AC-07: an empty file and a file gone since the scan report inside the frame, the bar staying
  await memFile('empty.md').click()
  await expect(fdBody).toHaveText('Empty file')
  await expect(fd.locator('.md-preview-seg')).toBeVisible()
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // AC-08: the overlay closes
  await expect(fd).toHaveCount(0)
  await memFile('vanish.md').click()
  await expect(fdBody).toHaveText('File cannot be read: This file can no longer be read (moved or deleted?)')
  await expect(fd.locator('.md-preview-name')).toHaveText('vanish.md')
  await expect(fd.locator('.md-preview-seg')).toBeVisible()
  await win.locator('.mask').click({ position: { x: 10, y: 10 } }) // The drawer covers the window centre, so click the visible mask on the left
  // AC-07: a file past the read cap ends with the truncation marker, in preview and in raw
  await memFile('big.md').click()
  await expect(fdBody).toHaveClass(/preview/)
  await expect(fdBody).toHaveText(/…\(truncated\)\s*$/)
  await fd.locator('.md-preview-seg button', { hasText: 'Raw' }).click()
  await expect(fdBody).toHaveClass(/raw/)
  // The cap cuts the 29-character lines 11 characters into one (500,000 = 17,241 × 29 + 11), so the raw text
  // ends "Line of the" right before the marker — this pins the cap itself, not only that a cut happened
  await expect(fdBody).toHaveText(/Line of the\s*…\(truncated\)\s*$/)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // E5: a large file under the cap renders in full; prose wraps; an unbroken path and a wide table scroll the
  // body sideways and a wide code line scrolls its fence, so nothing wide is cut off by the drawer
  await memFile('wide.md').click()
  await expect(fdBody).toHaveClass(/preview/)
  await expect(fdBody).toContainText('The last line of the wide file.')
  const wide = await fdBody.evaluate((body) => {
    const prose = [...body.querySelectorAll('p')].find((p) => p.textContent?.startsWith('word0 '))
    const pre = body.querySelector('pre') as HTMLElement
    const table = body.querySelector('table') as HTMLElement
    body.scrollLeft = body.scrollWidth
    pre.scrollLeft = pre.scrollWidth
    return {
      proseOverflow: prose ? prose.scrollWidth - prose.clientWidth : -1,
      // The table is judged on its own: the body's scroll width comes from the path, so it cannot show whether
      // the table cuts its own columns off. A table wider than the body, hiding nothing inside its own box, is
      // reached by the body's sideways scroll
      tableWiderThanBody: table.getBoundingClientRect().width > body.clientWidth,
      tableHidden: table.scrollWidth - table.clientWidth,
      // A script can scroll an overflow:hidden box a reader cannot, so the scrolling style is read as well
      bodyScroll: `${getComputedStyle(body).overflowX} ${body.scrollLeft > 0}`,
      fenceScroll: `${getComputedStyle(pre).overflowX} ${pre.scrollLeft > 0}`
    }
  })
  expect(wide.proseOverflow, 'the prose line wraps within the body').toBe(0)
  expect(wide.tableWiderThanBody, 'the wide table keeps its width rather than squeezing into the body').toBe(true)
  expect(wide.tableHidden, 'no column is cut off inside the table').toBeLessThanOrEqual(1)
  expect(wide.bodyScroll, 'the body scrolls sideways to the unbroken path and the table').toBe('auto true')
  expect(wide.fenceScroll, 'the fence scrolls sideways to its wide line').toBe('auto true')
  // appearance::REQ-001 in a drawer and in rendered markdown (F3, F8): the body scrolls both ways, so it draws two
  // 6px scrollbars and clears the corner where they meet; the fence draws its own 6px sideways one
  const bars = await fdBody.evaluate((node) => {
    const body = node as HTMLElement
    const pre = body.querySelector('pre') as HTMLElement
    const sides = (el: HTMLElement): { x: number; y: number } => {
      const cs = getComputedStyle(el)
      return {
        x: parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
        y: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      }
    }
    const b = sides(body)
    const p = sides(pre)
    const r = body.getBoundingClientRect()
    const cs = getComputedStyle(body)
    return {
      bodyBothWays: body.scrollHeight > body.clientHeight && body.scrollWidth > body.clientWidth,
      bodyVertical: body.offsetWidth - body.clientWidth - b.x,
      bodyHorizontal: body.offsetHeight - body.clientHeight - b.y,
      preSideways: pre.scrollWidth > pre.clientWidth,
      preHorizontal: pre.offsetHeight - pre.clientHeight - p.y,
      // The corner square's innermost pixel: the drawer's rounded corner curves across the square's outer part,
      // where a pixel reads the border's line, not the corner
      cornerX: r.right - parseFloat(cs.borderRightWidth) - 5.5,
      cornerY: r.bottom - parseFloat(cs.borderBottomWidth) - 5.5
    }
  })
  expect(bars.bodyBothWays, 'the wide file scrolls the body both ways, or there is no corner to read').toBe(true)
  expect(bars.bodyVertical, "the body's vertical scrollbar is 6px wide").toBe(6)
  expect(bars.bodyHorizontal, "the body's horizontal scrollbar is 6px tall").toBe(6)
  expect(bars.preSideways).toBe(true)
  expect(bars.preHorizontal, "the fence's sideways scrollbar is 6px tall").toBe(6)
  // The corner is read in dark: an uncleared corner is a white square, which on the light body's white is no
  // different from the background, so a light reading could not fail
  const lightBody = await paintedBackground(fdBody)
  await win.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => paintedBackground(fdBody)).not.toEqual(lightBody)
  const darkBody = await paintedBackground(fdBody)
  const corner = await pixelAt(win, bars.cornerX, bars.cornerY)
  await fdBody.screenshot({ path: 'e2e-out/scrollbars-drawer-dark.png' })
  expect(near(corner, darkBody), `the corner shows the body's dark background ${rgb(darkBody)}, got ${rgb(corner)}`).toBe(true)
  await win.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => paintedBackground(fdBody)).toEqual(lightBody)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // AC-01 for Codex's global memory: the placeholder owner and the Codex side
  await win.locator('.it.row-btn', { hasText: '(Codex global memory)' }).click()
  await memFile('consolidated.md').click()
  await expect(fd.locator('.d-title')).toHaveText('(Codex global memory)')
  await expect(fd.locator('.d-meta')).toHaveText('Codex · consolidated.md · today')
  await expect(fdBody).toContainText('Codex memory body')
  await expect(fdBody).toHaveClass(/preview/)
  await expect(fdBody.locator('h1')).toHaveText('Consolidated')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (4) The demo detail page: F3's second half — enabled at the project layer; the Skills tab contains the
  // plugin namespace entry (read-only)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  const detRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(detRow).toContainText('Enabled')
  await expect(detRow).toContainText('project')
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const nsSkill = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(nsSkill).toBeVisible()
  await expect(nsSkill.locator('.ins')).toHaveCount(0) // G3: a plugin entry has no install or uninstall button
  // A4/ADR-0012: a namespace row expands and previews on equal footing with an on-disk one
  await nsSkill.locator('.sk-head').click()
  await expect(nsSkill.locator('.files button', { hasText: 'SKILL.md' })).toBeVisible()
  // (5) Detail Memory: MEMORY.md's body is rendered directly, with the shared heading ladder
  //     (spec appearance.md sequence E — the document-card side of "one ladder, every surface")
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('Key point A')
  const cardLadder = await headingLadder(win, '.pane-body .md')
  expectLadder(cardLadder, 'memory .md card')
  expectCodeStyle(await codeStyle(win, '.pane-body .md'), 'memory .md card')
  expectTableStyle(await tableStyle(win, '.pane-body .md'), cardLadder.h1.color, 'memory .md card')
  expect(await listIndent(win, '.pane-body .md'), 'memory .md card: list indent').toBe('20px')
  expect(await contentLineHeight(win, '.pane-body .md'), 'memory .md card: line-height').toBeCloseTo(21.875, 1)
  // Hover parity with the drawer (spec appearance E7c)
  const cardLink = win.locator('.pane-body .md a', { hasText: 'Pitfalls' })
  const cardRest = await cardLink.evaluate((el) => getComputedStyle(el).color)
  await cardLink.hover()
  expect(
    await cardLink.evaluate((el) => getComputedStyle(el).color),
    'memory .md card: link hover feedback'
  ).not.toBe(cardRest)

  // (6) A relative link in the main file: clicking it **must not navigate the whole window** (the
  //     2026-08-02 bug regression point),
  //     a valid target opens a drawer inside the app, and a broken target gets a notice while still not
  //     navigating.
  const urlBefore = win.url()
  await win.locator('.pane-body .md a', { hasText: 'Pitfalls' }).click()
  await expect(fdBody).toContainText('Unique content B')
  await expect(fd.locator('.d-title')).toHaveText('demo-proj')
  expect(win.url()).toBe(urlBefore)
  // memory-view::US-001/AC-05 in project detail: the main file is among the directory's files
  await fdBody.locator('a', { hasText: 'the index' }).click()
  await expect(fd.locator('.md-preview-name')).toHaveText('MEMORY.md')
  await expect(fdBody).toContainText('Key point A')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // The memory drawer's own out-of-scope link above raised a toast too; wait it out so the next one is fresh
  await expect(win.locator('.toast')).toHaveCount(0)
  await win.locator('.pane-body .md a', { hasText: 'Deleted' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url()).toBe(urlBefore)

  // (6b) The artifact reader overlay is a markdown surface too, so it takes the same ladder — the
  //      regression this pins: the overlay's own title rule (.reader h2) used to out-cascade the
  //      ladder for every h2 inside the rendered body (same specificity, later in the file)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Artifacts' }).click()
  await win.locator('.it.ai', { hasText: 'Context ladder' }).click()
  await expect(win.locator('.reader .md')).toContainText('Ladder h2')
  expectLadder(await headingLadder(win, '.reader .md'), 'artifact reader')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (6d) Instructions-card links (project detail): a relative link to a listed artifact opens the same
  //      reader overlay; anything outside the artifact list keeps the explicit notice; neither
  //      navigates the window
  await win.locator('.pane-head .tabs .tab', { hasText: 'Instructions' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('instructions link probe')
  await win.locator('.pane-body .md a', { hasText: 'open context' }).click()
  await expect(win.locator('.reader .md')).toContainText('Ladder h2')
  expect(win.url(), 'artifact link from the Instructions card must not navigate').toBe(urlBefore)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await expect(win.locator('.toast')).toHaveCount(0) // wait out any earlier toast, so the next one is fresh
  await win.locator('.pane-body .md a', { hasText: 'missing doc' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url(), 'out-of-scope Instructions link must not navigate').toBe(urlBefore)

  // (6e) A main file written after the scan: only the project's own read registration admits it, so a topic's
  //      link to it opens it rather than reporting a refused read (memory-view, Implementation Decisions)
  writeFileSync(join(lateMem, 'MEMORY.md'), '# Late main\n\nLate main body\n')
  await win.locator('.side .row', { hasText: 'late-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await expect(win.locator('.pane-body .md')).toContainText('Late main body')
  await win.locator('.it.row-btn', { hasText: 't.md' }).click()
  await fdBody.locator('a', { hasText: 'the main file' }).click()
  await expect(fd.locator('.md-preview-name')).toHaveText('MEMORY.md')
  await expect(fdBody).toContainText('Late main body')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()

  // (7) Drawer widths: the memory file drawer takes the file drawer's rule, min(720, 80% of the right-hand
  //     content area), and the Subagents drawer keeps its own, min(680, 80%) (memory-view::CON-001, E8). In a
  //     narrow window neither covers the whole content area (the 2026-08-02 bug). A geometric check rather
  //     than reading the CSS declaration — a correct declaration with an unwired variable would still cover it.
  const drawerGeom = async (sel: string): Promise<{ pane: number; drawer: number; left: number; paneLeft: number }> =>
    win.evaluate((s) => {
      const d = document.querySelector(s) as HTMLElement
      const pane = document.querySelector('.stage .pane') as HTMLElement
      const dr = d.getBoundingClientRect()
      const pr = pane.getBoundingClientRect()
      return { pane: pr.width, drawer: dr.width, left: dr.left, paneLeft: pr.left }
    }, sel)
  // The frame the file drawer shares with the skill drawer (CON-001): the bar's fade and the title block
  const frame = (): Promise<{ bar: string; title: string; close: string }> =>
    win.evaluate(() => {
      const cs = (sel: string) => getComputedStyle(document.querySelector(`.file-drawer ${sel}`) as HTMLElement)
      const t = cs('.d-title')
      const c = cs('.drawer-close')
      return {
        bar: cs('.md-preview-bar').backgroundImage,
        title: `${t.fontSize} ${t.fontWeight} ${t.color}`,
        close: `${c.width} ${c.height} ${c.display} ${c.placeItems}`
      }
    })
  for (const [w, label] of [
    [1400, 'wide window'],
    [900, 'narrow window']
  ] as const) {
    await win.setViewportSize({ width: w, height: 800 })
    await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
    await win.locator('.it.row-btn', { hasText: 'pitfalls.md' }).click()
    const g = await drawerGeom('.file-drawer')
    expect(Math.abs(g.drawer - Math.min(720, g.pane * 0.8)), `${label}: the memory drawer's width rule`).toBeLessThan(2)
    expect(g.left, `${label}: the memory drawer must not cover the whole content area`).toBeGreaterThan(g.paneLeft + 1)
    const memFrame = await frame()
    // The fade's two ends resolved through a probe in the drawer, so the comparison is between computed colours
    const fade = await win.evaluate(() => {
      const probe = document.createElement('div')
      document.querySelector('.file-drawer')?.appendChild(probe)
      probe.style.background = 'var(--bg)'
      const ground = getComputedStyle(probe).backgroundColor
      probe.style.background = 'var(--card)'
      const card = getComputedStyle(probe).backgroundColor
      probe.remove()
      return `linear-gradient(${ground} 0%, ${card} 100%)`
    })
    expect(memFrame.bar, `${label}: the bar fades from the ground into the card`).toBe(fade)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    // The plugin skill drawer in the same window: the same frame
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    const ns = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
    if (!(await ns.locator('.files button', { hasText: 'SKILL.md' }).isVisible())) await ns.locator('.sk-head').click()
    await ns.locator('.files button', { hasText: 'SKILL.md' }).click()
    expect(await frame(), `${label}: the memory drawer and the skill drawer share one frame`).toEqual(memFrame)
    const gs = await drawerGeom('.file-drawer')
    expect(Math.abs(gs.drawer - g.drawer), `${label}: both file drawers are the same width`).toBeLessThan(1)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
    // The Subagents drawer keeps its own width rule
    await win.locator('.pane-head .tabs .tab', { hasText: 'Subagents' }).click()
    await win.locator('.it.row-btn', { hasText: 'code-reviewer' }).first().click()
    const ga = await drawerGeom('.drawer:not(.file-drawer)')
    expect(Math.abs(ga.drawer - Math.min(680, ga.pane * 0.8)), `${label}: the Subagents drawer's width rule`).toBeLessThan(2)
    expect(ga.left, `${label}: the Subagents drawer must not cover the whole content area`).toBeGreaterThan(ga.paneLeft + 1)
    await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  }

  // (8) An external link in the memory drawer is handed to the system browser and the window does not navigate
  //     (memory-view::US-001/AC-06). Last in the test: the main-process guard cancels the navigation the click
  //     starts, and Playwright then waits on that navigation for every later step on this page.
  await win.locator('.pane-head .tabs .tab', { hasText: 'Memory' }).click()
  await win.locator('.it.row-btn', { hasText: 'pitfalls.md' }).click()
  await fdBody.locator('a', { hasText: 'Docs' }).click({ noWaitAfter: true })
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened))
    .toEqual(['https://example.com/docs'])
  expect(win.url(), 'an external memory link must not navigate the window').toBe(urlBefore)

  // The one expected handler error: reading vanish.md, removed after the scan on purpose (AC-07). Electron logs
  // every rejected IPC handler to stderr; anything else is still a failure.
  expect(errors.filter((e) => !(e.includes("handler for 'agentshed:read-artifact'") && e.includes(ERR.artifactUnreadable)))).toEqual([])
  await closeApp(app)
  rmSync(userData, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})
