// Plugin scope semantics (spec: subagents-memory-plugin, sequences E/F):
// installation records are not merged (E1); the global page reads enablement at the user layer (E4);
// project detail's effective enabled set is local > project > user (F1), degrading when a layer is
// corrupt (F2); F3 is the two-way acceptance case.
// Known gaps: E2 (the lost-projectPath label), F4 (the Codex group note on the detail page) and the
// per-side grouped rendering are all UI layer,
//   not unit tested per ADR-0002; the data pass-through is pinned by E1/E8 and F3's whole chain by e2e.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import { readProjectDetail } from './project-detail'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
function mkInstalled(plugins: Record<string, unknown[]>): void {
  const pdir = join(dir, '.claude', 'plugins')
  mkdirSync(pdir, { recursive: true })
  writeFileSync(join(pdir, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }))
}
function mkUserSettings(enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins }))
}
function mkProjSettings(proj: string, file: string, enabledPlugins: Record<string, boolean>): void {
  mkdirSync(join(proj, '.claude'), { recursive: true })
  writeFileSync(join(proj, '.claude', file), JSON.stringify({ enabledPlugins }))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-plg-'))
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: {} }))
  mkdirSync(join(dir, '.codex'), { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('global plugins: the scope semantics fix', () => {
  it('E1 all of a plugin\'s installation records are kept (installed at both user and project, with projectPath alongside)', async () => {
    const demo = join(dir, 'demo-proj')
    mkInstalled({
      'tdd-guard@community': [
        { scope: 'user', version: '2.4.1', installPath: '/cache/a' },
        { scope: 'project', version: '2.4.1', installPath: '/cache/a', projectPath: demo }
      ]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const p = snap.global.plugins[0]
    expect(p.installs).toHaveLength(2)
    expect(p.installs[0].scope).toBe('user')
    expect(p.installs[1]).toMatchObject({ scope: 'project', projectPath: demo })
  })

  it('E2 a project-scope record whose owning project directory is gone → the projectMissing label, without crashing', async () => {
    const demo = join(dir, 'demo-exists')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'p@mp': [
        { scope: 'project', version: '1.0.0', installPath: '/x', projectPath: demo },
        { scope: 'project', version: '1.0.0', installPath: '/x', projectPath: join(dir, 'gone-proj') }
      ]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const [ok, gone] = snap.global.plugins[0].installs
    expect(ok.projectMissing).toBe(false)
    expect(gone.projectMissing).toBe(true)
  })

  it('E3 a scope of local or an unknown value is kept as written; a record with no scope field → unknown', async () => {
    mkInstalled({
      'a@mp': [{ scope: 'local', version: '1.0.0', installPath: '/x' }],
      'b@mp': [{ version: '1.0.0', installPath: '/x' }]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['a@mp'].installs[0].scope).toBe('local')
    expect(byName['b@mp'].installs[0].scope).toBeNull()
  })

  it('E4 the global page reads enablement at the user layer: both absent and explicitly false mean not enabled', async () => {
    mkInstalled({
      'a@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }],
      'b@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }],
      'c@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }]
    })
    mkUserSettings({ 'a@mp': true, 'b@mp': false })
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.global.plugins.map((p) => [p.name, p]))
    expect(byName['a@mp'].enabled).toBe(true)
    expect(byName['b@mp'].enabled).toBe(false)
    expect(byName['c@mp'].enabled).toBe(false)
  })
})

describe('project detail plugins: the effective enabled set (local > project > user)', () => {
  let proj: string
  beforeEach(() => {
    proj = join(dir, 'myproj')
    mkdirSync(proj, { recursive: true })
    mkInstalled({ 'p@mp': [{ scope: 'user', version: '1.0.0', installPath: '/x' }] })
  })

  it('F1 an explicit false at the project layer overrides a true at the user layer, and the local layer overrides the project layer in turn', () => {
    mkUserSettings({ 'p@mp': true })
    mkProjSettings(proj, 'settings.json', { 'p@mp': false })
    let d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: false, enabledFrom: 'project' })
    mkProjSettings(proj, 'settings.local.json', { 'p@mp': true })
    d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'local' })
  })

  it('F1 mentioned in no layer → not enabled (enabledFrom null); enabled only at the user layer → user takes effect', () => {
    let d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: false, enabledFrom: null })
    mkUserSettings({ 'p@mp': true })
    d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'user' })
  })

  it('F2 corrupt project-layer settings → that layer is skipped and it degrades to the user layer, without crashing', () => {
    mkUserSettings({ 'p@mp': true })
    mkdirSync(join(proj, '.claude'), { recursive: true })
    writeFileSync(join(proj, '.claude', 'settings.json'), '{broken json')
    const d = readProjectDetail(roots(), proj)
    expect(d.plugins[0]).toMatchObject({ enabled: true, enabledFrom: 'user' })
  })

  it('F3 acceptance: a project-scope install → not enabled on the global page, enabled in the owning project\'s detail (the project layer)', async () => {
    const demo = join(dir, 'demo')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'superpowers@official': [
        { scope: 'project', version: '6.2.0', installPath: '/cache/sp', projectPath: demo }
      ]
    })
    mkProjSettings(demo, 'settings.json', { 'superpowers@official': true })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.plugins.find((p) => p.name === 'superpowers@official')?.enabled).toBe(false)
    const d = readProjectDetail(roots(), demo)
    expect(d.plugins.find((p) => p.name === 'superpowers@official')).toMatchObject({
      enabled: true,
      enabledFrom: 'project'
    })
  })
})

// ── Expanding bundled components (E5–E7) and enumerating Codex plugins (E8) ──

/** Build a plugin package directory with skills / agents / hooks / manifest as needed */
function mkPluginPkg(root: string): void {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  // The manifest: inline mcpServers plus a hooks field pointing at an extra file (the string form of the
  // three)
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({
      name: 'pkg',
      mcpServers: { 'pkg-server': { command: 'npx' } },
      hooks: './extra-hooks.json'
    })
  )
  writeFileSync(
    join(root, 'extra-hooks.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } })
  )
  // The directory convention for hooks
  mkdirSync(join(root, 'hooks'), { recursive: true })
  writeFileSync(
    join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: 'startup|clear', hooks: [] }],
        PostToolUse: [{ matcher: 'Write', hooks: [] }, { matcher: 'Edit', hooks: [] }]
      }
    })
  )
  // skills: one normal and one broken (with no description line)
  mkdirSync(join(root, 'skills', 'good-skill'), { recursive: true })
  writeFileSync(join(root, 'skills', 'good-skill', 'SKILL.md'), '---\ndescription: good skill\n---\nbody')
  mkdirSync(join(root, 'skills', 'broken-skill'), { recursive: true })
  writeFileSync(join(root, 'skills', 'broken-skill', 'SKILL.md'), ' binary garbage')
  // agents
  mkdirSync(join(root, 'agents'), { recursive: true })
  writeFileSync(join(root, 'agents', 'helper.md'), '---\ndescription: h\n---\nx')
}

describe('expanding a plugin\'s bundled components', () => {
  it('E5 the directory convention merged with manifest fields: skills/agents/hooks/mcp; one corrupt file keeps its entry name', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({ 'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    const snap = await scan(roots(), { now: () => 1 })
    const c = snap.global.plugins[0].contents
    expect(c.missing).toBe(false)
    expect(c.skills.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: 'broken-skill', description: null },
      { name: 'good-skill', description: 'good skill' }
    ])
    // H1: each summary carries stat-only package stats
    expect(c.skills[0].pkg?.files).toBeGreaterThanOrEqual(1)
    expect(c.agents).toEqual(['helper'])
    // hooks: the directory convention (SessionStart ×1, PostToolUse ×2) plus the extra file the manifest
    // points at (PreToolUse ×1)
    const hooks = Object.fromEntries(c.hooks.map((h) => [h.event, h.matchers]))
    expect(hooks).toEqual({ PostToolUse: 2, PreToolUse: 1, SessionStart: 1 })
    expect(c.mcp).toEqual(['pkg-server'])
  })

  it('a manifest field pointing outside the package (../) → ignored, with no out-of-package file read', async () => {
    const pkg = join(dir, 'pkg-root')
    mkdirSync(join(pkg, '.claude-plugin'), { recursive: true })
    writeFileSync(
      join(pkg, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'evil', hooks: '../outside-hooks.json', mcpServers: '../outside-mcp.json' })
    )
    // Both files really exist outside the package — reading either of them would be a path escape
    writeFileSync(
      join(dir, 'outside-hooks.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'x', hooks: [] }] } })
    )
    writeFileSync(join(dir, 'outside-mcp.json'), JSON.stringify({ mcpServers: { leaked: {} } }))
    mkInstalled({ 'evil@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    const snap = await scan(roots(), { now: () => 1 })
    const c = snap.global.plugins[0].contents
    expect(c.hooks).toEqual([])
    expect(c.mcp).toEqual([])
  })

  it('E6 a missing installPath or directory → contents.missing, with the list row kept', async () => {
    mkInstalled({ 'ghost@mp': [{ scope: 'user', version: '0.1.0', installPath: '/gone/away' }] })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.plugins[0].contents.missing).toBe(true)
  })
})

describe('the G series: a plugin\'s bundled skills joining the Skills effective view', () => {
  it('G1/G4 only user-layer enabled plugins\' skills enter the global view: namespaced entries, sides always claude, origin=plugin', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({
      'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }],
      'off@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }]
    })
    mkUserSettings({ 'pkg@mp': true }) // off@mp is not enabled → its skills do not appear
    const snap = await scan(roots(), { now: () => 1 })
    const pluginSkills = snap.global.skills.filter((s) => s.origin === 'plugin')
    expect(pluginSkills.map((s) => s.name).sort()).toEqual(['pkg:broken-skill', 'pkg:good-skill'])
    expect(pluginSkills[0].sides).toEqual(['claude'])
    expect(pluginSkills[0].pluginName).toBe('pkg@mp')
    // G3 equal-footing preview: a joined entry carries package stats and the summary-source package root
    // (ADR-0012)
    expect(pluginSkills[0].pkg.claude?.files).toBeGreaterThanOrEqual(1)
    expect(pluginSkills[0].pluginRoot).toBe(pkg)
    // The bare skill name is sent down with the entry (the UI no longer parses it back from the colon)
    expect(pluginSkills[0].pluginSkillName).toBe('broken-skill')
  })

  it('G2 no shadowing against an on-disk skill of the same name: namespace isolation keeps two independent entries', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    mkInstalled({ 'pkg@mp': [{ scope: 'user', version: '1.0.0', installPath: pkg }] })
    mkUserSettings({ 'pkg@mp': true })
    // An on-disk global library skill with the same base name
    const sd = join(dir, '.claude', 'skills', 'good-skill')
    mkdirSync(sd, { recursive: true })
    writeFileSync(join(sd, 'SKILL.md'), '---\ndescription: on-disk version\n---\nx')
    const snap = await scan(roots(), { now: () => 1 })
    const names = snap.global.skills.map((s) => s.name)
    expect(names).toContain('good-skill')
    expect(names).toContain('pkg:good-skill')
    const disk = snap.global.skills.find((s) => s.name === 'good-skill')
    expect(disk?.origin).toBe('disk')
  })

  it('G1 the detail page\'s rule: this project\'s effective enabled set decides whether a plugin\'s skills appear (enabled at the project layer is enough)', async () => {
    const pkg = join(dir, 'pkg-root')
    mkPluginPkg(pkg)
    const demo = join(dir, 'demo')
    mkdirSync(demo, { recursive: true })
    mkInstalled({
      'pkg@mp': [{ scope: 'project', version: '1.0.0', installPath: pkg, projectPath: demo }]
    })
    mkProjSettings(demo, 'settings.json', { 'pkg@mp': true })
    // Not enabled at the user layer: it does not appear on the global page
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.skills.some((s) => s.origin === 'plugin')).toBe(false)
    // demo's detail: it appears with level=plugin
    const d = readProjectDetail(roots(), demo)
    const ps = d.skills.filter((s) => s.origin === 'plugin')
    expect(ps.map((s) => s.name).sort()).toEqual(['pkg:broken-skill', 'pkg:good-skill'])
    expect(ps[0].level).toBe('plugin')
    // G3 equal-footing preview: a detail plugin entry carries package stats and the summary-source package
    // root (ADR-0012)
    expect(ps[0].pkg?.files).toBeGreaterThanOrEqual(1)
    expect(ps[0].pluginRoot).toBeTruthy()
    expect(ps[0].pluginSkillName).toBe('broken-skill')
    // Another project's detail: it does not appear
    const other = join(dir, 'other')
    mkdirSync(other, { recursive: true })
    expect(readProjectDetail(roots(), other).skills.some((s) => s.origin === 'plugin')).toBe(false)
  })
})

describe('E8 enumerating the Codex plugin cache', () => {
  it('E10 one unreadable marketplace directory → skip it and enumerate the rest as usual (never emptying the whole group)', async () => {
    // chmod 000 does not block reads as root, so that environment is skipped explicitly rather than faking
    // a green
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    const cache = join(dir, '.codex', 'plugins', 'cache')
    mkdirSync(join(cache, 'good', 'ok-plugin', '1.0.0'), { recursive: true })
    mkdirSync(join(cache, 'broken', 'x', '1.0.0'), { recursive: true })
    const { chmodSync } = await import('node:fs')
    chmodSync(join(cache, 'broken'), 0o000)
    try {
      const snap = await scan(roots(), { now: () => 1 })
      expect(snap.global.codexPlugins.map((p) => p.name)).toContain('ok-plugin')
    } finally {
      chmodSync(join(cache, 'broken'), 0o755) // Restore it so afterEach's cleanup does not fail
    }
  })

  it('enumerates the three directory levels; several versions take the highest with a count; a missing or empty cache root → an empty array', async () => {
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.global.codexPlugins).toEqual([])
    const cache = join(dir, '.codex', 'plugins', 'cache')
    mkdirSync(join(cache, 'local', 'codex-helper', '0.3.2'), { recursive: true })
    mkdirSync(join(cache, 'official', 'superpowers', '6.1.0'), { recursive: true })
    mkdirSync(join(cache, 'official', 'superpowers', '6.2.0'), { recursive: true })
    snap = await scan(roots(), { now: () => 1 })
    expect(
      snap.global.codexPlugins.map(({ name, marketplace, version, cachedVersions }) => ({ name, marketplace, version, cachedVersions }))
    ).toEqual([
      { name: 'codex-helper', marketplace: 'local', version: '0.3.2', cachedVersions: 1 },
      { name: 'superpowers', marketplace: 'official', version: '6.2.0', cachedVersions: 2 }
    ])
    // E8: root = the highest version cache directory (the summary-source package root); no skills
    // directory → an empty list
    expect(snap.global.codexPlugins[1].root).toBe(join(cache, 'official', 'superpowers', '6.2.0'))
    expect(snap.global.codexPlugins[0].skills).toEqual([])
  })
})

describe('plugin skill preview: enumeration and stats (plugins-view H1/H5/E8)', () => {
  it('Claude contents.skills carries package stats; a wholly missing package sets missing with skills empty', async () => {
    const pkg = join(dir, 'cache', 'sp')
    mkdirSync(join(pkg, 'skills', 'brainstorming', 'references'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: ask before acting\n---\nbody\n')
    writeFileSync(join(pkg, 'skills', 'brainstorming', 'references', 'a.md'), 'x\n')
    mkInstalled({
      'sp@official': [{ scope: 'user', installPath: pkg, version: '1.0.0' }],
      'ghost@old': [{ scope: 'user', installPath: join(dir, 'gone'), version: '1.0.0' }]
    })
    const snap = await scan(roots(), { now: () => 1 })
    const sp = snap.global.plugins.find((p) => p.name === 'sp@official')!
    const sk = sp.contents.skills[0]
    expect(sk).toMatchObject({ name: 'brainstorming', description: 'ask before acting' })
    expect(sk.pkg?.files).toBe(2)
    expect(sk.pkg!.bytes).toBeGreaterThan(0)
    const ghost = snap.global.plugins.find((p) => p.name === 'ghost@old')!
    expect(ghost.contents.missing).toBe(true)
    expect(ghost.contents.skills).toEqual([])
  })

  it('a Codex entry enumerates the skills under the highest version\'s package root (E8, the same directory convention as Claude)', async () => {
    const base = join(dir, '.codex', 'plugins', 'cache', 'openai-bundled', 'documents')
    for (const v of ['1.0.0', '2.0.0']) {
      mkdirSync(join(base, v, 'skills', 'documents'), { recursive: true })
      writeFileSync(join(base, v, 'skills', 'documents', 'SKILL.md'), `---\ndescription: v${v}\n---\n`)
    }
    const snap = await scan(roots(), { now: () => 1 })
    const cx = snap.global.codexPlugins.find((p) => p.name === 'documents')!
    expect(cx.version).toBe('2.0.0')
    expect(cx.root).toBe(join(base, '2.0.0'))
    expect(cx.skills[0]).toMatchObject({ name: 'documents', description: 'v2.0.0' })
    expect(cx.skills[0].pkg?.files).toBe(1)
  })

  it('a detail plugin entry carries the summary-source package root (H5)', () => {
    const proj = join(dir, 'proj')
    mkdirSync(proj, { recursive: true })
    const pkg = join(dir, 'cache', 'ct')
    mkdirSync(join(pkg, 'skills', 'x'), { recursive: true })
    writeFileSync(join(pkg, 'skills', 'x', 'SKILL.md'), '#\n')
    mkInstalled({ 'ct@local': [{ scope: 'user', installPath: pkg, version: '1' }] })
    const d = readProjectDetail(roots(), proj)
    const p = d.plugins.find((x) => x.name === 'ct@local')!
    expect(p.installPath).toBe(pkg)
    expect(p.contents.skills[0].pkg?.files).toBe(1)
  })
})
