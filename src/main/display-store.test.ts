// The filesystem store seam: no Electron or private-state access. Full-process restoration is e2e.
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { emptySnapshot } from '@shared/domain'
import { emptyDisplayData } from '@shared/display-data'
import { DisplayStore } from './display-store'
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
function dir(): string { const d = mkdtempSync(join(tmpdir(), 'agentshed-display-')); dirs.push(d); return d }
it('restores the successful snapshot after a normal flush and a new store instance', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(123456)
  store.save(data)
  await store.flush()
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(123456)
})

it('drops a corrupt snapshot leaf without losing an independently valid preview', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(100)
  data.reads = [{ kind: 'artifactContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }]
  store.save(data)
  await store.flush()
  // Corruption enters at the filesystem boundary, not through a fabricated private state.
  const file = join(root, 'display-cache.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { data: { snapshot: { global: { skills: unknown[] } } } }
  raw.data.snapshot.global.skills = [null]
  writeFileSync(file, JSON.stringify(raw))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot).toBeNull()
  expect(restored.reads).toEqual([{ kind: 'artifactContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }])
})

it('coalesces pending writes and flushes the newest successful payload', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(10)
  store.save(data)
  const flushing = store.flush()
  data.snapshot = emptySnapshot(20)
  store.save(data)
  await flushing
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(20)
})

it('a failed atomic write retains the previous disk copy and can later retry', async () => {
  const root = dir(), store = new DisplayStore(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(10)
  store.save(data)
  await store.flush()
  // A directory at the temporary file's location makes writeFile fail on every platform.
  const obstruction = join(root, `.display-cache.json.tmp-${process.pid}`)
  mkdirSync(obstruction)
  data.snapshot = emptySnapshot(20)
  store.save(data)
  await expect(store.flush()).rejects.toThrow()
  expect(store.get().snapshot?.scannedAt).toBe(20)
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(10)
  rmSync(obstruction, { recursive: true })
  await store.flush()
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(20)
})

it.each(['{broken', '{"version":999,"data":{}}'])('an unreadable display envelope falls back to cold start: %s', content => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), content)
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})

it('isolates a saved page whose numeric data overflowed JSON without discarding another preview', () => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), reads: [
      { kind: 'sessionPage', file: '/session.jsonl', data: {
        file: '/session.jsonl', side: 'claude', revision: 'page', title: 'Question', at: 1,
        tokens: 'OVERFLOW', bytes: 100, forkState: 'none', forkPoints: 0,
        forkParentTitle: null, forkParentFile: null, questions: []
      } },
      { kind: 'artifactContent', file: '/good.md', data: { text: 'Good body', truncated: false } }
    ]
  } }).replace('"OVERFLOW"', '1e400'))
  expect(new DisplayStore(root).get().reads.map(r => r.kind)).toEqual(['artifactContent'])
})

// A project detail saved by a version whose memory had no main-file entry (the installed app's own cache holds
// `memory: { main, topics }`): it still restores, its main file not yet listed, until the live read replaces it
// (ADR-0029's upgrade case; memory-view, Implementation Decisions). A malformed entry is still dropped.
it('restores a project detail saved before its memory carried the main file entry', () => {
  const root = dir()
  const detail = (memory: Record<string, unknown>) => ({
    path: '/p', skills: [], subagents: [], memory, plugins: [], mcp: [],
    configs: { claudeMd: null, agentsMd: null, settingsSummary: null }, stats: null, artifacts: []
  })
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), reads: [
      { kind: 'projectDetail', path: '/p', data: detail({
        main: { text: 'Saved main body', truncated: false },
        topics: [{ name: 't.md', file: '/m/t.md', mtimeMs: 1 }]
      }) },
      { kind: 'projectDetail', path: '/q', data: { ...detail({ main: null, mainFile: 7, topics: [] }), path: '/q' } }
    ]
  } }))
  const reads = new DisplayStore(root).get().reads
  expect(reads.map((r) => r.kind === 'projectDetail' && r.path)).toEqual(['/p'])
  const restored = reads[0]
  if (restored.kind !== 'projectDetail') throw new Error('expected the saved project detail')
  expect(restored.data.memory.mainFile).toBeNull()
  expect(restored.data.memory.main?.text).toBe('Saved main body')
})

// project-detail::REQ-002/AC-02 across an update: every project detail in this machine's display cache on 2026-10-29
// (27 of them) holds `configs: { claudeMd, agentsMd, settingsSummary }`, the two files as contents with no path
// ({ text, truncated } or null: both files in 3, AGENTS.md only in 3, CLAUDE.md only in 3, neither in 18) and the
// summary as a string or null. They restore with each present file given its path in the project — the only place
// the project's own two files live — an absent one staying absent, and without the summary, until the live read
// replaces them (the 2026-10-21 postmortem's rule). A malformed one is still dropped.
it('restores a project detail saved before configuration entries carried their paths', () => {
  const root = dir()
  const saved = (path: string, configs: Record<string, unknown>) => ({ kind: 'projectDetail', path, data: {
    path, skills: [], subagents: [], memory: { main: null, mainFile: null, topics: [] }, plugins: [], mcp: [],
    configs, stats: null, artifacts: []
  } })
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), reads: [
      saved('/w/p', {
        claudeMd: { text: '# Saved conventions', truncated: false },
        agentsMd: { text: '# Saved agent notes', truncated: true },
        settingsSummary: '{\n  "allowedTools": []\n}'
      }),
      saved('/w/r', { claudeMd: null, agentsMd: { text: '# Only agent notes', truncated: false }, settingsSummary: null }),
      saved('/w/s', { claudeMd: { text: '# Only conventions', truncated: false }, agentsMd: null, settingsSummary: '{}' }),
      saved('/w/q', { claudeMd: 7, agentsMd: null, settingsSummary: null })
    ]
  } }))
  const reads = new DisplayStore(root).get().reads
  expect(reads.map((r) => r.kind === 'projectDetail' && r.path)).toEqual(['/w/p', '/w/r', '/w/s'])
  const configs = reads.map((r) => (r.kind === 'projectDetail' ? r.data.configs : null))
  expect(configs).toEqual([
    {
      claudeMd: { file: '/w/p/CLAUDE.md', content: { text: '# Saved conventions', truncated: false } },
      agentsMd: { file: '/w/p/AGENTS.md', content: { text: '# Saved agent notes', truncated: true } }
    },
    { claudeMd: null, agentsMd: { file: '/w/r/AGENTS.md', content: { text: '# Only agent notes', truncated: false } } },
    { claudeMd: { file: '/w/s/CLAUDE.md', content: { text: '# Only conventions', truncated: false } }, agentsMd: null }
  ])
})

// agents-overview::REQ-004 across an update: the snapshot in this machine's display cache on 2026-10-29 holds
// `global.claudeGlobalMd` and `global.codexAgentsMd` as contents with no path, and `global.codexConfigSummary`. The
// main process knows where those two files are, so it restores them as the two entries' files, at its own paths,
// and drops the summary. The parts of the snapshot this change does not touch come from the current type, so another
// change to them cannot turn this case red for a reason that is not this one.
it('restores a snapshot saved before configuration entries carried their paths, at the paths the main process gives', () => {
  const root = dir()
  const paths = { claudeMd: '/h/.claude/CLAUDE.md', codexAgentsMd: '/h/.codex/AGENTS.md' }
  const savedSnapshot = (claudeGlobalMd: unknown, codexAgentsMd: unknown): unknown => {
    const snap = emptySnapshot(77) as unknown as { global: Record<string, unknown> }
    delete snap.global.claudeMd
    delete snap.global.agentsMd
    return { ...snap, global: { ...snap.global, claudeGlobalMd, codexAgentsMd,
      codexConfigSummary: { model: 'gpt-5.5-codex', projectCount: 18, mcpCount: 2 } } }
  }
  const writeCache = (snapshot: unknown): void => writeFileSync(join(root, 'display-cache.json'),
    JSON.stringify({ version: 1, data: { ...emptyDisplayData(), snapshot } }))

  writeCache(savedSnapshot({ text: '# Global rules', truncated: false }, { text: '# Codex global', truncated: true }))
  const restored = new DisplayStore(root, paths).get().snapshot
  expect(restored?.scannedAt).toBe(77)
  expect(restored?.global.claudeMd).toEqual({ file: '/h/.claude/CLAUDE.md', content: { text: '# Global rules', truncated: false } })
  expect(restored?.global.agentsMd).toEqual([{ file: '/h/.codex/AGENTS.md', content: { text: '# Codex global', truncated: true } }])
  for (const k of ['claudeGlobalMd', 'codexAgentsMd', 'codexConfigSummary']) expect(restored?.global).not.toHaveProperty(k)
  // Without the paths (the preload's parse, which only ever sees what the main process already converted) the old
  // shape cannot be completed, and is dropped rather than shown without its headings
  expect(new DisplayStore(root).get().snapshot).toBeNull()

  writeCache(savedSnapshot(null, null))
  const none = new DisplayStore(root, paths).get().snapshot
  expect(none?.global.claudeMd).toBeNull()
  expect(none?.global.agentsMd).toEqual([])
})

// session-view::CON-003: session pages saved before the session ID was kept (the shape of the seven saved pages in
// this machine's display cache on 2026-10-28 — no sessionId) restore with it filled in: a Claude Code or Grok page by
// its path, a Codex page with none, so it shows the unavailable form until the live page replaces it. A malformed ID
// is still dropped.
it('restores session pages saved before the session ID was kept, filling the ID in from the path where the path holds it', () => {
  const root = dir()
  const page = (file: string, side: string, extra: Record<string, unknown> = {}) => ({ kind: 'sessionPage', file, data: {
    revision: `rev-${side}`, file, side, title: 'Saved title', at: 1, tokens: 10, bytes: 100, forkState: 'none',
    forkPoints: 0, forkParentTitle: null, forkParentFile: null,
    questions: [{ revision: `q-${side}`, i: 1, text: 'Saved question', at: 1, tools: 0, subagents: 0 }], ...extra
  } })
  const claude = '/Users/x/.claude/projects/-Users-x-work-p/6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b.jsonl'
  const grok = '/Users/x/.grok/sessions/%2FUsers%2Fx%2Fwork%2Fp/019fd1e2-1042-7c12-94e9-15b9d0ad23ec/updates.jsonl'
  const codex = '/Users/x/.codex/sessions/2026/10/26/rollout-2026-10-26T14-08-07-01a1250a-7662-7e30-a170-62f43cb935cc.jsonl'
  const malformed = '/Users/x/.claude/projects/-Users-x-work-p/0a0a0a0a-0000-4000-8000-000000000000.jsonl'
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), reads: [page(claude, 'claude'), page(grok, 'grok'), page(codex, 'codex'), page(malformed, 'claude', { sessionId: 7 })]
  } }))
  const ids = new DisplayStore(root).get().reads.map((r) => r.kind === 'sessionPage' ? [r.file, r.data.sessionId] : null)
  expect(ids).toEqual([
    [claude, '6b3f2a10-4c5d-4e6f-8a7b-9c0d1e2f3a4b'],
    [grok, '019fd1e2-1042-7c12-94e9-15b9d0ad23ec'],
    [codex, null]
  ])
})

// A display cache written before Antigravity CLI joined the side set (the key sets of this machine's real cache on
// 2026-10-29: every per-side Record — the snapshot's sides, every token block's bySide and its days' bySide, each
// global skill's symlink and pkg — holds claude, codex and grok only). The contract now asks for every side, so
// without filling the new one in, the first launch after the update would drop every saved page (CONTEXT, "a page
// switch is atomic": a field added to a saved type is filled in on restore). A malformed entry is still dropped.
function withoutSide<T>(v: T, side: string): T {
  return JSON.parse(JSON.stringify(v), (k, val: unknown) => (k === side ? undefined : val)) as T
}
function savedBeforeTheSide(): Record<string, unknown> {
  const snap = emptySnapshot(500)
  snap.projects = [{ path: '/p', name: 'p', sides: ['claude'], stale: false, lastSessionAt: 1, sessionCount: 1 }]
  snap.tokens.byDay = [{ day: '2026-10-28', bySide: { claude: 5, codex: 0, grok: 0, antigravity: 0 }, byProvider: { Anthropic: 5 } }]
  snap.global.skills = [{
    name: 's', description: null, sides: ['claude'], symlink: { claude: false, codex: false, grok: false, antigravity: false },
    pkg: { claude: { files: 1, bytes: 2 }, codex: null, grok: null, antigravity: null }, origin: 'disk', pluginName: null,
    pluginRoot: null, pluginSkillName: null
  }]
  const stats = { tokens: snap.tokens, sessions: [] }
  const detail = { path: '/p', skills: [], subagents: [], memory: { main: null, mainFile: null, topics: [] }, plugins: [], mcp: [],
    configs: { claudeMd: null, agentsMd: null, settingsSummary: null }, stats, artifacts: [] }
  // A cache that old predates Antigravity CLI's components too (#325), so neither key is in it
  return withoutSide(withoutSide({ ...emptyDisplayData(), snapshot: snap, stats: [['/p', stats]],
    reads: [{ kind: 'projectDetail', path: '/p', data: detail }] }, 'antigravity'), 'antigravityPlugins')
}

it('restores a display cache saved before the Antigravity side, with that side filled in rather than the pages dropped', () => {
  const root = dir()
  const saved = savedBeforeTheSide()
  expect(JSON.stringify(saved)).not.toContain('antigravity')
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: saved }))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot?.scannedAt).toBe(500)
  expect(restored.snapshot?.sides.antigravity).toEqual({ detected: false })
  expect(restored.snapshot?.tokens.bySide.antigravity).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 })
  expect(restored.snapshot?.tokens.byDay[0].bySide).toEqual({ claude: 5, codex: 0, grok: 0, antigravity: 0 })
  expect(restored.snapshot?.global.skills[0].symlink.antigravity).toBe(false)
  expect(restored.snapshot?.global.skills[0].pkg.antigravity).toBeNull()
  expect(restored.stats.map(([p, s]) => [p, s.tokens.bySide.antigravity.total])).toEqual([['/p', 0]])
  const detail = restored.reads[0]
  if (detail?.kind !== 'projectDetail') throw new Error('expected the saved project detail')
  expect(detail.data.stats?.tokens.bySide.antigravity.total).toBe(0)
})

// A display cache written after Antigravity CLI joined the sides but before its components were read (#325): the side
// is in every per-side Record, while the global layer has no Antigravity plugins, its subagents no Antigravity
// definition and none of their definitions agy's two front matter fields, and its MCP entries no disabled flag or
// plugin. Each is filled in with what a scan without those components produces, rather than the saved pages dropped.
function savedBeforeTheComponents(): Record<string, unknown> {
  const snap = emptySnapshot(700) as unknown as { global: Record<string, unknown> }
  const detail = (text: string): Record<string, unknown> =>
    ({ content: { text, truncated: false }, description: null, tools: null, model: null, sandbox: null, error: null })
  delete snap.global['antigravityPlugins']
  snap.global['subagents'] = [{ name: 'code-reviewer', sides: ['claude'], description: null, claude: detail('saved'), codex: null, overridesBuiltin: false }]
  snap.global['mcp'] = [{ name: 'figma', side: 'claude', source: 'global-config' }]
  const page = { path: '/p', skills: [], memory: { main: null, mainFile: null, topics: [] }, plugins: [], mcp: [], artifacts: [], stats: null,
    configs: { claudeMd: null, agentsMd: null, settingsSummary: null },
    subagents: [{ name: 'r', side: 'claude', level: 'project', description: null, detail: detail('page'), shadows: false, shadowed: false, overridesBuiltin: false }] }
  return { ...emptyDisplayData(), snapshot: snap, reads: [{ kind: 'projectDetail', path: '/p', data: page }] }
}

it('restores a display cache saved before Antigravity CLI\'s components, filling in what that version did not have', () => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: savedBeforeTheComponents() }))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot?.scannedAt).toBe(700)
  expect(restored.snapshot?.global.antigravityPlugins).toEqual([])
  expect(restored.snapshot?.global.mcp).toEqual([{ name: 'figma', side: 'claude', source: 'global-config', disabled: false, plugin: null }])
  const sub = restored.snapshot?.global.subagents[0]
  expect(sub?.antigravity).toBeNull()
  expect([sub?.claude?.subagent, sub?.claude?.mainAgent, sub?.claude?.content?.text]).toEqual([null, null, 'saved'])
  const page = restored.reads[0]
  if (page?.kind !== 'projectDetail') throw new Error('expected the saved project detail')
  expect([page.data.subagents[0].detail.subagent, page.data.subagents[0].detail.mainAgent]).toEqual([null, null])
})

it('still drops a saved snapshot whose Antigravity plugins are present but malformed', () => {
  const root = dir()
  const saved = savedBeforeTheComponents() as { snapshot: { global: Record<string, unknown> } }
  saved.snapshot.global['antigravityPlugins'] = [{ name: 'flutter' }]
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: saved }))
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})

it('still drops a saved snapshot whose entry for the side is present but malformed', () => {
  const root = dir()
  const saved = savedBeforeTheSide() as { snapshot: { sides: Record<string, unknown> } }
  saved.snapshot.sides['antigravity'] = 7
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: saved }))
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})

// The count of Antigravity conversations a scan could not read is part of the saved snapshot, so the side card's
// notice is back at the next launch before its first scan (token-stats::REQ-004/AC-02, ADR-0029); a malformed count is
// a corrupt leaf and drops the snapshot
it('restores a saved snapshot carrying the count of unreadable Antigravity conversations, and drops one whose count is malformed', () => {
  const root = dir()
  const snap = emptySnapshot(700)
  snap.sides.antigravity = { detected: true, unreadable: 2 }
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: { ...emptyDisplayData(), snapshot: snap } }))
  expect(new DisplayStore(root).get().snapshot?.sides.antigravity).toEqual({ detected: true, unreadable: 2 })
  const bad = JSON.parse(JSON.stringify(snap)) as { sides: { antigravity: Record<string, unknown> } }
  bad.sides.antigravity['unreadable'] = 'x'
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: { ...emptyDisplayData(), snapshot: bad } }))
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})
