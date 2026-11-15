// The scanner (ADR-0043): what one scan hands the main process, and what the main process makes of it. The
// aggregation itself is the token engine's and has its own cases (token-stats.test.ts); these cover the steps a
// scan adds around it, which ran inline in the main process before and had no case below e2e.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyTokenStats } from '@shared/domain'
import { mergeKey } from '@shared/path-key'
import { UsageArchive } from './archive'
import { Scanner, settleScan } from './scanner'
import { runParseJob } from './token-stats'
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
