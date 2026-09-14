import { ReadRegistry } from './read-registrations'
import { DisplayStore } from './display-store'
import { sourceIdentity, pageRevision, questionRevision, regularTarget } from './source-identity'
import { emptyDisplayData, savedReadKey, type SavedRead, type StartupStatus } from '@shared/display-data'
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, nativeTheme, protocol, session, shell } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CMD,
  EVT,
  type SearchSessionsArgs,
  type SessionTurnArgs,
  type SkillOpArgs,
  type ListSkillFilesArgs,
  type ListSkillFilesResult
} from '@shared/ipc'
import type { CappedText, ProjectStats, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import { AGENT_SIDES, assertSnapshot, assertProjectDetail, assertSessionPage, assertSessionTurn, assertSearchResult } from '@shared/validate'
import { mergeKey } from '@shared/path-key'
import { deriveStats } from '@shared/usage'
import { scan } from './providers/scan'
import { readRanges } from './providers/range-read'
import { grokQuestionTextFromSlice, questionTextAt } from './providers/question-index'
import { turnBlocksFromText } from './providers/turn-content'
import { searchProjectSessions } from './providers/search-sessions'
import { readProjectDetail } from './providers/project-detail'
import { CACHE_VERSION, TokenEngine, projectStatsFromRows } from './providers/token-stats'
import { UsageArchive } from './providers/archive'
import { installSkill, uninstallSkill } from './providers/install'
import { APP_HOST, registerAppProtocol } from './app-protocol'
import { realRoots } from './roots'
import {
  assertTrustedSender,
  installCsp,
  installNavigationGuards,
  installPermissionGuards,
  sessionReadTarget
} from './security'
import { rescanIntervalMs, shouldRescanOnFocus } from './rescan'
import { PrefsStore } from './prefs-store'
import { applyAppearanceMode } from './appearance-mode'
import { createPrefsHandlers } from './prefs-handlers'
import { buildMenuTemplate } from './app-menu'
import { ERR, appError } from '@shared/errors'
import { effectiveLanguage, type Language } from '@shared/i18n'
import { LANG_ARG, SYS_LANGS_ARG } from '@shared/ipc'
import { DEFAULT_PREFS } from '@shared/prefs'
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

// The single-instance lock: a second instance has initialised nothing, so exiting outright is safest
// (quit goes through before-quit and can hang)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
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
let tokenEngine: TokenEngine | null = null
let archive: UsageArchive | null = null
let perProjectStats = new Map<string, ProjectStats>()
// The session read allow-list (ticket 04): an exact path Set the main process produces during its own
// scan, and the only thing range reads honour.
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
function persistDisplay(): void {
  if (!displayStore) return
  displayStore.save({ snapshot: current, stats: [...perProjectStats], sessionFiles: [...sessionWhitelist],
    registrations: readRegistry.snapshot(), reads: [...savedReads.values()] })
}
function remember(read: SavedRead): void {
  if (read.kind === 'sessionPage') {
    for (const [key, saved] of savedReads) if (saved.kind === 'turnContent' && saved.file === read.file && saved.revision !== read.data.questions[saved.i]?.revision) savedReads.delete(key)
  }
  if (read.kind === 'turnContent') {
    const page = savedReads.get(JSON.stringify(['sessionPage', read.file]))
    if (page?.kind !== 'sessionPage' || page.data.questions[read.i]?.revision !== read.revision) return
  }
  savedReads.set(savedReadKey(read), read)
  persistDisplay()
}
function setStartupStatus(status: StartupStatus): void {
  startupStatus = status
  mainWindow?.webContents.send(EVT.startupStatus, status)
}

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
 * same knob also covers listSkillFiles and readArtifact, letting e2e assert the widget-level query
 * layer's reopen-is-cached behaviour (issue #177). 0 in production. */
const FETCH_DELAY_MS = rescanIntervalMs(process.env['AGENTSHED_FETCH_DELAY_MS'], 0)

async function doScan(): Promise<Snapshot> {
  if (inflight) return inflight
  if (!firstScanComplete) setStartupStatus('scanning')
  inflight = (async () => {
    try {
      if (SCAN_DELAY_MS > 0 && !firstScanDelayed) {
        firstScanDelayed = true
        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS))
      }
      let nextStats = perProjectStats
      let nextSessionFiles = sessionWhitelist
      let nextSessionTokens = sessionTokens
      const snap = await scan(realRoots(), { now: () => Date.now() })
      if (scanFailures > 0) { scanFailures--; throw new Error('Injected scan failure') }
      if (tokenEngine) {
        const claudePaths = snap.projects
          .filter((p) => p.sides.includes('claude'))
          .map((p) => p.path)
        const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
        const t = await tokenEngine.build(realRoots(), claudePaths, registered)
        snap.tokens = t.global
        nextStats = t.perProject
        // The session count shares its source with the sessions section. scan() gives a **file count**
        // (including warmups and subagents),
        // while the section lists only real sessions per spec A3a/A3 — two numbers both called "session
        // count" would contradict each other
        // (measured on one project: 1511 vs 507). Backfilled here from data just computed above, at zero
        // extra cost.
        // Only backfilled when the token engine has run: with the engine absent the file count is kept,
        // so the column does not go to zero.
        for (const p of snap.projects) {
          p.sessionCount = t.perProject.get(mergeKey(p.path))?.sessions.length ?? 0
        }
        nextSessionFiles = t.sessionFiles
        const tok = new Map<string, number>()
        for (const ps of t.perProject.values()) for (const s of ps.sessions) tok.set(s.file, s.tokens)
        nextSessionTokens = tok
        // Archive (ADR-0026): the archive owns the effective row set — live rows for the (day, side) pairs
        // it accepted, archive rows for archived-only and retained pairs — and every figure derives from
        // it (spec G6), the project pages included. Undated rows never enter the archive and are added
        // back here so the whole-history figures keep them (spec G7).
        if (archive) {
          const eff = archive.merge(t.rows, snap.scannedAt, { forceAccept: ARCHIVE_FORCE_ACCEPT })
          const rows = [...eff.rows, ...t.rows.filter((r) => !r.day)]
          snap.tokens = deriveStats(rows)
          snap.archivedDays = eff.archivedOnlyDays
          nextStats = projectStatsFromRows(t.perProject, rows)
        }
      }
      assertSnapshot(snap)
      perProjectStats = nextStats
      sessionWhitelist = nextSessionFiles
      sessionTokens = nextSessionTokens
      lastScanAt = Date.now() // The baseline for focus throttling (token-stats E1)
      readRegistry.replace({ owner: 'scan',
        artifacts: snap.global.memory.flatMap(m => m.files.map(f => f.file)),
        pluginRoots: [...snap.global.plugins.flatMap(p => p.installPath ? [p.installPath] : []),
          ...snap.global.codexPlugins.flatMap(p => p.root ? [p.root] : [])], projects: [], skillFiles: [] })
      for (const r of savedReads.values()) {
        if (r.kind === 'projectDetail' && !snap.projects.some(p => p.path === r.path && !p.stale)) readRegistry.remove(`project:${r.path}`)
        if (r.kind === 'skillFiles' && ((r.args.scope === 'project' && !snap.projects.some(p => p.path === r.args.projectPath && !p.stale)) ||
          (r.args.scope === 'plugin' && !readRegistry.admission('pluginRoots', r.args.pluginRoot ?? '')) ||
          (r.args.scope === 'global' && !snap.global.skills.some(skill => skill.name === r.args.name && skill.sides.includes(r.args.side))))) readRegistry.remove(savedReadKey(r))
      }
      current = snap
      firstScanComplete = true
      liveScanReady()
      // An authoritative absence retires saved session identities, while a failed scan never does.
      for (const [key, r] of savedReads) if ((r.kind === 'sessionPage' || r.kind === 'turnContent') && !sessionWhitelist.has(r.file)) savedReads.delete(key)
      persistDisplay()
      setStartupStatus('ready')
      mainWindow?.webContents.send(EVT.snapshot, snap)
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
 * validates the sender before executing.
 * A wrapper rather than a line inside each handler — **doing it one by one inevitably misses one**, and
 * the wrapper makes "a new handler
 * is validated automatically" the default, so forgetting to wire one up fails compilation rather than
 * silently leaving it undefended.
 */
function handle<T>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, arg: unknown) => T
): void {
  ipcMain.handle(channel, (e, arg: unknown) => {
    assertTrustedSender(e.senderFrame?.url, process.env['ELECTRON_RENDERER_URL'])
    return fn(e, arg)
  })
}

handle(CMD.getStartup, () => ({ display: { ...(displayStore?.get() ?? emptyDisplayData()), snapshot: current, reads: [...savedReads.values()] }, status: startupStatus }))
handle(CMD.getSnapshot, async () => {
  if (current) return current
  return doScan()
})
handle(CMD.getProjectDetail, async (_e, path: unknown) => {
  if (typeof path !== 'string' || path === '') throw appError(ERR.badArgs, { channel: 'getProjectDetail', field: 'path' })
  if (!firstScanComplete) await firstLiveScan
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  // Exit validation: contract drift throws at the boundary rather than rendering as undefined (the same
  // rule as the snapshot).
  // It covers the whole detail payload including the stats.sessions block (validateProjectDetail reuses
  // that validator internally).
  assertProjectDetail(detail)
  readRegistry.replace({ owner: `project:${path}`, artifacts: [...detail.artifacts.map(a => a.file), ...detail.memory.topics.map(t => t.file)],
    projects: [path], pluginRoots: detail.plugins.flatMap(p => p.installPath ? [p.installPath] : []), skillFiles: [] })
  for (const r of savedReads.values()) if (r.kind === 'skillFiles' && ((r.args.scope === 'project' && r.args.projectPath === path &&
    !detail.skills.some(skill => skill.level === 'project' && skill.name === r.args.name && skill.side === r.args.side)) ||
    (r.args.scope === 'plugin' && !readRegistry.admission('pluginRoots', r.args.pluginRoot ?? '')))) readRegistry.remove(savedReadKey(r))
  remember({ kind: 'projectDetail', path, data: detail })
  return detail
})
handle(CMD.getSessionPage, async (_e, raw: unknown) => {
  // The allow-list comes first: an invalid path is not even stat-ed (fail-closed; the pure judging
  // function is in security.ts)
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  if (!firstScanComplete) await firstLiveScan
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  if (!tokenEngine) throw appError(ERR.engineNotReady)
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  const identity = sourceIdentity(file)
  const q = await tokenEngine.sessionQuestions(realRoots(), file)
  // The text is read live by range (spec D2a: the index holds no text); readRanges never reads whole
  const { texts } = await readRanges(file, q.questions.map((r) => ({ start: r[0], end: r[1] })))
  const questions = q.questions.map((rec, idx) => {
    // A single bad line only hurts itself: that entry shows a placeholder without affecting the other
    // questions or dragging down the page
    let text: string | null = null
    if (q.side === 'grok') {
      // A Grok question's range can span several chunk lines (they concatenate raw), so the whole
      // slice is derived at once rather than parsed as one line
      text = grokQuestionTextFromSlice(texts[idx])
    } else {
      try {
        const obj: unknown = JSON.parse(texts[idx].trim())
        if (typeof obj === 'object' && obj !== null) text = questionTextAt(q.side, obj as Record<string, unknown>)
      } catch {
        text = null
      }
    }
    // Unreadable means passing null: the wording belongs to the renderer (ticket 07), and the main
    // process emits no user-facing natural language
    return { revision: questionRevision(identity, file, rec[0], rec[1], texts[idx]), i: idx + 1, text, at: rec[3], tools: rec[4], subagents: rec[5] }
  })
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  if (sourceIdentity(file) !== identity) throw appError(ERR.sessionNotIndexed)
  const page: SessionPage = {
    revision: pageRevision(identity, q.questions),
    file,
    side: q.side,
    title: q.title,
    at: q.at,
    tokens: sessionTokens.get(file) ?? 0,
    bytes: statSync(file).size,
    forkState: q.forkState,
    forkPoints: q.forkPoints,
    forkParentTitle: q.forkParentTitle,
    forkParentFile: q.forkParentFile,
    questions
  }
  assertSessionPage(page)
  remember({ kind: 'sessionPage', file, data: page })
  return page
})
handle(CMD.sessionFresh, (_e, raw: unknown) => {
  // The same allow-list comes first (fail-closed); the predicate is read-only and triggers no rebuild
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  return regularTarget(file) && tokenEngine ? tokenEngine.isFresh(file) : false
})
handle(CMD.getSessionTurn, async (_e, raw: unknown) => {
  const a = raw as SessionTurnArgs
  const file = sessionReadTarget(sessionWhitelist, a?.file)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  if (a?.revision !== undefined && typeof a.revision !== 'string') throw appError(ERR.badArgs, { channel: 'getSessionTurn', field: 'revision' })
  if (typeof a?.i !== 'number' || !Number.isInteger(a.i) || a.i < 0)
    throw appError(ERR.badArgs, { channel: 'getSessionTurn', field: 'i' })
  if (!firstScanComplete) await firstLiveScan
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  if (!tokenEngine) throw appError(ERR.engineNotReady)
  // The range comes from the main process's own index (sessionQuestions rebuilds the single file when
  // the signature does not match),
  // and a byte range from the renderer is not accepted — all this channel can fetch is "the turn of a
  // given question"
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  const readStarted = performance.now()
  const identity = sourceIdentity(file)
  const q = await tokenEngine.sessionQuestions(realRoots(), file)
  if (a.i >= q.questions.length) throw appError(ERR.turnOutOfRange, { i: a.i, total: q.questions.length })
  const rec = q.questions[a.i]
  // A whole turn = from after the question up to the next one ([turn start, turn end); the page already
  // has the question in full; re-read that selected question only to validate its source identity)
  const { texts, bytesRead } = await readRanges(file, [{ start: rec[0], end: rec[1] }, { start: rec[1], end: rec[2] }])
  const revision = questionRevision(identity, file, rec[0], rec[1], texts[0])
  if (a.revision !== undefined && a.revision !== revision) throw appError(ERR.sessionNotIndexed)
  const turn: SessionTurn = { blocks: turnBlocksFromText(q.side, texts[1]), bytesRead }
  if (!sessionWhitelist.has(file)) throw appError(ERR.sessionNotWhitelisted)
  if (sourceIdentity(file) !== identity) throw appError(ERR.sessionNotIndexed)
  assertSessionTurn(turn)
  remember({ kind: 'turnContent', file, i: a.i, revision, ms: Math.max(1, Math.round(performance.now() - readStarted)), data: turn })
  return turn
})
handle(CMD.searchSessions, async (_e, raw: unknown) => {
  const a = raw as SearchSessionsArgs
  if (typeof a?.path !== 'string' || a.path === '') throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'path' })
  if (typeof a?.needle !== 'string' || a.needle.length > 200)
    throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'needle' })
  if (typeof a?.fullText !== 'boolean') throw appError(ERR.badArgs, { channel: 'searchSessions', field: 'fullText' })
  if (!tokenEngine) throw appError(ERR.engineNotReady)
  // The session set comes from the main process's own statistics (the renderer cannot supply file
  // paths); an unregistered project is naturally empty
  const sessions = perProjectStats.get(mergeKey(a.path))?.sessions ?? []
  const r = await searchProjectSessions(tokenEngine, realRoots(), sessions, a.needle, a.fullText)
  assertSearchResult(r)
  return r
})
handle(CMD.readArtifact, async (_e, file: unknown) => {
  if (typeof file !== 'string' || !readRegistry.admission('artifacts', file)) throw appError(ERR.artifactNotWhitelisted)
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  if (!readRegistry.admission('artifacts', file)) throw appError(ERR.artifactNotWhitelisted)
  if (readRegistry.admission('artifacts', file) === 'restored' && !regularTarget(file)) throw appError(ERR.artifactNotWhitelisted)
  const raw = readFileSync(file, 'utf8')
  // Only report whether it was truncated; the renderer appends the marker in the current language
  // (ticket 07)
  const text = raw.length > 500_000
    ? { text: raw.slice(0, 500_000), truncated: true }
    : { text: raw, truncated: false }
  remember({ kind: 'artifactContent', file, data: text })
  return text
})
handle(CMD.copyText, (_e, text: unknown) => {
  if (typeof text !== 'string' || text === '')
    throw appError(ERR.badArgs, { channel: 'copyText', field: 'text' })
  clipboard.writeText(text)
})

handle(CMD.openArtifact, async (_e, file: unknown) => {
  if (typeof file !== 'string' || !readRegistry.admission('artifacts', file)) throw appError(ERR.artifactNotWhitelisted)
  if (readRegistry.admission('artifacts', file) === 'restored' && !regularTarget(file)) throw appError(ERR.artifactNotWhitelisted)
  await shell.openPath(file)
})
function checkSkillOpArgs(args: unknown): SkillOpArgs {
  const a = args as SkillOpArgs
  if (
    typeof a?.skillName !== 'string' ||
    !AGENT_SIDES.has(a?.side) ||
    typeof a?.targetProjectPath !== 'string'
  ) {
    throw appError(ERR.badArgs, { channel: 'skillOp' })
  }
  return a
}
handle(CMD.installSkill, (_e, args: unknown) => installSkill(realRoots(), checkSkillOpArgs(args)))
handle(CMD.uninstallSkill, (_e, args: unknown) => uninstallSkill(checkSkillOpArgs(args)))

function checkListSkillFilesArgs(args: unknown): ListSkillFilesArgs {
  const a = args as ListSkillFilesArgs
  if (
    typeof a?.name !== 'string' ||
    !AGENT_SIDES.has(a?.side) ||
    (a?.scope !== 'global' && a?.scope !== 'project' && a?.scope !== 'plugin')
  ) {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles' })
  }
  if (a.scope === 'project' && typeof a.projectPath !== 'string') {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles', field: 'projectPath' })
  }
  if (a.scope === 'plugin' && typeof a.pluginRoot !== 'string') {
    throw appError(ERR.badArgs, { channel: 'listSkillFiles', field: 'pluginRoot' })
  }
  return a
}
handle(CMD.listSkillFiles, async (_e, args: unknown): Promise<ListSkillFilesResult> => {
  const a = checkListSkillFilesArgs(args)
  if (FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS))
  let root: string | null
  if (a.scope === 'plugin') {
    // H8: the package root must hit the scan's registration set (fail-closed); the skill name is
    // sanitised inside the resolver
    if (!readRegistry.admission('pluginRoots', a.pluginRoot as string)) {
      throw appError(ERR.pluginRootNotRegistered)
    }
    if (readRegistry.admission('pluginRoots', a.pluginRoot as string) === 'restored' && !regularTarget(a.pluginRoot as string, true)) throw appError(ERR.pluginRootNotRegistered)
    root = resolvePluginSkillRoot(a.pluginRoot as string, a.name)
  } else {
    if (a.scope === 'project' && !readRegistry.admission('projects', a.projectPath as string)) {
      throw appError(ERR.projectNotOpened)
    }
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
  const result = {
    files: listing.files,
    deep: listing.deep,
    deepPaths: listing.deepPaths,
  }
  const read: SavedRead = { kind: 'skillFiles', args: a, data: result }
  readRegistry.replace({ owner: savedReadKey(read), skillFiles: listing.files.map(f => f.absPath), artifacts: [], projects: [], pluginRoots: [] })
  remember(read)
  return result
})
handle(CMD.readSkillFile, (_e, args: unknown): CappedText => {
  const a = args as { absPath?: unknown }
  if (typeof a?.absPath !== 'string' || !a.absPath) throw appError(ERR.badArgs, { channel: 'readSkillFile', field: 'absPath' })
  if (!readRegistry.admission('skillFiles', a.absPath)) throw appError(ERR.skillFileNotWhitelisted)
  try {
    if (readRegistry.admission('skillFiles', a.absPath) === 'restored' && !regularTarget(a.absPath)) throw appError(ERR.skillFileUnreadable)
    const text = readSkillFileText(a.absPath)
    remember({ kind: 'skillContent', file: a.absPath, data: text })
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
handle(CMD.getPrefs, () => prefsHandlers.getPrefs())
handle(CMD.setTheme, (_e, theme: unknown) => prefsHandlers.setTheme(theme))
handle(CMD.setLanguage, (_e, language: unknown) => {
  const next = prefsHandlers.setLanguage(language)
  // **The menu must be rebuilt**, not constructed once at startup (ticket 13): it is a native control,
  // and its copy does not update automatically when the renderer's language changes
  applyMenu()
  return next
})
handle(CMD.setMode, (_e, mode: unknown) => prefsHandlers.setMode(mode))
const PRELOAD = join(__dirname, '../preload/index.cjs')

/** Rebuild the application menu in the currently effective language; must be called again after a
 * language change */
function applyMenu(): void {
  const send = (channel: string) => (): void => mainWindow?.webContents.send(channel)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate(initialLanguage(), { openSettings: send(EVT.menuOpenSettings) })
    )
  )
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
        `${LANG_ARG}${initialLanguage()}`,
        `${SYS_LANGS_ARG}${systemPreferredLanguages().join(',')}`
      ]
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
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
  tokenEngine = new TokenEngine(app.getPath('userData'))
  // The accounting stamp (ADR-0026): the application version covers combination-layer changes, the cache
  // structure version covers parser changes — together they identify the accounting code, so a lower
  // figure under the same stamp can only mean the data shrank
  archive = new UsageArchive(app.getPath('userData'), { stamp: `${app.getVersion()}+c${CACHE_VERSION}` })
  displayStore = new DisplayStore(app.getPath('userData'))
  const restored = displayStore.get()
  current = restored.snapshot
  perProjectStats = new Map(restored.stats)
  sessionWhitelist = new Set(restored.sessionFiles)
  for (const stats of perProjectStats.values()) for (const s of stats.sessions) sessionTokens.set(s.file, s.tokens)
  savedReads = new Map(restored.reads.map(r => [savedReadKey(r), r]))
  readRegistry = new ReadRegistry(restored.registrations)
  createWindow()
  applyMenu()
  void doScan().catch((error: unknown) => console.error('[startup] scan failed:', error))
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

// Normal quit waits for pending atomic writes. Forced termination may lose only unfinished writes.
let quitFlushed = false
app.on('before-quit', (event) => {
  if (quitFlushed || !displayStore) return
  event.preventDefault()
  void displayStore.flush().catch((error: unknown) => console.error('[display-cache] quit flush failed:', error)).finally(() => {
    quitFlushed = true
    app.quit()
  })
})
