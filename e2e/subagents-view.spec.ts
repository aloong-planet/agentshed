import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launch, close } from './support/launch'

// subagents-view A2: the label stays and the detail line is a sentence, with none of the parser's text
test('a subagent\'s corrupt toml keeps its label, and its detail line carries no parser\'s text', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-e2e-toml-'))
  mkdirSync(join(home, '.codex', 'agents'), { recursive: true })
  writeFileSync(join(home, '.codex', 'agents', 'broken.toml'), 'name = "unterminated')
  writeFileSync(join(home, '.codex', 'agents', 'good.toml'), 'name = "good"\ndeveloper_instructions = "ok"\n')
  const l = await launch(undefined, home)
  const win = await l.app.firstWindow()
  await win.locator('.pane-head .tabs .tab', { hasText: 'Subagents' }).click()
  const row = win.locator('.it.row-btn', { hasText: '(broken.toml)' })
  await expect(row.locator('.pill.warn')).toHaveText('Parse failed')
  await row.click()
  await expect(win.locator('.drawer .none')).toHaveText('Failed to parse the toml (corrupt or a syntax error); Codex itself will not load it either. Other entries are unaffected.')
  expect(l.errors).toEqual([])
  await close(l)
})
