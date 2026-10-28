// The Antigravity CLI side at the providers seam (ADR-0037): its registry — the trust ledger in agy's settings
// (projects-list::REQ-001) — the activity its conversations give a project, and the rule that reading agy's files
// writes nothing there (token-stats::CON-002). Fixture databases carry agy's schema and real-shaped trajectory
// records (src/main/testing/agy-fixture.ts).
//
// Gaps, with what would close them:
// - agy exiting between the reader's look for the log and its copy (token-stats failure modes): a race no fixture
//   can stage, since the reader takes no pause between the two; an injectable step there would make it testable.
// - agy exiting between the log's copy and the database's — the window the log-first order is for: the same kind of
//   race, invisible after the read, and closed the same way.
// - agy starting to write a database while it is read in place: the same race, the other way round.
// - A read killed half-way leaving its copy behind: killing the process is outside this seam. What the copy is left
//   in — a directory only the user can read — is asserted while a read runs.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ERR } from '@shared/errors'
import { scan } from './scan'
import { readAntigravitySessions, readConversationDb } from './antigravity'
import type { ScanRoots } from './types'
import type { DatabaseSync } from './sqlite'
import {
  MEASURED_FOLDER,
  encodeTrajectoryMetadata,
  measured,
  settingsJson,
  writeConversation
} from '../testing/agy-fixture'

let dir: string
const writers: DatabaseSync[] = []
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
const agyRoot = (): string => join(dir, '.gemini', 'antigravity-cli')
const conversations = (): string => join(agyRoot(), 'conversations')
function mkProject(name: string): string {
  const p = join(dir, 'work', name)
  mkdirSync(p, { recursive: true })
  return p
}
function trust(paths: unknown): void {
  mkdirSync(agyRoot(), { recursive: true })
  writeFileSync(join(agyRoot(), 'settings.json'), settingsJson(paths))
}
function writeClaudeRegistry(paths: string[]): void {
  const projects: Record<string, object> = {}
  for (const p of paths) projects[p] = {}
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects }))
}
/** A conversation in `folders` (encoded record), with its database's mtime set to atSec */
function conversation(
  id: string,
  folders: string[],
  atSec: number,
  extra: Partial<Parameters<typeof encodeTrajectoryMetadata>[0]> = {}
): string {
  mkdirSync(conversations(), { recursive: true })
  const { file } = writeConversation(conversations(), id, encodeTrajectoryMetadata({ folders, conversationId: id, ...extra }))
  utimesSync(file, atSec, atSec)
  return file
}
/** Every file in a directory with its size and mtime, the CON-002 comparison */
function listing(d: string): string[] {
  return readdirSync(d)
    .sort()
    .map((n) => {
      const s = statSync(join(d, n))
      return `${n} ${s.size} ${s.mtimeMs}`
    })
}

beforeEach(() => {
  // A prefix of its own: the reader's temporary copies are 'agentshed-agy-…', and a leftover must not pass for a home
  dir = mkdtempSync(join(tmpdir(), 'agentshed-agyhome-'))
})
afterEach(() => {
  for (const w of writers.splice(0)) w.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('the registry: the folders agy was told to trust (projects-list::REQ-001)', () => {
  it('each trusted folder is a project on this side; one whose directory is gone is stale (AC-01)', async () => {
    const alive = mkProject('alive')
    trust([alive, join(dir, 'work', 'ghost')])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.antigravity).toEqual({ detected: true })
    const byName = Object.fromEntries(snap.projects.map((p) => [p.name, p]))
    expect(byName['alive']).toMatchObject({ sides: ['antigravity'], stale: false })
    expect(byName['ghost']).toMatchObject({ sides: ['antigravity'], stale: true })
    expect(snap.projects).toHaveLength(2)
  })

  it('a folder Claude also registered is one entry counting both sides, a trailing slash notwithstanding (AC-01)', async () => {
    const p = mkProject('both')
    writeClaudeRegistry([p])
    trust([`${p}/`])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'antigravity'])
  })

  it('no data root: not detected; a root with no settings, no ledger or an empty one: detected with no projects (AC-05)', async () => {
    expect((await scan(roots(), { now: () => 1 })).sides.antigravity).toEqual({ detected: false })
    mkdirSync(agyRoot(), { recursive: true })
    for (const settings of [null, '{"permissions":{"allow":[]}}', settingsJson([])]) {
      if (settings !== null) writeFileSync(join(agyRoot(), 'settings.json'), settings)
      const snap = await scan(roots(), { now: () => 1 })
      expect(snap.sides.antigravity).toEqual({ detected: true })
      expect(snap.projects).toEqual([])
    }
  })

  it('a corrupt settings file, or a ledger that is not a list, is this side\'s error alone (AC-05)', async () => {
    const p = mkProject('claude-side')
    writeClaudeRegistry([p])
    mkdirSync(agyRoot(), { recursive: true })
    writeFileSync(join(agyRoot(), 'settings.json'), '{"trustedWorkspaces": ["/x"')
    let snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.antigravity.detected).toBe(true)
    expect(snap.sides.antigravity.error?.code).toBe(ERR.registryParseFailed)
    expect(snap.projects.map((e) => e.name)).toEqual(['claude-side'])
    writeFileSync(join(agyRoot(), 'settings.json'), '{"trustedWorkspaces": 3}')
    snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.antigravity.error?.code).toBe(ERR.registryProjectsInvalid)
    expect(snap.sides.claude.error).toBeUndefined()
    expect(snap.projects.map((e) => e.name)).toEqual(['claude-side'])
  })

  it('an entry that is not a path is skipped and the others kept', async () => {
    const p = mkProject('kept')
    trust([p, 7, null, ''])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.map((e) => e.name)).toEqual(['kept'])
    expect(snap.sides.antigravity.error).toBeUndefined()
  })

  it("agy's own project records and its folder cache never register a folder (AC-03)", async () => {
    const trusted = mkProject('trusted')
    const viaProject = mkProject('via-project-record')
    const viaCache = mkProject('via-cache')
    trust([trusted])
    // The project record's shape (measured: ~/.gemini/config/projects/default-cli-project.json), with a folder
    // resource as the research record describes one; and the CLI's workspace-to-project cache
    const projects = join(dir, '.gemini', 'config', 'projects')
    mkdirSync(projects, { recursive: true })
    writeFileSync(
      join(projects, 'p1.json'),
      JSON.stringify({
        id: 'p1',
        name: 'Desktop project',
        projectResources: { resources: [{ gitFolder: { folderUri: pathToFileURL(viaProject).href, allowWrite: true } }] }
      })
    )
    mkdirSync(join(agyRoot(), 'cache'), { recursive: true })
    writeFileSync(join(agyRoot(), 'cache', 'projects.json'), JSON.stringify({ [viaCache]: 'p1' }))
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.map((e) => e.name)).toEqual(['trusted'])
  })
})

describe("activity: a conversation's folder and time (projects-list::REQ-001/AC-04)", () => {
  it('a conversation moves its trusted folder to its database\'s time and counts once', async () => {
    const p = mkProject('p')
    trust([p])
    conversation('c1', [p], 1_793_000_000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_000_000 })
  })

  it('while agy writes, the time is the log\'s when it is later than the database\'s', async () => {
    const p = mkProject('p')
    trust([p])
    mkdirSync(conversations(), { recursive: true })
    const { file, writer } = writeConversation(conversations(), 'live', encodeTrajectoryMetadata({ folders: [p], conversationId: 'live' }), { keepOpen: true })
    if (writer) writers.push(writer)
    utimesSync(file, 1_793_000_000, 1_793_000_000)
    utimesSync(`${file}-wal`, 1_793_000_500, 1_793_000_500)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_500_000 })
  })

  it('while agy writes, the time is the database\'s when it is later than the log\'s — a checkpoint writes the database and leaves the log', async () => {
    const p = mkProject('p')
    trust([p])
    mkdirSync(conversations(), { recursive: true })
    const { file, writer } = writeConversation(conversations(), 'live', encodeTrajectoryMetadata({ folders: [p], conversationId: 'live' }), { keepOpen: true })
    if (writer) writers.push(writer)
    utimesSync(`${file}-wal`, 1_793_000_000, 1_793_000_000)
    utimesSync(file, 1_793_000_800, 1_793_000_800)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_800_000 })
  })

  it('a subagent conversation, with the same trajectory source and a later time, neither counts nor moves the time (token-stats::REQ-003/AC-07)', async () => {
    // The measured records name MEASURED_FOLDER; register exactly that path (it need not exist: stale is beside the point)
    trust([MEASURED_FOLDER])
    mkdirSync(conversations(), { recursive: true })
    const main = writeConversation(conversations(), 'main', measured('mainApiKey'), { source: 17 }).file
    const sub = writeConversation(conversations(), 'sub', measured('subagent'), { source: 17 }).file
    utimesSync(main, 1_793_000_000, 1_793_000_000)
    utimesSync(sub, 1_793_009_000, 1_793_009_000)
    const snap = await scan(roots(), { now: () => 1 })
    const entry = snap.projects.find((e) => e.path === MEASURED_FOLDER)
    expect(entry).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_000_000 })
  })

  it('a folder agy ran in without trusting it is no project; a folder only Claude registered still takes its time (AC-02)', async () => {
    const untrusted = mkProject('untrusted')
    const claudeOnly = mkProject('claude-only')
    writeClaudeRegistry([claudeOnly])
    trust([])
    conversation('u1', [untrusted], 1_793_000_000)
    conversation('t1', [claudeOnly], 1_793_000_700)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.map((e) => e.name)).toEqual(['claude-only'])
    expect(snap.projects[0]).toMatchObject({ sides: ['claude'], lastSessionAt: 1_793_000_700_000, sessionCount: 1 })
  })

  it('a conversation listing two folders is credited to the first only (token-stats::REQ-003/AC-08)', async () => {
    const first = mkProject('first')
    const second = mkProject('second')
    trust([first, second])
    conversation('two', [first, second], 1_793_000_000)
    const snap = await scan(roots(), { now: () => 1 })
    const byName = Object.fromEntries(snap.projects.map((e) => [e.name, e]))
    expect(byName['first']).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_000_000 })
    expect(byName['second']).toMatchObject({ sessionCount: 0, lastSessionAt: null })
  })

  it('a first folder that is not a local file credits no project, not even a trusted folder listed after it', async () => {
    const p = mkProject('p')
    trust([p])
    conversation('remote', [], 1_793_000_000, { rawUris: ['vscode-remote://ssh-remote+host/home/x', pathToFileURL(p).href] })
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ name: 'p', sessionCount: 0, lastSessionAt: null })
  })

  it('the conversation agy creates when its interface is opened and left moves the time, and is no error (token-stats::REQ-003/AC-09)', async () => {
    trust([MEASURED_FOLDER])
    mkdirSync(conversations(), { recursive: true })
    const { file } = writeConversation(conversations(), 'opened', measured('emptyConversation'))
    utimesSync(file, 1_793_000_000, 1_793_000_000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ lastSessionAt: 1_793_000_000_000, sessionCount: 1 })
    expect(snap.sides.antigravity).toEqual({ detected: true })
  })

  it('only .db files directly in agy\'s own conversations directory are conversations (token-stats::CON-001)', async () => {
    const p = mkProject('p')
    const other = mkProject('other-products')
    trust([p])
    // A database one level down, and the desktop app's and the IDE's roots with their own ledgers and conversations
    mkdirSync(join(conversations(), 'nested'), { recursive: true })
    writeConversation(join(conversations(), 'nested'), 'deep', encodeTrajectoryMetadata({ folders: [p], conversationId: 'deep' }))
    for (const root of ['antigravity', 'antigravity-ide']) {
      const r = join(dir, '.gemini', root)
      mkdirSync(join(r, 'conversations'), { recursive: true })
      writeFileSync(join(r, 'settings.json'), settingsJson([other]))
      writeConversation(join(r, 'conversations'), `${root}-c`, encodeTrajectoryMetadata({ folders: [p], conversationId: 'x' }))
    }
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects.map((e) => e.name)).toEqual(['p'])
    expect(snap.projects[0]).toMatchObject({ sessionCount: 0, lastSessionAt: null })
  })

  it('a conversation that cannot be read contributes nothing, and the others still count', async () => {
    const p = mkProject('p')
    trust([p])
    conversation('good', [p], 1_793_000_000)
    writeFileSync(join(conversations(), 'zero.db'), '')
    writeFileSync(join(conversations(), 'text.db'), 'not a database')
    const bad = writeConversation(conversations(), 'cut', measured('mainApiKey').subarray(0, 40)).file
    for (const f of [join(conversations(), 'zero.db'), join(conversations(), 'text.db'), bad]) utimesSync(f, 1_793_009_000, 1_793_009_000)
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0]).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_000_000 })
    expect(snap.sides.antigravity).toEqual({ detected: true })
  })

  it('a conversation is read again when its database\'s time moves though its size does not', async () => {
    const before = mkProject('alpha1')
    const after = mkProject('bravo2')
    trust([before, after])
    // Folder names of one length, so the rewritten record — and the database — keep their size
    const file = conversation('moved', [before], 1_793_000_000)
    expect((await scan(roots(), { now: () => 1 })).projects.find((e) => e.name === 'alpha1')?.sessionCount).toBe(1)
    const size = statSync(file).size
    rmSync(file)
    writeConversation(conversations(), 'moved', encodeTrajectoryMetadata({ folders: [after], conversationId: 'moved' }))
    utimesSync(file, 1_793_000_100, 1_793_000_100)
    expect(statSync(file).size).toBe(size)
    const byName = Object.fromEntries((await scan(roots(), { now: () => 1 })).projects.map((e) => [e.name, e]))
    expect(byName['bravo2']).toMatchObject({ sessionCount: 1, lastSessionAt: 1_793_000_100_000 })
    expect(byName['alpha1']).toMatchObject({ sessionCount: 0, lastSessionAt: null })
  })
})

describe("reading agy's files writes nothing there (token-stats::CON-002)", () => {
  it('a database with no log is read in place: the directory keeps the same files, sizes and times', async () => {
    const p = mkProject('p')
    trust([p])
    conversation('quiet', [p], 1_793_000_000)
    const before = listing(conversations())
    expect(before).toHaveLength(1) // the database alone: its writer closed, so the log was merged and removed
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(listing(conversations())).toEqual(before)
  })

  it('a database agy is writing is read through a copy: nothing changes there, and the rows only its log holds are seen', async () => {
    const p = mkProject('p')
    trust([p])
    mkdirSync(conversations(), { recursive: true })
    // Every row, the trajectory record included, was written after the journal switch: it is in the log only, so a
    // read of the database file alone would find no record at all
    const { file, writer } = writeConversation(conversations(), 'busy', encodeTrajectoryMetadata({ folders: [p], conversationId: 'busy' }), { keepOpen: true })
    if (writer) writers.push(writer)
    utimesSync(file, 1_793_000_000, 1_793_000_000)
    const before = listing(conversations())
    expect(before.map((l) => l.split(' ')[0])).toEqual(['busy.db', 'busy.db-shm', 'busy.db-wal'])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects[0].sessionCount).toBe(1)
    expect(listing(conversations())).toEqual(before)
  })

  it('the copy is made in a temporary directory of its own and removed after the read', () => {
    const p = mkProject('p')
    mkdirSync(conversations(), { recursive: true })
    const { writer } = writeConversation(conversations(), 'busy', encodeTrajectoryMetadata({ folders: [p], conversationId: 'busy' }), { keepOpen: true })
    if (writer) writers.push(writer)
    const tmpParent = join(dir, 'tmp')
    mkdirSync(tmpParent)
    const sessions = readAntigravitySessions(agyRoot(), tmpParent)
    expect(sessions.map((s) => [s.cwd, s.subagent])).toEqual([[p, false]])
    expect(readdirSync(tmpParent)).toEqual([])
    expect(existsSync(join(conversations(), 'busy.db-wal'))).toBe(true)
  })

  it('the copy\'s directory is the user\'s alone while the read runs, so a read killed half-way leaves nothing others can read', () => {
    const p = mkProject('p')
    mkdirSync(conversations(), { recursive: true })
    const { file, writer } = writeConversation(conversations(), 'busy', encodeTrajectoryMetadata({ folders: [p], conversationId: 'busy' }), { keepOpen: true })
    if (writer) writers.push(writer)
    const tmpParent = join(dir, 'tmp')
    mkdirSync(tmpParent)
    const seen = readConversationDb(file, (db) => {
      const copyDir = dirname(db.location() ?? '')
      // SQLite reports the path resolved (macOS's /var is a link to /private/var)
      return { underParent: dirname(copyDir) === realpathSync(tmpParent), mode: statSync(copyDir).mode & 0o777 }
    }, tmpParent)
    expect(seen).toEqual({ underParent: true, mode: 0o700 })
  })
})

describe('a conversation is read again only when it changed, and a failed read is tried again', () => {
  // A conversation with a log is read through a copy made under the walk's temporary parent: a parent that does not
  // exist makes every fresh read fail, which tells a read served from the last one apart from a new read
  function busy(): string {
    const p = mkProject('p')
    mkdirSync(conversations(), { recursive: true })
    const { writer } = writeConversation(conversations(), 'busy', encodeTrajectoryMetadata({ folders: [p], conversationId: 'busy' }), { keepOpen: true })
    if (writer) writers.push(writer)
    return p
  }
  const usable = (): string => {
    const t = join(dir, 'tmp')
    mkdirSync(t, { recursive: true })
    return t
  }
  const unusable = (): string => join(dir, 'no-such-dir')

  it('an unchanged conversation is not read again', () => {
    const p = busy()
    expect(readAntigravitySessions(agyRoot(), usable()).map((s) => s.cwd)).toEqual([p])
    expect(readAntigravitySessions(agyRoot(), unusable()).map((s) => s.cwd)).toEqual([p])
  })

  it('a read that failed is tried again at the next walk', () => {
    const p = busy()
    expect(readAntigravitySessions(agyRoot(), unusable()).map((s) => s.cwd)).toEqual([null])
    expect(readAntigravitySessions(agyRoot(), usable()).map((s) => s.cwd)).toEqual([p])
  })
})
