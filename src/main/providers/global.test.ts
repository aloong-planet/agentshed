// Ticket 07: the Agents global layer — global skills (merged, symlinks), plugins, global MCP (three
// sources), and read-only configuration.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    grokHome: join(dir, '.grok'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
function mkSkill(base: string, name: string, content: string): void {
  const d = join(base, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'SKILL.md'), content)
}
const SKILL_MD = (desc: string, body = 'x'): string =>
  `---\nname: n\ndescription: ${desc}\n---\n\n${body}\n`

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-glb-'))
  // The minimal skeleton for both sides existing
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('global skills (the global library)', () => {
  it('both sides merge into one column: the same name merges with both badges, a single-side entry gets its own; the description comes from SKILL.md frontmatter', async () => {
    mkSkill(join(dir, '.claude', 'skills'), 'tdd', SKILL_MD('red before green', 'same'))
    mkSkill(join(dir, '.agents', 'skills'), 'tdd', SKILL_MD('red before green', 'same'))
    mkSkill(join(dir, '.claude', 'skills'), 'review-code', SKILL_MD('four-layer method'))
    mkSkill(join(dir, '.agents', 'skills'), 'decision-form', SKILL_MD('batch decision form'))
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.skills.map((s) => [s.name, s]))
    expect(byName['tdd'].sides).toEqual(['claude', 'codex'])
    expect(byName['tdd']).not.toHaveProperty('differs')
    expect(byName['review-code'].sides).toEqual(['claude'])
    expect(byName['review-code'].description).toBe('four-layer method')
    expect(byName['decision-form'].sides).toEqual(['codex'])
    // Inline package stats: a side with a package gets numbers, a side with no definition gets null
    expect(byName['tdd'].pkg.claude?.files).toBe(1)
    expect(byName['tdd'].pkg.claude!.bytes).toBeGreaterThan(0)
    expect(byName['decision-form'].pkg.claude).toBeNull()
    expect(byName['decision-form'].pkg.codex?.files).toBe(1)
  })

  it('the same name with different contents on the two sides still merges onto one row (no differs signal)', async () => {
    mkSkill(join(dir, '.claude', 'skills'), 'grilling', SKILL_MD('in batches', 'version A'))
    mkSkill(join(dir, '.agents', 'skills'), 'grilling', SKILL_MD('one question at a time', 'version B'))
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.skills.find((x) => x.name === 'grilling')
    expect(s?.sides).toEqual(['claude', 'codex'])
    expect(s).not.toHaveProperty('differs')
  })

  it('a symlinked skill is marked symlink (per side)', async () => {
    mkSkill(join(dir, '.agents', 'skills'), 'grill-me', SKILL_MD('forward'))
    mkdirSync(join(dir, '.claude', 'skills'), { recursive: true })
    symlinkSync(join(dir, '.agents', 'skills', 'grill-me'), join(dir, '.claude', 'skills', 'grill-me'))
    const snap = await scan(roots(), { now: () => 1 })
    const s = snap.global.skills.find((x) => x.name === 'grill-me')
    expect(s?.symlink.claude).toBe(true)
    expect(s?.symlink.codex).toBe(false)
  })
})

describe('plugins (Claude only, read-only)', () => {
  it('installed_plugins.json + settings.json enabledPlugins → name / version / scope / enablement', async () => {
    const pdir = join(dir, '.claude', 'plugins')
    mkdirSync(pdir, { recursive: true })
    writeFileSync(
      join(pdir, 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'chrome-devtools-mcp@chrome-devtools-plugins': [
            { scope: 'user', version: '1.6.0', installPath: join(dir, 'plug-install') }
          ],
          'disabled-one@mp': [{ scope: 'user', version: '0.9.2', installPath: '/nope' }]
        }
      })
    )
    writeFileSync(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'chrome-devtools-mcp@chrome-devtools-plugins': true } })
    )
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['chrome-devtools-mcp@chrome-devtools-plugins']).toMatchObject({
      version: '1.6.0',
      enabled: true
    })
    expect(byName['chrome-devtools-mcp@chrome-devtools-plugins'].installs[0].scope).toBe('user')
    expect(byName['disabled-one@mp'].enabled).toBe(false)
  })
})

describe('global MCP (three sources)', () => {
  it('Claude global mcpServers + those bundled with a plugin + the Codex config.toml section', async () => {
    writeFileSync(
      join(dir, '.claude.json'),
      JSON.stringify({ projects: {}, mcpServers: { figma: { command: 'x' } } })
    )
    // Bundled with a plugin: the mcpServers in installPath/.claude-plugin/plugin.json
    const plugRoot = join(dir, 'plug-install')
    mkdirSync(join(plugRoot, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(plugRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'chrome-devtools-mcp', mcpServers: { 'chrome-devtools': { command: 'npx' } } })
    )
    const pdir = join(dir, '.claude', 'plugins')
    mkdirSync(pdir, { recursive: true })
    writeFileSync(
      join(pdir, 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: { 'chrome-devtools-mcp@mp': [{ scope: 'user', version: '1.6.0', installPath: plugRoot }] }
      })
    )
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'model = "gpt-5.5-codex"\n[mcp_servers.node_repl]\ncommand = "node"\n[mcp_servers.computer-use]\ncommand = "cu"\n'
    )
    const snap = await scan(roots(), { now: () => 1 })
    const rows = snap.global.mcp.map((m) => `${m.side}:${m.source}:${m.name}`).sort()
    expect(rows).toEqual([
      'claude:global-config:figma',
      'claude:plugin:chrome-devtools',
      'codex:config.toml:computer-use',
      'codex:config.toml:node_repl'
    ])
  })
})

describe('read-only global configuration', () => {
  it('reads the global CLAUDE.md and AGENTS.md; missing files are null; the config.toml summary carries the model and the counts', async () => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'CLAUDE.md'), '# Global rules\n- pnpm\n')
    writeFileSync(join(dir, '.codex', 'AGENTS.md'), '# Codex global\n')
    writeFileSync(
      join(dir, '.codex', 'config.toml'),
      'model = "gpt-5.5-codex"\n[projects."/a"]\ntrust_level = "trusted"\n[mcp_servers.node_repl]\ncommand="node"\n'
    )
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeGlobalMd?.text).toContain('Global rules')
    expect(snap.global.codexAgentsMd?.text).toContain('Codex global')
    // The summary is structured fields now, with the renderer composing the sentence (ticket 07) —
    // asserting fields is steadier than asserting a sentence:
    // a wording change should not turn this red, only a wrong count should
    expect(snap.global.codexConfigSummary).toEqual({
      model: 'gpt-5.5-codex',
      projectCount: 1,
      mcpCount: 1
    })
  })

  it('everything missing → null, without throwing', async () => {
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeGlobalMd).toBeNull()
    expect(snap.global.codexAgentsMd).toBeNull()
  })
})
