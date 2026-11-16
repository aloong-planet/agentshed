// The filesystem store seam: no Electron or private-state access. Full-process restoration is e2e.
import { chmodSync, mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { emptySnapshot, emptyTokenStats, zeroBySide } from '@shared/domain'
import type { AgentSide, ProjectDetail, ProjectStats, SessionPage, SessionTurn, Snapshot, UsageRow } from '@shared/domain'
import { emptyDisplayData, type DisplayData, type SavedRead } from '@shared/display-data'
import { AGENT_SIDES } from '@shared/validate'
import { errorText } from '@shared/error-text'
import { ERR, appError } from '@shared/errors'
import { loadEngineModule } from './engine-module'
import { TEST_ENGINE } from './testing/engine'
import { DisplayStore, engineWrite, type DisplayWrite } from './display-store'
import { ReadRegistry } from './read-registrations'
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
function dir(): string { const d = mkdtempSync(join(tmpdir(), 'agentshed-display-')); dirs.push(d); return d }

// ── The display copy's writer, the engine module (ADR-0045): what it leaves on disk ──

const engine = loadEngineModule(TEST_ENGINE)

/** Every number form ECMAScript's Number::toString has, the edges of each, and doubles drawn from every exponent */
function numbers(): number[] {
  const fixed = [0, -0, 1, -1, 42, 2 ** 31, 2 ** 53 - 1, 2 ** 53, 2 ** 53 + 2, 2 ** 60, 1e20, 1e21, 123e19, 1.5e21, 0.1, 0.1 + 0.2,
    123.456, -123.456, 1e-6, 1.5e-6, 1e-7, 1.5e-7, 9.99e-7, 5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, -1e300,
    1 / 3, 100.5, 1772870400000, 0.000001234, NaN, Infinity, -Infinity,
    // Halfway between two shortest decimals, …853.2 and …853.3: the even one is ECMAScript's
    667082108456853.25]
  const drawn = new Float64Array(2000)
  const bits = new BigUint64Array(drawn.buffer)
  // A fixed generator, so that a failure names the same doubles every run
  let state = 0x9e3779b97f4a7c15n
  for (let i = 0; i < bits.length; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn
    bits[i] = state
  }
  return [...fixed, ...drawn]
}

/** `levels` containers, arrays and objects in turn, each the only element or member of the one around it */
function nested(levels: number): unknown {
  let value: unknown = []
  for (let i = 1; i < levels; i++) value = i % 2 === 1 ? { in: value } : [value]
  return value
}

/** A value of every kind JSON holds, and of every kind JSON.stringify leaves out of one without failing */
function everyKind(): unknown {
  const strings = ['plain', 'quote " backslash \\ slash /', '\b\f\n\r\t', '\u0000\u0001\u001f\u007f', 'line\u2028para\u2029', 'café \u6f22\u5b57',
    '😀 emoji', 'lone high \ud83d', 'lone low \ude00', 'reversed \ude00\ud83d', '\ud83d😀', '']
  // A hole at index 3
  const elements: unknown[] = [undefined, () => 1, Symbol('s')]
  elements[4] = 'after a hole'
  // Its members are its own enumerable ones, as Object.keys gives them: an inherited member and a hidden one are left out
  const ownKeys = Object.create({ inherited: 1 }) as Record<string, unknown>
  Object.defineProperty(ownKeys, 'hidden', { value: 2, enumerable: false })
  ownKeys['own'] = 3
  return {
    strings,
    numbers: numbers(),
    flags: [true, false, null],
    members: { kept: 1, gone: undefined, fn: () => 1, sym: Symbol('s'), [Symbol('key')]: 2, last: 'x' },
    order: { b: 1, 2: 'two', 1: 'one', a: 2, '-1': 'minus', '01': 'zero-one' },
    elements,
    empty: [{}, [], [[]], { inner: {} }],
    keys: { [strings[7]]: 'lone surrogate key', 'tab\tkey': 1, '': 'empty key', ['k'.repeat(5000)]: 'a long key' },
    // Long strings, each ending in a character JSON escapes, so a string cut short shows. The long key above has already
    // grown the buffer the module reuses past 4,097 units, so only the last is too long to read in one call; the edge at
    // the buffer's starting size is the rows below, each the copy's only string
    long: [4094, 4095, 4096, 4097, 100_000].map((units) => 'x'.repeat(units - 1) + '"'),
    ownKeys,
    // 1,000 levels with the root: the deepest the module writes, as a deeper value stands for a cycle
    deep: nested(999)
  }
}

it.each<[string, () => unknown]>([
  ['a value of every kind JSON holds', everyKind],
  // Each the copy's only string, so that the module reads it into its buffer at the size it starts with: around the
  // length that fills that buffer, and ending in a character JSON escapes, so that a string cut short shows
  ...[4095, 4096, 4097].map((units): [string, () => unknown] => [
    `a string of ${units} code units ending in a lone surrogate`,
    () => 'x'.repeat(units - 1) + String.fromCharCode(0xd83d)
  ])
])('the module writes %s as the text JSON.stringify gives it, byte for byte, into a directory it creates, readable by its user alone', async (_what, make) => {
  const value = make()
  const file = join(dir(), 'missing', 'copy.json')
  await engine.writeDisplayCopy(file, value)
  // As text first, so that a difference shows where it is; the bytes then rule out an invalid sequence read as U+FFFD
  expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(value))
  expect(readFileSync(file).equals(Buffer.from(JSON.stringify(value), 'utf8'))).toBe(true)
  expect(statSync(file).mode & 0o777).toBe(0o600)
  expect(readdirSync(join(file, '..'))).toEqual(['copy.json'])
})

it.each([
  ['a BigInt', (): unknown => ({ n: 1n })],
  ['a cycle', (): unknown => { const a: Record<string, unknown> = {}; a['self'] = { a }; return a }]
])('a value holding %s, which JSON.stringify refuses, fails the write and leaves the copy before it whole', async (_what, make) => {
  const value = make()
  expect(() => JSON.stringify(value)).toThrow(TypeError)
  const root = dir(), file = join(root, 'copy.json')
  writeFileSync(file, 'the copy before')
  await expect(Promise.resolve().then(() => engine.writeDisplayCopy(file, value))).rejects.toThrow()
  expect(readFileSync(file, 'utf8')).toBe('the copy before')
  expect(readdirSync(root)).toEqual(['copy.json'])
})

it('a value nesting deeper than 1,000 levels, which stands for a cycle, fails the write and leaves the copy before it whole, though JSON.stringify writes it', async () => {
  const value = nested(1001)
  expect(() => JSON.stringify(value)).not.toThrow()
  const root = dir(), file = join(root, 'copy.json')
  writeFileSync(file, 'the copy before')
  await expect(Promise.resolve().then(() => engine.writeDisplayCopy(file, value))).rejects.toThrow()
  expect(readFileSync(file, 'utf8')).toBe('the copy before')
  expect(readdirSync(root)).toEqual(['copy.json'])
})
// ── When the store writes the copy (agents-overview::REQ-008, restart sequence items 12 and 14) ──

/** A store writing through the engine module, as the app's does */
function writing(root: string): DisplayStore {
  return new DisplayStore(root, { write: engineWrite(TEST_ENGINE) })
}

/**
 * The engine module's writer as the store's, watched at the filesystem boundary: how many writes the store asked for
 * and how many of them the module has finished, and, with `hold`, each write's outcome kept from the store until
 * `release` — the file itself is written at once, so while held the store has a write under way whose result is
 * already on disk, or whose failure is already decided.
 */
function moduleWriter(hold = false): { write: DisplayWrite; asked: () => number; finished: () => number; release: () => void } {
  const real = engineWrite(TEST_ENGINE)
  let asked = 0, finished = 0
  let release = (): void => {}
  const gate = hold ? new Promise<void>((resolve) => { release = resolve }) : Promise.resolve()
  return {
    write: (file, envelope) => {
      asked++
      const written = real(file, envelope)
      written.then(() => finished++, () => finished++)
      return written.then(() => gate, (error: unknown) => gate.then(() => { throw error }))
    },
    asked: () => asked,
    finished: () => finished,
    release: () => release()
  }
}

const copyAt = (scannedAt: number): DisplayData => ({ ...emptyDisplayData(), snapshot: emptySnapshot(scannedAt) })
/** The scan time of the copy on disk, read as the next launch reads it */
const onDisk = (root: string): number | undefined => new DisplayStore(root).get().snapshot?.scannedAt
/** Long enough for a write the store had scheduled to have been asked for */
const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

it('a change recorded while the window has focus is not written while it keeps focus, and is written as the data stands when the window loses it (agents-overview::REQ-008/AC-01, Startup implementation decisions)', async () => {
  const root = dir(), w = moduleWriter(), store = new DisplayStore(root, { write: w.write })
  store.record(copyAt(1))
  await expect.poll(() => onDisk(root)).toBe(1)
  store.focusChanged(true)
  const data = copyAt(2)
  store.record(data)
  await turn()
  expect(w.asked(), 'no write was asked for while the window had focus').toBe(1)
  expect(onDisk(root)).toBe(1)
  // Changed again after it was recorded: the change was not a copy, so the write takes the data as it stands
  data.snapshot = emptySnapshot(3)
  store.focusChanged(false)
  await expect.poll(() => onDisk(root)).toBe(3)
  expect(w.asked()).toBe(2)
})

it('a change recorded while the window has no focus is written right away: before the window first has focus, and after it loses focus (agents-overview::REQ-008/AC-02)', async () => {
  const root = dir(), store = writing(root)
  store.record(copyAt(1))
  await expect.poll(() => onDisk(root)).toBe(1)
  store.focusChanged(true)
  store.focusChanged(false)
  await turn()
  store.record(copyAt(2))
  await expect.poll(() => onDisk(root)).toBe(2)
})

it.each([
  ['the window losing focus', (store: DisplayStore): void => { store.focusChanged(true); store.record(copyAt(1)); store.focusChanged(false) }],
  ['a change made without focus', (store: DisplayStore): void => { store.record(copyAt(1)) }]
])('%s is written even when the window regains focus before the write begins (agents-overview::REQ-008/AC-01, AC-02)', async (_moment, moment) => {
  const root = dir(), store = writing(root)
  moment(store)
  store.focusChanged(true)
  await expect.poll(() => onDisk(root)).toBe(1)
})

it.skipIf(process.getuid?.() === 0)('a write that fails leaves its change unwritten and the copy on disk as it was, and the next time the window loses focus writes it (agents-overview::REQ-008/AC-05)', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = dir(), store = writing(root)
  try {
    store.record(copyAt(1))
    await expect.poll(() => onDisk(root)).toBe(1)
    // The directory unwritable for one write
    chmodSync(root, 0o555)
    try {
      store.record(copyAt(2))
      await expect.poll(() => logged.mock.calls.length).toBe(1)
    } finally {
      chmodSync(root, 0o755)
    }
    expect(String(logged.mock.calls[0])).toMatch(/\[display-cache\] save failed:.*display-cache\.json failed/)
    expect(onDisk(root)).toBe(1)
    expect(readdirSync(root)).toEqual(['display-cache.json'])
    expect(store.get().snapshot?.scannedAt, 'the app goes on with the data it has').toBe(2)
    store.focusChanged(true)
    store.focusChanged(false)
    await expect.poll(() => onDisk(root)).toBe(2)
  } finally {
    logged.mockRestore()
  }
})

it('a change made while a write is under way goes in the next write, not in the one under way (restart sequence item 12)', async () => {
  const root = dir(), w = moduleWriter(true), store = new DisplayStore(root, { write: w.write })
  store.record(copyAt(1))
  await expect.poll(() => onDisk(root)).toBe(1)
  store.record(copyAt(2))
  await turn()
  expect(w.asked(), 'the store waits for the write under way').toBe(1)
  w.release()
  await expect.poll(() => onDisk(root)).toBe(2)
  expect(w.asked()).toBe(2)
})

it.skipIf(process.getuid?.() === 0)('a change made without focus while a write is under way is written by the next write when the one under way fails (restart sequence item 12, agents-overview::REQ-008/AC-02)', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = dir(), w = moduleWriter(true), store = new DisplayStore(root, { write: w.write })
  try {
    // The write under way fails: the directory is unwritable until the module has tried it
    chmodSync(root, 0o555)
    try {
      store.record(copyAt(1))
      await expect.poll(() => w.finished()).toBe(1)
    } finally {
      chmodSync(root, 0o755)
    }
    store.record(copyAt(2))
    w.release()
    await expect.poll(() => onDisk(root)).toBe(2)
    expect(String(logged.mock.calls[0]), 'the failed write is still told').toMatch(/\[display-cache\] save failed:.*display-cache\.json failed/)
  } finally {
    logged.mockRestore()
  }
})

it('the window gaining focus while a write is under way: the write completes, and a change made from then on waits for the window to lose focus (restart sequence item 12)', async () => {
  const root = dir(), w = moduleWriter(true), store = new DisplayStore(root, { write: w.write })
  store.record(copyAt(1))
  await expect.poll(() => onDisk(root)).toBe(1)
  store.focusChanged(true)
  store.record(copyAt(2))
  w.release()
  await turn()
  expect(w.asked()).toBe(1)
  expect(onDisk(root)).toBe(1)
  store.focusChanged(false)
  await expect.poll(() => onDisk(root)).toBe(2)
})

it('with an engine module that will not load, the copy restores without it, and every write fails with the copy on disk left as it was (restart sequence item 14)', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = dir(), file = join(root, 'display-cache.json')
  writeFileSync(file, JSON.stringify({ version: 1, data: copyAt(1) }))
  const before = readFileSync(file)
  const damaged = join(root, 'agentshed_engine.node')
  writeFileSync(damaged, 'not a library')
  try {
    const store = new DisplayStore(root, { write: engineWrite({ ...TEST_ENGINE, path: damaged }) })
    expect(store.get().snapshot?.scannedAt).toBe(1)
    store.record(copyAt(2))
    await expect.poll(() => logged.mock.calls.length).toBe(1)
    expect(String(logged.mock.calls[0])).toContain(`the engine module will not load from ${damaged}`)
    await expect(store.flush()).rejects.toThrow('will not load')
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(store.get().snapshot?.scannedAt).toBe(2)
  } finally {
    logged.mockRestore()
  }
})

it('drops a corrupt snapshot leaf without losing an independently valid preview', async () => {
  const root = dir(), store = writing(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(100)
  data.reads = [{ kind: 'memoryContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }]
  store.record(data)
  await store.flush()
  // Corruption enters at the filesystem boundary, not through a fabricated private state.
  const file = join(root, 'display-cache.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { data: { snapshot: { global: { skills: unknown[] } } } }
  raw.data.snapshot.global.skills = [null]
  writeFileSync(file, JSON.stringify(raw))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot).toBeNull()
  expect(restored.reads).toEqual([{ kind: 'memoryContent', file: '/viewed.md', data: { text: 'kept preview', truncated: false } }])
})

// agents-overview A3. Corruption's route in, the file: this is what a build from before the error named its file left there
it('a snapshot whose side error still holds the old detail parameter comes back whole, and reads as the sentence alone', async () => {
  const root = dir(), store = writing(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(100)
  data.snapshot.sides.claude.error = { code: ERR.registryParseFailed, params: { path: '/h/.claude.json' } }
  store.record(data)
  await store.flush()
  const file = join(root, 'display-cache.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { data: { snapshot: { sides: { claude: { error: { params: unknown } } } } } }
  const old = { detail: 'SyntaxError: Expected property name in JSON at position 1' }
  raw.data.snapshot.sides.claude.error.params = old
  writeFileSync(file, JSON.stringify(raw))
  const error = new DisplayStore(root).get().snapshot?.sides.claude.error
  expect(error).toEqual({ code: ERR.registryParseFailed, params: old })
  expect(errorText('en', appError(ERR.registryParseFailed, error?.params))).toBe('The registry is corrupt')
})

it('coalesces pending writes and flushes the newest successful payload', async () => {
  const root = dir(), store = writing(root), data = emptyDisplayData()
  data.snapshot = emptySnapshot(10)
  store.record(data)
  const flushing = store.flush()
  store.record(copyAt(20))
  await flushing
  expect(new DisplayStore(root).get().snapshot?.scannedAt).toBe(20)
})

it.each(['{broken', '{"version":999,"data":{}}'])('an unreadable display envelope falls back to cold start: %s', content => {
  const root = dir()
  writeFileSync(join(root, 'display-cache.json'), content)
  expect(new DisplayStore(root).get().snapshot).toBeNull()
})

it('restores a file listing saved before the depth limit went, and one saved after it (skills-view::REQ-003/AC-06)', () => {
  const root = dir()
  const file = { path: 'SKILL.md', absPath: '/k/SKILL.md', bytes: 4, lines: 1, mtimeMs: 5 }
  const before = { kind: 'skillFiles', args: { side: 'claude', name: 'before', scope: 'global' }, data: { files: [file], deep: true, deepPaths: ['a/b/c.md'] } }
  const after = { kind: 'skillFiles', args: { side: 'claude', name: 'after', scope: 'global' }, data: { files: [file] } }
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: { ...emptyDisplayData(), reads: [before, after] } }))
  const reads = new DisplayStore(root).get().reads
  expect(reads.map((r) => (r.kind === 'skillFiles' ? [r.args.name, r.data.files[0].path] : r.kind))).toEqual([
    ['before', 'SKILL.md'],
    ['after', 'SKILL.md']
  ])
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
      { kind: 'memoryContent', file: '/good.md', data: { text: 'Good body', truncated: false } }
    ]
  } }).replace('"OVERFLOW"', '1e400'))
  expect(new DisplayStore(root).get().reads.map(r => r.kind)).toEqual(['memoryContent'])
})

// A project detail saved by a version whose memory had no main-file entry (the installed app's own cache holds
// `memory: { main, topics }`): it still restores, its main file not yet listed, until the live read replaces it
// (ADR-0028's upgrade case; memory-view, Implementation Decisions). A malformed entry is still dropped.
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
it('restores a project detail saved before instruction entries carried their paths', () => {
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

// The read path across the retirement of the project's document list: a display cache saved before it — the shape of
// this machine's on 2026-11-14 — registers memory files and documents under one key, `artifacts`, and saves a read of
// either as `artifactContent`. The scan's registration held only the memory files the snapshot lists (Codex's outside
// a memory directory among them); a project page's held its documents, its memory topics and its main file — the main
// file and one topic written since the scan only there; a skill package's held none. Only a path the restored
// snapshot, a restored project page or the scan's own saved registration lists as a memory file stays readable, or
// keeps its saved read: a document a page listed, and one no page lists any more, are not.
it('restores the memory files a display cache saved before the document list went had registered and read, and none of its documents', () => {
  const root = dir()
  const memory = '/h/.claude/projects/-w-p/memory', main = `${memory}/MEMORY.md`, topic = `${memory}/topic.md`, fresh = `${memory}/fresh.md`
  const codexMain = '/h/.codex/memories/MEMORY.md', codexSummary = '/h/.codex/memories/memory_summary.md'
  const spec = '/w/p/docs/specs/s.md', context = '/w/p/docs/CONTEXT.md', page = '/w/p/docs/prototypes/m/page.html'
  const memoryFile = (file: string) => ({ name: file.slice(file.lastIndexOf('/') + 1), file, mtimeMs: 1 })
  const snapshot = emptySnapshot(100)
  snapshot.global.memory = [
    { side: 'claude', projectPath: '/w/p', projectName: 'p', hasMain: false, files: [memoryFile(topic)], lastModified: 1, stale: false },
    { side: 'codex', projectPath: null, projectName: null, hasMain: false, files: [memoryFile(codexMain), memoryFile(codexSummary)], lastModified: 1, stale: false }
  ]
  const text = (t: string) => ({ text: t, truncated: false })
  const skillOwner = JSON.stringify(['skillFiles', 'claude', 's', 'global', null, null])
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), snapshot,
    registrations: [
      { owner: 'scan', artifacts: [topic, codexMain, codexSummary], pluginRoots: ['/plug'], projects: [], skillFiles: [] },
      { owner: 'project:/w/p', artifacts: [page, spec, context, fresh, topic, main], projects: ['/w/p'], pluginRoots: ['/plug'], skillFiles: [] },
      { owner: skillOwner, skillFiles: ['/s/SKILL.md'], artifacts: [], projects: [], pluginRoots: [] }
    ],
    reads: [
      { kind: 'projectDetail', path: '/w/p', data: {
        path: '/w/p', skills: [], subagents: [], plugins: [], mcp: [], configs: { claudeMd: null, agentsMd: null }, stats: null,
        memory: { main: text('# Index'), mainFile: memoryFile(main), topics: [memoryFile(fresh), memoryFile(topic)] },
        artifacts: [{ type: 'specs', title: 's', file: spec, mtimeMs: 2 }, { type: 'context', title: 'CONTEXT.md', file: context, mtimeMs: 2 },
          { type: 'prototypes', title: 'page', file: page, mtimeMs: 2 }]
      } },
      { kind: 'artifactContent', file: topic, data: text('Saved topic') },
      { kind: 'artifactContent', file: fresh, data: text('Saved fresh topic') },
      { kind: 'artifactContent', file: codexSummary, data: text('Saved summary') },
      { kind: 'artifactContent', file: spec, data: text('Saved spec') },
      { kind: 'artifactContent', file: '/w/q/docs/features/gone.md', data: text('Saved feature') }
    ]
  } }))
  const restored = new DisplayStore(root).get()
  expect(restored.reads).toEqual([
    { kind: 'projectDetail', path: '/w/p', data: {
      path: '/w/p', skills: [], subagents: [], plugins: [], mcp: [], configs: { claudeMd: null, agentsMd: null }, stats: null,
      memory: { main: text('# Index'), mainFile: memoryFile(main), topics: [memoryFile(fresh), memoryFile(topic)] }
    } },
    { kind: 'memoryContent', file: topic, data: text('Saved topic') },
    { kind: 'memoryContent', file: fresh, data: text('Saved fresh topic') },
    { kind: 'memoryContent', file: codexSummary, data: text('Saved summary') }
  ])
  expect(restored.registrations).toEqual([
    { owner: 'scan', memoryFiles: [topic, codexMain, codexSummary], pluginRoots: ['/plug'], projects: [], skillFiles: [] },
    { owner: 'project:/w/p', memoryFiles: [fresh, topic, main], projects: ['/w/p'], pluginRoots: ['/plug'], skillFiles: [] },
    { owner: skillOwner, memoryFiles: [], skillFiles: ['/s/SKILL.md'], projects: [], pluginRoots: [] }
  ])
  const registry = new ReadRegistry(restored.registrations)
  expect([main, topic, fresh, codexSummary, spec, context, page].map((f) => registry.admission('memoryFiles', f)))
    .toEqual(['restored', 'restored', 'restored', 'restored', null, null, null])
  expect(registry.admission('skillFiles', '/s/SKILL.md')).toBe('restored')
})

// The same copy with its snapshot dropped as malformed (agents-overview's restart sequence, item 1): the scan's
// registration only ever held memory files, so they stay memory files, registered and previewed, with no snapshot
// to list them; a document a project page registered still does not.
it('restores the memory files a scan registration saved before the document list went had held, when the saved snapshot is dropped', () => {
  const root = dir()
  const topic = '/h/.claude/projects/-w-p/memory/topic.md', codexSummary = '/h/.codex/memories/memory_summary.md', spec = '/w/p/docs/specs/s.md'
  const snapshot = emptySnapshot(100) as unknown as { global: { skills: unknown[] } }
  snapshot.global.skills = [null]
  const text = (t: string) => ({ text: t, truncated: false })
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: {
    ...emptyDisplayData(), snapshot,
    registrations: [
      { owner: 'scan', artifacts: [topic, codexSummary], pluginRoots: ['/plug'], projects: [], skillFiles: [] },
      { owner: 'project:/w/p', artifacts: [spec, topic], projects: ['/w/p'], pluginRoots: [], skillFiles: [] }
    ],
    reads: [
      { kind: 'artifactContent', file: codexSummary, data: text('Saved summary') },
      { kind: 'artifactContent', file: spec, data: text('Saved spec') }
    ]
  } }))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot).toBeNull()
  expect(restored.reads).toEqual([{ kind: 'memoryContent', file: codexSummary, data: text('Saved summary') }])
  expect(restored.registrations).toEqual([
    { owner: 'scan', memoryFiles: [topic, codexSummary], pluginRoots: ['/plug'], projects: [], skillFiles: [] },
    { owner: 'project:/w/p', memoryFiles: [topic], projects: ['/w/p'], pluginRoots: [], skillFiles: [] }
  ])
})

it('restores a registration this build saved as it was saved, whether or not a restored page lists its memory files', async () => {
  const root = dir(), store = writing(root), data = emptyDisplayData()
  data.registrations = [{ owner: 'project:/w/p', memoryFiles: ['/h/.claude/projects/-w-p/memory/topic.md'], skillFiles: [], projects: ['/w/p'],
    pluginRoots: ['/plug'] }]
  store.record(data)
  await store.flush()
  expect(new DisplayStore(root).get().registrations).toEqual([{ owner: 'project:/w/p', memoryFiles: ['/h/.claude/projects/-w-p/memory/topic.md'],
    skillFiles: [], projects: ['/w/p'], pluginRoots: ['/plug'] }])
})

// agents-overview::REQ-004 across an update: the snapshot in this machine's display cache on 2026-10-29 holds
// `global.claudeGlobalMd` and `global.codexAgentsMd` as contents with no path, and `global.codexConfigSummary`. The
// main process knows where those two files are, so it restores them as the two entries' files, at its own paths,
// and drops the summary. The parts of the snapshot this change does not touch come from the current type, so another
// change to them cannot turn this case red for a reason that is not this one.
it('restores a snapshot saved before instruction entries carried their paths, at the paths the main process gives', () => {
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
  const restored = new DisplayStore(root, { savedInstructionPaths: paths }).get().snapshot
  expect(restored?.scannedAt).toBe(77)
  expect(restored?.global.claudeMd).toEqual({ file: '/h/.claude/CLAUDE.md', content: { text: '# Global rules', truncated: false } })
  expect(restored?.global.agentsMd).toEqual([{ file: '/h/.codex/AGENTS.md', content: { text: '# Codex global', truncated: true } }])
  for (const k of ['claudeGlobalMd', 'codexAgentsMd', 'codexConfigSummary']) expect(restored?.global).not.toHaveProperty(k)
  // Without the paths (the preload's parse, which only ever sees what the main process already converted) the old
  // shape cannot be completed, and is dropped rather than shown without its headings
  expect(new DisplayStore(root).get().snapshot).toBeNull()

  writeCache(savedSnapshot(null, null))
  const none = new DisplayStore(root, { savedInstructionPaths: paths }).get().snapshot
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
// without filling the new one in, the first launch after the update would drop every saved page (the AGENTS.md invariant on
// page switches: a field added to a saved type is filled in on restore). A malformed entry is still dropped.
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
// notice is back at the next launch before its first scan (token-stats::REQ-004/AC-02, ADR-0028); a malformed count is
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

// agents-overview::REQ-005: a display copy a newer build saved, whose side this build does not know. It is made from
// payloads of every saved kind built as this build's types require, with one known side then renamed in every key
// and value to a name outside the set — what a build that knows that side writes, seen from one that does not. The
// shapes follow this machine's display cache probed that way on 2026-10-30: the side survived only as zero buckets
// in records keyed by side, while the snapshot and the one project with real usage of it were dropped.
const NEWER = ((): string => {
  let s = 'side-from-a-newer-build'
  while (AGENT_SIDES.has(s)) s += '+'
  return s
})()
function renameSide(v: unknown, from: string, to: string): unknown {
  if (v === from) return to
  if (Array.isArray(v)) return v.map((x) => renameSide(x, from, to))
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === from ? to : k, renameSide(x, from, to)]))
  return v
}
function mentions(v: unknown, name: string): number {
  if (v === name) return 1
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + mentions(x, name), 0)
  if (typeof v === 'object' && v !== null) return Object.entries(v).reduce((n, [k, x]) => n + (k === name ? 1 : 0) + mentions(x, name), 0)
  return 0
}
const RENAMED: AgentSide = 'grok'
const DAY = '2026-10-28'
function perSide<T>(f: (side: AgentSide) => T): Record<AgentSide, T> {
  return Object.fromEntries([...AGENT_SIDES].map((s) => [s, f(s as AgentSide)])) as Record<AgentSide, T>
}
function usage(side: AgentSide, total: number): UsageRow {
  return { day: DAY, side, projectKey: '/w/g', model: 'm', input: total, output: 0, cacheRead: 0, cacheWrite: 0, total }
}
function stats(rows: UsageRow[]): ProjectStats {
  const bySide = zeroBySide()
  for (const r of rows) bySide[r.side] += r.total
  const tokens = emptyTokenStats()
  for (const r of rows) tokens.bySide[r.side] = { ...tokens.bySide[r.side], input: r.input, total: r.total }
  return { tokens: { ...tokens, rows, byDay: [{ day: DAY, bySide, byProvider: {} }] }, sessions: [] }
}
function detail(path: string, side: AgentSide | null, s: ProjectStats | null): ProjectDetail {
  return {
    path, subagents: [], memory: { main: null, mainFile: null, topics: [] }, plugins: [], mcp: [],
    configs: { claudeMd: null, agentsMd: null }, stats: s,
    skills: side === null ? [] : [{ name: 's', description: null, level: 'project', side, symlink: false, pkg: null,
      origin: 'disk', pluginName: null, pluginRoot: null, pluginSkillName: null }]
  }
}
function sessionReads(file: string, side: AgentSide): SavedRead[] {
  const page: SessionPage = { revision: `rev-${side}`, file, side, title: 'Saved', at: 1, tokens: 1, bytes: 1, forkState: 'none',
    forkPoints: 0, forkParentTitle: null, forkParentFile: null, sessionId: null,
    questions: [{ revision: `q-${side}`, i: 1, text: 'Saved question', at: 1, tools: 0, subagents: 0 }] }
  const turn: SessionTurn = { blocks: [], bytesRead: 0 }
  return [{ kind: 'sessionPage', file, data: page }, { kind: 'turnContent', file, i: 0, revision: `q-${side}`, ms: 1, data: turn }]
}
function snapshotNaming(projectSides: AgentSide[]): Snapshot {
  const snap = emptySnapshot(900)
  snap.sides[RENAMED] = { detected: true }
  snap.projects = [{ path: '/w/p', name: 'p', sides: projectSides, stale: false, lastSessionAt: 1, sessionCount: 1 }]
  snap.global.skills = [{ name: 's', description: null, sides: ['claude'], symlink: perSide((s) => s === RENAMED),
    pkg: perSide((s) => (s === RENAMED ? { files: 3, bytes: 4 } : null)), origin: 'disk', pluginName: null, pluginRoot: null,
    pluginSkillName: null }]
  snap.tokens = { ...snap.tokens, byDay: [{ day: DAY, bySide: zeroBySide(), byProvider: {} }] }
  return snap
}
function savedByANewerBuild(data: DisplayData): DisplayData {
  return renameSide(data, RENAMED, NEWER) as DisplayData
}

it('agents-overview::REQ-005: restores what a newer build saved without the side this build does not know, as a key or as a value', () => {
  const root = dir()
  const shown = stats([])
  const saved = savedByANewerBuild({
    ...emptyDisplayData(),
    snapshot: snapshotNaming(['claude']),
    stats: [['/w/p', shown], ['/w/g', stats([usage(RENAMED, 50)])]],
    reads: [
      { kind: 'projectDetail', path: '/w/p', data: detail('/w/p', null, shown) },
      { kind: 'projectDetail', path: '/w/g', data: detail('/w/g', RENAMED, null) },
      ...sessionReads('/s/claude.jsonl', 'claude'),
      ...sessionReads('/s/other.jsonl', RENAMED),
      { kind: 'skillFiles', args: { side: 'claude', name: 's', scope: 'global' }, data: { files: [] } },
      { kind: 'skillFiles', args: { side: RENAMED, name: 's', scope: 'global' }, data: { files: [] } },
      { kind: 'memoryContent', file: '/w/p/a.md', data: { text: 'kept', truncated: false } }
    ]
  })
  expect(mentions(saved, NEWER)).toBeGreaterThan(0)
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: saved }))
  const restored = new DisplayStore(root).get()
  expect(mentions(restored, NEWER)).toBe(0)
  expect(restored.snapshot?.scannedAt).toBe(900)
  expect(restored.snapshot?.sides[RENAMED]).toEqual({ detected: false })
  expect(restored.stats.map(([p]) => p)).toEqual(['/w/p'])
  expect(restored.reads.map((r) => [r.kind, 'path' in r ? r.path : 'file' in r ? r.file : r.args.side])).toEqual([
    ['projectDetail', '/w/p'], ['sessionPage', '/s/claude.jsonl'], ['turnContent', '/s/claude.jsonl'], ['skillFiles', 'claude'],
    ['memoryContent', '/w/p/a.md']
  ])
})

// Each value position of a snapshot where a side is named, the side in that one position alone (besides the records
// keyed by side, which the case above strips); most are checked only by the restore's own disk check, not by live IPC's
const snapshotPositions: Array<[string, (snap: Snapshot) => void]> = [
  ["a project's list of sides", (snap) => { snap.projects[0].sides = ['claude', RENAMED] }],
  ["a global skill's list of sides", (snap) => { snap.global.skills[0].sides = ['claude', RENAMED] }],
  ["a subagent's list of sides", (snap) => {
    snap.global.subagents = [{ name: 'r', sides: [RENAMED], description: null, claude: null, codex: null, antigravity: null, overridesBuiltin: false }]
  }],
  ["a memory entry's side", (snap) => {
    snap.global.memory = [{ side: RENAMED, projectPath: null, projectName: null, hasMain: false, files: [], lastModified: null, stale: false }]
  }],
  ["an MCP entry's side", (snap) => { snap.global.mcp = [{ name: 'x', side: RENAMED, source: 'global-config', disabled: false, plugin: null }] }],
  ["a usage row's side", (snap) => { snap.tokens.rows = [usage(RENAMED, 50)] }],
  ["a model row's side", (snap) => { snap.tokens.byModel = [{ model: 'm', side: RENAMED, total: 50 }] }]
]
it.each(snapshotPositions)('agents-overview::REQ-005: a saved snapshot naming the side this build does not know in %s is not restored, and the rest is', (_position, name) => {
  const root = dir()
  const snapshot = snapshotNaming(['claude'])
  name(snapshot)
  // The control: before the rename the same snapshot is valid, so only the side can be what drops it below
  const control = dir()
  writeFileSync(join(control, 'display-cache.json'), JSON.stringify({ version: 1, data: { ...emptyDisplayData(), snapshot } }))
  expect(new DisplayStore(control).get().snapshot?.scannedAt).toBe(900)
  const saved = savedByANewerBuild({
    ...emptyDisplayData(),
    snapshot,
    reads: [{ kind: 'memoryContent', file: '/w/p/a.md', data: { text: 'kept', truncated: false } }]
  })
  writeFileSync(join(root, 'display-cache.json'), JSON.stringify({ version: 1, data: saved }))
  const restored = new DisplayStore(root).get()
  expect(restored.snapshot).toBeNull()
  expect(restored.reads.map((r) => r.kind)).toEqual(['memoryContent'])
})
