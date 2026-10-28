// Ticket antigravity-side/#325: Antigravity CLI's components — its global skills (three directories, the copy agy uses),
// the shared skills directory in project detail, subagents, plugins and MCP. Every case goes through a reader's exported
// function over a temporary fixture tree shaped from the samples agy itself loaded (research §10.9; the test design table
// is in docs/.workings/antigravity-side/ticket-325-review-tests.md).
import { chmodSync, mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'
import { isUnderKnownSkillRoots, listSkillPackageFiles, resolveSkillRoot } from './skill-package'
import { readAntigravityPlugins } from './plugins'
import { readProjectDetail } from './project-detail'
import { settingsJson } from '../testing/agy-fixture'
import { readEffectiveSubagents, readGlobalSubagents } from './subagents'
import { ERR } from '@shared/errors'
import { installSkillToProject, skillHoldings } from './install'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
/** agy's three global skills directories, in the order agy prefers a same-name copy (research §10.9, runs s20–s23) */
const agCli = (): string => join(dir, '.gemini', 'antigravity-cli', 'skills')
const agConfig = (): string => join(dir, '.gemini', 'config', 'skills')
const agRoot = (): string => join(dir, '.gemini', 'skills')

/** A skill package in the shape agy's samples have: SKILL.md with front matter, optionally more files */
function mkSkill(base: string, name: string, description: string, extra: Record<string, string> = {}): string {
  const d = join(base, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\nExplain calc.py briefly.\n`)
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(join(d, rel, '..'), { recursive: true })
    writeFileSync(join(d, rel), text)
  }
  return d
}

/** `~/.gemini/config`, the configuration agy loads beside its data root */
const agConfigDir = (): string => join(dir, '.gemini', 'config')

/** The plugin.json agy's official `flutter` plugin installed with (samples/global/.gemini/config/plugins/flutter),
 * trimmed of fields nothing reads */
const FLUTTER_MANIFEST = {
  name: 'flutter',
  displayName: 'Dart and Flutter',
  version: '1.0.6',
  description: 'Official plugin for Dart and Flutter',
  author: { name: 'Flutter Team', url: 'https://flutter.dev' },
  keywords: ['dart', 'flutter'],
  license: 'BSD-3-Clause'
}
/** The sample's bundled agent: a quoted description, a block-list `tools:`, and more keys than any reader needs */
const A11Y_AGENT = [
  '---',
  'name: flutter_a11y_agent',
  'description: "Audits Flutter code for accessibility (a11y)."',
  'tools:',
  '  - view_file',
  '  - grep_search',
  'mainAgent: true',
  'subagent: true',
  'commandExecutionPolicy: auto',
  '---',
  '',
  '# Flutter accessibility reviewer persona',
  ''
].join('\n')

/** A plugin installed the way agy installs one: a directory under config/plugins holding a top-level plugin.json,
 * skills/<name>/SKILL.md (the sample's carry a nested metadata block), agents/*.md, mcp_config.json and rules */
function mkAgPlugin(
  name: string,
  opts: { manifest?: object | string | null; skills?: string[]; agents?: Record<string, string>; servers?: Record<string, object> } = {}
): string {
  const root = join(agConfigDir(), 'plugins', name)
  mkdirSync(root, { recursive: true })
  const manifest = opts.manifest === undefined ? { ...FLUTTER_MANIFEST, name } : opts.manifest
  if (manifest !== null) writeFileSync(join(root, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2))
  for (const s of opts.skills ?? []) {
    mkdirSync(join(root, 'skills', s), { recursive: true })
    writeFileSync(
      join(root, 'skills', s, 'SKILL.md'),
      `---\nname: ${s}\ndescription: ${s} from ${name}\nmetadata:\n  model: models/gemini-3.1-pro-preview\n---\n# ${s}\n`
    )
  }
  for (const [file, text] of Object.entries(opts.agents ?? {})) {
    mkdirSync(join(root, 'agents'), { recursive: true })
    writeFileSync(join(root, 'agents', file), text)
  }
  if (opts.servers) writeFileSync(join(root, 'mcp_config.json'), JSON.stringify({ mcpServers: opts.servers }, null, 2))
  // Rules ship in the sample too; agy's rules are shown nowhere (ADR-0037)
  mkdirSync(join(root, 'rules'), { recursive: true })
  writeFileSync(join(root, 'rules', 'hot-reload.md'), '---\ntrigger: glob\n---\nrule\n')
  return root
}

/** agy's shared configuration (config.json) with the given plugin records; `null` writes nothing */
function writeAgConfig(plugins: Record<string, object> | null, raw?: string): void {
  mkdirSync(agConfigDir(), { recursive: true })
  if (raw !== undefined) writeFileSync(join(agConfigDir(), 'config.json'), raw)
  else if (plugins !== null) writeFileSync(join(agConfigDir(), 'config.json'), JSON.stringify({ plugins }, null, 2))
}
/** A plugin record the way agy writes one at install time: `installedFrom` and no `enabled` key (research §10.9) */
const freshRecord = (name: string, marketplace = 'antigravity-plugins-official'): object => ({
  installedFrom: { id: `${marketplace}/plugin/${name}`, marketplace, version: '1.0.6' }
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-agy-comp-'))
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("Antigravity's global library (skills-view::REQ-001)", () => {
  it('a name in two of agy\'s global directories is one row, the copy from the first', async () => {
    mkSkill(agCli(), 'x', 'the CLI copy', { 'references/a.md': 'a' })
    mkSkill(agConfig(), 'x', 'the config copy')
    const snap = await scan(roots(), { now: () => 1 })
    const rows = snap.global.skills.filter((s) => s.name === 'x')
    expect(rows).toHaveLength(1)
    expect(rows[0].sides).toEqual(['antigravity'])
    expect(rows[0].description).toBe('the CLI copy')
    expect(rows[0].pkg.antigravity?.files).toBe(2)
  })

  it('a name in all three keeps the CLI copy, and one in the second and third keeps the config copy', async () => {
    mkSkill(agCli(), 'y', 'y from the CLI directory')
    mkSkill(agConfig(), 'y', 'y from config')
    mkSkill(agRoot(), 'y', 'y from the root')
    mkSkill(agConfig(), 'z', 'z from config')
    mkSkill(agRoot(), 'z', 'z from the root')
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.skills.map((s) => [s.name, s]))
    expect(byName['y'].description).toBe('y from the CLI directory')
    expect(byName['z'].description).toBe('z from config')
    expect(snap.global.skills.filter((s) => s.name === 'y' || s.name === 'z')).toHaveLength(2)
  })

  it('the preview opens the copy agy uses, and the install source is that copy too', () => {
    mkSkill(agCli(), 'y', 'cli', { 'cli-only.md': 'c' })
    mkSkill(agConfig(), 'y', 'config', { 'config-only.md': 'c' })
    mkSkill(agConfig(), 'z', 'config', { 'config-only.md': 'c' })
    mkSkill(agRoot(), 'z', 'root', { 'root-only.md': 'r' })
    const files = (name: string): string[] => {
      const root = resolveSkillRoot({ side: 'antigravity', name, scope: 'global', roots: roots() })
      expect(root).not.toBeNull()
      return listSkillPackageFiles(root as string).files.map((f) => f.path)
    }
    expect(files('y')).toEqual(['SKILL.md', 'cli-only.md'])
    expect(files('z')).toEqual(['SKILL.md', 'config-only.md'])
  })

  it('entries in config/skills and ~/.gemini/skills are inside the known roots; a sibling directory is not', () => {
    const inConfig = mkSkill(agConfig(), 'a', 'a')
    const inRoot = mkSkill(agRoot(), 'b', 'b')
    const elsewhere = mkSkill(join(dir, '.gemini', 'elsewhere'), 'c', 'c')
    const builtin = mkSkill(join(dir, '.gemini', 'antigravity-cli', 'builtin', 'skills'), 'agy-customizations', 'built in')
    expect(isUnderKnownSkillRoots(inConfig, roots())).toBe(true)
    expect(isUnderKnownSkillRoots(inRoot, roots())).toBe(true)
    expect(isUnderKnownSkillRoots(elsewhere, roots())).toBe(false)
    expect(isUnderKnownSkillRoots(builtin, roots())).toBe(false)
  })

  it('agy\'s built-in skills are not listed', async () => {
    // The real built-in directory's shape: antigravity-cli/builtin/skills/<name>/SKILL.md
    mkSkill(join(dir, '.gemini', 'antigravity-cli', 'builtin', 'skills'), 'agy-customizations', 'built in')
    mkSkill(agCli(), 'mine', 'the user\'s')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.skills.map((s) => s.name)).toEqual(['mine'])
  })

  it('Codex\'s ~/.agents/skills is not Antigravity\'s library', async () => {
    mkSkill(join(dir, '.agents', 'skills'), 'codex-only', 'codex')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.skills.find((s) => s.name === 'codex-only')?.sides).toEqual(['codex'])
  })

  it('a name Claude also holds is one row carrying both sides', async () => {
    mkSkill(join(dir, '.claude', 'skills'), 'w', 'claude copy')
    mkSkill(agRoot(), 'w', 'agy copy', { 'more.md': 'm' })
    const snap = await scan(roots(), { now: () => 1 })
    const rows = snap.global.skills.filter((s) => s.name === 'w')
    expect(rows).toHaveLength(1)
    expect(rows[0].sides).toEqual(['claude', 'antigravity'])
    expect(rows[0].pkg.claude?.files).toBe(1)
    expect(rows[0].pkg.antigravity?.files).toBe(2)
  })
})

/** agy's global MCP file in the sample's shape (samples/global/.gemini/config/mcp_config.json): a stdio server and a
 * remote one keyed `serverUrl`, the sample's both disabled; one here enabled so the flag has two values to tell apart */
const GLOBAL_MCP = {
  mcpServers: {
    'sample-stdio': { command: '/usr/bin/true', args: ['--sample'] },
    'sample-remote': { serverUrl: 'https://example.invalid/mcp/', disabled: true }
  }
}

describe('the shared skills directory in project detail (skills-view::REQ-002)', () => {
  it('.agents/skills is one project-level group; a name in it hides the same name in Codex\'s and Antigravity\'s global groups', () => {
    const proj = join(dir, 'agy-demo')
    mkSkill(join(proj, '.agents', 'skills'), 'commit-style', 'the project copy')
    mkSkill(join(proj, '.agents', 'skills'), 'demo-skill', 'Project-level sample skill in the shared .agents/skills directory')
    mkSkill(join(dir, '.agents', 'skills'), 'commit-style', 'Codex global copy')
    mkSkill(agConfig(), 'commit-style', 'agy global copy')
    mkSkill(join(dir, '.agents', 'skills'), 'codex-only', 'c')
    mkSkill(agRoot(), 'only-ag', 'a')
    const skills = readProjectDetail(roots(), proj).skills.filter((s) => s.origin === 'disk')
    expect(skills.map((s) => [s.level, s.side, s.name, s.description])).toEqual([
      ['global', 'codex', 'codex-only', 'c'],
      // The shared directory, once: the side recorded is the first that loads it, which is what locates it
      ['project', 'codex', 'commit-style', 'the project copy'],
      ['project', 'codex', 'demo-skill', 'Project-level sample skill in the shared .agents/skills directory'],
      ['global', 'antigravity', 'only-ag', 'a']
    ])
  })

  it('the group shows whatever the project is registered on; an empty or absent directory gives no entries', async () => {
    const claudeOnly = join(dir, 'claude-only')
    const empty = join(dir, 'empty')
    mkSkill(join(claudeOnly, '.agents', 'skills'), 'x', 'x')
    mkdirSync(join(empty, '.agents', 'skills'), { recursive: true })
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [claudeOnly]: {}, [empty]: {} } }))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.find((p) => p.path === claudeOnly)?.sides).toEqual(['claude'])
    expect(readProjectDetail(roots(), claudeOnly).skills.map((s) => [s.level, s.name])).toEqual([['project', 'x']])
    expect(readProjectDetail(roots(), empty).skills).toEqual([])
  })
})

describe('installing into the shared skills directory (skill-install::REQ-001)', () => {
  const read = (p: string): string => readFileSync(p, 'utf8')

  it('a skill installed for Codex and Antigravity together lands once, with one result; again, the one same-name block', () => {
    const proj = join(dir, 'proj')
    mkdirSync(proj)
    mkSkill(join(dir, '.agents', 'skills'), 'tdd', 'codex copy')
    mkSkill(agCli(), 'tdd', 'agy copy')
    const first = installSkillToProject(roots(), { skillName: 'tdd', sides: ['codex', 'antigravity'], targetProjectPath: proj })
    expect(first).toEqual([{ dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: true } }])
    expect(readdirSync(join(proj, '.agents', 'skills'))).toEqual(['tdd'])
    // The first side's library is the source: Codex's copy
    expect(read(join(proj, '.agents', 'skills', 'tdd', 'SKILL.md'))).toContain('codex copy')
    const again = installSkillToProject(roots(), { skillName: 'tdd', sides: ['codex', 'antigravity'], targetProjectPath: proj })
    expect(again).toEqual([{ dir: '.agents/skills', loaders: ['codex', 'antigravity'], result: { ok: false, reason: ERR.skillConflict } }])
  })

  it('Claude, Codex and Antigravity together: two landings, the shared one once', () => {
    const proj = join(dir, 'proj')
    mkdirSync(proj)
    for (const base of [join(dir, '.claude', 'skills'), join(dir, '.agents', 'skills'), agConfig()]) mkSkill(base, 'g', 'g')
    const r = installSkillToProject(roots(), { skillName: 'g', sides: ['antigravity', 'claude', 'codex'], targetProjectPath: proj })
    expect(r.map((l) => [l.dir, l.result.ok])).toEqual([['.claude/skills', true], ['.agents/skills', true]])
    expect(readdirSync(join(proj, '.agents', 'skills'))).toEqual(['g'])
    expect(readdirSync(join(proj, '.claude', 'skills'))).toEqual(['g'])
  })

  it('an Antigravity-only skill installs the copy agy uses', () => {
    const proj = join(dir, 'proj')
    mkdirSync(proj)
    mkSkill(agConfig(), 'r', 'the config copy agy uses')
    mkSkill(agRoot(), 'r', 'the root copy agy does not use')
    const r = installSkillToProject(roots(), { skillName: 'r', sides: ['antigravity'], targetProjectPath: proj })
    expect(r.map((l) => l.result)).toEqual([{ ok: true }])
    expect(read(join(proj, '.agents', 'skills', 'r', 'SKILL.md'))).toContain('the config copy agy uses')
  })

  it('holdings: which landing directories of which projects already hold the name', () => {
    const a = join(dir, 'a')
    const b = join(dir, 'b')
    const c = join(dir, 'c')
    mkSkill(join(a, '.agents', 'skills'), 'n', 'n')
    mkSkill(join(b, '.claude', 'skills'), 'n', 'n')
    mkdirSync(c)
    expect(skillHoldings([a, b, c], 'n')).toEqual({ [a]: ['.agents/skills'], [b]: ['.claude/skills'], [c]: [] })
    expect(skillHoldings([a, b], '../n')).toEqual({})
  })
})

/** The two global definitions agy loaded in the samples (samples/global/.gemini/config/agents/) */
const SAMPLE_FLAT = '---\nname: sample-flat\ndescription: Sample global subagent (flat file form).\n---\nYou answer in one sentence. This is a sample definition.\n'
const SAMPLE_REVIEWER =
  '---\nname: sample-reviewer\ndescription: Sample global subagent (directory form).\nsubagent: true\nmainAgent: false\n---\nYou review diffs for obvious mistakes. This is a sample definition.\n'
/** The project-level one (the demo project's .agents/agents/demo-agent/agent.md) */
const DEMO_AGENT = '---\nname: demo-agent\ndescription: Project-level sample subagent for the agy demo project.\nsubagent: true\n---\nYou explain calc.py. This is a sample definition.\n'

const agAgents = (): string => join(agConfigDir(), 'agents')
function mkFile(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

describe('Antigravity subagents (subagents-view::REQ-001)', () => {
  it('reads both global forms; the name is the front matter\'s, else the file\'s or directory\'s; the definition as written', () => {
    mkFile(join(agAgents(), 'sample-flat.md'), SAMPLE_FLAT)
    mkFile(join(agAgents(), 'sample-reviewer', 'agent.md'), SAMPLE_REVIEWER)
    // A file named differently from its front matter, one without front matter, a directory form without a name
    mkFile(join(agAgents(), 'renamed.md'), '---\nname: actual-name\ndescription: named inside\n---\nbody\n')
    mkFile(join(agAgents(), 'bare.md'), 'No front matter at all.\n')
    mkFile(join(agAgents(), 'noname', 'agent.md'), '---\ndescription: a directory without a name field\n---\nbody\n')
    // A body line that reads like a field is not one
    mkFile(join(agAgents(), 'body-name.md'), '---\ndescription: d\n---\nname: not-a-field\n')
    const subs = readGlobalSubagents(roots())
    const byName = Object.fromEntries(subs.map((s) => [s.name, s]))
    expect(Object.keys(byName).sort()).toEqual(['actual-name', 'bare', 'body-name', 'noname', 'sample-flat', 'sample-reviewer'])
    for (const s of subs) expect(s.sides).toEqual(['antigravity'])
    expect(byName['sample-flat'].description).toBe('Sample global subagent (flat file form).')
    expect(byName['sample-flat'].antigravity?.content?.text).toBe(SAMPLE_FLAT)
    expect(byName['sample-reviewer'].antigravity?.content?.text).toBe(SAMPLE_REVIEWER)
    expect(byName['bare'].description).toBeNull()
    expect(byName['noname'].description).toBe('a directory without a name field')
    expect(byName['sample-flat'].claude).toBeNull()
  })

  it('a definition marked as not usable as a main agent is listed like any other', () => {
    mkFile(join(agAgents(), 'sample-reviewer', 'agent.md'), SAMPLE_REVIEWER)
    const [s] = readGlobalSubagents(roots())
    expect(s.name).toBe('sample-reviewer')
    expect(s.antigravity?.mainAgent).toBe('false')
    expect(s.antigravity?.subagent).toBe('true')
    expect(s.antigravity?.error).toBeNull()
  })

  it('a description written as a YAML block scalar shows its text, not the block marker', () => {
    mkFile(
      join(agAgents(), 'folded.md'),
      '---\nname: folded\ndescription: >-\n  Reviews diffs\n  for obvious mistakes.\ntools:\n  - view_file\n---\nbody\n'
    )
    const [s] = readGlobalSubagents(roots())
    expect(s.description).toBe('Reviews diffs for obvious mistakes.')
    expect(s.antigravity?.tools).toBe('view_file')
  })

  it('a directory without agent.md holds no definition', () => {
    mkdirSync(join(agAgents(), 'empty-dir'), { recursive: true })
    mkFile(join(agAgents(), 'sample-flat.md'), SAMPLE_FLAT)
    expect(readGlobalSubagents(roots()).map((s) => s.name)).toEqual(['sample-flat'])
  })

  // Root reads any file, so the unreadable shape cannot be built there: skipped explicitly rather than passing empty
  it.skipIf(process.getuid?.() === 0)('a file that cannot be read keeps its name with the unreadable label (A8)', () => {
    mkFile(join(agAgents(), 'locked.md'), SAMPLE_FLAT)
    chmodSync(join(agAgents(), 'locked.md'), 0o000)
    try {
      const locked = readGlobalSubagents(roots()).find((s) => s.name === 'locked')
      expect(locked?.antigravity?.error?.code).toBe(ERR.subagentUnreadable)
      expect(locked?.antigravity?.content).toBeNull()
    } finally {
      chmodSync(join(agAgents(), 'locked.md'), 0o644)
    }
  })

  it('a name Claude also defines is one entry with both sides\' definitions', () => {
    mkFile(join(dir, '.claude', 'agents', 'code-reviewer.md'), '---\ndescription: Review code\ntools: Read, Grep\n---\nYou are a reviewer.\n')
    mkFile(join(agAgents(), 'code-reviewer', 'agent.md'), '---\nname: code-reviewer\ndescription: agy reviewer\ntools:\n  - view_file\n  - grep_search\n---\nYou review.\n')
    const [s] = readGlobalSubagents(roots())
    expect(s.sides).toEqual(['claude', 'antigravity'])
    expect(s.claude?.tools).toBe('Read, Grep')
    // The sample's block-list tools read as one line, item by item
    expect(s.antigravity?.tools).toBe('view_file, grep_search')
    expect(s.description).toBe('Review code')
  })

  it('project detail reads .agents/agents/<name>/agent.md but not a flat file, and Antigravity rows never shadow', () => {
    const proj = join(dir, 'agy-demo')
    mkFile(join(proj, '.agents', 'agents', 'demo-agent', 'agent.md'), DEMO_AGENT)
    mkFile(join(proj, '.agents', 'agents', 'flat.md'), '---\nname: flat\n---\nnot sampled at project level\n')
    mkFile(join(proj, '.agents', 'agents', 'dup', 'agent.md'), '---\nname: dup\n---\nproject\n')
    mkFile(join(agAgents(), 'dup.md'), '---\nname: dup\n---\nglobal\n')
    const ag = readEffectiveSubagents(roots(), proj).filter((s) => s.side === 'antigravity')
    expect(ag.map((s) => [s.level, s.name, s.shadows, s.shadowed])).toEqual([
      ['project', 'demo-agent', false, false],
      ['project', 'dup', false, false],
      ['global', 'dup', false, false]
    ])
    expect(ag[0].detail.content?.text).toBe(DEMO_AGENT)
  })
})

describe('Antigravity MCP servers (agents-overview::REQ-003/AC-04)', () => {
  it('lists the global file\'s servers with the disabled flag, and the enabled plugins\' servers as <plugin>_<server>', async () => {
    mkdirSync(agConfigDir(), { recursive: true })
    writeFileSync(join(agConfigDir(), 'mcp_config.json'), JSON.stringify(GLOBAL_MCP, null, 2))
    // The sample plugin's server: its command (dart) missing on this machine makes no difference to listing it
    mkAgPlugin('flutter', { servers: { 'dart-mcp-server': { command: 'dart', args: ['mcp-server'] } } })
    mkAgPlugin('gdocs', { servers: { docs: { command: 'gdocs-mcp' } } })
    writeAgConfig({ flutter: freshRecord('flutter'), gdocs: { ...freshRecord('gdocs'), enabled: false } })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.mcp.filter((m) => m.side === 'antigravity')).toEqual([
      { name: 'sample-stdio', side: 'antigravity', source: 'mcp_config.json', disabled: false, plugin: null },
      { name: 'sample-remote', side: 'antigravity', source: 'mcp_config.json', disabled: true, plugin: null },
      { name: 'flutter_dart-mcp-server', side: 'antigravity', source: 'plugin', disabled: false, plugin: 'flutter' }
    ])
  })

  it('a project\'s own .agents/mcp_config.json is read nowhere', async () => {
    const proj = join(dir, 'agy-demo')
    mkdirSync(join(proj, '.agents'), { recursive: true })
    // The project sample: a disabled stdio server agy was not observed to load
    writeFileSync(join(proj, '.agents', 'mcp_config.json'), JSON.stringify({ mcpServers: { 'demo-stdio': { command: '/usr/bin/true', disabled: true } } }))
    mkdirSync(join(dir, '.gemini', 'antigravity-cli'), { recursive: true })
    writeFileSync(join(dir, '.gemini', 'antigravity-cli', 'settings.json'), settingsJson([proj]))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.map((p) => p.path)).toEqual([proj])
    expect(snap.global.mcp.map((m) => m.name)).not.toContain('demo-stdio')
    expect(JSON.stringify(readProjectDetail(roots(), proj).mcp)).not.toContain('demo-stdio')
  })

  it('an empty or unparsable global file lists none of its servers; the plugin\'s and the other sides\' still list', async () => {
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {}, mcpServers: { figma: {} } }))
    mkAgPlugin('flutter', { servers: { 'dart-mcp-server': { command: 'dart' } } })
    writeAgConfig({ flutter: freshRecord('flutter') })
    // agy leaves a 0-byte mcp_config.json behind (this machine's, observed); and a half-written one
    for (const text of ['', '{ "mcpServers": { "half": ']) {
      writeFileSync(join(agConfigDir(), 'mcp_config.json'), text)
      const snap = await scan(roots(), { now: () => 1 })
      expect(snap.global.mcp.map((m) => `${m.side}:${m.name}`)).toEqual(['claude:figma', 'antigravity:flutter_dart-mcp-server'])
    }
  })
})

describe('Antigravity plugins (plugins-view::REQ-001)', () => {
  it('lists a plugin with its plugin.json version, the marketplace it came from, and its bundled skills, subagents and servers', () => {
    const root = mkAgPlugin('flutter', {
      skills: ['dart-add-unit-test', 'flutter-add-widget-test'],
      agents: { 'a11y_agent.md': A11Y_AGENT },
      servers: { 'dart-mcp-server': { command: 'dart', args: ['mcp-server'], env: { AGENT_PLUGIN: 'agy' } } }
    })
    writeAgConfig({ flutter: freshRecord('flutter') })
    const [p] = readAntigravityPlugins(roots())
    expect(p.name).toBe('flutter')
    expect(p.version).toBe('1.0.6')
    expect(p.marketplace).toBe('antigravity-plugins-official')
    expect(p.root).toBe(root)
    expect(p.contents.skills.map((s) => s.name)).toEqual(['dart-add-unit-test', 'flutter-add-widget-test'])
    expect(p.contents.skills[0].description).toBe('dart-add-unit-test from flutter')
    expect(p.contents.skills[0].pkg?.files).toBe(1)
    // agy lists the bundled agent by its front matter name, and the server as <plugin>_<server> (measured)
    expect(p.contents.agents).toEqual(['flutter_a11y_agent'])
    expect(p.contents.mcp).toEqual(['flutter_dart-mcp-server'])
    // Rules are shown nowhere and hooks have no sample: neither is a category here
    expect(p.contents.hooks).toEqual([])
    expect(p.contents.missing).toBe(false)
  })

  it('enablement: no enabled key is enabled, an explicit false disabled and an explicit true enabled', () => {
    for (const n of ['fresh', 'off', 'on', 'unrecorded']) mkAgPlugin(n)
    writeAgConfig({
      fresh: freshRecord('fresh'),
      // The shape agy writes on `agy plugin disable` / `enable` (samples: config.disabled-sample.json, config.json)
      off: { ...freshRecord('off'), enabled: false },
      on: { ...freshRecord('on'), enabled: true }
    })
    const enabled = Object.fromEntries(readAntigravityPlugins(roots()).map((p) => [p.name, p.enabled]))
    expect(enabled).toEqual({ fresh: true, off: false, on: true, unrecorded: true })
  })

  it('a configuration file that is missing or does not parse is skipped: every plugin reads as having no key', () => {
    mkAgPlugin('flutter')
    expect(readAntigravityPlugins(roots()).map((p) => [p.enabled, p.marketplace])).toEqual([[true, null]])
    writeAgConfig(null, '{ "plugins": { "flutter": { "enabled": false ')
    expect(readAntigravityPlugins(roots()).map((p) => [p.enabled, p.marketplace])).toEqual([[true, null]])
  })

  it('a plugin directory without a readable plugin.json keeps its directory name and no version, the others unaffected', () => {
    mkAgPlugin('broken', { manifest: null, skills: ['still-here'] })
    mkAgPlugin('garbled', { manifest: '{ not json' })
    mkAgPlugin('flutter')
    writeAgConfig({ flutter: freshRecord('flutter') })
    const byName = Object.fromEntries(readAntigravityPlugins(roots()).map((p) => [p.name, p]))
    expect(Object.keys(byName)).toEqual(['broken', 'flutter', 'garbled'])
    expect(byName['broken'].version).toBeNull()
    expect(byName['broken'].contents.skills.map((s) => s.name)).toEqual(['still-here'])
    expect(byName['garbled'].version).toBeNull()
    expect(byName['flutter'].version).toBe('1.0.6')
  })

  it('an enabled plugin\'s skills join the global Skills list as <plugin>:<skill>; a disabled plugin\'s do not', async () => {
    const root = mkAgPlugin('flutter', { skills: ['dart-add-unit-test'] })
    mkAgPlugin('gdocs', { skills: ['draft-doc'] })
    writeAgConfig({ flutter: freshRecord('flutter'), gdocs: { ...freshRecord('gdocs'), enabled: false } })
    const snap = await scan(roots(), { now: () => 1 })
    const plugin = snap.global.skills.filter((s) => s.origin === 'plugin')
    expect(plugin.map((s) => s.name)).toEqual(['flutter:dart-add-unit-test'])
    expect(plugin[0].sides).toEqual(['antigravity'])
    expect(plugin[0].pluginName).toBe('flutter')
    expect(plugin[0].pluginRoot).toBe(root)
    expect(plugin[0].pluginSkillName).toBe('dart-add-unit-test')
    expect(plugin[0].pkg.antigravity?.files).toBe(1)
    // The group itself lists both, the disabled one readable (AC-06, H4)
    expect(snap.global.antigravityPlugins.map((p) => [p.name, p.enabled])).toEqual([['flutter', true], ['gdocs', false]])
  })

  it('a Claude plugin and an Antigravity plugin bundling one skill name give two entries, one per side, never merged', async () => {
    // Claude's flutter plugin, enabled at the user layer, bundling the skill agy's flutter plugin bundles too
    const cpkg = join(dir, 'claude-flutter')
    mkdirSync(join(cpkg, '.claude-plugin'), { recursive: true })
    writeFileSync(join(cpkg, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'flutter' }))
    mkSkill(join(cpkg, 'skills'), 'dart-add-unit-test', 'the Claude copy')
    mkdirSync(join(dir, '.claude', 'plugins'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'flutter@official': [{ scope: 'user', version: '1.0.0', installPath: cpkg }] } })
    )
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'flutter@official': true } }))
    const aroot = mkAgPlugin('flutter', { skills: ['dart-add-unit-test'] })
    writeAgConfig({ flutter: freshRecord('flutter') })
    const snap = await scan(roots(), { now: () => 1 })
    const named = snap.global.skills.filter((s) => s.name === 'flutter:dart-add-unit-test')
    // plugins-view G4 and plugins-view::REQ-001/AC-06: each keeps its own side, package and description
    expect(named.map((s) => [s.sides, s.pluginName, s.pluginRoot, s.description])).toEqual([
      [['claude'], 'flutter@official', cpkg, 'the Claude copy'],
      [['antigravity'], 'flutter', aroot, 'dart-add-unit-test from flutter']
    ])
  })

  it('a skill description written as a YAML block scalar, as agy\'s official flutter plugin writes five, shows its text', async () => {
    const root = mkAgPlugin('flutter', { skills: ['dart-migrate-to-checks-package', 'dart-use-path-package'] })
    writeAgConfig({ flutter: freshRecord('flutter') })
    // The two shapes the sample's skills take: literal (|-) and folded (>-), with a metadata block after
    writeFileSync(
      join(root, 'skills', 'dart-migrate-to-checks-package', 'SKILL.md'),
      '---\nname: dart-migrate-to-checks-package\ndescription: |-\n  Replace the usage of `expect`\n  with `package:checks`.\nmetadata:\n  model: m\n---\n# body\n'
    )
    writeFileSync(
      join(root, 'skills', 'dart-use-path-package', 'SKILL.md'),
      '---\nname: dart-use-path-package\ndescription: >-\n  Cross-platform path manipulation.\nmetadata:\n  model: m\n---\n\n# body\n'
    )
    // The same reader serves every side's skills: a Claude global skill written the same way reads the same
    mkdirSync(join(dir, '.claude', 'skills', 'folded'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'skills', 'folded', 'SKILL.md'), '---\ndescription: >\n  One\n  line.\n---\nbody\n')
    const snap = await scan(roots(), { now: () => 1 })
    const desc = Object.fromEntries(snap.global.skills.map((s) => [s.name, s.description]))
    expect(desc['flutter:dart-migrate-to-checks-package']).toBe('Replace the usage of `expect`\nwith `package:checks`.')
    expect(desc['flutter:dart-use-path-package']).toBe('Cross-platform path manipulation.')
    expect(desc['folded']).toBe('One line.')
  })

  it('two of a plugin\'s definitions giving one name are both listed, as agy\'s directory holds them', () => {
    mkAgPlugin('flutter', { agents: { 'a.md': A11Y_AGENT, 'b.md': A11Y_AGENT } })
    expect(readAntigravityPlugins(roots())[0].contents.agents).toEqual(['flutter_a11y_agent', 'flutter_a11y_agent'])
  })

  it('a bundled definition reached through a symbolic link is listed, as the global agents directories list one', () => {
    const root = mkAgPlugin('flutter')
    mkFile(join(dir, 'elsewhere', 'reviewer.md'), SAMPLE_REVIEWER)
    mkdirSync(join(root, 'agents'), { recursive: true })
    symlinkSync(join(dir, 'elsewhere', 'reviewer.md'), join(root, 'agents', 'reviewer.md'))
    // A link to a directory is not a definition
    mkdirSync(join(dir, 'elsewhere', 'folder.md'))
    symlinkSync(join(dir, 'elsewhere', 'folder.md'), join(root, 'agents', 'folder.md'))
    expect(readAntigravityPlugins(roots())[0].contents.agents).toEqual(['sample-reviewer'])
  })

  it('in project detail an enabled plugin\'s skills join as plugin-level rows on the Antigravity side; agy has no project layer', () => {
    const root = mkAgPlugin('flutter', { skills: ['dart-add-unit-test'] })
    mkAgPlugin('gdocs', { skills: ['draft-doc'] })
    writeAgConfig({ flutter: freshRecord('flutter'), gdocs: { ...freshRecord('gdocs'), enabled: false } })
    const proj = join(dir, 'proj')
    // A workspace plugin directory: not read (no sample, plugins-view::REQ-001/AC-05)
    mkdirSync(join(proj, '.agents', 'plugins', 'local', 'skills', 'nope'), { recursive: true })
    writeFileSync(join(proj, '.agents', 'plugins', 'local', 'skills', 'nope', 'SKILL.md'), '---\ndescription: x\n---\n')
    const plugin = readProjectDetail(roots(), proj).skills.filter((s) => s.level === 'plugin')
    expect(plugin.map((s) => [s.name, s.side, s.origin, s.pluginRoot, s.pluginSkillName])).toEqual([
      ['flutter:dart-add-unit-test', 'antigravity', 'plugin', root, 'dart-add-unit-test']
    ])
  })
})
