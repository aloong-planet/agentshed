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
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
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

describe('Grok global skills (ticket #126)', () => {
  it('a Grok skill lists alongside the other sides\'; the borrowed direction stays out by construction', async () => {
    // The same name under Claude's root only: Grok reads it at RUNTIME (compatibility-borrowed),
    // and it must appear once under Claude with no grok side
    mkSkill(join(dir, '.claude', 'skills'), 'borrowed-one', SKILL_MD('claude thing'))
    // Grok's own root: its own entry, plus a symlinked one
    mkSkill(join(dir, '.grok', 'skills'), 'grok-own', SKILL_MD('grok thing'))
    mkSkill(join(dir, '.agents', 'skills'), 'linked-into-grok', SKILL_MD('shared'))
    symlinkSync(join(dir, '.agents', 'skills', 'linked-into-grok'), join(dir, '.grok', 'skills', 'linked-into-grok'))
    const snap = await scan(roots(), { now: () => 1 })
    const own = snap.global.skills.find((x) => x.name === 'grok-own')
    expect(own?.sides).toEqual(['grok'])
    expect(own?.pkg.grok?.files).toBe(1)
    expect(own?.description).toBe('grok thing')
    const borrowed = snap.global.skills.find((x) => x.name === 'borrowed-one')
    expect(borrowed?.sides).toEqual(['claude'])
    const linked = snap.global.skills.find((x) => x.name === 'linked-into-grok')
    expect(linked?.sides).toEqual(['codex', 'grok'])
    expect(linked?.symlink.grok).toBe(true)
  })

  it('an unreadable Grok skill entry degrades alone: the group survives and the other sides are untouched', async () => {
    mkSkill(join(dir, '.grok', 'skills'), 'healthy', SKILL_MD('fine'))
    // A dangling symlink: the entry cannot be read, and only it may suffer
    symlinkSync(join(dir, 'nowhere'), join(dir, '.grok', 'skills', 'broken-link'))
    mkSkill(join(dir, '.claude', 'skills'), 'claude-fine', SKILL_MD('ok'))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.skills.find((x) => x.name === 'healthy')?.sides).toEqual(['grok'])
    expect(snap.global.skills.find((x) => x.name === 'claude-fine')?.sides).toEqual(['claude'])
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

// agents-overview::REQ-004: two entries, CLAUDE.md and AGENTS.md. The locations are the ones measured with agy
// (research record §10.9): it loads ~/.gemini/AGENTS.md and ~/.gemini/config/AGENTS.md together, the root one
// first, and GEMINI.md and rules from their own places — none of which joins the section.
describe('the Configuration section (agents-overview::REQ-004)', () => {
  const write = (rel: string, text: string): void => {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  const CODEX = join('.codex', 'AGENTS.md')
  const AGY_ROOT = join('.gemini', 'AGENTS.md')
  const AGY_CONFIG = join('.gemini', 'config', 'AGENTS.md')
  // What agy also reads, and the section shows nowhere (AC-05), each with its own marker
  const writeExcluded = (): void => {
    write(join('.gemini', 'GEMINI.md'), '# marker-gemini-root\n')
    write(join('.gemini', 'config', 'GEMINI.md'), '# marker-gemini-config\n')
    write(join('.gemini', 'config', 'rules', 'house-style.md'), '# marker-global-rule\n')
    write(join('.gemini', 'antigravity-cli', 'rules', 'sample-cli-rule.md'), '# marker-cli-rule\n')
    write(join('.grok', 'AGENTS.md'), '# marker-grok-agents\n')
  }

  it('CLAUDE.md is ~/.claude/CLAUDE.md; AGENTS.md is every global AGENTS.md that exists, Codex first, then agy\'s root one, then its config one, each with its path', async () => {
    write(join('.claude', 'CLAUDE.md'), '# Global rules\n- pnpm\n')
    // Written in reverse of the order shown, so neither creation order nor directory order can produce it
    write(AGY_CONFIG, '# Antigravity instructions\nmarker-agy-config\n')
    write(AGY_ROOT, '# Agent rules\nmarker-agy-root\n')
    write(CODEX, '# Codex global\nmarker-codex\n')
    writeExcluded()
    // The input that used to produce the config.toml summary (AC-04)
    write(join('.codex', 'config.toml'), 'model = "gpt-5.5-codex"\n[projects."/a"]\ntrust_level = "trusted"\n[mcp_servers.node_repl]\ncommand="node"\n')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeMd).toEqual({
      file: join(dir, '.claude', 'CLAUDE.md'),
      content: { text: '# Global rules\n- pnpm\n', truncated: false }
    })
    expect(snap.global.agentsMd).toEqual([
      { file: join(dir, '.codex', 'AGENTS.md'), content: { text: '# Codex global\nmarker-codex\n', truncated: false } },
      { file: join(dir, '.gemini', 'AGENTS.md'), content: { text: '# Agent rules\nmarker-agy-root\n', truncated: false } },
      { file: join(dir, '.gemini', 'config', 'AGENTS.md'), content: { text: '# Antigravity instructions\nmarker-agy-config\n', truncated: false } }
    ])
    // AC-05: the payload carries file contents (the three markers above), and nothing from GEMINI.md, either
    // rules directory or Grok's AGENTS.md
    const payload = JSON.stringify(snap.global)
    for (const m of ['marker-codex', 'marker-agy-root', 'marker-agy-config']) expect(payload).toContain(m)
    for (const m of ['marker-gemini-root', 'marker-gemini-config', 'marker-global-rule', 'marker-cli-rule', 'marker-grok-agents'])
      expect(payload, m).not.toContain(m)
    // AC-04: no settings summary for any side; the old per-side fields are gone from the contract
    for (const k of ['codexConfigSummary', 'codexAgentsMd', 'claudeGlobalMd']) expect(snap.global).not.toHaveProperty(k)
  })

  // Every combination of the three (the ticket's "providers fixtures for each combination")
  it.each([
    { present: [], shown: [] },
    { present: [CODEX], shown: [CODEX] },
    { present: [AGY_ROOT], shown: [AGY_ROOT] },
    { present: [AGY_CONFIG], shown: [AGY_CONFIG] },
    { present: [CODEX, AGY_ROOT], shown: [CODEX, AGY_ROOT] },
    { present: [CODEX, AGY_CONFIG], shown: [CODEX, AGY_CONFIG] },
    { present: [AGY_ROOT, AGY_CONFIG], shown: [AGY_ROOT, AGY_CONFIG] },
    { present: [AGY_CONFIG, AGY_ROOT, CODEX], shown: [CODEX, AGY_ROOT, AGY_CONFIG] }
  ])('present $present → shown $shown', async ({ present, shown }) => {
    for (const rel of present) write(rel, `# ${rel}\n`)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.agentsMd.map((f) => f.file)).toEqual(shown.map((rel) => join(dir, rel)))
  })

  it('GEMINI.md and rules exist but no AGENTS.md does → the AGENTS.md entry has no file (it shows "None")', async () => {
    writeExcluded()
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.agentsMd).toEqual([])
  })

  it('a file that exists but cannot be read keeps its place and its path, with no contents; the others are read', async () => {
    write(CODEX, '# Codex global\n')
    // A directory where the file should be: the read fails (EISDIR) whoever runs the test
    mkdirSync(join(dir, AGY_ROOT), { recursive: true })
    write(AGY_CONFIG, '# Antigravity instructions\n')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.agentsMd).toEqual([
      { file: join(dir, CODEX), content: { text: '# Codex global\n', truncated: false } },
      { file: join(dir, AGY_ROOT), content: null },
      { file: join(dir, AGY_CONFIG), content: { text: '# Antigravity instructions\n', truncated: false } }
    ])
  })

  it('an oversized file is truncated (B5)', async () => {
    write(CODEX, 'x'.repeat(200_123))
    const snap = await scan(roots(), { now: () => 1 })
    const [codex] = snap.global.agentsMd
    expect(codex.content?.truncated).toBe(true)
    expect(codex.content?.text.length).toBe(200000)
  })

  it('nothing present → no CLAUDE.md and no AGENTS.md, without throwing', async () => {
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.claudeMd).toBeNull()
    expect(snap.global.agentsMd).toEqual([])
  })
})
