import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launch, close } from './support/launch'
import { scansLanded, errorToastsAdded } from './support/waits'
import { headingLadder, expectLadder, codeStyle, contentLineHeight, tableStyle, expectTableStyle, listIndent, expectCodeStyle } from './support/markdown-styles'

/**
 * skills-view: an on-disk skill expands into a file table with a drawer for reading (markdown preview /
 * raw for non-markdown),
 * a same-side same-name pair in detail lists only the project level (B1), and plugin rows expand (A4).
 * End to end with a fixture home.
 */
test('Skills view: expanding globally reads the package; a same-name pair in detail shows only the project level; plugin rows do not expand', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // The global library: tdd (with a script one subdirectory down) + review-code (global only)
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd', 'scripts'), { recursive: true })
  writeFileSync(
    join(gskills, 'tdd', 'SKILL.md'),
    '---\ndescription: Red before green\n---\n\n# Ladder h1\n\nGlobal body A\n\n## Ladder h2\n\nInline `probe` code.\n\n```\nfenced probe\n```\n\n- Bullet probe A\n- Bullet probe B\n\n| L | C | R |\n|:--|:-:|--:|\n| a1 | b1 | c1 |\n| a2 | b2 | c2 |\n\n[Probe link](https://example.com/probe) · [run the script](./scripts/run.sh) · [missing link](./nope.md) · [deep guide](./references/nested/deep-guide.md) · [the schema](./schemas/wml.xsd)\n\n### Ladder h3\n#### Ladder h4\n\n##### Ladder h5\n'
  )
  writeFileSync(join(gskills, 'tdd', 'scripts', 'run.sh'), 'echo Unique script B\n')
  // Files nested as real packages nest them (skills-view::REQ-003), and one type off the text list
  mkdirSync(join(gskills, 'tdd', 'references', 'nested'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'references', 'nested', 'deep-guide.md'), '# Deep guide\n\nDeep guide body\n')
  mkdirSync(join(gskills, 'tdd', 'scripts', 'lib'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'scripts', 'lib', 'deep-tool.py'), 'print("Deep tool body")\n')
  writeFileSync(join(gskills, 'tdd', 'scripts', 'lib', 'helper.mjs'), 'export {}\n')
  mkdirSync(join(gskills, 'tdd', 'assets'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'assets', 'defaults.json'), '{}\n')
  mkdirSync(join(gskills, 'tdd', 'schemas'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'schemas', 'wml.xsd'), '<schema/>\n')
  // A directory link out of the package, as a skill sharing a folder holds one (skills-view, "any depth" boundaries)
  mkdirSync(join(home, 'shared-docs'), { recursive: true })
  writeFileSync(join(home, 'shared-docs', 'outside.md'), '# Outside\n\nLinked directory body\n')
  symlinkSync(join(home, 'shared-docs'), join(gskills, 'tdd', 'linked'))
  // Past the read cap, in a type that shows raw
  writeFileSync(join(gskills, 'tdd', 'references', 'nested', 'big-data.txt'), 'Line of the data file\n'.repeat(30000))
  // One segment with no break point, as real names run on underscores, and wider than any window
  const longPath = `templates/${'long_directory_name_'.repeat(10)}/guide.md`
  mkdirSync(dirname(join(gskills, 'tdd', longPath)), { recursive: true })
  writeFileSync(join(gskills, 'tdd', longPath), '# Long\n')
  mkdirSync(join(gskills, 'review-code'), { recursive: true })
  writeFileSync(join(gskills, 'review-code', 'SKILL.md'), '---\ndescription: Four-layer method\n---\n\nGlobal body D\n')
  // A symlinked skill whose target is outside every known skills root (the dotfiles/monorepo shape, the
  // 2026-08-07 bug regression point)
  const linkTarget = join(home, 'repo', 'skills', 'linked-skill')
  mkdirSync(linkTarget, { recursive: true })
  writeFileSync(join(linkTarget, 'SKILL.md'), '---\ndescription: Symlink install\n---\n\nSymlink body E\n')
  symlinkSync(linkTarget, join(gskills, 'linked-skill'))
  // A project-level tdd of the same name: the detail list should show only this one (B1)
  mkdirSync(join(demo, '.claude', 'skills', 'tdd'), { recursive: true })
  writeFileSync(
    join(demo, '.claude', 'skills', 'tdd', 'SKILL.md'),
    '---\ndescription: Project version\n---\n\nProject body C\n'
  )
  // A plugin enabled at the user layer (with skills) → the global Skills tab shows the plugin namespace row
  const pkg = join(home, 'plug-pkg')
  mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
  writeFileSync(join(pkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(pkg, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: Ask before acting\n---\nx')
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: { 'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: pkg }] }
    })
  )
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@official': true } })
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()

  // (1) Global Skills: a collapsed row already carries package stats (file count / size, without line
  //     counts); clicking a row expands the file table;
  //     clicking SKILL.md opens the drawer, with markdown previewing by default (a frontmatter card plus
  //     the body)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const tdd = win.locator('.sk', { hasText: 'tdd' })
  // SKILL.md, the script, the six nested files and the one behind the directory link; the schema is off the text list
  await expect(tdd.locator('.sk-meta')).toContainText('9 files')
  await tdd.locator('.sk-head').click()
  await expect(tdd.locator('.files-card')).toBeVisible()
  await expect(tdd.locator('.files-sum')).toHaveCount(0) // The summary moved onto the row, so the expanded area no longer repeats it
  await tdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-fm')).toContainText('Red before green')
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Global body A')
  // The drawer side of "one ladder, every surface" (spec appearance.md sequence E): the same
  // computed ladder the memory .md card asserts
  const drawerLadder = await headingLadder(win, '.file-drawer .md-preview-body.preview')
  expectLadder(drawerLadder, 'skill drawer preview')
  expectCodeStyle(await codeStyle(win, '.file-drawer .md-preview-body.preview'), 'skill drawer preview')
  expectTableStyle(
    await tableStyle(win, '.file-drawer .md-preview-body.preview'),
    drawerLadder.h1.color,
    'skill drawer preview'
  )
  expect(await listIndent(win, '.file-drawer .md-preview-body.preview'), 'skill drawer preview: list indent').toBe('20px')
  // Link hover shares the card's semantics (spec appearance E7c): accent at rest, deep accent on
  // hover — the deep value cross-checked against h1, which the ladder pins to --accent-deep
  const probeLink = win.locator('.file-drawer .md-preview-body a', { hasText: 'Probe link' })
  const restColor = await probeLink.evaluate((el) => getComputedStyle(el).color)
  await probeLink.hover()
  const hoverColor = await probeLink.evaluate((el) => getComputedStyle(el).color)
  expect(hoverColor, 'skill drawer preview: link hover feedback').not.toBe(restColor)
  expect(hoverColor, 'skill drawer preview: hover lands on the deep accent').toBe(drawerLadder.h1.color)
  expect(
    await contentLineHeight(win, '.file-drawer .md-preview-body.preview'),
    'skill drawer preview: line-height'
  ).toBeCloseTo(21.875, 1)
  // Links inside the drawer preview (skills-view spec D3): an in-package relative link switches the
  // drawer to that file, an out-of-scope one gets an explicit notice, and neither navigates the window
  const urlBeforeLinks = win.url()
  await win.locator('.file-drawer .md-preview-body a', { hasText: 'missing link' }).click()
  await expect(win.locator('.toast')).toBeVisible()
  expect(win.url(), 'out-of-scope link must not navigate').toBe(urlBeforeLinks)
  await win.locator('.file-drawer .md-preview-body a', { hasText: 'run the script' }).click()
  await expect(win.locator('.file-drawer .md-preview-name')).toHaveText('scripts/run.sh')
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Unique script B')
  await expect(win.locator('.file-drawer .md-preview-seg')).toHaveCount(0)
  expect(win.url(), 'internal link must not navigate').toBe(urlBeforeLinks)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // Clicking another text file in the package switches the content: non-markdown has no raw/preview toggle
  // and shows monospace raw only
  await tdd.locator('.files button', { hasText: 'scripts/run.sh' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Unique script B')
  await expect(win.locator('.file-drawer .md-preview-seg')).toHaveCount(0)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (1a0) Every badge kind takes one box and moves no row: the kinds' classes once met global rules of the same
  //       name, and a shell row took the project list's search head margin
  const { badges, paints } = await tdd.locator('.files button').evaluateAll((rows) => {
    // A token as computed, since the values follow the light or dark mode in effect
    const probe = document.body.appendChild(document.createElement('span'))
    const tokens = (background: string, text: string): string => {
      probe.style.color = `var(${background})`
      const first = getComputedStyle(probe).color
      probe.style.color = `var(${text})`
      return `${first} on which ${getComputedStyle(probe).color}`
    }
    const paints = { MD: tokens('--accent-soft', '--accent-deep'), SH: tokens('--ok-bg', '--ok-fg'), neutral: tokens('--bg', '--text-2') }
    probe.remove()
    const badges = rows.map((row) => {
      const icon = row.querySelector('.ic') as HTMLElement
      const style = getComputedStyle(icon)
      const box = icon.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(icon)
      const lines = [...range.getClientRects()]
      const labelInside = lines.length === 1 && lines[0].left >= box.left && lines[0].right <= box.right && lines[0].top >= box.top && lines[0].bottom <= box.bottom
      return {
        label: icon.textContent ?? '',
        look: `${box.width}x${box.height} margin ${style.margin} overflow ${style.overflow} label inside ${labelInside}`,
        paint: `${style.backgroundColor} on which ${style.color}`,
        rowHeight: row.getBoundingClientRect().height,
        pathLeft: (row.querySelector('.path') as HTMLElement).getBoundingClientRect().left
      }
    })
    return { badges, paints }
  })
  expect(new Set(badges.map((b) => b.label))).toEqual(new Set(['MD', 'SH', 'JS', 'CFG', 'PY', 'TXT']))
  expect([...new Set(badges.map((b) => b.look))]).toEqual(['22x22 margin 0px overflow visible label inside true'])
  expect(new Set(badges.map((b) => b.rowHeight)).size, 'no row is taller for its kind').toBe(1)
  expect(new Set(badges.map((b) => b.pathLeft)).size, 'every path starts level').toBe(1)
  expect(new Set(Object.values(paints)).size, 'the three paints differ, or this check says nothing').toBe(3)
  for (const b of badges) {
    expect(b.paint, `the ${b.label} badge's colours`).toBe(b.label === 'MD' ? paints.MD : b.label === 'SH' ? paints.SH : paints.neutral)
  }

  // (1a) Files at any depth (skills-view::REQ-003): listed with their badges and no notice about depth; a nested
  //      script reads raw, and a nested document is reached by a link and previews
  const deepTool = tdd.locator('.files button', { hasText: 'scripts/lib/deep-tool.py' })
  await expect(deepTool.locator('.ic')).toHaveText('PY')
  await expect(tdd.locator('.files button', { hasText: 'references/nested/deep-guide.md' }).locator('.ic')).toHaveText('MD')
  await expect(tdd).not.toContainText('restructuring')
  await deepTool.click()
  await expect(win.locator('.file-drawer .md-preview-name')).toHaveText('scripts/lib/deep-tool.py')
  await expect(win.locator('.file-drawer .d-meta')).toContainText('scripts/lib/deep-tool.py')
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Deep tool body')
  await expect(win.locator('.file-drawer .md-preview-seg')).toHaveCount(0)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await tdd.locator('.files button', { hasText: 'linked/outside.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body.preview')).toContainText('Linked directory body')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await tdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await win.locator('.file-drawer .md-preview-body a', { hasText: 'deep guide' }).click()
  await expect(win.locator('.file-drawer .md-preview-name')).toHaveText('references/nested/deep-guide.md')
  await expect(win.locator('.file-drawer .md-preview-body.preview')).toContainText('Deep guide body')
  await expect(win.locator('.file-drawer .md-preview-seg button')).toHaveCount(2)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // A file in the package but off the list gets the notice, and the drawer stays where it is (D3)
  await expect(win.locator('.toast')).toHaveCount(0) // wait out the earlier toast, so the next one is fresh
  await tdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await win.locator('.file-drawer .md-preview-body a', { hasText: 'the schema' }).click()
  await expect(win.locator('.toast')).toContainText('outside the readable scope')
  await expect(win.locator('.file-drawer .md-preview-name')).toHaveText('SKILL.md')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // A path wider than its column ends in an ellipsis and keeps its whole path on hover. Longer than any window
  // is wide, so the check does not depend on the platform's font metrics
  const longCell = tdd.locator(`.files button .path[title="${longPath}"]`)
  await expect(longCell).toHaveText(longPath)
  expect(
    await longCell.evaluate((el) => {
      const style = getComputedStyle(el)
      return { cut: el.scrollWidth > el.clientWidth, whiteSpace: style.whiteSpace, overflowX: style.overflowX, textOverflow: style.textOverflow }
    })
  ).toEqual({ cut: true, whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'ellipsis' })
  // The drawer's subtitle holds that whole path, uncut
  await longCell.click()
  const drawerMeta = win.locator('.file-drawer .d-meta')
  await expect(drawerMeta).toContainText(longPath)
  expect(
    await drawerMeta.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      const block = (el.parentElement as HTMLElement).getBoundingClientRect()
      return {
        ownBoxFits: el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
        textInsideBlock: text.width > 0 && text.left >= block.left && text.right <= block.right && text.top >= block.top && text.bottom <= block.bottom
      }
    })
  ).toEqual({ ownBoxFits: true, textInsideBlock: true })
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // A nested file past the read cap ends in the truncation footnote (C7)
  await tdd.locator('.files button', { hasText: 'references/nested/big-data.txt' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toHaveText(/…\(truncated\)\s*$/)
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (1b) A symlinked skill whose target is outside the roots: the row carries the symlink badge, and
  //      expanding and reading files work end to end (A6)
  const linked = win.locator('.sk', { hasText: 'linked-skill' })
  await expect(linked.locator('.pill.ln')).toBeVisible()
  await linked.locator('.sk-head').click()
  await linked.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Symlink body E')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // (2) The plugin namespace row: expands and previews on equal footing with an on-disk one (A4; ADR-0012
  //     overturned the v1 exclusion, and the inline stats are on equal footing too)
  const plug = win.locator('.sk', { hasText: 'superpowers:brainstorming' })
  await expect(plug.locator('.sk-meta')).toContainText('1 file')
  await plug.locator('.sk-head').click()
  await plug.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-fm')).toContainText('Ask before acting')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await plug.locator('.sk-head').click() // Collapse, so it does not interfere with later locators

  // (3) Detail Skills: a same-name pair lists only the project level with no second global row; names
  //     present only globally are still listed; project-level rows preview
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const detTdd = win.locator('.pane-body .sk', { hasText: 'tdd' })
  await expect(detTdd).toHaveCount(1)
  await expect(detTdd.locator('.pill.prj')).toBeVisible()
  await expect(detTdd.locator('.pill.glb')).toHaveCount(0)
  await expect(detTdd.locator('.sk-meta')).toContainText('1 file')
  await expect(
    win.locator('.pane-body .sk', { hasText: 'review-code' }).locator('.pill.glb')
  ).toBeVisible()
  await detTdd.locator('.sk-head').click()
  await detTdd.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Project body C')

  // (4) The drawer width reuses the chrome-w formula (capped at 720): in a narrow window it must not cover
  //     the whole content area (the same-origin regression point as the 2026-08-02 bug)
  await win.setViewportSize({ width: 900, height: 800 })
  const g = await win.evaluate(() => {
    const d = (document.querySelector('.file-drawer') as HTMLElement).getBoundingClientRect()
    const p = (document.querySelector('.stage .pane') as HTMLElement).getBoundingClientRect()
    return { drawer: d.width, left: d.left, pane: p.width, paneLeft: p.left }
  })
  expect(Math.abs(g.drawer - Math.min(720, g.pane * 0.8))).toBeLessThan(2)
  expect(g.left).toBeGreaterThan(g.paneLeft + 1)

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * Filtering the skills lists by name, and revealing a name the column truncated.
 *
 * The two traps this guards, both of which produce green tests that prove nothing:
 *
 *  - **A clipped element still reports a bounding box**, so `toBeVisible()` passes on a tooltip that is
 *    painted nowhere. The tooltip's visibility is asserted by hit-testing its own centre.
 *  - **"Nothing matched" and "nothing here" must be different sentences.** Asserting merely that *some*
 *    empty state appeared would pass if the code reused the "library is empty" copy, which would be a
 *    lie told to a user whose library is full.
 */
test('filtering the skills lists by name, and revealing a truncated name on hover', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  // Two names sharing a fragment (`review`), one that shares nothing, and one long enough that the
  // 200px name column must truncate it — the hover reveal has nothing to show without that last one
  const LONG = 'chrome-devtools-mcp-an-absurdly-long-skill-directory-name-that-the-filesystem-allows'
  for (const n of ['review-code', 'review-tests', 'github-ops', LONG]) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }
  // A name that does not contain "zebra" while its description does — the only way to show that the
  // description is not searched (spec E2). Rows do not display it, so a hit explained by it would look
  // like a malfunction.
  mkdirSync(join(gskills, 'quiet-skill'), { recursive: true })
  writeFileSync(
    join(gskills, 'quiet-skill', 'SKILL.md'),
    '---\ndescription: zebra appears only in this description\n---\n\nbody\n'
  )
  // A project-level skill, so detail has more than one group and "an empty group disappears" is testable
  mkdirSync(join(demo, '.claude', 'skills', 'local-only'), { recursive: true })
  writeFileSync(
    join(demo, '.claude', 'skills', 'local-only', 'SKILL.md'),
    '---\ndescription: project level\n---\n\nbody\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  const globalRows = win.locator('.sk-card > .rel')
  const box = win.locator('.sbar.sk-search input')
  await expect(globalRows).toHaveCount(5)

  // (1) Narrowing, and recovering when the box is cleared
  await box.fill('review')
  await expect(globalRows).toHaveCount(2)
  await box.fill('REVIEW') // case-insensitive
  await expect(globalRows).toHaveCount(2)
  await box.fill('   ') // whitespace only filters nothing (spec E4)
  await expect(globalRows).toHaveCount(5)
  await box.fill('gwd') // a substring, not a subsequence — must not reach any name
  await expect(globalRows).toHaveCount(0)
  // Only the name is matched: `zebra` lives in quiet-skill's description and nowhere in any name
  await box.fill('zebra')
  await expect(globalRows).toHaveCount(0)

  // (2) "Nothing matched" is its own sentence, distinct from "the library is empty"
  const globalMiss = await win.locator('.pane-body .none').textContent()
  expect(globalMiss).toBe('No skill name matched')
  expect(globalMiss).not.toBe('Both global libraries are empty')
  await box.fill('')
  await expect(globalRows).toHaveCount(5)

  // (2b) Typing closes the install popover (spec E8). The popover must be opened on a row that
  // **survives** the keyword about to be typed: open it on a row the filter removes and the popover
  // disappears along with its row, which would pass whether or not anything closes it deliberately —
  // verified by mutation, an earlier version of this assertion did exactly that and stayed green with
  // the closing removed.
  const survivingRow = win.locator('.sk-card > .rel').filter({ hasText: 'review-code' })
  await survivingRow.locator('.ins').click()
  await expect(win.locator('.pop')).toHaveCount(1)
  await box.fill('review') // review-code still matches, so only the deliberate close can hide it
  await expect(survivingRow).toHaveCount(1)
  await expect(win.locator('.pop')).toHaveCount(0)
  await box.fill('')

  // (3) An expanded row survives filtering; one that left and came back is collapsed again
  const reviewCode = win.locator('.sk', { hasText: 'review-code' }).first()
  await reviewCode.locator('.sk-head').click()
  await expect(reviewCode).toHaveClass(/open/)
  await box.fill('review-code')
  await expect(win.locator('.sk', { hasText: 'review-code' }).first()).toHaveClass(/open/)
  await box.fill('zzz')
  await box.fill('review-code')
  await expect(win.locator('.sk', { hasText: 'review-code' }).first()).not.toHaveClass(/open/)
  await box.fill('')

  // (4) The hover reveal. Truncation is the trigger: a short name must stay quiet.
  const shortName = win.locator('.sk', { hasText: 'github-ops' }).first().locator('.nm')
  await shortName.hover()
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  const longName = win.locator('.sk', { hasText: 'absurdly-long' }).first().locator('.nm')
  const truncated = await longName.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(truncated).toBe(true) // otherwise the case below proves nothing
  await longName.hover()
  await expect(win.locator('.nm-tip')).toHaveCount(1)

  const tip = await win.evaluate(() => {
    const el = document.querySelector('.nm-tip') as HTMLElement
    const r = el.getBoundingClientRect()
    // pointer-events: none would let the hit test fall straight through, so lift it for the probe
    const saved = el.style.pointerEvents
    el.style.pointerEvents = 'auto'
    const atCentre = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    el.style.pointerEvents = saved
    return {
      text: el.textContent,
      width: Math.round(r.width),
      height: Math.round(r.height),
      insideViewport: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      // The decisive one: a clipped layer reports this same rect but loses this
      centreBelongsToTip: atCentre !== null && el.contains(atCentre),
      pointerEvents: getComputedStyle(el).pointerEvents,
      position: getComputedStyle(el).position
    }
  })
  expect(tip.text).toBe(LONG)
  expect(tip.centreBelongsToTip).toBe(true)
  expect(tip.insideViewport).toBe(true)
  expect(tip.width).toBeLessThanOrEqual(420) // bounded, so a long directory name cannot span the display
  expect(tip.height).toBeGreaterThan(24) // and wrapped rather than stretched onto one line
  expect(tip.pointerEvents).toBe('none') // must not swallow the click that expands the row
  // Pinning `fixed` deliberately, even though it is an implementation choice rather than a behaviour.
  // The check above cannot cover it: with no positioned ancestor in the row today, `absolute` resolves
  // against the initial containing block and behaves identically — verified by mutation, the hit test
  // stays green when this is switched to `absolute`. It only starts failing once someone gives a row
  // `position: relative`, which is an ordinary-looking change nobody would connect to this tooltip.
  // `fixed` is what makes that change harmless, so it is pinned here rather than left to be rediscovered.
  expect(tip.position).toBe('fixed')

  // Moving away removes it
  await win.mouse.move(5, 5)
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  // Anything that moves the anchor invalidates the coordinates measured from it, so all three dismiss.
  // These are the second of the floating layer's two obligations (useAnchorInvalidation.ts) — the layer is
  // fixed, so without them it would hang in place over unrelated content.
  // Each of the three needs the pointer parked away first: `hover()` on an element the pointer already
  // sits on fires no `mouseenter`, so the tooltip would never reappear and the next assertion would pass
  // for the wrong reason.
  const hoverLongName = async (): Promise<void> => {
    await win.mouse.move(5, 5)
    await longName.hover()
    await expect(win.locator('.nm-tip')).toHaveCount(1)
  }

  // The events are dispatched directly rather than by actually resizing or scrolling. Doing it for real
  // moves the row out from under the pointer, so the tooltip would vanish via `mouseleave` and the
  // assertion would pass whether or not the listener was ever attached — which is precisely the thing
  // under test.
  await hoverLongName()
  await win.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  await hoverLongName()
  await win.locator('.pane-body').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.nm-tip')).toHaveCount(0)

  await hoverLongName()
  await box.fill('github') // filtering the anchor row away takes the tooltip with it
  await expect(win.locator('.nm-tip')).toHaveCount(0)
  await box.fill('')

  // (5) Project detail: one box narrows every group, headings count what survived, empty groups vanish
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'demo-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const headings = win.locator('.pane-body .grp-t')
  const detailBox = win.locator('.sbar.sk-search input')
  await expect(headings).toHaveCount(2) // project level + global level

  await detailBox.fill('review')
  // The project-level group holds only `local-only`, so it disappears entirely — heading included
  await expect(headings).toHaveCount(1)
  await expect(headings.first()).toHaveText('Global level · Claude(2)') // the count follows the filter
  await detailBox.fill('local')
  await expect(headings).toHaveCount(1)
  await expect(headings.first()).toHaveText('Project level · .claude/skills(1)')

  await detailBox.fill('zzz')
  await expect(headings).toHaveCount(0)
  const detailMiss = await win.locator('.pane-body .none').textContent()
  expect(detailMiss).toBe('No skill name matched')
  expect(detailMiss).not.toBe('No skills in effect for this project')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * How long a filter keyword lives — the one gap from this feature's test review judged worth closing.
 *
 * The other four recorded gaps are guarded by structure (an empty library returns before the box is
 * rendered) or unreachable in the current layout. This one is not guarded by anything: the behaviour
 * follows entirely from **which component owns the state**, so it breaks the day someone lifts that
 * state to a parent — and it breaks *silently*. Coming back to a section and finding it filtered by a
 * keyword you no longer see typed anywhere reads as "my skills are gone", not as a bug.
 */
test('a filter keyword survives a refresh, and is cleared by leaving the section or switching project', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const alpha = join(home, 'alpha-proj')
  const beta = join(home, 'beta-proj')
  mkdirSync(alpha, { recursive: true })
  mkdirSync(beta, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [alpha]: {}, [beta]: {} } }))
  const gskills = join(home, '.claude', 'skills')
  for (const n of ['review-code', 'github-ops']) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }
  for (const p of [alpha, beta]) {
    mkdirSync(join(p, '.claude', 'skills', 'local-only'), { recursive: true })
    writeFileSync(join(p, '.claude', 'skills', 'local-only', 'SKILL.md'), '---\ndescription: x\n---\n\nbody\n')
  }

  // A brisk rescan interval: since the manual refresh was removed (2026-08-23) a snapshot update is
  // observed through the automatic scan
  const l = await launch(undefined, home, { AGENTSHED_RESCAN_MS: '250' })
  const win = await l.app.firstWindow()
  const box = win.locator('.sbar.sk-search input')

  // (1) A snapshot refresh keeps it. The section is re-rendered rather than remounted, so the keyword
  // survives — losing it here would silently undo the narrowing the user is in the middle of reading.
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await box.fill('review')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(1)
  // Land a scan and **prove it landed** before asserting survival: a newly registered project bumps the
  // side card's project count, which only a completed scan can do — and it stays clear of the skills
  // list this test measures. Without that proof "the keyword survived" would also pass when no refresh
  // ever happened.
  const late = join(home, 'late-proj')
  mkdirSync(late, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ projects: { [alpha]: {}, [beta]: {}, [late]: {} } })
  )
  await expect(win.locator('.pane-head .stats .stat').first()).toContainText('3 projects')
  await expect(box).toHaveValue('review')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(1)

  // (2) Leaving the section clears it. The keyword is a way of looking at one list, not a setting —
  // and a section that reopens already filtered, with the box scrolled out of sight, looks empty.
  await win.locator('.pane-head .tabs .tab', { hasText: 'Subagents' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(box).toHaveValue('')
  await expect(win.locator('.sk-card > .rel')).toHaveCount(2)

  // (3) Switching project clears it too — otherwise a keyword typed for one project's skills would
  // quietly filter another's, and a populated project would look like it has nothing installed.
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'alpha-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await box.fill('local')
  await expect(win.locator('.pane-body .grp-t')).toHaveCount(1)

  await win.locator('.side .row', { hasText: 'beta-proj' }).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(box).toHaveValue('')

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * plugins-view sequence H: previewing a plugin skill in place — category tabs, a row list, readability
 * independent of enablement,
 * a greyed-out missing state, and the Codex group having only a Skills tab. End to end with a fixture home.
 */
test('previewing a plugin skill in place: the tab expands and reads the package; a disabled plugin is readable; a missing one is greyed out; the Codex group', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // An enabled plugin: 2 skills + 1 hooks (category tabs need more than one category)
  const sp = join(home, 'pkg-sp')
  mkdirSync(join(sp, '.claude-plugin'), { recursive: true })
  writeFileSync(join(sp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(sp, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(
    join(sp, 'skills', 'brainstorming', 'SKILL.md'),
    '---\ndescription: Ask before acting\n---\n\nPlugin body A\n'
  )
  mkdirSync(join(sp, 'skills', 'brainstorming', 'references', 'nested'), { recursive: true })
  writeFileSync(join(sp, 'skills', 'brainstorming', 'references', 'nested', 'plugin-deep.md'), '# Deep\n\nPlugin deep body\n')
  mkdirSync(join(sp, 'skills', 'writing-plans'), { recursive: true })
  writeFileSync(join(sp, 'skills', 'writing-plans', 'SKILL.md'), '---\ndescription: Write plans\n---\nx\n')
  mkdirSync(join(sp, 'hooks'), { recursive: true })
  writeFileSync(
    join(sp, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [] }] } })
  )
  // A disabled plugin: 1 skill (H4: still readable)
  const ct = join(home, 'pkg-ct')
  mkdirSync(join(ct, '.claude-plugin'), { recursive: true })
  writeFileSync(join(ct, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'content-tools' }))
  mkdirSync(join(ct, 'skills', 'publish'), { recursive: true })
  writeFileSync(join(ct, 'skills', 'publish', 'SKILL.md'), '---\ndescription: Publish\n---\n\nReadable while disabled B\n')
  // A plugin whose whole package is missing (E6)
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: sp }],
        'content-tools@local': [{ scope: 'user', version: '0.1.0', installPath: ct }],
        'ghost@legacy': [{ scope: 'user', version: '1.0.0', installPath: join(home, 'gone') }]
      }
    })
  )
  writeFileSync(
    join(home, '.claude', 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'superpowers@official': true } })
  )
  // The Codex cache: the highest version contains skills (E8)
  const cxBase = join(home, '.codex', 'plugins', 'cache', 'openai-bundled', 'documents')
  mkdirSync(join(cxBase, '2.0.0', 'skills', 'documents'), { recursive: true })
  writeFileSync(
    join(cxBase, '2.0.0', 'skills', 'documents', 'SKILL.md'),
    '---\ndescription: Docs\n---\n\nCodex body C\n'
  )

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()

  // (1) An enabled plugin: inline installation record chips; expanding gives category tabs; the Skills row
  //     list carries stats; row → file table → drawer
  const spRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(spRow.locator('.chip', { hasText: 'user' })).toBeVisible()
  await spRow.click()
  const spExp = win.locator('.exp-area').first()
  await expect(spExp.locator('.ptab')).toHaveText(['Skills2', 'Hooks1'])
  const bRow = spExp.locator('.psk', { hasText: 'superpowers:brainstorming' })
  await expect(bRow.locator('.meta')).toContainText('2 files')
  await bRow.click()
  await spExp.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Plugin body A')
  await expect(win.locator('.file-drawer .d-meta')).toContainText('Plugin package')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // A nested file lists and opens as in the Skills section (H2, skills-view::REQ-003)
  await spExp.locator('.files button', { hasText: 'references/nested/plugin-deep.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Plugin deep body')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await spRow.click() // Collapse, so a later .files locator is not taken by this row's table

  // (2) A disabled plugin's skill is still readable (H4/ADR-0012)
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click()
  const ctRow = win.locator('.psk', { hasText: 'content-tools:publish' })
  await ctRow.click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Readable while disabled B')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  await win.locator('.it.row-btn', { hasText: 'content-tools@local' }).click() // Collapse

  // (3) A wholly missing package (E6): expanding gives the missing banner and no category tabs
  await win.locator('.it.row-btn', { hasText: 'ghost@legacy' }).click()
  await expect(win.locator('.exp-area.none', { hasText: 'Install directory missing' })).toBeVisible()

  // (4) The Codex group: a Skills tab only, with a row click reading the package
  const cxRow = win.locator('.it.row-btn', { hasText: 'documents@openai-bundled' })
  await cxRow.click()
  const cxPsk = win.locator('.psk', { hasText: 'documents:documents' })
  await cxPsk.click()
  await win.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Codex body C')

  expect(l.errors).toEqual([])
  await close(l)
})

// skills-view A11 / plugins-view H10: a package that disappears between the scan and the expand cannot
// be listed. The file area says so in the same words as the toast, not with the raw IPC error.
test('a skill package removed after the scan: one toast for each expansion, and the file table in the toast\'s wording, in both skill lists (#209)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  const vanishing = join(home, '.claude', 'skills', 'vanishing')
  mkdirSync(vanishing, { recursive: true })
  writeFileSync(join(vanishing, 'SKILL.md'), '---\ndescription: Here at scan time\n---\nx\n')
  const sp = join(home, 'pkg-sp')
  mkdirSync(join(sp, '.claude-plugin'), { recursive: true })
  writeFileSync(join(sp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(sp, 'skills', 'brainstorming'), { recursive: true })
  writeFileSync(join(sp, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: Ask before acting\n---\nx\n')
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: sp }] } })
  )
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }))

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const added = await errorToastsAdded(win)
  const expectSameAsToast = async (
    table: ReturnType<typeof win.locator>,
    sentence = 'Listing failed: The skill package is unavailable or outside the allowed roots'
  ): Promise<void> => {
    await expect(table).toHaveText(sentence)
    await expect(win.locator('.toast.err').last()).toHaveText(sentence)
  }
  /** One toast for each expansion: the cached failure and the revalidation's new failure are one failure (A11, H10) */
  const collapseAndReopen = async (head: ReturnType<typeof win.locator>, table: ReturnType<typeof win.locator>): Promise<void> => {
    await head.click()
    await expect(table).toHaveCount(0)
    expect(await added()).toBe(0)
    await head.click()
    await expect(table).toBeVisible()
    expect(await added()).toBe(1)
  }

  // The Skills tab (SkillExpandBlock)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const row = win.locator('.sk', { hasText: 'vanishing' })
  await expect(row).toBeVisible()
  rmSync(vanishing, { recursive: true })
  await row.locator('.sk-head').click()
  await expectSameAsToast(row.locator('.files .empty'))
  expect(await added()).toBe(1)
  await collapseAndReopen(row.locator('.sk-head'), row.locator('.files .empty'))
  await collapseAndReopen(row.locator('.sk-head'), row.locator('.files .empty'))

  // The Plugins tab (PluginSkillList)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  const spRow = win.locator('.it.row-btn', { hasText: 'superpowers@official' })
  await expect(spRow).toBeVisible()
  rmSync(join(sp, 'skills', 'brainstorming'), { recursive: true })
  await spRow.click()
  const exp = win.locator('.exp-area').first()
  const psk = exp.locator('.psk', { hasText: 'superpowers:brainstorming' })
  await psk.click()
  await expectSameAsToast(exp.locator('.files .empty'))
  expect(await added()).toBe(1)
  await collapseAndReopen(psk, exp.locator('.files .empty'))
  await collapseAndReopen(psk, exp.locator('.files .empty'))

  // The one language control is on the settings page, which takes both rows off the stage. The switch adds no failure
  // toast, each row comes back collapsed, and its next expansion adds one, in the new language
  await win.locator('.rail .ri.set').click()
  await win.locator('[data-testid="language-trigger"]').click()
  await win.locator('.lang-opt[data-lang="zh"]').click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await win.locator('.rail .ri').nth(0).click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(row).toBeVisible()
  await expect(row).not.toHaveClass(/open/)
  expect(await added()).toBe(0)
  await row.locator('.sk-head').click()
  await expectSameAsToast(row.locator('.files .empty'), '列举失败:skill 包不可用或不在允许根下')
  expect(await added()).toBe(1)
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  await spRow.click()
  await psk.click()
  await expectSameAsToast(exp.locator('.files .empty'), '列举失败:skill 包不可用或不在允许根下')
  expect(await added()).toBe(1)
  await close(l)

  // A row left open on a failed listing, with scans landing. The package above leaves the list on the next scan, so these
  // rows are ones the resolver refuses by name and the scan still lists: `resolveSkillRoot` and `resolvePluginSkillRoot`
  // refuse a colon, and the listing fails whatever the scans do. The global row is on two sides
  const home2 = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo2 = join(home2, 'demo-proj')
  mkdirSync(demo2, { recursive: true })
  writeFileSync(join(home2, '.claude.json'), JSON.stringify({ projects: { [demo2]: {} } }))
  const sp2 = join(home2, 'pkg-sp')
  for (const dir of [join(home2, '.claude', 'skills'), join(home2, '.agents', 'skills'), join(sp2, 'skills')]) {
    mkdirSync(join(dir, 'odd:name'), { recursive: true })
    writeFileSync(join(dir, 'odd:name', 'SKILL.md'), '---\ndescription: Refused by name\n---\nx\n')
  }
  mkdirSync(join(sp2, 'skills', 'odd:two'), { recursive: true })
  writeFileSync(join(sp2, 'skills', 'odd:two', 'SKILL.md'), '---\ndescription: Refused by name too\n---\nx\n')
  mkdirSync(join(sp2, '.claude-plugin'), { recursive: true })
  writeFileSync(join(sp2, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'superpowers' }))
  mkdirSync(join(home2, '.claude', 'plugins'), { recursive: true })
  writeFileSync(
    join(home2, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'superpowers@official': [{ scope: 'user', version: '1.0.0', installPath: sp2 }] } })
  )
  writeFileSync(join(home2, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'superpowers@official': true } }))

  const l2 = await launch(undefined, home2, { AGENTSHED_RESCAN_MS: '250' })
  const win2 = await l2.app.firstWindow()
  const added2 = await errorToastsAdded(win2)
  await win2.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const odd = win2.locator('.sk', { hasText: 'odd:name' }).filter({ hasNotText: 'superpowers:' })
  await expect(odd).toBeVisible()
  await odd.locator('.sk-head').click()
  await expect(odd.locator('.files .empty')).toContainText('Listing failed: ')
  expect(await added2()).toBe(1)
  await scansLanded(win2, 2)
  await expect(odd).toHaveClass(/open/)
  await expect(odd.locator('.files .empty')).toContainText('Listing failed: ')
  expect(await added2()).toBe(0)
  // Scans with the row collapsed add none, and the reopen adds one
  await odd.locator('.sk-head').click()
  await expect(odd.locator('.files .empty')).toHaveCount(0)
  await scansLanded(win2, 1)
  expect(await added2()).toBe(0)
  await odd.locator('.sk-head').click()
  await expect(odd.locator('.files .empty')).toBeVisible()
  expect(await added2()).toBe(1)
  // Another side is another listing: its failure adds one, and coming back to the first, which has a cached failure, one
  await odd.locator('.sk-sides button').nth(1).click()
  await expect(odd.locator('.sk-sides button.on')).toHaveText('Codex')
  expect(await added2()).toBe(1)
  await odd.locator('.sk-sides button').nth(0).click()
  await expect(odd.locator('.sk-sides button.on')).toHaveText('Claude')
  expect(await added2()).toBe(1)

  await win2.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  await win2.locator('.it.row-btn', { hasText: 'superpowers@official' }).click()
  const exp2 = win2.locator('.exp-area').first()
  const oddPsk = exp2.locator('.psk', { hasText: 'superpowers:odd:name' })
  await oddPsk.click()
  await expect(exp2.locator('.files .empty')).toContainText('Listing failed: ')
  expect(await added2()).toBe(1)
  await scansLanded(win2, 2)
  await expect(exp2.locator('.files .empty')).toContainText('Listing failed: ')
  expect(await added2()).toBe(0)
  await oddPsk.click()
  await expect(exp2.locator('.files .empty')).toHaveCount(0)
  await oddPsk.click()
  await expect(exp2.locator('.files .empty')).toBeVisible()
  expect(await added2()).toBe(1)
  // Another row is another listing: its failure adds one, and coming back to the first, which has a cached failure, one
  await exp2.locator('.psk', { hasText: 'superpowers:odd:two' }).click()
  await expect(exp2.locator('.psk.on')).toContainText('superpowers:odd:two')
  expect(await added2()).toBe(1)
  await oddPsk.click()
  await expect(exp2.locator('.psk.on')).toContainText('superpowers:odd:name')
  expect(await added2()).toBe(1)
  await close(l2)
})

// The file table's line counts group digits the way the UI language does, like every other count. The
// expected strings are literals, not Intl output, so the test does not share the formatter it checks.
// Chinese and English both group as 12,345, so since ADR-0035 removed French (which grouped with a
// narrow no-break space) one case is left: it shows grouping happens, not that it follows the language.
for (const [system, expected] of [['en-US', '12,345']] as const) {
  test(`skill file line counts follow the UI language's digit grouping [${system}] (#210)`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
    const demo = join(home, 'demo-proj')
    mkdirSync(demo, { recursive: true })
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
    const big = join(home, '.claude', 'skills', 'big')
    mkdirSync(big, { recursive: true })
    writeFileSync(join(big, 'SKILL.md'), '---\ndescription: A long data file\n---\nx\n')
    writeFileSync(join(big, 'data.txt'), 'x\n'.repeat(12345))

    const l = await launch(undefined, home, { AGENTSHED_SYSTEM_LANGUAGES: system })
    const win = await l.app.firstWindow()
    await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
    const row = win.locator('.sk', { hasText: 'big' })
    await row.locator('.sk-head').click()
    await expect(row.locator('.files button', { hasText: 'data.txt' }).locator('.meta.lines')).toHaveText(expected)
    expect(l.errors).toEqual([])
    await close(l)
  })
}

// Ticket grok-side/#126: Grok's own global skills list alongside the other sides', the borrowing
// copy is present, and the install popover names every side of a target project.
test('the Agents page shows Grok\'s own global skills with the borrowing line, and installs one into a project', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-gkglobal-'))
  const proj = join(home, 'demo-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  mkdirSync(join(home, '.grok'), { recursive: true })
  writeFileSync(join(home, '.grok', 'trusted_folders.toml'), `[folders."${proj}"]\ntrusted = true\n`)
  const gsk = join(home, '.grok', 'skills', 'grok-own-skill')
  mkdirSync(gsk, { recursive: true })
  writeFileSync(join(gsk, 'SKILL.md'), '---\ndescription: a grok-side skill\n---\n\nbody\n')
  // The borrowed direction: the same-named skill under Claude's root must list once, under Claude
  const csk = join(home, '.claude', 'skills', 'claude-own-skill')
  mkdirSync(csk, { recursive: true })
  writeFileSync(join(csk, 'SKILL.md'), '---\ndescription: a claude-side skill\n---\n\nbody\n')

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  // The Grok summary card is detected; the grok skill row carries its side; the borrowing line shows
  await expect(win.locator('.pane-head .stats .stat').nth(2)).toContainText('GROK')
  const row = win.locator('.sk', { hasText: 'grok-own-skill' })
  await expect(row).toHaveCount(1)
  // The row's own side strip: grok wears its GK badge in the third slot, not a second CX (the #125
  // ternary fall-through, recurred on this surface — the popover below was asserted, the row was not).
  // The two missing sides draw the shared Minus icon, not a text dash (#148)
  const strip = row.locator('.bdg .badge')
  await expect(strip).toHaveCount(4)
  await expect(strip.nth(0)).toHaveClass(/miss/)
  await expect(strip.nth(1)).toHaveClass(/miss/)
  await expect(strip.nth(2)).toHaveText('GK')
  await expect(strip.nth(2)).toHaveClass(/gk/)
  await expect(strip.nth(3)).toHaveClass(/miss/)
  await expect(row.locator('.bdg .badge.miss svg')).toHaveCount(3)
  await expect(win.locator('.grp-t .hint2')).toContainText('borrowed components belong to the Claude side')
  // Install the grok skill into the project: the popover target marks where it lands, Grok's own directory
  await row.locator('.ins').click()
  await expect(win.locator('.pop .pop-p .badge.gk')).toHaveText('GK')
  await win.locator('.pop .pop-p').first().click()
  await expect(win.locator('.toast.ok')).toBeVisible()

  expect(l.errors).toEqual([])
  await close(l)
})

test('reopening a skill file table (query layer): first expand is slow, reopening it is instant', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-skillcache-'))
  const gskills = join(home, '.claude', 'skills')
  mkdirSync(join(gskills, 'tdd'), { recursive: true })
  writeFileSync(join(gskills, 'tdd', 'SKILL.md'), '---\ndescription: Red before green\n---\n\nbody\n')
  const l = await launch(undefined, home, { AGENTSHED_FETCH_DELAY_MS: '600' })
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const row = win.locator('.sk-head', { hasText: 'tdd' })
  await expect(row).toBeVisible()

  await row.click()
  // Sampled inside the 600ms delay window, immediately after the click: still the "listing" placeholder
  await expect(win.locator('.sk-body .files .empty')).toBeVisible()
  await expect(win.locator('.sk-body .files-card')).toBeVisible()

  await row.click() // collapse
  await row.click() // reopen — a cached visit, well inside the delay window
  await expect(win.locator('.sk-body .files-card')).toBeVisible({ timeout: 200 })

  expect(l.errors).toEqual([])
  await close(l)
})
