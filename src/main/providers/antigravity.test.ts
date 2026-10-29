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
// - A checkpoint agy runs while it keeps writing, landing between the copy of the log and the copy of the database
//   (token-stats failure modes; the mechanism allows it, not observed): the pair cannot be staged without a pause
//   between the two copies, and an injectable step there would make it testable. What follows a failing read of such a
//   pair — not counted, the last result kept, read again — is driven below through a copy that cannot be made.
// - A conversation deleted between the walk's look at its signature and its read: no seam between the two. The rule it
//   shares with the usage read (a database gone is no format change) is driven below through the usage read's window.
// - A read killed half-way leaving its copy behind: killing the process is outside this seam. What the copy is left
//   in — a directory only the user can read — is asserted while a read runs.
// - Usage agy never writes to a database (the /btw side question, the Auto mode's command reviewer): there is nothing
//   to read, so nothing to drive; the under-count is stated in the features page.
// - A conversation whose format and trajectory record read but one of whose usage records will not decode: the usage
//   read counts it unreadable (driven below), while the walk, which reads only the trajectory record, still gives its
//   folder the database's time — activity is the file's time by design (CONTEXT "Activity"); not driven as a case of
//   its own, since it adds no rule beyond the two reads each driven here.
// - A transcript agy rewrites (its context compaction) while a session page is open: a turn the page asks for under its
//   old revision is refused (session-view::REQ-001/AC-04) by the IPC handlers, whose question revision and end-of-read
//   identity check are taken on the transcript, the session's read source, not on the database. No case here reaches
//   the handlers, and a rewrite in the middle of a read is a race no fixture can stage without a pause. An e2e that
//   replaces the open fork's transcript by rename, bytes unchanged, then expands a turn and sees it refused would
//   close the first half; an injectable pause between the read and the check, the second.
// - The real-data reconciliation (the reader over copies of agy's own conversations against the descriptor-based
//   decoder of the research record) needs real agy data and stays out of the default gate; run 2026-10-29 for #323:
//   43 calls, identical figures (research record §10.11).
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ERR, decodeAppError } from '@shared/errors'
import { mergeKey } from '@shared/path-key'
import { scan, walkSessions } from './scan'
import { readAntigravitySessions, readConversationDb } from './antigravity'
import { TokenEngine, runParseJob, type ParseRunner, type TokenBuildResult } from './token-stats'
import { UsageArchive } from './archive'
import type { ScanRoots } from './types'
import { DatabaseSync } from './sqlite'
import { readRanges } from './range-read'
import { questionTextOfRange } from './question-index'
import { sessionReadTarget } from '../security'
import type { SessionMeta } from '@shared/domain'
import { MEASURED_TRANSCRIPT, MEASURED_TRANSCRIPT_ID, transcriptFile, writeTranscript } from '../testing/agy-transcript-fixture'
import {
  MEASURED_FOLDER,
  MEASURED_TITLE,
  MEASURED_USAGE_CONVERSATION,
  callRecord,
  encodeGeneratorMetadata,
  encodeStepMetadata,
  encodeTrajectoryMetadata,
  insertGens,
  insertSteps,
  insertSummaries,
  measured,
  measuredUsage,
  settingsJson,
  writeConversation,
  writeSummaries,
  type ConversationOptions,
  type GenRow,
  type StepRow,
  type UsageFixture
} from '../testing/agy-fixture'

let dir: string
const writers: DatabaseSync[] = []
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

// ── Usage (token-stats::REQ-003, token-stats::REQ-004) at the providers seam: the token build over a fixture home ──

/** A local time on a day of October 2026, so a day key written as a literal holds in every time zone */
const oct = (day: number, h = 12, m = 0, s = 0): number => new Date(2026, 9, day, h, m, s).getTime()

interface CallSpec {
  usage: UsageFixture
  /** The step's completion time */
  at: number
  model?: string
}

/** Each call's step and generator record, as agy writes them, numbered from step 1 and generator record 0 */
function callRows(conversationId: string, calls: CallSpec[], firstStep = 1, firstGen = 0): { steps: StepRow[]; gens: GenRow[] } {
  const steps: StepRow[] = []
  const gens: GenRow[] = []
  calls.forEach((c, i) => {
    const r = callRecord({
      conversationId,
      stepIdx: firstStep + i * 2,
      genIdx: firstGen + i,
      usage: c.usage,
      createdAt: c.at - 5_000,
      completedAt: c.at,
      responseModel: c.model ?? 'gemini-3.6-flash'
    })
    steps.push(r.step)
    gens.push(r.gen)
  })
  return { steps, gens }
}

/** A conversation in `folders` holding `calls` (and any extra rows); returns its path */
function usageConversation(
  id: string,
  folders: string[],
  calls: CallSpec[],
  opts: ConversationOptions & { record?: Uint8Array } = {}
): string {
  mkdirSync(conversations(), { recursive: true })
  const rows = callRows(id, calls)
  const { file, writer } = writeConversation(conversations(), id, opts.record ?? encodeTrajectoryMetadata({ folders, conversationId: id }), {
    ...opts,
    steps: [...rows.steps, ...(opts.steps ?? [])],
    gens: [...rows.gens, ...(opts.gens ?? [])]
  })
  if (writer) writers.push(writer)
  return file
}

const cacheDir = (): string => join(dir, 'cache')
function build(runner?: ParseRunner): Promise<TokenBuildResult> {
  return new TokenEngine(cacheDir(), runner).build(roots(), [], undefined, walkSessions(roots()))
}
const agyRows = (r: TokenBuildResult): TokenBuildResult['rows'] => r.rows.filter((x) => x.side === 'antigravity')
const agyTotal = (r: TokenBuildResult): number => r.global.bySide.antigravity.total
const projectTotal = (r: TokenBuildResult, folder: string): number | undefined =>
  r.perProject.get(mergeKey(folder))?.tokens.bySide.antigravity.total

/** A parse runner whose Antigravity reads cannot make their copy: a read of a conversation agy has open fails */
const copyFails: ParseRunner = {
  run: (job) => runParseJob(job.kind === 'antigravity' ? { ...job, tmpParent: join(dir, 'no-such-dir') } : job),
  concurrency: 1
}

describe('usage: each model call once (token-stats::REQ-003)', () => {
  it('the three records of one call — its step, its generator record and that record\'s retry list — count once (AC-01, AC-03, AC-04)', async () => {
    trust([MEASURED_FOLDER])
    mkdirSync(conversations(), { recursive: true })
    writeConversation(conversations(), MEASURED_USAGE_CONVERSATION.apiKey, measured('mainApiKey'), {
      steps: [{ idx: 1, metadata: measuredUsage('stepApiKey') }],
      gens: [{ idx: 0, data: measuredUsage('genApiKey') }]
    })
    const r = await build()
    expect(agyRows(r).map((x) => [x.projectKey, x.model, x.input, x.output, x.cacheRead, x.cacheWrite, x.total])).toEqual([
      [mergeKey(MEASURED_FOLDER), 'gemini-3.6-flash', 6813, 109, 0, 0, 6922]
    ])
    expect(r.antigravityUnreadable).toBe(0)
  })

  it('a signed-in call reads the same way, its model kept with its suffix (AC-01, AC-04)', async () => {
    trust([MEASURED_FOLDER])
    mkdirSync(conversations(), { recursive: true })
    writeConversation(conversations(), MEASURED_USAGE_CONVERSATION.signedIn, measured('mainSignedIn'), {
      steps: [{ idx: 1, metadata: measuredUsage('stepSignedIn') }],
      gens: [{ idx: 0, data: measuredUsage('genSignedIn') }]
    })
    const r = await build()
    expect(agyRows(r).map((x) => [x.model, x.total])).toEqual([['gemini-3.8-flash-n', 6841]])
    expect(r.global.byModel.map((m) => [m.side, m.model])).toEqual([['antigravity', 'gemini-3.8-flash-n']])
  })

  it('a call is one across databases by its response id, else its provider-assigned id, else its message id (AC-01)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('conv-a', [p], [
      { usage: { responseId: 'r-1', messageId: 'bot-shared', input: 100, output: 10 }, at: oct(26) },
      { usage: { providerMessageId: 'p-1', messageId: 'm-1', input: 200, output: 20 }, at: oct(26) },
      { usage: { responseId: 'r-3', providerMessageId: 'p-3', input: 400, output: 40 }, at: oct(26) }
    ])
    usageConversation('conv-b', [p], [
      // Another response id: another call, though the message id is the same
      { usage: { responseId: 'r-2', messageId: 'bot-shared', input: 1000, output: 100 }, at: oct(26) },
      // The same provider-assigned id: the same call, though the message ids differ
      { usage: { providerMessageId: 'p-1', messageId: 'm-2', input: 200, output: 20 }, at: oct(26) },
      // The same response id: the same call, though the provider-assigned ids differ
      { usage: { responseId: 'r-3', providerMessageId: 'p-4', input: 400, output: 40 }, at: oct(26) }
    ])
    expect(agyTotal(await build())).toBe(110 + 220 + 440 + 1100)
  })

  it('a call carrying no identity counts once where it is, its model joined through the step its record names, and is never matched across databases (AC-01)', async () => {
    const p = mkProject('p')
    trust([p])
    // No id at all (none of the 51 measured calls lacks one: a derived shape). Each call is still its step and the
    // generator record naming that step, as agy writes them
    usageConversation('conv-a', [p], [
      { usage: { input: 100, output: 10 }, at: oct(26), model: 'gemini-3.6-flash' },
      { usage: { input: 200, output: 20 }, at: oct(26), model: 'gemini-3.8-flash-n' }
    ])
    // Equal in every field to conv-a's first call: nothing says it is the same call
    usageConversation('conv-b', [p], [{ usage: { input: 100, output: 10 }, at: oct(26), model: 'gemini-3.6-flash' }])
    const r = await build()
    expect(agyTotal(r)).toBe(110 + 220 + 110)
    expect(r.global.byModel.map((m) => [m.model, m.total])).toEqual([
      ['gemini-3.6-flash', 220],
      ['gemini-3.8-flash-n', 220]
    ])
  })

  describe('a fork (AC-01, AC-06)', () => {
    // The parent: two calls and one generator record attached to no step. The fork holds a copy of all of it, as agy
    // copies the database — its copied steps and records name the parent (measured on the fork 8c07e920) — and one
    // call of its own
    function parentAndFork(withParent: boolean): string {
      const p = mkProject('p')
      trust([p])
      const parent = callRows('conv-parent', [
        { usage: { messageId: 'm-p1', input: 1000, output: 100 }, at: oct(26) },
        { usage: { messageId: 'm-p2', input: 2000, output: 200 }, at: oct(26) }
      ])
      const noStep: GenRow = {
        idx: 2,
        data: encodeGeneratorMetadata({ usage: { messageId: 'm-px', input: 300, output: 30 }, responseModel: 'gemini-3.6-flash', conversationId: 'conv-parent' })
      }
      if (withParent) {
        usageConversation('conv-parent', [p], [], { steps: parent.steps, gens: [...parent.gens, noStep] })
      }
      const own = callRows('conv-fork', [{ usage: { messageId: 'm-f1', input: 500, output: 50 }, at: oct(27) }], 5, 3)
      usageConversation('conv-fork', [p], [], { steps: [...parent.steps, ...own.steps], gens: [...parent.gens, noStep, ...own.gens] })
      return p
    }

    it('with its parent: the parent\'s calls once, the record with no step once, the fork\'s own call once', async () => {
      parentAndFork(true)
      expect(agyTotal(await build())).toBe(1100 + 2200 + 330 + 550)
    })

    it('without its parent: only what the fork made — the copied calls count nowhere', async () => {
      parentAndFork(false)
      const r = await build()
      expect(agyTotal(r)).toBe(550)
      expect(agyRows(r).map((x) => x.day)).toEqual(['2026-10-27'])
    })
  })

  it('a failed attempt without token counts adds nothing; an attempt with tokens and an id of its own is a call (AC-02)', async () => {
    const p = mkProject('p')
    trust([p])
    // The measured shape of a failed call: a user-input step, and a generator record with an error, no step indices, a
    // usage holding only the model, and a retry entry with an error and a reason (a 429)
    const quota = 'Error 429, Message: You exceeded your current quota'
    usageConversation('conv-failed', [p], [], {
      steps: [{ idx: 0, type: 14, metadata: encodeStepMetadata({ conversationId: 'conv-failed', createdAt: oct(26) }) }],
      gens: [{ idx: 0, data: encodeGeneratorMetadata({ error: quota, usage: {}, retries: [{ usage: {}, error: quota, reason: 3 }], conversationId: 'conv-failed' }) }]
    })
    const call: UsageFixture = { messageId: 'm-c1', input: 700, output: 70 }
    usageConversation('conv-retry', [p], [], {
      steps: [{ idx: 1, metadata: encodeStepMetadata({ conversationId: 'conv-retry', stepIndex: 1, createdAt: oct(26), completedAt: oct(26), usage: call }) }],
      gens: [
        {
          idx: 0,
          data: encodeGeneratorMetadata({
            stepIndices: [1, 2],
            usage: call,
            retries: [
              // A 503 that still consumed tokens, under an id of its own: a call of its own
              { usage: { messageId: 'retry-503', input: 400 }, error: 'Error 503', reason: 2 },
              // The call itself, as agy lists it; once more with its id but other figures: still the same call
              { usage: call },
              { usage: { messageId: 'm-c1', input: 9_999 } },
              // Token counts but no identity: nothing says it is another call
              { usage: { input: 5_000 } }
            ],
            responseModel: 'gemini-3.6-flash',
            conversationId: 'conv-retry'
          })
        }
      ]
    })
    const r = await build()
    expect(agyTotal(r)).toBe(770 + 400)
    // One row: the call and the 503 attempt share its day and model; the failed call adds none, not even a zero one
    expect(agyRows(r).map((x) => [x.day, x.model, x.total])).toEqual([['2026-10-26', 'gemini-3.6-flash', 1170]])
    expect(r.antigravityUnreadable).toBe(0)
  })

  it('the four fields as recorded: thinking stays inside output, nothing is taken out of input, the total is the four summed (AC-03)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('conv-four', [p], [
      // A Gemini call with cache reads, as measured: agy's own total (input + output) is lower by exactly the reads
      { usage: { messageId: 'm-g', input: 2534, output: 298, thinking: 141, response: 157, cacheRead: 6183 }, at: oct(26), model: 'gemini-3.6-flash' },
      // A Claude model run through agy reports cache writes too (the spec's failure modes; the shape is derived)
      { usage: { messageId: 'm-cl', input: 1000, output: 300, thinking: 250, response: 50, cacheRead: 5000, cacheWrite: 200 }, at: oct(26), model: 'claude-sonnet-4-6' }
    ])
    const rows = Object.fromEntries(agyRows(await build()).map((x) => [x.model, [x.input, x.output, x.cacheRead, x.cacheWrite, x.total]]))
    expect(rows).toEqual({ 'gemini-3.6-flash': [2534, 298, 6183, 0, 9015], 'claude-sonnet-4-6': [1000, 300, 5000, 200, 6500] })
    expect(9015 - (2534 + 298)).toBe(6183)
  })

  it('a call without a model counts toward the total and enters no model bucket (AC-04)', async () => {
    const p = mkProject('p')
    trust([p])
    const noModel = callRecord({ conversationId: 'conv-m', stepIdx: 3, genIdx: 1, usage: { messageId: 'm-nomodel', input: 100, output: 10 }, createdAt: oct(26), completedAt: oct(26) })
    // A step whose call no generator record names
    const stepOnly = encodeStepMetadata({ conversationId: 'conv-m', stepIndex: 5, createdAt: oct(26), completedAt: oct(26), usage: { messageId: 'm-steponly', input: 200, output: 20 } })
    usageConversation('conv-m', [p], [{ usage: { messageId: 'm-model', input: 1000, output: 100 }, at: oct(26), model: 'gemini-3.6-flash' }], {
      steps: [noModel.step, { idx: 5, metadata: stepOnly }],
      gens: [noModel.gen]
    })
    const r = await build()
    expect(agyTotal(r)).toBe(1100 + 110 + 220)
    expect(agyRows(r).map((x) => [x.model, x.total]).sort()).toEqual([['', 330], ['gemini-3.6-flash', 1100]])
    expect(r.global.byModel.map((m) => [m.model, m.total])).toEqual([['gemini-3.6-flash', 1100]])
  })

  it('a call\'s day is its step\'s completion, else its creation; a generator record with no step is undated (AC-05)', async () => {
    const p = mkProject('p')
    trust([p])
    const steps: StepRow[] = [
      // Created before local midnight, completed after it
      { idx: 1, metadata: encodeStepMetadata({ conversationId: 'conv-d', stepIndex: 1, createdAt: oct(27, 23, 59, 50), completedAt: oct(28, 0, 0, 10), usage: { messageId: 'm-mid', input: 100, output: 10 } }) },
      // Never completed
      { idx: 3, metadata: encodeStepMetadata({ conversationId: 'conv-d', stepIndex: 3, createdAt: oct(27, 9), usage: { messageId: 'm-open', input: 200, output: 20 } }) }
    ]
    const gens: GenRow[] = [
      { idx: 0, data: encodeGeneratorMetadata({ stepIndices: [1, 2], usage: { messageId: 'm-mid', input: 100, output: 10 }, responseModel: 'gemini-3.6-flash', conversationId: 'conv-d' }) },
      // A generator record with tokens and no step (a derived shape: every measured one with tokens names its step)
      { idx: 1, data: encodeGeneratorMetadata({ usage: { messageId: 'm-undated', input: 50, output: 5 }, responseModel: 'gemini-3.6-flash', conversationId: 'conv-d' }) }
    ]
    usageConversation('conv-d', [p], [], { steps, gens })
    const r = await build()
    expect(agyRows(r).map((x) => [x.day, x.total]).sort()).toEqual([['', 55], ['2026-10-27', 220], ['2026-10-28', 110]])
    expect(agyTotal(r)).toBe(385)
  })

  it('a subagent conversation\'s usage counts, credited to its folder (AC-07)', async () => {
    trust([MEASURED_FOLDER])
    usageConversation('conv-sub', [], [{ usage: { messageId: 'm-sub', input: 6984, output: 164 }, at: oct(28) }], { record: measured('subagent') })
    const r = await build()
    expect(agyTotal(r)).toBe(7148)
    expect(projectTotal(r, MEASURED_FOLDER)).toBe(7148)
  })

  it('credited to the first folder listed; an untrusted folder counts globally and in no registered project; a remote first folder in none (AC-08)', async () => {
    const a = mkProject('alpha')
    const b = mkProject('bravo')
    const u = mkProject('untrusted')
    trust([a, b])
    usageConversation('conv-two', [a, b], [{ usage: { messageId: 'm-two', input: 100 }, at: oct(26) }])
    usageConversation('conv-u', [u], [{ usage: { messageId: 'm-u', input: 1000 }, at: oct(26) }])
    usageConversation('conv-remote', [], [{ usage: { messageId: 'm-r', input: 10_000 }, at: oct(26) }], {
      record: encodeTrajectoryMetadata({ folders: [], conversationId: 'conv-remote', rawUris: ['vscode-remote://ssh-remote+host/home/x', pathToFileURL(a).href] })
    })
    const r = await build()
    expect(agyTotal(r)).toBe(11_100)
    expect([projectTotal(r, a), projectTotal(r, b) ?? 0]).toEqual([100, 0])
    expect((await scan(roots(), { now: () => 1 })).projects.map((e) => e.name).sort()).toEqual(['alpha', 'bravo'])
  })

  it('the conversation agy creates when its interface is opened contributes nothing and is not unreadable (AC-09)', async () => {
    trust([MEASURED_FOLDER])
    mkdirSync(conversations(), { recursive: true })
    writeConversation(conversations(), 'opened', measured('emptyConversation'))
    const r = await build()
    expect([agyRows(r), r.antigravityUnreadable, agyTotal(r)]).toEqual([[], 0, 0])
  })

  it('a conversation\'s own id is the one its database records, not its file\'s name (AC-06)', async () => {
    const p = mkProject('p')
    trust([p])
    const file = usageConversation('conv-x', [p], [{ usage: { messageId: 'm-x', input: 100, output: 10 }, at: oct(26) }])
    renameSync(file, join(conversations(), 'renamed.db'))
    expect(agyTotal(await build())).toBe(110)
  })

})

describe('conversations that cannot be read (token-stats::REQ-004)', () => {
  it('each unreadable shape is left out of every figure and counted; the others still count (AC-01, CON-001)', async () => {
    const p = mkProject('p')
    trust([p])
    const bad: CallSpec[] = [{ usage: { messageId: 'm-bad', input: 5000 }, at: oct(26) }]
    usageConversation('good', [p], [{ usage: { messageId: 'm-good', input: 100, output: 10 }, at: oct(26) }])
    usageConversation('version-2', [p], bad, { userVersion: 2 })
    usageConversation('no-metadata-column', [p], [], {
      alterSchema: (sql) => (sql.startsWith('CREATE TABLE `steps`') ? 'CREATE TABLE `steps` (`idx` integer,`step_type` integer,`status` integer,PRIMARY KEY (`idx`))' : sql)
    })
    usageConversation('no-gen-table', [p], [], { alterSchema: (sql) => (sql.startsWith('CREATE TABLE `gen_metadata`') ? null : sql) })
    const cut = callRows('gen-cut', bad)
    usageConversation('gen-cut', [p], [], { steps: cut.steps, gens: cut.gens.map((g) => ({ idx: g.idx, data: g.data.subarray(0, g.data.length - 3) })) })
    usageConversation('trajectory-cut', [p], bad, { record: measured('mainApiKey').subarray(0, 40) })
    writeFileSync(join(conversations(), 'zero.db'), '')
    writeFileSync(join(conversations(), 'text.db'), 'not a database')
    // The trajectory table without its cascade id, and with no row at all: nothing says which steps are the
    // conversation's own
    usageConversation('no-cascade-column', [p], bad, {
      alterSchema: (sql) =>
        sql.startsWith('CREATE TABLE `trajectory_meta`')
          ? 'CREATE TABLE `trajectory_meta` (`trajectory_id` text,`cascade` text,`trajectory_type` integer,`source` integer,PRIMARY KEY (`trajectory_id`))'
          : sql
    })
    const noRow = new DatabaseSync(usageConversation('no-trajectory-row', [p], bad))
    noRow.exec('DELETE FROM trajectory_meta')
    noRow.close()
    const r = await build()
    expect(r.antigravityUnreadable).toBe(9)
    expect(agyTotal(r)).toBe(110)
  })

  it('a read that fails while a log is beside the database is not counted, keeps the last result, and is read again (AC-03)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('busy', [p], [{ usage: { messageId: 'm-b1', input: 100, output: 10 }, at: oct(26) }], { keepOpen: true })
    expect(agyTotal(await build())).toBe(110)
    // agy writes on: a second call lands in the log, and a conversation never read before appears, also being written
    const more = callRows('busy', [{ usage: { messageId: 'm-b2', input: 200, output: 20 }, at: oct(26) }], 3, 1)
    insertSteps(writers[0], more.steps)
    insertGens(writers[0], more.gens)
    usageConversation('fresh', [p], [{ usage: { messageId: 'm-f', input: 1000, output: 100 }, at: oct(26) }], { keepOpen: true })
    const failed = await build(copyFails)
    expect([agyTotal(failed), failed.antigravityUnreadable]).toEqual([110, 0])
    expect(agyTotal(await build())).toBe(330 + 1100)
  })

  describe('a conversation deleted between the scan\'s listing and its read is not unreadable', () => {
    function two(): string {
      const p = mkProject('p')
      trust([p])
      usageConversation('stays', [p], [{ usage: { messageId: 'm-s', input: 100, output: 10 }, at: oct(26) }])
      return usageConversation('goes', [p], [{ usage: { messageId: 'm-g', input: 1000, output: 100 }, at: oct(26) }])
    }

    it('deleted after the walk listed it: it leaves the figures in that scan', async () => {
      const goes = two()
      expect(agyTotal(await build())).toBe(1210)
      const walked = walkSessions(roots())
      rmSync(goes)
      const r = await new TokenEngine(cacheDir()).build(roots(), [], undefined, walked)
      expect([agyTotal(r), r.antigravityUnreadable]).toEqual([110, 0])
    })

    it('deleted while its read is under way: that scan keeps its last result, and the next leaves it out', async () => {
      const goes = two()
      expect(agyTotal(await build())).toBe(1210)
      // Its time moves, so the next scan reads it again; the database goes just before that read
      utimesSync(goes, new Date(), new Date())
      const deleting: ParseRunner = {
        run: (job) => {
          if (job.kind === 'antigravity' && job.file === goes) rmSync(goes)
          return runParseJob(job)
        },
        concurrency: 1
      }
      const during = await build(deleting)
      expect([agyTotal(during), during.antigravityUnreadable]).toEqual([1210, 0])
      const next = await build()
      expect([agyTotal(next), next.antigravityUnreadable]).toEqual([110, 0])
    })
  })

  it('an unreadable conversation agy then writes is not counted while its read fails, and counted again once agy closes it (AC-03)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('good', [p], [{ usage: { messageId: 'm-g', input: 100, output: 10 }, at: oct(26) }])
    const file = usageConversation('version-2', [p], [{ usage: { messageId: 'm-v1', input: 5000 }, at: oct(26) }], { userVersion: 2 })
    const closed = await build()
    expect([existsSync(`${file}-wal`), closed.antigravityUnreadable, agyTotal(closed)]).toEqual([false, 1, 110])
    // agy, updated, writes on in its new format: a log appears beside the database
    const writer = new DatabaseSync(file)
    writers.push(writer)
    insertSteps(writer, callRows('version-2', [{ usage: { messageId: 'm-v2', input: 6000 }, at: oct(26) }], 3, 1).steps)
    const writing = await build()
    expect([existsSync(`${file}-wal`), writing.antigravityUnreadable, agyTotal(writing)]).toEqual([true, 0, 110])
    // agy exits: its last connection merges the log into the database and deletes it
    writers.pop()?.close()
    const again = await build()
    expect([existsSync(`${file}-wal`), again.antigravityUnreadable, agyTotal(again)]).toEqual([false, 1, 110])
  })

  it('a conversation in another format gives its folder no activity either (AC-01)', () => {
    const p = mkProject('p')
    const good = mkProject('good')
    trust([p, good])
    usageConversation('version-2', [p], [], { userVersion: 2 })
    usageConversation('no-metadata-column', [p], [], {
      alterSchema: (sql) => (sql.startsWith('CREATE TABLE `steps`') ? 'CREATE TABLE `steps` (`idx` integer,`step_type` integer,`status` integer,PRIMARY KEY (`idx`))' : sql)
    })
    usageConversation('no-gen-table', [p], [], { alterSchema: (sql) => (sql.startsWith('CREATE TABLE `gen_metadata`') ? null : sql) })
    usageConversation('fine', [good], [])
    const byName: Record<string, string | null> = Object.fromEntries(readAntigravitySessions(agyRoot()).map((s) => [basename(s.file), s.cwd]))
    expect(byName).toEqual({ 'version-2.db': null, 'no-metadata-column.db': null, 'no-gen-table.db': null, 'fine.db': good })
  })

  it('a walk read that fails while a log is beside the database keeps the last folder, and reads it again next time (AC-03)', () => {
    const first = mkProject('first1')
    const second = mkProject('second')
    mkdirSync(conversations(), { recursive: true })
    const { writer } = writeConversation(conversations(), 'busy', encodeTrajectoryMetadata({ folders: [first], conversationId: 'busy' }), { keepOpen: true })
    if (!writer) throw new Error('no writer')
    writers.push(writer)
    const usable = join(dir, 'tmp')
    mkdirSync(usable)
    expect(readAntigravitySessions(agyRoot(), usable).map((s) => s.cwd)).toEqual([first])
    // agy rewrites the record (its log changes) while the next read cannot make its copy
    writer.prepare("UPDATE trajectory_metadata_blob SET data = ? WHERE id = 'main'").run(encodeTrajectoryMetadata({ folders: [second], conversationId: 'busy' }))
    expect(readAntigravitySessions(agyRoot(), join(dir, 'no-such-dir')).map((s) => s.cwd)).toEqual([first])
    expect(readAntigravitySessions(agyRoot(), usable).map((s) => s.cwd)).toEqual([second])
  })
})

describe('reading usage writes nothing, and reads a conversation again only when it changed', () => {
  it('a closed conversation and one agy is writing: the directory is unchanged, and the calls only the log holds count (token-stats::CON-002)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('quiet', [p], [{ usage: { messageId: 'm-q', input: 100, output: 10 }, at: oct(26) }])
    usageConversation('busy', [p], [{ usage: { messageId: 'm-b', input: 200, output: 20 }, at: oct(26) }], { keepOpen: true })
    const before = listing(conversations())
    expect(before.map((l) => l.split(' ')[0])).toEqual(['busy.db', 'busy.db-shm', 'busy.db-wal', 'quiet.db'])
    expect(agyTotal(await build())).toBe(330)
    expect(listing(conversations())).toEqual(before)
  })

  it('a conversation whose log changed while its database\'s size and time did not is read again', async () => {
    const p = mkProject('p')
    trust([p])
    const file = usageConversation('busy', [p], [{ usage: { messageId: 'm-1', input: 100, output: 10 }, at: oct(26) }], { keepOpen: true })
    expect(agyTotal(await build())).toBe(110)
    const db = statSync(file)
    const more = callRows('busy', [{ usage: { messageId: 'm-2', input: 300, output: 30 }, at: oct(26) }], 3, 1)
    insertSteps(writers[0], more.steps)
    insertGens(writers[0], more.gens)
    expect([statSync(file).size, statSync(file).mtimeMs], 'the database itself must not have moved').toEqual([db.size, db.mtimeMs])
    expect(agyTotal(await build())).toBe(440)
  })

  it('an unchanged conversation is not read again, and one that could not be read stays counted', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('good', [p], [{ usage: { messageId: 'm-g', input: 100, output: 10 }, at: oct(26) }])
    usageConversation('version-2', [p], [], { userVersion: 2 })
    const jobs: string[] = []
    const counting: ParseRunner = {
      run: (job) => {
        jobs.push(job.kind)
        return runParseJob(job)
      },
      concurrency: 1
    }
    const first = await build(counting)
    expect([jobs, first.antigravityUnreadable, agyTotal(first)]).toEqual([['antigravity', 'antigravity'], 1, 110])
    jobs.length = 0
    const second = await build(counting)
    expect([jobs, second.antigravityUnreadable, agyTotal(second)]).toEqual([[], 1, 110])
  })
})

describe('a corrupt cache entry for a conversation', () => {
  // Within one cache version only the shape guard stands between a corrupt entry and the aggregation (the cache's own
  // rule): a conversation's entry gone bad on disk must be read again, not crash the scan or the session page
  it('is read again rather than failing the build or the session page', async () => {
    const p = mkProject('p')
    trust([p])
    const file = usageConversation('conv-c', [p], [{ usage: { messageId: 'm-c', input: 100, output: 10 }, at: oct(26) }])
    writeTranscript(agyRoot(), 'conv-c', MEASURED_TRANSCRIPT.dispatch)
    expect(agyTotal(await build())).toBe(110)
    const cacheFile = join(cacheDir(), 'token-cache.json')
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as { files: Record<string, unknown> }
    for (const entry of [{ sig: '1:1', agg: null }, null]) {
      cache.files[file] = entry
      writeFileSync(cacheFile, JSON.stringify(cache))
      expect(agyTotal(await build())).toBe(110)
      cache.files[file] = entry
      writeFileSync(cacheFile, JSON.stringify(cache))
      const page = new TokenEngine(cacheDir()).sessionQuestions(roots(), file)
      // A corrupt entry is read again for the page; an absent one is a session the scan never indexed (every side's rule)
      if (entry === null) await expect(page).rejects.toSatisfy((err: unknown) => decodeAppError(err)?.code === ERR.sessionNotIndexed)
      else expect((await page).questions).toHaveLength(1)
    }
  })

  // A sentinel call the real conversation does not hold: a build that shows it reused the entry
  const sentinel = ['m-sentinel', oct(26), 999_000, 0, 0, 0, 'gemini-3.6-flash']
  const wellFormed = {
    projectKey: '',
    unreadable: false,
    calls: [sentinel],
    conversationId: 'conv-g',
    subagent: false,
    listed: false,
    at: null,
    forkOf: null,
    title: null,
    questions: []
  }
  it.each([
    ['projectKey'],
    ['unreadable'],
    ['calls'],
    ['conversationId'],
    ['subagent'],
    ['listed'],
    ['at'],
    ['forkOf'],
    ['title'],
    ['questions']
  ])('an entry missing %s, under the conversation\'s current signature, is read again rather than reused', async (missing) => {
    const p = mkProject('p')
    trust([p])
    const file = usageConversation('conv-g', [p], [{ usage: { messageId: 'm-g', input: 100, output: 10 }, at: oct(26) }])
    expect(agyTotal(await build())).toBe(110)
    const cacheFile = join(cacheDir(), 'token-cache.json')
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as { files: Record<string, { sig: string; agg: unknown }> }
    const sig = cache.files[file].sig
    // The control: a well-formed entry under that signature is reused, so the signature is the one the engine matches
    cache.files[file] = { sig, agg: { kind: 'antigravity', file, ...wellFormed } }
    writeFileSync(cacheFile, JSON.stringify(cache))
    expect(agyTotal(await build())).toBe(999_000)
    const partial: Record<string, unknown> = { ...wellFormed }
    delete partial[missing]
    cache.files[file] = { sig, agg: { kind: 'antigravity', file, ...partial } }
    writeFileSync(cacheFile, JSON.stringify(cache))
    expect(agyTotal(await build())).toBe(110)
  })

  it.each([
    ["a call's seventh element", { calls: [sentinel.slice(0, 6)] }],
    ['a question record of another arity', { questions: [[0, 1, 2, null, 0, 0]] }],
    ['a title that is not a string', { title: 7 }]
  ])('an entry with %s is read again rather than reused', async (_what, change) => {
    const p = mkProject('p')
    trust([p])
    const file = usageConversation('conv-g', [p], [{ usage: { messageId: 'm-g', input: 100, output: 10 }, at: oct(26) }])
    expect(agyTotal(await build())).toBe(110)
    const cacheFile = join(cacheDir(), 'token-cache.json')
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as { files: Record<string, { sig: string; agg: unknown }> }
    cache.files[file] = { sig: cache.files[file].sig, agg: { kind: 'antigravity', file, ...wellFormed, ...change } }
    writeFileSync(cacheFile, JSON.stringify(cache))
    expect(agyTotal(await build())).toBe(110)
  })
})

describe('the archive keeps what a scan saw (token-stats C10)', () => {
  // The calls are on 26 October; the scans run on the 28th, so their day is a past day
  const anchor = oct(28)
  const stamp = { stamp: '0.0.0+c0' }
  const pastDay = (rows: TokenBuildResult['rows']): number =>
    rows.filter((x) => x.side === 'antigravity' && x.day === '2026-10-26').reduce((a, x) => a + x.total, 0)

  it('a fork\'s parent deleted after a scan saw it: the past day keeps the calls the fork had copied (REQ-003/AC-06)', async () => {
    const p = mkProject('p')
    trust([p])
    const parent = callRows('conv-parent', [{ usage: { messageId: 'm-p1', input: 1000, output: 100 }, at: oct(26) }])
    const parentFile = usageConversation('conv-parent', [p], [], { steps: parent.steps, gens: parent.gens })
    const own = callRows('conv-fork', [{ usage: { messageId: 'm-f1', input: 500, output: 50 }, at: oct(26) }], 3, 1)
    usageConversation('conv-fork', [p], [], { steps: [...parent.steps, ...own.steps], gens: [...parent.gens, ...own.gens] })
    const archive = new UsageArchive(join(dir, 'archive'), stamp)
    expect(pastDay(archive.merge((await build()).rows, anchor).rows)).toBe(1650)
    rmSync(parentFile)
    const live = (await build()).rows
    expect(pastDay(live)).toBe(550)
    expect(pastDay(archive.merge(live, anchor).rows)).toBe(1650)
  })

  it('a conversation turning unreadable under the same stamp: the past day keeps its figure and the count rises (REQ-004/AC-04)', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('stays', [p], [{ usage: { messageId: 'm-s', input: 100, output: 10 }, at: oct(26) }])
    const file = usageConversation('turns', [p], [{ usage: { messageId: 'm-t', input: 1000, output: 100 }, at: oct(26) }])
    const archive = new UsageArchive(join(dir, 'archive'), stamp)
    expect(pastDay(archive.merge((await build()).rows, anchor).rows)).toBe(1210)
    // agy, updated, rewrites the conversation in a format this reader does not support
    rmSync(file)
    usageConversation('turns', [p], [{ usage: { messageId: 'm-t', input: 1000, output: 100 }, at: oct(26) }], { userVersion: 2 })
    const r = await build()
    expect([pastDay(r.rows), r.antigravityUnreadable]).toEqual([110, 1])
    expect(pastDay(archive.merge(r.rows, anchor).rows)).toBe(1210)
  })

  it('a rewind deletes a call: the next scan\'s figure falls and the past day keeps what a scan saw', async () => {
    const p = mkProject('p')
    trust([p])
    usageConversation('conv-r', [p], [
      { usage: { messageId: 'm-r1', input: 100, output: 10 }, at: oct(26) },
      { usage: { messageId: 'm-r2', input: 200, output: 20 }, at: oct(26) }
    ], { keepOpen: true })
    const archive = new UsageArchive(join(dir, 'archive'), stamp)
    expect(pastDay(archive.merge((await build()).rows, anchor).rows)).toBe(330)
    // agy's rewind deletes the rewound call's step and generator record (measured)
    writers[0].exec('DELETE FROM steps WHERE idx >= 3')
    writers[0].exec('DELETE FROM gen_metadata WHERE idx >= 1')
    const live = (await build()).rows
    expect(pastDay(live)).toBe(110)
    expect(pastDay(archive.merge(live, anchor).rows)).toBe(330)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Sessions (session-view::REQ-003, REQ-004, REQ-005, US-001): a conversation database is the session, its transcript
// holds the questions and turns, and agy's summaries database the title. The transcripts are agy's own
// (agy-transcript-fixture.ts); the summaries rows copy the real titles.
describe('sessions: the list, the page and forks (session-view::REQ-003, REQ-004, REQ-005)', () => {
  const T = MEASURED_TRANSCRIPT
  const ID = MEASURED_TRANSCRIPT_ID
  const sessionsOf = (r: TokenBuildResult, folder: string): SessionMeta[] => r.perProject.get(mergeKey(folder))?.sessions ?? []
  const engine = (): TokenEngine => new TokenEngine(cacheDir())
  /** The page's question texts, read from the session's read source by range as the session page reads them */
  async function questionTexts(e: TokenEngine, file: string): Promise<Array<string | null>> {
    const q = await e.sessionQuestions(roots(), file)
    const { texts } = await readRanges(q.source, q.questions.map((r) => ({ start: r[0], end: r[1] })))
    return texts.map((t) => questionTextOfRange(q.side, t))
  }
  /** A step agy records for a user's input: its creation time and no call */
  const inputStep = (conversationId: string, idx: number, at: number): StepRow => ({
    idx,
    type: 14,
    metadata: encodeStepMetadata({ conversationId, stepIndex: idx, createdAt: at })
  })
  /** The derived question line: the measured user-input shape at a later step */
  const question = (step: number, text: string): string =>
    JSON.stringify({ step_index: step, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-28T08:30:00Z', content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-10-28T16:30:00+08:00.\n</ADDITIONAL_METADATA>` })

  /** A trusted folder with the measured dispatching conversation (two calls and a later input step; its db's time set
   * apart from its steps'), its subagent, the conversation agy creates when opened, and one that asked nothing */
  function dispatchHome(): { p: string; main: string; sub: string; empty: string; silent: string } {
    const p = mkProject('demo')
    trust([p])
    const main = usageConversation(ID.dispatch, [p], [
      { usage: { messageId: 'm-d1', input: 100, output: 10 }, at: oct(26, 10) },
      { usage: { messageId: 'm-d2', input: 200, output: 20 }, at: oct(26, 11) }
    ], { steps: [inputStep(ID.dispatch, 5, oct(26, 12))] })
    utimesSync(main, oct(20) / 1000, oct(20) / 1000)
    writeTranscript(agyRoot(), ID.dispatch, T.dispatch)
    const sub = usageConversation(ID.subagent, [p], [{ usage: { messageId: 'm-s1', input: 6984, output: 164 }, at: oct(26, 10) }], {
      record: encodeTrajectoryMetadata({ folders: [p], conversationId: ID.subagent, parentConversationId: ID.dispatch, nestingDepth: 1, subagentSpec: true })
    })
    writeTranscript(agyRoot(), ID.subagent, T.subagent)
    const empty = conversation('438a6b76-5f66-490d-8506-613ed88f6d68', [p], oct(26) / 1000)
    const silent = usageConversation('conv-silent', [p], [{ usage: { messageId: 'm-q1', input: 50, output: 5 }, at: oct(26) }])
    writeTranscript(agyRoot(), 'conv-silent', [T.main[5]])
    writeSummaries(agyRoot(), [{ id: ID.dispatch, title: MEASURED_TITLE[ID.dispatch] }, { id: ID.subagent, title: '' }])
    return { p, main, sub, empty, silent }
  }

  it('one row per conversation that asked something: agy\'s title, its largest step time, its own tokens (REQ-003/AC-01 to AC-05)', async () => {
    const { p, main } = dispatchHome()
    const r = await build()
    expect(sessionsOf(r, p)).toEqual([
      { side: 'antigravity', title: 'List Calc.py Function Names', at: oct(26, 12), tokens: 330, file: main, questionCount: 1, forkState: 'none' }
    ])
    // The subagent, the opened-and-left conversation and the one that asked nothing have no row; their tokens count
    expect(agyTotal(r)).toBe(330 + 7148 + 55)
    expect(r.antigravityUnreadable).toBe(0)
  })

  it('the page: the session ID is the database\'s name, the questions come from the transcript (US-001/AC-01, REQ-004/AC-01)', async () => {
    const { main } = dispatchHome()
    await build()
    const e = engine()
    const q = await e.sessionQuestions(roots(), main)
    expect([q.side, q.sessionId, q.source, q.title, q.forkState]).toEqual([
      'antigravity', '78543117-17bd-4161-bc47-c256f29f31eb', transcriptFile(agyRoot(), ID.dispatch), 'List Calc.py Function Names', 'none'
    ])
    expect(await questionTexts(e, main)).toEqual([
      'Use the invoke_subagent tool to start one subagent of type self. Its task: list the names of the functions defined in calc.py. Wait for its answer and then report the list in one line.'
    ])
  })

  it('opening a session reads only its questions\' ranges, never the whole transcript (REQ-004/AC-02)', async () => {
    const { main } = dispatchHome()
    writeTranscript(agyRoot(), ID.dispatch, [
      ...T.dispatch,
      JSON.stringify({ step_index: 8, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-28T08:10:20Z', content: 'z'.repeat(1024 * 1024) })
    ])
    await build()
    const q = await engine().sessionQuestions(roots(), main)
    const { bytesRead } = await readRanges(q.source, q.questions.map((r) => ({ start: r[0], end: r[1] })))
    expect(bytesRead).toBeGreaterThan(0)
    expect(bytesRead).toBeLessThan(5_000)
    expect(statSync(q.source).size).toBeGreaterThan(1024 * 1024)
  })

  it('the read allow-list holds the listed conversation\'s database alone — never a transcript path, nor a subagent (REQ-004/AC-09)', async () => {
    const { main, sub } = dispatchHome()
    const r = await build()
    expect(sessionReadTarget(r.sessionFiles, main)).toBe(main)
    expect(sessionReadTarget(r.sessionFiles, sub)).toBeNull()
    expect(sessionReadTarget(r.sessionFiles, transcriptFile(agyRoot(), ID.subagent))).toBeNull()
    expect(sessionReadTarget(r.sessionFiles, transcriptFile(agyRoot(), ID.dispatch))).toBeNull()
    expect([...r.sessionFiles]).toEqual([main])
  })

  it('a subagent conversation that was asked something still gets no row and is not admitted (REQ-003/AC-01, REQ-004/AC-09, token-stats::REQ-003/AC-07)', async () => {
    const { p, main, sub } = dispatchHome()
    // Derived: no subagent transcript measured holds a user-input line; a user resuming a subagent by its ID would
    // write one. The control: the same transcript in a conversation whose record names no parent is listed
    const asked = [...T.subagent, question(7, 'Which of them is the longest?')]
    writeTranscript(agyRoot(), ID.subagent, asked)
    const control = usageConversation('conv-control', [p], [{ usage: { messageId: 'm-k', input: 30, output: 3 }, at: oct(25) }])
    writeTranscript(agyRoot(), 'conv-control', asked)
    const r = await build()
    expect(sessionsOf(r, p).map((s) => [s.file, s.questionCount])).toEqual([
      [main, 1],
      [control, 1]
    ])
    expect(agyTotal(r)).toBe(330 + 7148 + 55 + 33)
    expect(sessionReadTarget(r.sessionFiles, sub)).toBeNull()
    expect([...r.sessionFiles].sort()).toEqual([main, control].sort())
  })

  it.each([
    ['no summaries database', (): void => undefined],
    ['an empty title, as agy leaves a fork\'s', (): void => void writeSummaries(agyRoot(), [{ id: ID.dispatch, title: '' }])],
    ['a summaries file that is no database', (): void => writeFileSync(join(agyRoot(), 'conversation_summaries.db'), 'not a database')],
    [
      'a summaries database of another shape',
      (): void => void writeSummaries(agyRoot(), [], { alterSchema: (sql) => sql.replace('`title` text', '`name` text') })
    ]
  ])('the title falls back to the first question with %s (REQ-003/AC-03)', async (_case, summaries) => {
    const p = mkProject('demo')
    trust([p])
    const main = usageConversation(ID.dispatch, [p], [{ usage: { messageId: 'm-d1', input: 100, output: 10 }, at: oct(26, 10) }])
    writeTranscript(agyRoot(), ID.dispatch, T.dispatch)
    summaries()
    const r = await build()
    const want = 'Use the invoke_subagent tool to start one subagent of type s…'
    expect(sessionsOf(r, p).map((s) => s.title)).toEqual([want])
    expect((await engine().sessionQuestions(roots(), main)).title).toBe(want)
  })

  it('reading the summaries writes nothing there, and reads the titles only a log holds (token-stats::CON-002)', async () => {
    const { p } = dispatchHome()
    const before = listing(agyRoot())
    await build()
    expect(listing(agyRoot())).toEqual(before)
    // agy holds the summaries open and retitles the conversation: the new title is only in the log
    rmSync(join(agyRoot(), 'conversation_summaries.db'))
    const { writer } = writeSummaries(agyRoot(), [], { keepOpen: true })
    if (!writer) throw new Error('no writer')
    writers.push(writer)
    insertSummaries(writer, [{ id: ID.dispatch, title: 'Retitled While Running' }])
    const during = listing(agyRoot())
    expect(during.map((l) => l.split(' ')[0])).toContain('conversation_summaries.db-wal')
    const r = await build()
    expect(sessionsOf(r, p).map((s) => s.title)).toEqual(['Retitled While Running'])
    expect(listing(agyRoot())).toEqual(during)
  })

  it('a summaries read that fails while agy writes them keeps the titles last read (REQ-003/AC-03)', async () => {
    const { p, main } = dispatchHome()
    // The copy a read makes while a log is beside the summaries cannot be made: a read while agy writes that fails
    const e = new TokenEngine(cacheDir(), undefined, join(dir, 'no-such-dir'))
    const rebuild = (): Promise<TokenBuildResult> => e.build(roots(), [], undefined, walkSessions(roots()))
    expect(sessionsOf(await rebuild(), p).map((s) => s.title)).toEqual(['List Calc.py Function Names'])
    rmSync(join(agyRoot(), 'conversation_summaries.db'))
    const { writer } = writeSummaries(agyRoot(), [], { keepOpen: true })
    if (!writer) throw new Error('no writer')
    writers.push(writer)
    insertSummaries(writer, [{ id: ID.dispatch, title: 'Retitled While Running' }])
    // Neither the log's title (a read that worked) nor the first question (the titles dropped)
    expect(sessionsOf(await rebuild(), p).map((s) => s.title)).toEqual(['List Calc.py Function Names'])
    // With no titles read before, the same failure falls back to the first question: at a build, and on a page asked
    // for before any build
    const fallback = 'Use the invoke_subagent tool to start one subagent of type s…'
    const fresh = (): TokenEngine => new TokenEngine(cacheDir(), undefined, join(dir, 'no-such-dir'))
    expect((await fresh().sessionQuestions(roots(), main)).title).toBe(fallback)
    expect(sessionsOf(await fresh().build(roots(), [], undefined, walkSessions(roots())), p).map((s) => s.title)).toEqual([fallback])
  })

  it('a changed transcript is indexed again for that conversation alone, its database untouched (C4)', async () => {
    const { p, main } = dispatchHome()
    await build()
    const e = engine()
    expect(e.isFresh(main)).toBe(true)
    const db = statSync(main)
    appendFileSync(transcriptFile(agyRoot(), ID.dispatch), `${question(8, 'And which one is the longest?')}\n`)
    expect(e.isFresh(main)).toBe(false)
    expect(await questionTexts(e, main)).toEqual([
      'Use the invoke_subagent tool to start one subagent of type self. Its task: list the names of the functions defined in calc.py. Wait for its answer and then report the list in one line.',
      'And which one is the longest?'
    ])
    expect(e.isFresh(main)).toBe(true)
    expect([statSync(main).mtimeMs, statSync(main).size]).toEqual([db.mtimeMs, db.size])
    expect(sessionsOf(await build(), p).map((s) => s.questionCount)).toEqual([2])
  })

  it('a conversation that cannot be read is listed nowhere and has no page, its transcript notwithstanding (token-stats::REQ-004/AC-01)', async () => {
    const p = mkProject('demo')
    trust([p])
    const file = usageConversation(ID.main, [p], [{ usage: { messageId: 'm-v', input: 100 }, at: oct(26) }], { userVersion: 2 })
    writeTranscript(agyRoot(), ID.main, T.main)
    const r = await build()
    expect([sessionsOf(r, p), r.antigravityUnreadable, [...r.sessionFiles]]).toEqual([[], 1, []])
    await expect(engine().sessionQuestions(roots(), file)).rejects.toSatisfy((err: unknown) => decodeAppError(err)?.code === ERR.sessionParseFailed)
  })

  describe('forks (REQ-005)', () => {
    // The parent: the measured main conversation, two calls; a fork holds a copy of the parent's steps — their source
    // naming the parent (measured) — and steps of its own, its transcript the measured fork rewound once
    function parentAndFork(withParent: boolean): { p: string; parent: string; fork: string; silentFork: string } {
      const p = mkProject('demo')
      trust([p])
      const copied = callRows(ID.main, [
        { usage: { messageId: 'm-p1', input: 1000, output: 100 }, at: oct(26, 9) },
        { usage: { messageId: 'm-p2', input: 2000, output: 200 }, at: oct(26, 10) }
      ])
      const parent = join(conversations(), `${ID.main}.db`)
      if (withParent) {
        usageConversation(ID.main, [p], [], { steps: copied.steps, gens: copied.gens })
        writeTranscript(agyRoot(), ID.main, T.main)
      }
      const own = callRows(ID.forkRewound, [{ usage: { messageId: 'm-f1', input: 500, output: 50 }, at: oct(27, 9) }], 19, 2)
      const fork = usageConversation(ID.forkRewound, [p], [], { steps: [...copied.steps, ...own.steps], gens: [...copied.gens, ...own.gens] })
      writeTranscript(agyRoot(), ID.forkRewound, T.forkRewound)
      // A fork that asked nothing of its own: a notice is all its transcript holds
      const ownSilent = callRows('conv-silent-fork', [{ usage: { messageId: 'm-sf', input: 40, output: 4 }, at: oct(27, 9) }], 19, 2)
      const silentFork = usageConversation('conv-silent-fork', [p], [], { steps: [...copied.steps, ...ownSilent.steps], gens: [...copied.gens, ...ownSilent.gens] })
      writeTranscript(agyRoot(), 'conv-silent-fork', [T.main[5]])
      writeSummaries(agyRoot(), [{ id: ID.main, title: MEASURED_TITLE[ID.main] }, { id: ID.forkRewound, title: '' }])
      return { p, parent, fork, silentFork }
    }
    const forkTitle = 'In one short sentence, which function in calc.py is the simp…'

    it('a fork is listed as one with only its own questions and tokens; its page names its parent (AC-01 to AC-03, AC-05)', async () => {
      const { p, parent, fork } = parentAndFork(true)
      const r = await build()
      expect(sessionsOf(r, p).map((s) => [s.file, s.title, s.tokens, s.questionCount, s.forkState])).toEqual([
        [fork, forkTitle, 550, 1, 'stripped'],
        [parent, 'Explaining Calc.py Functionality', 3300, 4, 'none']
      ])
      // The silent fork has no row; its own call counts, and the copied calls once, with the parent
      expect(agyTotal(r)).toBe(3300 + 550 + 44)
      const e = engine()
      const q = await e.sessionQuestions(roots(), fork)
      expect([q.forkState, q.forkParentFile, q.forkParentTitle, q.title, q.sessionId]).toEqual([
        'stripped', parent, 'Explaining Calc.py Functionality', forkTitle, '8c07e920-698c-4969-a30b-0226832da747'
      ])
      expect(await questionTexts(e, fork)).toEqual(['In one short sentence, which function in calc.py is the simplest?'])
    })

    it('a fork whose parent is no longer here is still a fork, never uncertain, and names no parent (AC-04, AC-05)', async () => {
      const { p, fork } = parentAndFork(false)
      const r = await build()
      expect(sessionsOf(r, p).map((s) => [s.title, s.tokens, s.forkState])).toEqual([[forkTitle, 550, 'stripped']])
      const q = await engine().sessionQuestions(roots(), fork)
      expect([q.forkState, q.forkParentFile, q.forkParentTitle]).toEqual(['stripped', null, null])
    })

    it('the parent deleted after a scan: the next scan\'s page names no parent (the "parent deleted" failure mode)', async () => {
      const { parent, fork } = parentAndFork(true)
      await build()
      expect((await engine().sessionQuestions(roots(), fork)).forkParentFile).toBe(parent)
      rmSync(parent)
      await build()
      const q = await engine().sessionQuestions(roots(), fork)
      expect([q.forkState, q.forkParentFile, q.forkParentTitle]).toEqual(['stripped', null, null])
    })

    it('a fork whose parent cannot be read takes the no-longer-here form (the "parent that cannot be read" failure mode)', async () => {
      const { p, parent, fork } = parentAndFork(true)
      // Derived: agy rewriting the parent in a format the app does not support, the fork itself still readable
      const db = new DatabaseSync(parent)
      db.exec('PRAGMA user_version = 2')
      db.close()
      const r = await build()
      expect([sessionsOf(r, p).map((s) => [s.file, s.forkState]), r.antigravityUnreadable]).toEqual([[[fork, 'stripped']], 1])
      const q = await engine().sessionQuestions(roots(), fork)
      expect([q.forkState, q.forkParentFile, q.forkParentTitle]).toEqual(['stripped', null, null])
    })

    it('a fork\'s page names its parent with a corrupt cache entry ahead of it, before any build (the cache rule)', async () => {
      const { parent, fork, silentFork } = parentAndFork(true)
      await build()
      const cacheFile = join(cacheDir(), 'token-cache.json')
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as { files: Record<string, unknown> }
      for (const entry of [{ sig: '1:1', agg: null }, null]) {
        // The corrupt entry first, so the parent lookup meets it before the parent
        const rest = { ...cache.files }
        delete rest[silentFork]
        writeFileSync(cacheFile, JSON.stringify({ ...cache, files: { [silentFork]: entry, ...rest } }))
        const keys = Object.keys((JSON.parse(readFileSync(cacheFile, 'utf8')) as { files: Record<string, unknown> }).files)
        expect(keys.indexOf(silentFork)).toBeLessThan(keys.indexOf(parent))
        const q = await engine().sessionQuestions(roots(), fork)
        expect([q.forkParentFile, q.forkParentTitle]).toEqual([parent, 'Explaining Calc.py Functionality'])
      }
    })

    it('a fork of a fork names the conversation its last copied step came from (the "fork of a fork" failure mode)', async () => {
      // Derived from the measured mechanism: B copies A; C copies A's steps and B's own, B's last
      const p = mkProject('demo')
      trust([p])
      const a = callRows('conv-a', [{ usage: { messageId: 'm-a', input: 100, output: 10 }, at: oct(26, 9) }])
      usageConversation('conv-a', [p], [], { steps: a.steps, gens: a.gens })
      const b = callRows('conv-b', [{ usage: { messageId: 'm-b', input: 200, output: 20 }, at: oct(26, 10) }], 3, 1)
      const bFile = usageConversation('conv-b', [p], [], { steps: [...a.steps, ...b.steps], gens: [...a.gens, ...b.gens] })
      const c = callRows('conv-c', [{ usage: { messageId: 'm-c', input: 300, output: 30 }, at: oct(26, 11) }], 5, 2)
      const cFile = usageConversation('conv-c', [p], [], { steps: [...a.steps, ...b.steps, ...c.steps], gens: [...a.gens, ...b.gens, ...c.gens] })
      for (const id of ['conv-a', 'conv-b', 'conv-c']) writeTranscript(agyRoot(), id, [question(0, `question of ${id}`)])
      await build()
      const q = await engine().sessionQuestions(roots(), cFile)
      expect([q.forkState, q.forkParentFile, q.forkParentTitle]).toEqual(['stripped', bFile, 'question of conv-b'])
    })
  })
})
