import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { mkAgyComponentsHome } from './support/homes'
import { launch, close } from './support/launch'

// skill-install's failure notices: one notice, naming the skill and the project, in the current UI language, with no
// system error. The directories go read-only with the lists already on screen, as a user's would
test('a failed uninstall and a failed install each show one notice in a sentence, with no system error', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-skillfail-'))
  const target = join(home, 'target-proj')
  const holder = join(home, 'holder-proj')
  mkdirSync(target)
  mkdirSync(holder)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [target]: {}, [holder]: {} } }))
  const global = join(home, '.claude', 'skills', 'alpha-skill')
  mkdirSync(global, { recursive: true })
  writeFileSync(join(global, 'SKILL.md'), '---\ndescription: alpha\n---\n\nbody\n')
  // A Codex skill: its landing is the shared directory, and a failure there names the directory, not a side
  const shared = join(home, '.agents', 'skills', 'gamma-skill')
  mkdirSync(shared, { recursive: true })
  writeFileSync(join(shared, 'SKILL.md'), '---\ndescription: gamma\n---\n\nbody\n')
  mkdirSync(join(home, '.codex'))
  writeFileSync(join(home, '.codex', 'config.toml'), `[projects."${target}"]\ntrust_level = "trusted"\n`)
  const skills = join(holder, '.claude', 'skills')
  const copy = join(skills, 'beta-skill')
  mkdirSync(copy, { recursive: true })
  writeFileSync(join(copy, 'SKILL.md'), '---\ndescription: beta\n---\n\nbody\n')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const tab = (name: string) => win.locator('.pane-head .tabs .tab', { hasText: name })

  // The uninstall. Its copy's contents are gone by the time the delete fails on the directory, so "not fully" is the truth
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'holder-proj' }).click()
  await tab('Skills').click()
  const row = win.locator('.pane-body .sk', { has: win.locator('.nm', { hasText: /^beta-skill$/ }) })
  await expect(row).toBeVisible()
  chmodSync(skills, 0o555)
  await row.locator('.ins').click()
  await win.locator('.dlg .cfg-btn.danger').click()
  await expect(win.locator('.toast.err')).toHaveText(`Couldn’t uninstall beta-skill. It could not be fully deleted: ${copy}`)
  await expect(win.locator('.toast')).toHaveCount(1)
  chmodSync(skills, 0o755)
  await expect(win.locator('.toast')).toHaveCount(0)

  // The install, in English and again in Chinese
  const install = async (skill: string = 'alpha-skill'): Promise<void> => {
    await win.locator('.rail .ri').nth(0).click()
    await tab('Skills').click()
    await win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: new RegExp(`^${skill}$`) }) }).locator('.ins').click()
    await win.locator('.pop .pop-p', { has: win.locator('.t', { hasText: /^target-proj$/ }) }).click()
  }
  chmodSync(target, 0o555)
  await install()
  await expect(win.locator('.toast.err')).toHaveText('alpha-skill → target-proj (claude): Copy failed and was cleaned up')
  await expect(win.locator('.toast')).toHaveCount(1)
  await expect(win.locator('.toast')).toHaveCount(0)
  await install('gamma-skill')
  await expect(win.locator('.toast.err')).toHaveText('gamma-skill → target-proj (.agents/skills): Copy failed and was cleaned up')
  await expect(win.locator('.toast')).toHaveCount(1)
  await expect(win.locator('.toast')).toHaveCount(0)
  await win.locator('.ri.set').click()
  await win.locator('[data-testid="language-trigger"]').click()
  await win.locator('.lang-opt[data-lang="zh"]').click()
  await expect(win.locator('html')).toHaveAttribute('lang', 'zh-CN')
  // The switch has a notice of its own, which is gone before the install
  await expect(win.locator('.toast')).toHaveCount(0)
  await install()
  await expect(win.locator('.toast.err')).toHaveText('alpha-skill → target-proj(claude):复制失败,已清理')
  await expect(win.locator('.toast')).toHaveCount(1)
  chmodSync(target, 0o755)

  expect(l.errors).toEqual([])
  await close(l)
})

// skill-install::REQ-003/AC-02: the "Same name installed" tag is the target's state at this opening of the picker.
// Found in #325's code review — a reopened picker first drew the tags of its previous opening, until the fresh ones
// arrived. The stale tag lasts one round trip, so a retried assertion cannot see it: an observer in the page records
// whether a tag is ever drawn after the reopening.
test('the install picker\'s same-name tag is this opening\'s: reopened after the copy is gone, it is not drawn', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-held-'))
  const proj = join(home, 'proj')
  const copy = join(proj, '.claude', 'skills', 'tidy')
  mkdirSync(copy, { recursive: true })
  writeFileSync(join(copy, 'SKILL.md'), '---\ndescription: tidy, the project copy\n---\nproject\n')
  mkdirSync(join(home, '.claude', 'skills', 'tidy'), { recursive: true })
  writeFileSync(join(home, '.claude', 'skills', 'tidy', 'SKILL.md'), '---\ndescription: tidy\n---\nglobal\n')
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const ins = win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: /^tidy$/ }) }).locator('.ins')
  const target = win.locator('.pop .pop-p', { has: win.locator('.t', { hasText: /^proj$/ }) })
  // The tag is drawn while the project holds the name
  await ins.click()
  await expect(target.locator('.pop-have')).toHaveText('Same name installed')
  await ins.click()
  await expect(win.locator('.pop')).toHaveCount(0)
  // The copy goes; from here on no tag may be drawn, not even for a moment
  rmSync(copy, { recursive: true })
  await win.evaluate(() => {
    const w = window as unknown as { tagDrawn: boolean }
    w.tagDrawn = false
    new MutationObserver(() => {
      if (document.querySelector('.pop .pop-have') !== null) w.tagDrawn = true
    }).observe(document.body, { childList: true, subtree: true })
  })
  await ins.click()
  await target.click()
  await expect(win.locator('.toast.ok')).toHaveText('Installed tidy → proj (claude)')
  expect(readFileSync(join(copy, 'SKILL.md'), 'utf8')).toContain('global')
  expect(await win.evaluate(() => (window as unknown as { tagDrawn: boolean }).tagDrawn)).toBe(false)

  // This home has no Antigravity CLI: neither its plugin group nor its MCP group is drawn (plugins-view, settled
  // boundaries; agents-overview::REQ-003 boundaries). Each read follows the Claude group's heading on the same render
  await win.locator('.pane-head .tabs .tab', { hasText: 'Plugins' }).click()
  await expect(win.locator('.pane-body .grp-t:has(.badge.cl)')).toHaveCount(1)
  expect(await win.locator('.pane-body .badge.ag').count()).toBe(0)
  await win.locator('.pane-head .tabs .tab', { hasText: 'MCP' }).click()
  await expect(win.locator('.pane-body .grp-t:has(.badge.cl)')).toHaveCount(1)
  expect(await win.locator('.pane-body .badge.ag').count()).toBe(0)

  expect(l.errors).toEqual([])
  await close(l)
})

// skill-install::REQ-001/AC-01, AC-02, AC-04, skill-install::REQ-003/AC-01, AC-02 (the picker), then
// skills-view::REQ-002/AC-01…AC-05, skill-install::REQ-002/AC-01, subagents-view::REQ-001/AC-05,
// plugins-view::REQ-001/AC-05, project-detail::REQ-002/AC-03 and AC-04 (project detail), in one launch.
test('the shared skills directory: one install target, stale and same-name rows, the project groups, and its uninstall', async () => {
  const { home, agOnly, all, stale } = mkAgyComponentsHome()
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })
  await tab('Skills').click()
  const row = (name: string) => win.locator('.sk-card > .rel', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  const target = (name: string) => win.locator('.pop .pop-p', { has: win.locator('.t', { hasText: new RegExp(`^${name}$`) }) })

  // The picker for an Antigravity-only skill: the shared directory is one mark naming both loaders, on the project
  // agy alone registered as on the one every side registered (skill-install::REQ-001/AC-01)
  await row('release-notes').locator('.ins').click()
  await expect(win.locator('.pop .pop-p')).toHaveCount(3)
  await expect(target('agy-demo').locator('.pop-lands > *')).toHaveCount(1)
  await expect(target('agy-demo').locator('.pop-shared .badge')).toHaveText(['CX', 'AG'])
  await expect(target('transfer').locator('.pop-shared .badge')).toHaveText(['CX', 'AG'])
  // A stale project is listed, labelled and disabled (skill-install::REQ-003/AC-01). A forced click on it does
  // nothing: the picker stays open for the next click — an install would have closed it first — and when that
  // install's notice arrives it is the only one on screen
  await expect(target('gone-proj')).toBeDisabled()
  await expect(target('gone-proj').locator('.pop-why')).toHaveText('Stale, disabled')
  await target('gone-proj').click({ force: true })
  // Installing into the Antigravity-only project: one landing, one result, in the project's shared directory
  await target('agy-demo').click()
  await expect(win.locator('.toast.ok')).toHaveText(
    'Installed release-notes → agy-demo’s shared directory (by copy; loaded by Codex and Antigravity)'
  )
  expect(await win.locator('.toast').count()).toBe(1)
  expect(existsSync(stale)).toBe(false)
  // The copy agy uses landed, once
  expect(readFileSync(join(agOnly, '.agents', 'skills', 'release-notes', 'SKILL.md'), 'utf8')).toContain('Release notes, the CLI copy')
  expect(existsSync(join(agOnly, '.claude'))).toBe(false)

  // A project whose shared directory already holds the name is tagged; choosing it shows the blocked notice and
  // installs nothing — in no landing (skill-install::REQ-003/AC-02)
  await expect(win.locator('.toast')).toHaveCount(0) // Wait the success out, so the next notice is fresh
  await row('commit-style').locator('.ins').click()
  await expect(target('agy-demo').locator('.pop-have')).toHaveText('Same name installed')
  await target('agy-demo').click()
  await expect(win.locator('.toast.err')).toHaveText(
    'commit-style → agy-demo (.agents/skills): Blocked: the target already has a project-level skill with this name, and nothing was overwritten'
  )
  expect(readFileSync(join(agOnly, '.agents', 'skills', 'commit-style', 'SKILL.md'), 'utf8')).toContain('Commit style, the project copy')
  // tdd into the project every side registered: two landings — Claude's directory and the shared one, which already
  // holds tdd. The tag stops both: Claude's directory, free on its own, is not written either
  await expect(win.locator('.toast')).toHaveCount(0)
  await row('tdd').locator('.ins').click()
  await expect(target('transfer').locator('.pop-lands > .badge')).toHaveText(['CC'])
  await expect(target('transfer').locator('.pop-shared .badge')).toHaveText(['CX', 'AG'])
  await expect(target('transfer').locator('.pop-have')).toHaveText('Same name installed')
  await expect(target('agy-demo').locator('.pop-have')).toHaveCount(0)
  await target('transfer').click()
  await expect(win.locator('.toast.err')).toHaveText('tdd → transfer (.agents/skills): Blocked: the target already has a project-level skill with this name, and nothing was overwritten')
  expect(await win.locator('.toast').count()).toBe(1)
  expect(existsSync(join(all, '.claude', 'skills', 'tdd'))).toBe(false)
  // Whether a project offers the shared directory follows the skill's sides it is registered on (A8): a Codex-only
  // skill on the Antigravity-only project lands nowhere — no mark, and the existing notice (skill-install::REQ-001/AC-02)
  await expect(win.locator('.toast')).toHaveCount(0)
  await row('decision-form').locator('.ins').click()
  await expect(target('agy-demo').locator('.pop-lands > *')).toHaveCount(0)
  await expect(target('transfer').locator('.pop-shared .badge')).toHaveText(['CX', 'AG'])
  await target('agy-demo').click()
  await expect(win.locator('.toast.err')).toHaveText('agy-demo does not belong to the agent side this skill lives on')
  expect(existsSync(join(agOnly, '.agents', 'skills', 'decision-form'))).toBe(false)

  // Project detail, the Antigravity-only project: the shared group between the Codex and the Antigravity groups,
  // headed with both loaders whatever the registration (skills-view::REQ-002/AC-01, AC-04)
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'agy-demo' }).click()
  await tab('Skills').click()
  const headings = win.locator('.pane-body .grp-t')
  await expect(headings).toHaveCount(5)
  await expect(headings.nth(0)).toHaveText('Global level · Claude(1)')
  await expect(headings.nth(1)).toHaveText('Global level · Codex(1)')
  await expect(headings.nth(2)).toContainText('Shared · .agents/skills')
  await expect(headings.nth(2).locator('.badge')).toHaveText(['CX', 'AG'])
  await expect(headings.nth(2)).toContainText('(3)')
  // The shared directory holds commit-style and release-notes, so neither is listed under agy's global level
  // (skills-view::REQ-002/AC-03): only tdd is
  await expect(headings.nth(3)).toHaveText('Global level · Antigravity(1)')
  await expect(headings.nth(4)).toContainText('Bundled in plugins')
  const detRow = (name: string) => win.locator('.pane-body .sk', { has: win.locator('.nm', { hasText: new RegExp(`^${name}$`) }) })
  // A shared row carries both loaders' badges; a plugin row its own side's (AC-05)
  await expect(detRow('demo-skill').locator('.bdg .badge').nth(1)).toHaveText('CX')
  await expect(detRow('demo-skill').locator('.bdg .badge').nth(3)).toHaveText('AG')
  await expect(detRow('flutter:dart-add-unit-test').locator('.bdg .badge').nth(3)).toHaveText('AG')
  await expect(detRow('flutter:dart-add-unit-test').locator('.bdg .badge').nth(0)).toHaveClass(/miss/)
  // Shared entries are project-level and previewable (AC-02); the drawer names both loaders
  await expect(detRow('demo-skill').locator('.pill.prj')).toBeVisible()
  await detRow('demo-skill').locator('.sk-head').click()
  await detRow('demo-skill').locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Explain calc.py briefly.')
  await expect(win.locator('.file-drawer .d-meta')).toContainText('Codex and Antigravity')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })
  // Uninstalling from the shared directory: the full path, and both loaders lose it (skill-install::REQ-002/AC-01)
  await detRow('commit-style').locator('.ins').click()
  await expect(win.locator('.dlg-path')).toHaveText(`${agOnly}/.agents/skills/commit-style/`)
  await expect(win.locator('.dlg .dlg-p').nth(1)).toHaveText(
    'This directory is loaded by Codex and Antigravity: once it is deleted, none of them has this skill.'
  )
  await win.locator('.dlg .cfg-btn.danger').click()
  await expect(win.locator('.toast.ok')).toHaveText('Uninstalled commit-style')
  expect(existsSync(join(agOnly, '.agents', 'skills', 'commit-style'))).toBe(false)
  // agy's global copy, hidden until then, comes back under its own group
  await expect(headings.nth(3)).toHaveText('Global level · Antigravity(2)')
  await expect(detRow('commit-style').locator('.pill.glb')).toBeVisible()

  // Subagents: the project-level group, then the global ones; Antigravity rows carry no shadowing
  // (subagents-view::REQ-001/AC-05)
  await tab('Subagents').click()
  await expect(headings).toHaveText([
    'Effective view · project level shadows on both Claude and Codex · click a row for the full definition',
    'Project level · .agents/agents(1)',
    'Global level · Claude(1)',
    'Global level · Antigravity(3)'
  ])
  await expect(win.locator('.pane-body .it.row-btn', { has: win.locator('.badge.ag') })).toHaveCount(4)
  expect(await win.locator('.pane-body .it.row-btn .pill.shadow').count()).toBe(0)

  // Plugins: agy's, labelled as taking effect globally (plugins-view::REQ-001/AC-05)
  await tab('Plugins').click()
  await expect(win.locator('.it.row-btn', { hasText: 'flutter' }).locator('.ds')).toHaveText(
    'In effect globally · from antigravity-plugins-official'
  )
  // MCP: agy's global and plugin servers; the project's own file nowhere (project-detail::REQ-002/AC-03)
  await tab('MCP').click()
  await expect(win.locator('.pane-body .it .nm')).toHaveText(['sqlite-explorer', 'github', 'flutter_dart-mcp-server'])
  expect(await win.locator('.pane-body', { hasText: 'demo-stdio' }).count()).toBe(0)

  // The project every side registered: the shared group still sits between the Codex and the Antigravity groups
  await win.locator('.side .row', { hasText: 'transfer' }).click()
  await tab('Skills').click()
  await expect(headings.nth(0)).toHaveText('Project level · .claude/skills(1)')
  await expect(headings.nth(2)).toHaveText('Global level · Codex(1)')
  await expect(headings.nth(3)).toContainText('Shared · .agents/skills')
  await expect(headings.nth(3)).toContainText('(2)')
  // The shared directory's tdd hides agy's: release-notes and commit-style remain
  await expect(headings.nth(4)).toHaveText('Global level · Antigravity(2)')
  // Its Subagents: each side's project group headed by the directory that side reads, then the global groups
  await tab('Subagents').click()
  await expect(headings).toHaveText([
    'Effective view · project level shadows on both Claude and Codex · click a row for the full definition',
    'Project level · .claude/agents(1)',
    'Project level · .codex/agents(1)',
    'Global level · Claude(1)',
    'Global level · Antigravity(3)'
  ])

  expect(l.errors).toEqual([])
  await close(l)
})

/**
 * The install-to popover is a **floating layer**: it has to appear next to the button that opened it, and
 * its targets have to be clickable.
 *
 * Why this cannot be asserted with `toBeVisible()` alone: an element clipped away by an ancestor's
 * `overflow` **still has a non-empty bounding box**, so `toBeVisible()` passes on a popover the user
 * cannot see or click. That is exactly "an attribute standing in for what the user sees". So this measures
 * geometry, hit-tests the popover's own centre, and finishes on the only judgement that matters — clicking
 * a target and getting a result.
 *
 * The regression it guards (found 2026-08-10): the popover is `position: absolute`, but the wrapper it is
 * meant to hang off carried a class that no rule defined, so it never became a containing block. The
 * popover fell back to the initial containing block and landed at the bottom edge of the viewport —
 * clicking "Install to…" looked like nothing happened.
 */
test('the install-to popover sits next to its button, and its targets can be clicked', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-home-'))
  const demo = join(home, 'demo-proj')
  mkdirSync(demo, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [demo]: {} } }))
  // Several skills, so the popover is opened from the **last** row: that is where the card's bottom edge
  // is right underfoot, the position most likely to be clipped
  const gskills = join(home, '.claude', 'skills')
  for (const n of ['alpha-skill', 'beta-skill', 'gamma-skill', 'delta-skill']) {
    mkdirSync(join(gskills, n), { recursive: true })
    writeFileSync(join(gskills, n, 'SKILL.md'), `---\ndescription: ${n}\n---\n\nbody\n`)
  }

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()

  const rows = win.locator('.sk-card > .rel')
  await expect(rows).toHaveCount(4)
  await rows.last().locator('.ins').click()

  const geo = await win.evaluate(() => {
    const pop = document.querySelector('.pop') as HTMLElement
    const buttons = [...document.querySelectorAll('.sk-card .ins')] as HTMLElement[]
    const btn = buttons[buttons.length - 1]
    const p = pop.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    // The decisive check: whatever is painted at the popover's own centre must belong to the popover.
    // A clipped popover reports a rect but loses this — the point resolves to whatever is behind it.
    const atCentre = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2)
    return {
      // Measured on both sides, because the popover legitimately opens either way
      gapBelowButton: Math.round(p.top - b.bottom),
      gapAboveButton: Math.round(b.top - p.bottom),
      horizontalOffset: Math.round(Math.abs(p.right - b.right)),
      bottomWithinViewport: p.bottom <= innerHeight,
      centreBelongsToPopover: atCentre !== null && pop.contains(atCentre)
    }
  })
  // Hangs off the button that opened it, rather than off the document — on **either** side. The popover
  // opens downwards by default and flips upwards when the room below runs short, which is deliberate
  // (see popAt) and depends on where the row happens to sit. An earlier version of this assertion
  // required the downward case specifically, and went red the moment a search box pushed the list down
  // by forty pixels — it was pinning today's incidental layout, not the behaviour.
  const gapToButton = Math.min(Math.abs(geo.gapBelowButton), Math.abs(geo.gapAboveButton))
  expect(gapToButton).toBeLessThan(40)
  expect(geo.horizontalOffset).toBeLessThan(40)
  expect(geo.bottomWithinViewport).toBe(true)
  expect(geo.centreBelongsToPopover).toBe(true)

  // A resize **repositions** rather than closes: the user is part-way through choosing a target, and
  // resizing the window is not them changing their mind. The language dropdown always behaved this
  // way; the two are the same kind of layer and now agree.
  //
  // The event is dispatched rather than the window actually resized, for the same reason as elsewhere:
  // a real resize moves the row out from under the pointer, and the layer could then close via a
  // route that has nothing to do with the listener under test.
  await win.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(win.locator('.pop')).toHaveCount(1)
  const after = await win.evaluate(() => {
    const pop = document.querySelector('.pop') as HTMLElement
    const buttons = [...document.querySelectorAll('.sk-card .ins')] as HTMLElement[]
    const b = buttons[buttons.length - 1].getBoundingClientRect()
    const p = pop.getBoundingClientRect()
    return Math.min(Math.abs(p.top - b.bottom), Math.abs(b.top - p.bottom))
  })
  expect(after).toBeLessThan(40) // still anchored to its button after re-placing

  // Step clear of the resize before the scroll cases: a scroll hard on a resize's heels is
  // attributed to the browser's scrollTop clamp and deliberately ignored (#122), and the
  // assertions above can complete inside that window
  await win.waitForTimeout(250)

  // Scrolling the popover's **own** contents must not close it. It is scrollable (a long project list
  // exceeds its max height), so closing on its own scroll would make every target below the fold
  // unreachable: reaching for one dismisses the thing you were reaching into.
  //
  // This is not hypothetical — it is what a document-level capture listener does by default, since
  // scroll does not bubble but does pass through document on capture. The listener has to tell "the
  // anchor moved" from "the user is scrolling the layer itself".
  await win.locator('.pop').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.pop')).toHaveCount(1)

  // Scrolling anything *outside* it still dismisses — the anchor has moved out from under a
  // viewport-positioned layer, and no reading of that leaves the old coordinates true
  await win.locator('.pane-body').evaluate((el) => el.dispatchEvent(new Event('scroll')))
  await expect(win.locator('.pop')).toHaveCount(0)

  // And the judgement that actually matters: the target is clickable and installing reports back
  const installedName = (await rows.last().locator('.nm').first().innerText()).trim()
  await rows.last().locator('.ins').click()
  await win.locator('.pop .pop-p').first().click()
  await expect(win.locator('.toast.ok')).toBeVisible()

  // The installed copy is visible with no refresh of any kind (pinned 2026-08-23, when the manual
  // control was removed and this was the case to be sure of): project detail — including its Skills
  // section — is fetched when the project is opened, so it never rides on the snapshot. The rescan
  // interval here is the five-minute default, so no scan can be what makes this pass.
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row').first().click()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  await expect(win.locator('.sk', { hasText: installedName })).toHaveCount(1)

  expect(l.errors).toEqual([])
  await close(l)
})
