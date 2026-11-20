import './launch-guard'
import { ReadRegistry, retireAfterDetail, retireAfterScan } from './read-registrations'
import { DisplayStore, engineWrite } from './display-store'
import { sourceIdentity, pageRevision, questionRevision, readSessionRanges, readSessionTurn, recordFileBytes, regularTarget } from './source-identity'
import { readTurnRanges, TURN_LIMIT_SEAM, turnLimitBytes } from './turn-limit'
import { KEPT_TURNS_SEAM, keptTurnsUnits, TURN_KEEP_SEAM, turnKeepBytes, turnKept } from './turn-keep'
import { keptTurnUnits, turnsToRelease } from '@shared/kept-turns'
import { emptyDisplayData, savedReadKey, savedTurnKey, type SavedRead, type StartupStatus } from '@shared/display-data'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, protocol, session, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CMD,
  EVT,
  type SkillLandingResult,
  type SkillHoldings,
  type SkillLibraryDirs,
  type ListSkillFilesResult
} from '@shared/ipc'
import type { CappedText, ProjectEntry, ProjectFigures, ProjectStats, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import { assertSnapshot, assertProjectFigures, assertProjectDetail, assertSessionPage, assertSessionTurn, assertSearchResult, assertGlobalSearchResult } from '@shared/validate'
import { mergeKey } from '@shared/path-key'
import { searchProjectSessions } from './providers/search-sessions'
import { QuestionCorpus, corpusProjects } from './providers/question-corpus'
import { readProjectDetail } from './providers/project-detail'
import { savedInstructionPaths } from './providers/global'
import { CACHE_VERSION, sessionReadSource } from './providers/token-stats'
import { settleScan } from './providers/scanner'
import { startScans, type ScanClient } from './scan-client'
import { scanCombination } from './scan-protocol'
import { ENGINE_BUILD, engineModulePath, threadEngineModule } from './engine-module'
import { settleForQuit } from './quit'
import { availableParallelism } from 'node:os'
import { UsageArchive } from './providers/archive'
import { installIntoListedProject, libraryDirs, skillHoldings, uninstallFromListedProject } from './providers/install'
import { APP_HOST, registerAppProtocol } from './app-protocol'
import { realRoots } from './roots'
import {
  assertTrustedSender,
  installCsp,
  installNavigationGuards,
  installPermissionGuards
} from './security'
import {
  admitMemoryFile,
  admitSkillPackage,
  checkedByPrefsHandlers,
  copyTextArgs,
  globalSearchArgs,
  installSkillArgs,
  listSkillFilesArgs,
  listedSession,
  listedSessionArg,
  memoryFileArg,
  noArgs,
  projectDetailArgs,
  revealSessionArg,
  searchSessionsArgs,
  sessionTurnArgs,
  skillFileArg,
  skillHoldingsArgs,
  uninstallSkillArgs,
  type GuardState,
  type Register
} from './ipc-guards'
import { rescanIntervalMs, shouldRescanOnFocus } from './rescan'
import { PrefsStore } from './prefs-store'
import { refusedLaunch } from './refused-launch'
import { applyAppearanceMode } from './appearance-mode'
import { createPrefsHandlers } from './prefs-handlers'
import { buildMenuTemplate } from './app-menu'
import { ERR, appError } from '@shared/errors'
import { effectiveLanguage, type Language } from '@shared/i18n'
import { APP_VERSION_ARG, KEPT_TURNS_ARG, LANG_ARG, SYS_LANGS_ARG, TREND_SPAN_ARG, UPDATES_ARG } from '@shared/ipc'
import { DEFAULT_PREFS } from '@shared/prefs'
import { IDLE_UPDATE, parseSettingsCheck, parseUpdateNotice, parseUpdateState, type CheckOutcome, type SettingsCheck, type UpdateNotice, type UpdateState } from '@shared/update'
import { UpdateController } from './update-controller'
import { SettingsChecks } from './settings-check'
import { recordRunVersion } from './run-version'
import { chooseUpdateSource, electronUpdateSource, scriptedUpdateSource } from './update-source'
import { systemPreferredLanguages } from './system-language'
import {
  listSkillPackageFiles,
  readSkillFileText,
  resolvePluginSkillRoot,
  resolveSkillRoot
} from './providers/skill-package'

// The app:// scheme must have its privileges registered **before** app ready (#18); dev goes over vite
// http and does not load
// app://, so registering has no side effect there. standard = a non-opaque origin (a secure context +
// the storage fast path),
// secure = equivalent to https, supportFetchAPI = required by modulepreload.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// The single-instance lock: a refused launch has initialised nothing, so exiting outright is safest
// (quit goes through before-quit and can hang). The runtime answers no both for a second instance and for a
// settings directory it cannot create the lock in, so refusedLaunch tells them apart (#367).
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  const refusal = refusedLaunch(app.getPath('userData'), systemPreferredLanguages)
  if (!refusal) {
    app.exit(0)
  } else {
    // Not while this module loads: a dialog shown then looks the same and takes the foreground the same, but it is missing
    // from the accessibility tree. Ready is the signal, bounded, since on macOS ready never arrives while a first instance
    // is running; by then the dialog is in the tree without it (all measured 2026-11-05).
    void Promise.race([app.whenReady(), new Promise((resolve) => setTimeout(resolve, 3000))]).then(() => {
      // Test silencing, on every platform: a modal dialog takes the foreground and waits for a click nobody makes. It says
      // whether ready came, which is all that tells this wait from the dialog being shown while the module loads
      if (process.env['AGENTSHED_NO_FOREGROUND']) console.error(`${refusal.title}\n${refusal.message}\nready: ${app.isReady()}`)
      else dialog.showErrorBox(refusal.title, refusal.message)
      app.exit(1)
    })
  }
}

// Test silencing (injected by e2e and smoke, the same kind of seam as AGENTSHED_HOME_OVERRIDE; never set
// in production):
// one round of local verification starts a couple of dozen instances, and on macOS each launch activates
// and steals the foreground, so the user can do nothing meanwhile.
// **Measured: the activation policy does not stop it** (with accessory / dock.hide it still steals focus
// on 12-13 of 15 ticks
// — the theft comes from BrowserWindow's default show doing makeKey plus activation, not from the Dock),
// so silent mode
// simply does not show the window: Playwright drives over CDP, and DOM and layout assertions do not need
// a visible window; backgroundThrottling is turned off alongside,
// so a hidden window's throttled timers do not introduce new timing flakes into the tests.
const QUIET = process.platform === 'darwin' && Boolean(process.env['AGENTSHED_NO_FOREGROUND'])
if (QUIET) {
  app.setActivationPolicy('accessory')
  app.dock?.hide()
}

let mainWindow: BrowserWindow | null = null
let prefsStore: PrefsStore | null = null
let updates: UpdateController | null = null
let settingsChecks: SettingsChecks | null = null
// The scan worker's client (ADR-0043): the token engine, its cache and the rollouts' first-line readings live
// on that thread, and a scan or a question-index read is a request to it
let scans: ScanClient | null = null
// Global search's question texts (ADR-0034): built on the page's first demand in a run, then kept up to date
// after every scan; held in memory only
let questionCorpus: QuestionCorpus | null = null
let archive: UsageArchive | null = null
let perProjectStats = new Map<string, ProjectStats>()
// The session read allow-list (ticket 04): an exact path Set the application's own scan produces, and the
// only thing range reads honour.
// It contains listed sessions plus subagent and nested transcripts (07 needs to expand the latter).
let sessionWhitelist = new Set<string>()
// file → tokens: the consumption figure in the session page header, sharing its source with the list
// (the SessionMeta computed in the same build pass)
let sessionTokens = new Map<string, number>()

// ── Snapshot and refresh (deduplicated: a second trigger while one is in flight is ignored) ──
let displayStore: DisplayStore | null = null
let savedReads = new Map<string, SavedRead>()
let startupStatus: StartupStatus = 'scanning'
let firstScanComplete = false
let liveScanReady: () => void = () => {}
const firstLiveScan = new Promise<void>((resolve) => { liveScanReady = resolve })
let current: Snapshot | null = null
let readRegistry = new ReadRegistry()
/** A change to the display copy, recorded without copying the data; the store writes it when the window has no focus
 * (agents-overview::REQ-008) */
function persistDisplay(): void {
  if (!displayStore) return
  displayStore.record({ snapshot: current, stats: [...perProjectStats], sessionFiles: [...sessionWhitelist],
    registrations: readRegistry.snapshot(), reads: [...savedReads.values()] })
}
type SavedTurn = Extract<SavedRead, { kind: 'turnContent' }>
/** Each kept turn's measure against the total limit, taken once */
const turnUnits = new WeakMap<SavedTurn, number>()
function unitsOf(read: SavedTurn): number {
  let units = turnUnits.get(read)
  if (units === undefined) { units = keptTurnUnits(read.data); turnUnits.set(read, units) }
  return units
}
/** Keeps a turn as the latest fetched, the earliest kept leaving first until it fits the total limit (ADR-0053), the
 * renderer deciding the same with the same rule; one over the limit alone is not kept */
function keepTurn(read: SavedTurn): void {
  const key = savedReadKey(read)
  savedReads.delete(key)
  const kept: [string, number][] = []
  for (const [k, r] of savedReads) if (r.kind === 'turnContent') kept.push([k, unitsOf(r)])
  const released = turnsToRelease(kept, unitsOf(read), KEPT_TURNS)
  if (released === null) return
  for (const k of released) savedReads.delete(k)
  savedReads.set(key, read)
}
function remember(read: SavedRead): void {
  if (read.kind === 'sessionPage') {
    for (const [key, saved] of savedReads) if (saved.kind === 'turnContent' && saved.file === read.file && saved.revision !== read.data.questions[saved.i]?.revision) savedReads.delete(key)
  }
  if (read.kind === 'turnContent') {
    const page = savedReads.get(JSON.stringify(['sessionPage', read.file]))
    if (page?.kind !== 'sessionPage' || page.data.questions[read.i]?.revision !== read.revision) return
    keepTurn(read)
  } else savedReads.set(savedReadKey(read), read)
  persistDisplay()
}
function setStartupStatus(status: StartupStatus): void {
  startupStatus = status
  mainWindow?.webContents.send(EVT.startupStatus, status)
}

/** The notice that the usage archive's file failed (token-stats C4): 'due' while the last merge failed and the window has
 * not taken it, since the sentence says "right now". Kept here because a reload is a new renderer in the same run, and
 * the failure can come before the window subscribes */
let archiveNotice: 'none' | 'due' | 'taken' = 'none'

let inflight: Promise<Snapshot> | null = null
/** The last successful scan moment; the throttle baseline for focus triggers (token-stats E1) */
let lastScanAt: number | null = null

/** Test seam (the same injection family as the rescan intervals): holds the **first** scan open so
 * e2e can assert the startup skeleton as a stable state instead of racing it (spec A4). 0 in
 * production — rescanIntervalMs falls back to it on unset/invalid input. */
const SCAN_DELAY_MS = rescanIntervalMs(process.env['AGENTSHED_SCAN_DELAY_MS'], 0)
let firstScanDelayed = false
// Fixture-only scan failure injection, paired with the existing delay/automatic retry seams.
let scanFailures = rescanIntervalMs(process.env['AGENTSHED_SCAN_FAILURES'], 0)
/** Developer override (spec C15): accept every live figure for the archive, even a same-stamp decrease on
 * a past day. Development changes accounting code without changing either version component, so a
 * legitimate decrease would otherwise be retained as if it were a loss. Never set in production. */
const ARCHIVE_FORCE_ACCEPT = process.env['AGENTSHED_ARCHIVE_FORCE_ACCEPT'] === '1'
/** Test seam (the same injection family as the rescan intervals and the scan delay): an artificial
 * delay before a project-detail or session-page fetch resolves, letting e2e assert that a switch
 * holds the previous page instead of blanking it (project-detail T1, session-view P1, ADR-0028); the
 * same knob also covers listSkillFiles and readMemoryFile, letting e2e assert the widget-level query
 * layer's reopen-is-cached behaviour (issue #177), and holds each reading of global search's question
 * texts, letting e2e assert the reading state (global-search REQ-002/AC-02). 0 in production. */
const FETCH_DELAY_MS = rescanIntervalMs(process.env['AGENTSHED_FETCH_DELAY_MS'], 0)
/** Test seam (the same family): an artificial delay before the renderer's initial getPrefs resolves,
 * letting e2e change a preference while that read is in flight and assert the read does not undo it
 * (#61). The launch-argument read at window creation is not delayed. 0 in production. */
const PREFS_DELAY_MS = rescanIntervalMs(process.env['AGENTSHED_PREFS_DELAY_MS'], 0)
/** The turn limit (session-view, the in-turn fetch states): 64 MiB, which e2e lowers through its seam */
const TURN_LIMIT_BYTES = turnLimitBytes(process.env[TURN_LIMIT_SEAM])
/** The keep size (ADR-0053): 8 MiB, which e2e lowers through its seam */
const TURN_KEEP_BYTES = turnKeepBytes(process.env[TURN_KEEP_SEAM])
/** The total limit on kept turns (ADR-0053): 128 Mi UTF-16 units, which e2e lowers through its seam; the renderer gets it
 * at launch */
const KEPT_TURNS = keptTurnsUnits(process.env[KEPT_TURNS_SEAM])

async function doScan(): Promise<Snapshot> {
  if (inflight) return inflight
  const worker = scans
  const usage = archive
  if (!worker || !usage) throw appError(ERR.engineNotReady)
  if (!firstScanComplete) setStartupStatus('scanning')
  // Nothing in here may throw before its first await: the finally below would then run before `inflight` is
  // assigned, and every later trigger would join that rejected promise
  inflight = (async () => {
    try {
      // The seam's hold goes with the first scan's request, so that scan is under way on the worker while held
      const holdMs = firstScanDelayed ? 0 : SCAN_DELAY_MS
      firstScanDelayed = true
      // The scan worker reads the agents' data (ADR-0043). The archive merge, the figures derived from its
      // effective rows and everything the window is told stay here
      const out = await worker.scan(realRoots(), holdMs)
      if (scanFailures > 0) { scanFailures--; throw new Error('Injected scan failure') }
      const snap = out.snapshot
      const settled = settleScan(out, usage, { forceAccept: ARCHIVE_FORCE_ACCEPT })
      if (archiveNotice !== 'taken') archiveNotice = settled.fileFailed ? 'due' : 'none'
      assertSnapshot(snap)
      // Every project's figures go to the window beside the snapshot, so a page drawn from its copy shows this scan's
      // (project-detail::REQ-005); checked here as the snapshot is
      const figures: ProjectFigures = [...settled.stats]
      assertProjectFigures(figures)
      perProjectStats = settled.stats
      sessionWhitelist = out.sessionFiles
      const tokensByFile = new Map<string, number>()
      for (const sessions of out.sessions.values()) for (const s of sessions) tokensByFile.set(s.file, s.tokens)
      sessionTokens = tokensByFile
      lastScanAt = Date.now() // The baseline for focus throttling (token-stats E1)
      readRegistry.replace({ owner: 'scan',
        memoryFiles: snap.global.memory.flatMap(m => m.files.map(f => f.file)),
        pluginRoots: [...snap.global.plugins.flatMap(p => p.installPath ? [p.installPath] : []),
          ...snap.global.codexPlugins.flatMap(p => p.root ? [p.root] : []),
          ...snap.global.antigravityPlugins.map(p => p.root)], projects: [], skillFiles: [] })
      retireAfterScan(readRegistry, savedReads.values(), snap)
      current = snap
      firstScanComplete = true
      liveScanReady()
      // An authoritative absence retires saved session identities, while a failed scan never does.
      for (const [key, r] of savedReads) if ((r.kind === 'sessionPage' || r.kind === 'turnContent') && !sessionWhitelist.has(r.file)) savedReads.delete(key)
      persistDisplay()
      setStartupStatus('ready')
      // Before the snapshot goes out, so the search the renderer sends on receiving it waits for these texts
      // (global-search REQ-004); a corpus never asked for is not built
      void questionCorpus?.refresh().catch((e: unknown) => console.error('[global-search] reading the question texts failed:', e))
      mainWindow?.webContents.send(EVT.snapshot, snap, figures)
      return snap
    } catch (error) {
      if (!firstScanComplete) setStartupStatus('waiting')
      throw error
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * The single entry point for IPC registration (#17): every handler goes through this wrapper, which
 * validates the sender, then judges the request by the channel's guard from ./ipc-guards (#405), before
 * executing on what the guard admitted.
 * A wrapper rather than a line inside each handler — **doing it one by one inevitably misses one**, and
 * the wrapper makes "a new handler
 * is validated automatically" the default, so forgetting to wire one up, or to name its guard, fails
 * compilation rather than silently leaving it undefended.
 */
const handle: Register = (channel, guard, run) => {
  ipcMain.handle(channel, (e, raw: unknown) => {
    assertTrustedSender(e.senderFrame?.url, process.env['ELECTRON_RENDERER_URL'])
    return run(guard(raw, guardState()))
  })
}
/** What a guard judges against, as it is at this moment: a scan can replace an allow-list across an await */
function guardState(): GuardState {
  return { sessions: sessionWhitelist, sessionsRestored: !firstScanComplete, registry: readRegistry, regular: regularTarget, exists: existsSync }
}

handle(CMD.getStartup, noArgs, () => ({ display: { ...(displayStore?.get() ?? emptyDisplayData()), snapshot: current, reads: [...savedReads.values()] }, status: startupStatus }))
handle(CMD.takeArchiveNotice, noArgs, () => {
  if (archiveNotice !== 'due') return false
  archiveNotice = 'taken'
  return true
})
handle(CMD.getSnapshot, noArgs, async () => {
  if (current) return current
  return doScan()
})
handle(CMD.getProjectDetail, projectDetailArgs, async (path) => {
  if (!firstScanComplete) await firstLiveScan
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  // Exit validation: contract drift throws at the boundary rather than rendering as undefined (the same
  // rule as the snapshot).
  // It covers the whole detail payload including the stats.sessions block (validateProjectDetail reuses
  // that validator internally).
  assertProjectDetail(detail)
  readRegistry.replace({ owner: `project:${path}`, memoryFiles: [...detail.memory.topics.map(t => t.file),
    ...(detail.memory.mainFile !== null ? [detail.memory.mainFile.file] : [])],
    // The package roots this page's plugin skill rows preview from: Claude's plugins as this project sees them, and
    // Antigravity's, which are global and read again for the page (a plugin installed since the last scan included)
    projects: [path], pluginRoots: [...detail.plugins.flatMap(p => p.installPath ? [p.installPath] : []),
      ...detail.skills.flatMap(s => s.origin === 'plugin' && s.side === 'antigravity' && s.pluginRoot ? [s.pluginRoot] : [])], skillFiles: [] })
  retireAfterDetail(readRegistry, savedReads.values(), path, detail)
  remember({ kind: 'projectDetail', path, data: detail })
  return detail
})
// The allow-list comes first: the guard refuses an invalid path before it is even stat-ed (fail-closed)
handle(CMD.getSessionPage, listedSessionArg, async (file) => {
  if (!firstScanComplete) await firstLiveScan
  listedSession(guardState(), file)
  if (!scans) throw appError(ERR.engineNotReady)
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  listedSession(guardState(), file)
  // The ranges are in the session file, or in an Antigravity conversation's transcript, derived from the admitted path
  const source = sessionReadSource(realRoots(), file)
  const identity = sourceIdentity(source)
  const q = await scans.sessionQuestions(realRoots(), file)
  // The text is read live by range (spec D2a: the index holds no text), and never whole
  const { texts } = await readSessionRanges(source, q.questions.map((r) => ({ start: r[0], end: r[1] })))
  const questions = q.questions.map((rec, idx) => {
    // A single bad line only hurts itself: that entry shows a placeholder without affecting the other
    // questions or dragging down the page
    const text = threadEngineModule().questionText(q.side, texts[idx])
    // Unreadable means passing null: the wording belongs to the renderer (ticket 07), and the main
    // process emits no user-facing natural language
    return { revision: questionRevision(identity, file, rec[0], rec[1], texts[idx]), i: idx + 1, text, at: rec[3], tools: rec[4], subagents: rec[5] }
  })
  listedSession(guardState(), file)
  if (sourceIdentity(source) !== identity) throw appError(ERR.sessionNotIndexed)
  const page: SessionPage = {
    revision: pageRevision(identity, q.questions),
    file,
    side: q.side,
    title: q.title,
    at: q.at,
    tokens: sessionTokens.get(file) ?? 0,
    // The record file's size — the one Finder shows (an Antigravity conversation's database, not its transcript)
    bytes: recordFileBytes(file),
    forkState: q.forkState,
    forkPoints: q.forkPoints,
    forkParentTitle: q.forkParentTitle,
    forkParentFile: q.forkParentFile,
    sessionId: q.sessionId,
    questions
  }
  assertSessionPage(page)
  remember({ kind: 'sessionPage', file, data: page })
  return page
})
// The same allow-list comes first (fail-closed); the predicate is read-only and triggers no rebuild
handle(CMD.sessionFresh, listedSessionArg, (file) => regularTarget(file) && scans ? scans.isFresh(file) : false)
handle(CMD.getSessionTurn, sessionTurnArgs, async (a) => {
  const file = a.file
  if (!firstScanComplete) await firstLiveScan
  listedSession(guardState(), file)
  if (!scans) throw appError(ERR.engineNotReady)
  // The range comes from the application's own index (sessionQuestions rebuilds the single file when
  // the signature does not match),
  // and a byte range from the renderer is not accepted — all this channel can fetch is "the turn of a
  // given question"
  listedSession(guardState(), file)
  const readStarted = performance.now()
  const source = sessionReadSource(realRoots(), file)
  const identity = sourceIdentity(source)
  const q = await scans.sessionQuestions(realRoots(), file)
  if (a.i >= q.questions.length) throw appError(ERR.turnOutOfRange, { i: a.i, total: q.questions.length })
  const rec = q.questions[a.i]
  // A whole turn = from after the question up to the next one ([turn start, turn end); the page already
  // has the question in full; re-read that selected question only to validate its source identity). A body over the
  // turn limit is not read at all; its question still is, so that a rewrite shows as one, not as this turn's reason
  const read = await readTurnRanges((s, question, body) => readSessionTurn(q.side, s, question, body), source, rec, TURN_LIMIT_BYTES)
  const revision = questionRevision(identity, file, rec[0], rec[1], read.question)
  if (a.revision !== undefined && a.revision !== revision) throw appError(ERR.sessionNotIndexed)
  listedSession(guardState(), file)
  if (sourceIdentity(source) !== identity) throw appError(ERR.sessionNotIndexed)
  if (read.body === null) {
    // A turn kept before it grew past the limit can no longer be kept either: its copy leaves with the reason
    if (savedReads.delete(savedTurnKey(file, revision, a.i))) persistDisplay()
    throw appError(ERR.turnTooLong, { bytes: read.bodyBytes, limit: TURN_LIMIT_BYTES })
  }
  const turn: SessionTurn = { blocks: read.body.blocks, bytesRead: read.bytesRead }
  // A body over the keep size is shown but never kept: not in the display copy, and (by the mark) not in the renderer
  const kept = turnKept(read.bodyBytes, TURN_KEEP_BYTES)
  if (!kept) turn.unkept = true
  assertSessionTurn(turn)
  const saved: SavedTurn = { kind: 'turnContent', file, i: a.i, revision, ms: Math.max(1, Math.round(performance.now() - readStarted)),
    bodyBytes: read.bodyBytes, data: turn }
  if (kept) remember(saved)
  // An unkept turn also retires a copy kept earlier under its key: one restored, or kept before the turn grew
  else if (savedReads.delete(savedReadKey(saved))) persistDisplay()
  return turn
})
handle(CMD.searchSessions, searchSessionsArgs, async (a) => {
  if (!scans) throw appError(ERR.engineNotReady)
  // The session set comes from the main process's own statistics (the renderer cannot supply file
  // paths); an unregistered project is naturally empty
  const sessions = perProjectStats.get(mergeKey(a.path))?.sessions ?? []
  const r = await searchProjectSessions(scans, realRoots(), sessions, a.needle, a.fullText)
  assertSearchResult(r)
  return r
})
handle(CMD.readSearchQuestions, noArgs, async () => {
  if (!questionCorpus) throw appError(ERR.engineNotReady)
  await questionCorpus.load()
})
handle(CMD.globalSearch, globalSearchArgs, async (needle) => {
  if (!questionCorpus) throw appError(ERR.engineNotReady)
  const r = await questionCorpus.search(needle)
  assertGlobalSearchResult(r)
  return r
})
handle(CMD.readMemoryFile, memoryFileArg, async (file) => {
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  admitMemoryFile(guardState(), file)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw appError(ERR.memoryFileUnreadable)
  }
  // Only report whether it was truncated; the renderer appends the marker in the current language
  // (ticket 07)
  const text = raw.length > 500_000
    ? { text: raw.slice(0, 500_000), truncated: true }
    : { text: raw, truncated: false }
  remember({ kind: 'memoryContent', file, data: text })
  return text
})
handle(CMD.copyText, copyTextArgs, (text) => {
  clipboard.writeText(text)
})

handle(CMD.revealSessionFile, revealSessionArg, (file) => {
  shell.showItemInFolder(file)
})

// The renderer names the target of an install or uninstall, so it goes only into a project the current snapshot lists
// (skill-install R3): the restored one until the first scan completes, which is the snapshot the renderer shows then
const listedProjects = (): ProjectEntry[] => current?.projects ?? []
handle(CMD.installSkill, installSkillArgs, (args): SkillLandingResult[] => installIntoListedProject(realRoots(), listedProjects(), args))
handle(CMD.uninstallSkill, uninstallSkillArgs, (args) => uninstallFromListedProject(realRoots(), listedProjects(), args))
// The live projects of the current snapshot: the renderer names the skill, never the paths probed. Before the first
// scan they are the restored snapshot's, or none without one, and the install itself still refuses a same name (A4)
handle(CMD.skillHoldings, skillHoldingsArgs, (name): SkillHoldings => {
  return skillHoldings((current?.projects ?? []).filter((p) => !p.stale).map((p) => p.path), name)
})
// The same live projects, probed for the skills directories an install would change a global library through
// (skill-install R4); the install itself still refuses one the picker has not yet disabled
handle(CMD.skillLibraryDirs, noArgs, (): SkillLibraryDirs => {
  return libraryDirs(realRoots(), (current?.projects ?? []).filter((p) => !p.stale).map((p) => p.path))
})

handle(CMD.listSkillFiles, listSkillFilesArgs, async (a): Promise<ListSkillFilesResult> => {
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  // The package's root is admitted after the delay, against the registrations of that moment (H8, fail-closed)
  admitSkillPackage(guardState(), a)
  let root: string | null
  if (a.scope === 'plugin') {
    // The skill name is sanitised inside the resolver
    root = resolvePluginSkillRoot(a.pluginRoot as string, a.name)
  } else {
    // The container check (C9, applied to the entry point before resolution) happens inside
    // resolveSkillRoot
    root = resolveSkillRoot({
      side: a.side,
      name: a.name,
      scope: a.scope,
      projectPath: a.projectPath,
      roots: realRoots()
    })
  }
  if (!root) {
    throw appError(ERR.skillPackageUnavailable)
  }
  const listing = listSkillPackageFiles(root)
  const result = { files: listing.files }
  const read: SavedRead = { kind: 'skillFiles', args: a, data: result }
  readRegistry.replace({ owner: savedReadKey(read), skillFiles: listing.files.map(f => f.absPath), memoryFiles: [], projects: [], pluginRoots: [] })
  remember(read)
  return result
})
handle(CMD.readSkillFile, skillFileArg, (absPath): CappedText => {
  try {
    const text = readSkillFileText(absPath)
    remember({ kind: 'skillContent', file: absPath, data: text })
    return text
  } catch {
    throw appError(ERR.skillFileUnreadable)
  }
})

// The preference handlers' logic lives in ./prefs-handlers (injectable, unit tested); this only wires
// them up.
// `store` is passed as a getter rather than an instance: prefsStore is only assigned at whenReady, while
// the channels are registered right now.
const prefsHandlers = createPrefsHandlers({ store: () => prefsStore, theme: nativeTheme })
handle(CMD.getPrefs, noArgs, async () => {
  if (PREFS_DELAY_MS > 0) await new Promise((r) => setTimeout(r, PREFS_DELAY_MS))
  return prefsHandlers.getPrefs()
})
handle(CMD.setTheme, checkedByPrefsHandlers, (theme) => prefsHandlers.setTheme(theme))
handle(CMD.setLanguage, checkedByPrefsHandlers, (language) => {
  try {
    return prefsHandlers.setLanguage(language)
  } finally {
    // **The menu must be rebuilt**, not constructed once at startup (ticket 13): it is a native control,
    // and its copy does not update automatically when the renderer's language changes. A failed write
    // included: the language is in effect until a restart, and the menu stays with the window
    applyMenu()
  }
})
handle(CMD.setTrendSpan, checkedByPrefsHandlers, (span) => prefsHandlers.setTrendSpan(span))
handle(CMD.setMode, checkedByPrefsHandlers, (mode) => prefsHandlers.setMode(mode))
// App updates (app-update): the controller owns the lifecycle; these only read it and pass on the click
handle(CMD.getUpdateState, noArgs, (): UpdateState => updates?.state() ?? IDLE_UPDATE)
handle(CMD.installUpdate, noArgs, () => {
  updates?.install()
})
handle(CMD.checkForUpdates, noArgs, (): Promise<CheckOutcome> => settingsChecks?.check() ?? Promise.resolve({ kind: 'unavailable' }))
handle(CMD.getSettingsCheck, noArgs, (): SettingsCheck => settingsChecks?.state() ?? { checking: false, outcome: null })
handle(CMD.setAutoCheckUpdates, checkedByPrefsHandlers, (on) => prefsHandlers.setAutoCheckUpdates(on))
const PRELOAD = join(__dirname, '../preload/index.cjs')

/** Rebuild the application menu in the currently effective language; must be called again after a
 * language change */
function applyMenu(): void {
  const send = (channel: string) => (): void => mainWindow?.webContents.send(channel)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate(
        initialLanguage(),
        { openSettings: send(EVT.menuOpenSettings), checkForUpdates: () => void menuCheck(), openSearch: send(EVT.menuOpenSearch) },
        updateChoice() !== null
      )
    )
  )
}

/**
 * "Check for Updates…" in the application menu (app-update::REQ-005): the main process's own check, which
 * joins one in flight like any other (US-003/AC-05); its outcome, the update found or the update already in
 * flight reaches the renderer as a notice, answered with a toast (US-003/AC-01, AC-04)
 */
async function menuCheck(): Promise<void> {
  const outcome: CheckOutcome = await (updates?.check() ?? Promise.resolve({ kind: 'unavailable' }))
  sendUpdateNotice({ code: 'menuCheck', outcome })
}

function sendUpdateNotice(notice: UpdateNotice): void {
  // Exit validation, the same rule as every other payload (ADR-0001)
  if (!parseUpdateNotice(notice)) throw appError(ERR.contractType, { path: 'updateNotice', expect: 'UpdateNotice' })
  mainWindow?.webContents.send(EVT.updateNotice, notice)
}

/** The effective language at window creation = the preference + the system language list. The system is
 * only consulted when the preference is "follow system" */
function initialLanguage(): Language {
  const pref = prefsStore?.get().language ?? DEFAULT_PREFS.language
  return effectiveLanguage(pref, systemPreferredLanguages())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 520,
    title: 'Agentshed',
    show: !QUIET,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !QUIET,
      // The effective language is created together with the window so the renderer has the correct
      // language on its **first frame**.
      // Fetching it asynchronously over IPC would make the first frame the default language and then
      // jump the whole page once —
      // a theme change is just a recolour and is hard to notice, whereas a language change moves
      // every word, and that has to be avoided.
      additionalArguments: [
        `${TREND_SPAN_ARG}${prefsHandlers.getPrefs().trendSpan}`,
        `${KEPT_TURNS_ARG}${KEPT_TURNS}`,
        `${LANG_ARG}${initialLanguage()}`,
        `${SYS_LANGS_ARG}${systemPreferredLanguages().join(',')}`,
        `${APP_VERSION_ARG}${app.getVersion()}`,
        `${UPDATES_ARG}${updateChoice() ? 1 : 0}`
      ]
    }
  })
  // The display copy waits while the window has focus, and is written once it has none (agents-overview::REQ-008)
  mainWindow.on('focus', () => displayStore?.focusChanged(true))
  mainWindow.on('blur', () => displayStore?.focusChanged(false))
  mainWindow.on('hide', () => displayStore?.focusChanged(false))
  mainWindow.on('minimize', () => displayStore?.focusChanged(false))
  mainWindow.on('closed', () => {
    mainWindow = null
    displayStore?.focusChanged(false)
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadURL(`app://${APP_HOST}/index.html`) // #18: no file://
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// Host security guards (the official Security Checklist #5/#12/#13/#14/#15; the decision layer is in
// security.ts).
// Hung off web-contents-created rather than a single window: this covers every webContents, and new ones
// are governed automatically.
// The criteria and the item-by-item status are in docs/ops/electron-security.md.
app.on('web-contents-created', (_e, contents) => {
  installNavigationGuards(contents, process.env['ELECTRON_RENDERER_URL'])
})

void app.whenReady().then(() => {
  if (!gotTheLock) return
  // Packaged macOS apps use the bundle icon; unpackaged runs use the development artwork.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon-dev.png'))
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  installPermissionGuards(session.defaultSession)
  installCsp(session.defaultSession, Boolean(process.env['ELECTRON_RENDERER_URL']))
  // Handlers must be registered before the window is built (loadURL app://…); __dirname = out/main, and
  // the build output is in out/renderer
  registerAppProtocol(join(__dirname, '../renderer'))
  prefsStore = new PrefsStore(app.getPath('userData'))
  // Must come **before** building the window: themeSource decides how the first frame evaluates
  // prefers-color-scheme,
  // and setting it afterwards renders one frame in the system's light/dark and then jumps the whole page
  // once (the spec's implementation decision)
  applyAppearanceMode(nativeTheme, prefsStore.get().mode)
  // Scans run on the scan worker (ADR-0043), which starts the parse workers itself (#159): every core but
  // one, up to four, the four set by the project owner on 2026-11-16 (#453). The files go to them largest first.
  // Measured on an instrumented packaged cold scan of 7,454 files, 21.0 GB of lines once decompressed (#453): the
  // four finished within 1 ms of each other, 8.9 s of parsing for 34.6 s of parse work, while the largest file alone
  // took 4.9 s, so the work over the workers bounds the time, not the largest file.
  // The engine module (ADR-0046): the scan worker, its parse workers and, after a worker failure, this process load it;
  // this process also writes the display copy through it
  const engine = {
    path: engineModulePath({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, mainDir: __dirname, env: process.env }),
    build: ENGINE_BUILD
  }
  scans = startScans({
    script: join(__dirname, 'scan-worker.js'),
    parseScript: join(__dirname, 'parse-worker.js'),
    cacheDir: app.getPath('userData'),
    poolSize: Math.min(4, Math.max(1, availableParallelism() - 1)),
    engine,
    // What a stored group result came from (token-stats, Implementation Decisions, Cache)
    combination: scanCombination(app.isPackaged, app.getVersion())
  })
  // The listed set as it stands: the snapshot's projects, stale ones included, with each one's listed
  // sessions — the restored ones until the first scan completes (global-search S2)
  questionCorpus = new QuestionCorpus(scans, () => ({ roots: realRoots(), projects: corpusProjects(current?.projects ?? [], perProjectStats) }), {
    pause: FETCH_DELAY_MS > 0 ? () => new Promise((r) => setTimeout(r, FETCH_DELAY_MS)) : undefined
  })
  // The accounting stamp (ADR-0026): the application version covers combination-layer changes, the cache
  // structure version covers parser changes — together they identify the accounting code, so a lower
  // figure under the same stamp can only mean the data shrank
  archive = new UsageArchive(app.getPath('userData'), { stamp: `${app.getVersion()}+c${CACHE_VERSION}` })
  displayStore = new DisplayStore(app.getPath('userData'), { write: engineWrite(engine), savedInstructionPaths: savedInstructionPaths(realRoots()) })
  const restored = displayStore.get()
  current = restored.snapshot
  perProjectStats = new Map(restored.stats)
  sessionWhitelist = new Set(restored.sessionFiles)
  for (const stats of perProjectStats.values()) for (const s of stats.sessions) sessionTokens.set(s.file, s.tokens)
  // Restored turns in the order they were kept, so that the total limit in effect now binds a copy saved under another
  savedReads = new Map()
  for (const r of restored.reads) if (r.kind === 'turnContent') keepTurn(r); else savedReads.set(savedReadKey(r), r)
  readRegistry = new ReadRegistry(restored.registrations)
  createWindow()
  applyMenu()
  void doScan().catch((error: unknown) => console.error('[startup] scan failed:', error))
  startUpdates()
  // Automatic snapshot refresh (token-stats sequence E) — since the manual control was removed
  // (2026-08-23) this is the **only** way a running window gets fresh data: focus (throttled) + a timed
  // backstop, both going through doScan, whose in-flight deduplication keeps two triggers that coincide
  // from scanning twice (E2). A trigger that fails keeps the current snapshot and waits for the next one
  // (E3). Injecting the intervals from the environment is a test seam (E5).
  const autoScan = (): void => {
    void doScan().catch((e: unknown) => {
      // E3: silently keep the current snapshot, but leave a trace of the failure — a programming error
      // must not be swallowed without a sound
      // In English: application logs travel with a user's bug report (pasted into an issue) and their
      // readers may not read Chinese;
      // a build script's output stays on the developer's machine, where that reasoning does not apply
      console.error('[auto-rescan] scan failed, keeping the current snapshot:', e)
    })
  }
  setInterval(autoScan, rescanIntervalMs(process.env['AGENTSHED_RESCAN_MS'], 300_000))
  const focusThrottleMs = rescanIntervalMs(process.env['AGENTSHED_FOCUS_RESCAN_MS'], 60_000)
  app.on('browser-window-focus', () => {
    if (shouldRescanOnFocus(Date.now(), lastScanAt, focusThrottleMs)) autoScan()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/**
 * App updates (ADR-0032, as amended): one check at launch and one every 24 hours while the switch allows,
 * a found update downloading in the background, and the lifecycle pushed to the renderer. A development
 * run has no source and never checks; the e2e seam declares a scripted one (see chooseUpdateSource).
 */
function startUpdates(): void {
  const choice = updateChoice()
  const source = choice?.kind === 'scripted'
    ? scriptedUpdateSource(choice.script)
    : choice ? electronUpdateSource(app.getVersion()) : null
  updates = new UpdateController({
    source,
    autoChecksOn: () => prefsStore?.get().autoCheckUpdates ?? DEFAULT_PREFS.autoCheckUpdates,
    now: () => Date.now(),
    setTimer: (fn, ms) => {
      const timer = setTimeout(fn, ms)
      return () => clearTimeout(timer)
    },
    publish: (state: UpdateState) => {
      // Exit validation, the same rule as every other payload (ADR-0001)
      if (!parseUpdateState(state)) throw appError(ERR.contractType, { path: 'updateState', expect: 'UpdateState' })
      mainWindow?.webContents.send(EVT.updateState, state)
      settingsChecks?.onUpdateState(state)
    },
    notify: sendUpdateNotice
  })
  settingsChecks = new SettingsChecks({
    check: () => updates?.check() ?? Promise.resolve({ kind: 'unavailable' }),
    publish: (state: SettingsCheck) => {
      if (!parseSettingsCheck(state)) throw appError(ERR.contractType, { path: 'settingsCheck', expect: 'SettingsCheck' })
      mainWindow?.webContents.send(EVT.settingsCheck, state)
    },
    // Only a run that checks for updates reads and writes the record: a development run's userData ("agentshed")
    // and the installed copy's ("Agentshed") are one directory on macOS's default case-insensitive volume, and a
    // working build's version must not stand in the installed copy's way
    firstRunAfterUpdate: choice ? recordRunVersion(app.getPath('userData'), app.getVersion()) : false
  })
  updates.start()
  // On waking from sleep, one check if one fell due meanwhile (app-update::REQ-006/AC-02)
  powerMonitor.on('resume', () => updates?.wake())
}

/** Where this run's app updates come from, or null when it never checks (a development run) */
function updateChoice(): ReturnType<typeof chooseUpdateSource> {
  return chooseUpdateSource({ packaged: app.isPackaged, env: process.env })
}

app.on('window-all-closed', () => {
  // A catalogue-style tool has no background duties, so closing every window quits (macOS included)
  app.quit()
})

// Orphan prevention in dev: electron-vite (Ctrl+C) does not kill electron when it exits, and Electron
// swallows SIGINT —
// so poll the parent process and exit once the parent (vite) is gone, avoiding a zombie left in the
// Dock. Dev only.
if (process.env['ELECTRON_RENDERER_URL']) {
  const vitePid = process.ppid
  const parentWatch = setInterval(() => {
    try {
      process.kill(vitePid, 0)
    } catch {
      clearInterval(parentWatch)
      app.quit()
    }
  }, 1000)
}

// Normal quit waits for pending atomic writes, and for the scan worker to stop between two steps of what it is
// doing, so that no cache write is cut short (ADR-0043); the order is settleForQuit's. Forced termination may lose
// only unfinished writes.
let quitFlushed = false
app.on('before-quit', (event) => {
  const store = displayStore
  if (quitFlushed || !store) return
  event.preventDefault()
  const flush = (): Promise<void> => store.flush().catch((error: unknown) => console.error('[display-cache] quit flush failed:', error))
  void settleForQuit(flush, () => scans?.close() ?? Promise.resolve()).finally(() => {
    quitFlushed = true
    app.quit()
  })
})
