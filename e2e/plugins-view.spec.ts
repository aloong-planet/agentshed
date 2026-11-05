import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launch, close } from './support/launch'

// plugins-view G4 and plugins-view::REQ-001/AC-06 (no merging by name across sides), with skills-view E7 (a filter
// keeps the rows it keeps as they were): a Claude plugin and agy's plugin bundling one skill name give two rows, and
// the open one stays the open one when filtering removes a row above them. Found in #325's code review — the rows were
// keyed by name alone, so the two shared one key, and filtering left a stale third row on screen. The same home, where
// agy's configuration holds a plugin and a server but agy itself is not detected, reads the plugin and MCP groups'
// settled forms there (the test review's findings 2, 3 and 7).
test('two sides\' plugins bundling one skill name: two rows, and filtering keeps the open one open', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-agy-dupe-'))
  const file = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  // A project Claude registered: its page shows agy's plugin as in effect globally
  const proj = join(home, 'claude-proj')
  mkdirSync(proj)
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
  // A row above the two, which the filter removes
  file(join(home, '.claude', 'skills', 'aaa-first', 'SKILL.md'), '---\ndescription: first\n---\nfirst\n')
  // Claude's flutter plugin, enabled at the user layer
  const cpkg = join(home, 'claude-flutter')
  file(join(cpkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'flutter', mcpServers: { 'dart-tools': { command: 'dart' } } }))
  file(join(cpkg, 'skills', 'dart-add-unit-test', 'SKILL.md'), '---\ndescription: Claude copy\n---\nClaude plugin body\n')
  file(join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'flutter@official': [{ scope: 'user', version: '1.0.0', installPath: cpkg }] } }))
  file(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'flutter@official': true } }))
  // agy's flutter plugin, enabled, with no record in agy's configuration (so no marketplace) and no server
  const apkg = join(home, '.gemini', 'config', 'plugins', 'flutter')
  file(join(apkg, 'plugin.json'), JSON.stringify({ name: 'flutter', version: '1.0.6' }))
  file(join(apkg, 'skills', 'dart-add-unit-test', 'SKILL.md'), '---\ndescription: agy copy\n---\nAntigravity plugin body\n')
  // agy's shared configuration holds a global server, but agy itself is not detected (no data root): its groups still
  // show, since they have something to list (plugins-view and agents-overview, settled boundaries)
  file(join(home, '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: { 'sqlite-explorer': { command: 'node' } } }))

  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Skills' }).click()
  const rows = win.locator('.sk-card > .rel')
  const named = rows.filter({ has: win.locator('.nm', { hasText: /^flutter:dart-add-unit-test$/ }) })
  await expect(named).toHaveCount(2)
  const agRow = named.filter({ has: win.locator('.bdg .badge.ag') })
  const clRow = named.filter({ has: win.locator('.bdg .badge.cl') })
  await expect(agRow).toHaveCount(1)
  await expect(clRow).toHaveCount(1)
  // Open agy's row, then filter away the row above
  await agRow.locator('.sk-head').click()
  await expect(agRow.locator('.sk')).toHaveClass(/open/)
  await win.locator('.sbar.sk-search input').fill('flutter')
  await expect(rows).toHaveCount(2)
  await expect(agRow.locator('.sk')).toHaveClass(/open/)
  await expect(clRow.locator('.sk')).not.toHaveClass(/open/)
  await agRow.locator('.files button', { hasText: 'SKILL.md' }).click()
  await expect(win.locator('.file-drawer .md-preview-body')).toContainText('Antigravity plugin body')
  await win.locator('.mask').click({ position: { x: 10, y: 10 } })

  // agy is not detected on this home
  await expect(win.locator('.pane-head .stats .stat', { has: win.locator('.badge.ag') }).locator('.k')).toContainText('Not detected')
  // Plugins: agy's group is drawn for its plugin; the plugin, without a recorded marketplace, carries no "From" note
  // (plugins-view, settled boundaries)
  const tab = (label: string) => win.locator('.pane-head .tabs .tab', { hasText: label })
  await tab('Plugins').click()
  await expect(win.locator('.pane-body .grp-t:has(.badge.ag) + .card .nm')).toHaveText(['flutter'])
  const agPlugin = win.locator('.it.row-btn', { hasText: 'v1.0.6' })
  await expect(agPlugin.locator('.pill')).toHaveText('Enabled')
  await expect(agPlugin.locator('.ds')).toHaveText('')
  // MCP: Claude's plugin server names its plugin, the row form every group shares; agy's group is drawn for its global
  // server (agents-overview::REQ-003 boundaries)
  await tab('MCP').click()
  await expect(win.locator('.pane-body .it', { hasText: 'dart-tools' }).locator('.ds')).toHaveText('From the flutter plugin')
  await expect(win.locator('.pane-body .grp-t:has(.badge.ag) + .card .nm')).toHaveText(['sqlite-explorer'])
  // The project's page: agy's plugin takes effect globally, with no marketplace to name
  await win.locator('.rail .ri').nth(1).click()
  await win.locator('.side .row', { hasText: 'claude-proj' }).click()
  await tab('Plugins').click()
  await expect(win.locator('.it.row-btn', { hasText: 'v1.0.6' }).locator('.ds')).toHaveText('In effect globally')

  expect(l.errors).toEqual([])
  await close(l)
})
