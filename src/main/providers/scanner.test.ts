// The scanner (ADR-0043): what one scan hands the main process, and what the main process makes of it. The
// aggregation itself is the token engine's and has its own cases (token-stats.test.ts); these cover the steps a
// scan adds around it, which ran inline in the main process before and had no case below e2e.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyTokenStats } from '@shared/domain'
import { ERR } from '@shared/errors'
import { mergeKey } from '@shared/path-key'
import { UsageArchive } from './archive'
import { Scanner, settleScan } from './scanner'
import { runParseJob, type ParseRunner } from './token-stats'
import { loadEngineModule } from '../engine-module'
import { encodeTrajectoryMetadata, settingsJson, writeConversation } from '../testing/agy-fixture'
import { TEST_ENGINE, type PanicSeam } from '../testing/engine'
import { FORK_TITLE, mkScanHome, scanRoots, type ScanHome } from '../testing/scan-home'

let dir: string
let home: ScanHome
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-scanner-'))
  home = mkScanHome(join(dir, 'home'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('what a scan hands the main process (token-stats, "Where a scan runs")', () => {
  it('a snapshot whose session count is the listed sessions\', the unreadable Antigravity count, no token figures; the rows, each project\'s sessions and the read allow-list', async () => {
    const out = await new Scanner(join(dir, 'cache'), TEST_ENGINE).scan(home.roots)
    const listed = [home.claude.asked, home.codex.parent, home.codex.fork, home.grok, home.antigravity.listed]

    expect(out.snapshot.projects.map((p) => p.path)).toEqual([home.project])
    // Six session files are the project's; the one nobody asked anything in is not a session
    expect(out.snapshot.projects[0].sessionCount).toBe(5)
    expect(out.snapshot.sides.antigravity.unreadable).toBe(1)
    expect(out.snapshot.tokens).toEqual(emptyTokenStats())
    expect(out.snapshot.archivedDays).toEqual([])

    const sessions = out.sessions.get(mergeKey(home.project)) ?? []
    expect(sessions.map((s) => s.file).sort()).toEqual([...listed].sort())
    expect(sessions.find((s) => s.file === home.codex.fork)?.title).toBe(FORK_TITLE)
    // Not the Codex rollout from a directory that is no registered project, which asked a question too: the scan
    // hands the build the registered set, and without it any rollout with a directory is admitted (session-view R1)
    expect([...out.sessionFiles].sort()).toEqual([...listed].sort())
    // 15 and the undated 9 on Claude, 42 on Codex, 33 on Grok, 110 on Antigravity
    expect(out.rows.reduce((sum, r) => sum + r.total, 0)).toBe(209)
  })
})

describe('the session walk\'s memory, which a scanner keeps for its run', () => {
  const seam = (): PanicSeam => loadEngineModule(TEST_ENGINE) as PanicSeam
  afterEach(() => {
    seam().seamPanicWhileWalking(null)
  })

  // A read of a conversation that fails while agy writes it keeps the folder the last read found
  // (token-stats::REQ-004/AC-03): only a scan through the memory of the scans before it has one to keep
  it('a later scan keeps a conversation\'s folder through a read that fails while agy writes it; a new scanner holds no folder to keep', async () => {
    const roots = scanRoots(join(dir, 'agy-home'))
    const p = join(dir, 'work', 'p')
    mkdirSync(p, { recursive: true })
    const conversations = join(roots.antigravityHome, 'conversations')
    mkdirSync(conversations, { recursive: true })
    writeFileSync(join(roots.antigravityHome, 'settings.json'), settingsJson([p]))
    const { file, writer } = writeConversation(conversations, 'busy', encodeTrajectoryMetadata({ folders: [p], conversationId: 'busy' }), { keepOpen: true })
    try {
      utimesSync(file, 1_793_000_000, 1_793_000_000)
      utimesSync(`${file}-wal`, 1_793_000_000, 1_793_000_000)
      const scanner = new Scanner(join(dir, 'cache'), TEST_ENGINE)
      expect((await scanner.scan(roots)).snapshot.projects.map((e) => e.lastSessionAt)).toEqual([1_793_000_000_000])
      // agy writes on, so the next scan reads the conversation again, and that read fails
      utimesSync(`${file}-wal`, 1_793_000_100, 1_793_000_100)
      seam().seamPanicWhileWalking(file)
      expect((await scanner.scan(roots)).snapshot.projects.map((e) => e.lastSessionAt)).toEqual([1_793_000_100_000])
      expect((await new Scanner(join(dir, 'cache-new'), TEST_ENGINE).scan(roots)).snapshot.projects.map((e) => e.lastSessionAt)).toEqual([null])
    } finally {
      writer?.close()
    }
  })
})

// token-stats, Failure modes and boundaries: the token store, and projects-list B10. The scan's one walk is handed the
// files the store holds, so the build keeps those below a directory it cannot list, and the row's session count, the
// build's, keeps them; the row's time is the activity's own listing's, which keeps what it lists. Each row makes its
// side's sessions the project's latest, so that the time shows whose sessions it takes.
describe('a session directory a scan cannot list', () => {
  type Out = Awaited<ReturnType<Scanner['scan']>>
  const LATEST = 1_900_000_000
  const EARLIER = 1_800_000_000
  it.skipIf(process.getuid?.() === 0).each([
    { name: 'a registered Claude Code project\'s directory', locked: (): string => dirname(home.claude.asked), side: 'claude', latest: (): string[] => [home.claude.asked, home.claude.silent], kept: [5, EARLIER], shut: [4, EARLIER], unreadable: 1 },
    { name: 'Claude Code\'s projects directory', locked: (): string => dirname(dirname(home.claude.asked)), side: 'claude', latest: (): string[] => [home.claude.asked, home.claude.silent], kept: [5, LATEST], shut: [4, EARLIER], unreadable: 1 },
    { name: 'a Codex day\'s directory', locked: (): string => dirname(home.codex.parent), side: 'codex', latest: (): string[] => [home.codex.parent, home.codex.fork], kept: [5, EARLIER], shut: [3, EARLIER], unreadable: 1 },
    { name: 'a Grok project\'s directory', locked: (): string => dirname(dirname(home.grok)), side: 'grok', latest: (): string[] => [home.grok], kept: [5, EARLIER], shut: [4, EARLIER], unreadable: 1 },
    { name: 'Antigravity CLI\'s conversations', locked: (): string => dirname(home.antigravity.listed), side: 'antigravity', latest: (): string[] => [home.antigravity.listed], kept: [5, EARLIER], shut: [4, EARLIER], unreadable: 2 }
  ] as const)('below $name, a scan fails nowhere and keeps the files the store holds, in the row\'s session count and in its time where the activity lists them; once they cannot be looked at either, they leave', async ({ locked, side, latest, kept, shut, unreadable }) => {
    const sessions = [home.claude.asked, home.claude.silent, home.codex.parent, home.codex.fork, home.grok, home.antigravity.listed]
    const newest = latest()
    for (const f of sessions) utimesSync(f, newest.includes(f) ? LATEST : EARLIER, newest.includes(f) ? LATEST : EARLIER)
    const scanner = new Scanner(join(dir, 'cache'), TEST_ENGINE)
    const shape = (out: Out): unknown => ({ rows: out.rows, sessions: [...out.sessions], sessionFiles: [...out.sessionFiles], unreadable: out.snapshot.sides.antigravity.unreadable })
    const row = (out: Out): unknown => out.snapshot.projects.map((p) => [p.sessionCount, p.lastSessionAt])
    const tokens = (out: Out): number => out.rows.filter((r) => r.side === side).reduce((n, r) => n + r.total, 0)
    const ms = ([count, at]: readonly [number, number]): unknown => [[count, at * 1000]]
    const first = await scanner.scan(home.roots)
    expect([row(first), tokens(first) > 0, first.snapshot.sides.antigravity.unreadable], 'the control: five sessions, the latest this side\'s, its tokens counted, one conversation unreadable').toEqual([ms([5, LATEST]), true, 1])
    chmodSync(locked(), 0o300)
    try {
      const listedNot = await scanner.scan(home.roots)
      expect(shape(listedNot)).toEqual(shape(first))
      expect(row(listedNot)).toEqual(ms(kept))
      chmodSync(locked(), 0o000)
      const enteredNot = await scanner.scan(home.roots)
      expect([row(enteredNot), tokens(enteredNot), enteredNot.snapshot.sides.antigravity.unreadable]).toEqual([ms(shut), 0, unreadable])
    } finally {
      chmodSync(locked(), 0o755)
    }
    const back = await scanner.scan(home.roots)
    expect([shape(back), row(back)]).toEqual([shape(first), row(first)])
  })
})

// Claude Code's registry, read at each scan, credits each session to the project its directory maps to (token-stats A2).
// A read that fails says nothing of the mapping: each stored session keeps the project it holds, with nothing parsed, and
// no past day's rows move between projects, which would leave the usage archive a superseded value each way. A registry
// that is not there, or that lists no project, is read: the sessions are then no project's (token-stats, failure modes).
describe('Claude Code\'s registry at each scan', () => {
  type Out = Awaited<ReturnType<Scanner['scan']>>
  /** The Claude Code rows, each by whether it has a day (which one is the time zone's), its project and its total, and
   * each project that lists a Claude Code session with those it lists */
  function claudeOf(out: Out): unknown {
    const p = (key: string): string => (key === mergeKey(home.project) ? '<project>' : key)
    const listed = [...out.sessions].map(([key, list]) => [p(key), list.filter((s) => s.side === 'claude').map((s) => s.file)] as const)
    return {
      rows: out.rows.filter((r) => r.side === 'claude').map((r) => [r.day ? 'dated' : 'undated', p(r.projectKey), r.total]),
      sessions: listed.filter(([, files]) => files.length > 0)
    }
  }
  /** A scanner whose parses are recorded: `parsed` gives the files parsed since it was last asked */
  function recorded(): { scanner: Scanner; parsed: () => string[] } {
    const files: string[] = []
    const runner: ParseRunner = { concurrency: 1, run: (job) => { files.push(job.file); return runParseJob(job) } }
    return { scanner: new Scanner(join(dir, 'cache'), TEST_ENGINE, runner), parsed: () => files.splice(0).sort() }
  }
  const credited = (): unknown => ({
    rows: [['dated', '<project>', 15], ['undated', '<project>', 9]],
    sessions: [['<project>', [home.claude.asked]]]
  })

  async function heldThrough(broken: { error: string; apply: () => void; undo: () => void }): Promise<void> {
    const { scanner, parsed } = recorded()
    const archive = new UsageArchive(join(dir, 'cache'), { stamp: 'test' })
    const first = await scanner.scan(home.roots)
    settleScan(first, archive)
    expect(claudeOf(first), 'the control').toEqual(credited())
    parsed()
    broken.apply()
    try {
      const failed = await scanner.scan(home.roots)
      expect(failed.snapshot.sides.claude.error?.code, 'the control: the read failed').toBe(broken.error)
      settleScan(failed, archive)
      expect(claudeOf(failed)).toEqual(credited())
      expect(parsed(), 'each stored session is held').toEqual([])
    } finally {
      broken.undo()
    }
    const back = await scanner.scan(home.roots)
    settleScan(back, archive)
    expect(claudeOf(back)).toEqual(credited())
    expect(parsed()).toEqual([])
    expect(archive.superseded(), 'no past day\'s rows moved').toEqual([])
  }
  const restore = (): void => writeFileSync(home.roots.claudeConfigFile, JSON.stringify({ projects: { [home.project]: {} } }))

  it.each([
    { name: 'does not parse', text: '{', error: ERR.registryParseFailed },
    { name: 'holds projects that are no object', text: '{"projects":1}', error: ERR.registryProjectsInvalid }
  ])('one that $name keeps each stored session\'s project for that scan', async ({ text, error }) => {
    await heldThrough({ error, apply: () => writeFileSync(home.roots.claudeConfigFile, text), undo: restore })
  })

  // A file behind a directory that cannot be entered cannot be read either, and is never one that is not there
  // (agents-overview A3): here the registry is a link into such a directory, as a dotfile kept elsewhere is
  const behind = (): string => join(dir, 'kept-elsewhere')
  it.skipIf(process.getuid?.() === 0).each([
    { name: 'cannot be read', apply: (): void => chmodSync(home.roots.claudeConfigFile, 0o000), undo: (): void => chmodSync(home.roots.claudeConfigFile, 0o644) },
    {
      name: 'sits behind a directory that cannot be entered',
      apply: (): void => {
        mkdirSync(behind())
        writeFileSync(join(behind(), 'claude.json'), readFileSync(home.roots.claudeConfigFile))
        rmSync(home.roots.claudeConfigFile)
        symlinkSync(join(behind(), 'claude.json'), home.roots.claudeConfigFile)
        chmodSync(behind(), 0o000)
      },
      undo: (): void => chmodSync(behind(), 0o755)
    }
  ])('one that $name keeps each stored session\'s project for that scan', async ({ apply, undo }) => {
    await heldThrough({ error: ERR.registryUnreadable, apply, undo })
  })

  it.each([
    { name: 'is not there', apply: (): void => rmSync(home.roots.claudeConfigFile) },
    { name: 'lists no project', apply: (): void => writeFileSync(home.roots.claudeConfigFile, '{"projects":{}}') }
  ])('one that $name credits the sessions to no project, and its project again once it lists it', async ({ apply }) => {
    const { scanner, parsed } = recorded()
    const archive = new UsageArchive(join(dir, 'cache'), { stamp: 'test' })
    const claudeTotal = (stats: Map<string, { tokens: { bySide: { claude: { total: number } } } }>): number | undefined =>
      stats.get(mergeKey(home.project))?.tokens.bySide.claude.total
    settleScan(await scanner.scan(home.roots), archive)
    parsed()
    apply()
    const none = await scanner.scan(home.roots)
    expect(none.snapshot.sides.claude.error, 'the control: the registry was read').toBeUndefined()
    const settledNone = settleScan(none, archive)
    expect(claudeOf(none)).toEqual({ rows: [['dated', '', 15], ['undated', '', 9]], sessions: [] })
    expect(claudeTotal(settledNone.stats), 'the project\'s figures, past day included').toBe(0)
    expect(parsed()).toEqual([home.claude.asked, home.claude.silent].sort())
    restore()
    const back = await scanner.scan(home.roots)
    const settledBack = settleScan(back, archive)
    expect(claudeOf(back)).toEqual(credited())
    expect(claudeTotal(settledBack.stats)).toBe(24)
    expect(parsed()).toEqual([home.claude.asked, home.claude.silent].sort())
    // The past day's rows moved twice at an unchanged total: accepted each time under the one stamp, the rows they
    // replaced kept (token-stats C10, C13)
    expect(archive.superseded().map((s) => [s.side, s.stamp, s.replacedBy])).toEqual([['claude', 'test', 'test'], ['claude', 'test', 'test']])
  })
})

describe('the scanner\'s parse workers', () => {
  it('close stops what its runner holds', () => {
    let closed = 0
    new Scanner(join(dir, 'cache'), TEST_ENGINE, { concurrency: 1, run: runParseJob, close: () => closed++ }).close()
    expect(closed).toBe(1)
  })
})

describe('what the main process makes of a scan (settleScan)', () => {
  it('a row with no day is in the whole-history figures and the project\'s, and in no day of the trend (G7)', async () => {
    const out = await new Scanner(join(dir, 'cache'), TEST_ENGINE).scan(home.roots)
    expect(out.rows.filter((r) => !r.day).map((r) => r.total), 'the fixture\'s call without a timestamp').toEqual([9])

    const settled = settleScan(out, new UsageArchive(join(dir, 'cache'), { stamp: 'test' }))

    expect(settled.fileFailed).toBe(false)
    expect(out.snapshot.tokens.bySide.claude.total).toBe(24)
    expect(settled.stats.get(mergeKey(home.project))?.tokens.bySide.claude.total).toBe(24)
    // The dated calls fall on two local days in any time zone: three within two seconds, and the Antigravity one
    expect(out.snapshot.tokens.byDay).toHaveLength(2)
    expect(settled.stats.get(mergeKey(home.project))?.sessions).toHaveLength(5)
  })
})
