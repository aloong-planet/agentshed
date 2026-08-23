import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, protocol, session, shell } from 'electron'
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
import { TokenEngine } from './providers/token-stats'
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
let current: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null
/** The last successful scan moment; the throttle baseline for focus triggers (token-stats E1) */
let lastScanAt: number | null = null

/** Test seam (the same injection family as the rescan intervals): holds the **first** scan open so
 * e2e can assert the startup skeleton as a stable state instead of racing it (spec A4). 0 in
 * production — rescanIntervalMs falls back to it on unset/invalid input. */
const SCAN_DELAY_MS = rescanIntervalMs(process.env['AGENTSHED_SCAN_DELAY_MS'], 0)
let firstScanDelayed = false

async function doScan(): Promise<Snapshot> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      if (SCAN_DELAY_MS > 0 && !firstScanDelayed) {
        firstScanDelayed = true
        await new Promise((r) => setTimeout(r, SCAN_DELAY_MS))
      }
      const snap = await scan(realRoots(), { now: () => Date.now() })
      if (tokenEngine) {
        const claudePaths = snap.projects
          .filter((p) => p.sides.includes('claude'))
          .map((p) => p.path)
        const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
        const t = await tokenEngine.build(realRoots(), claudePaths, registered)
        snap.tokens = t.global
        perProjectStats = t.perProject
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
        sessionWhitelist = t.sessionFiles
        const tok = new Map<string, number>()
        for (const ps of t.perProject.values()) for (const s of ps.sessions) tok.set(s.file, s.tokens)
        sessionTokens = tok
        // Archive: live values overwrite the days still visible, and days the agent has cleaned up are
        // filled back into the trend from the archive
        if (archive) {
          // Rows with no day cannot be archived — the archive is keyed by day
          archive.merge(t.rows.filter((r) => r.day), t.liveDays)
          const archivedDays = archive.archivedOnlyDays(t.liveDays)
          snap.archivedDays = archivedDays
          if (archivedDays.length) {
            // The archived rows join the row set, and every figure is re-derived from it. Patching
            // only `byDay` — what this used to do — put those days into the trend chart but into
            // neither the cumulative total nor the model breakdown, so the chart showed usage the
            // totals denied (spec G6).
            const set = new Set(archivedDays)
            snap.tokens = deriveStats([...snap.tokens.rows, ...archive.rows().filter((r) => set.has(r.day))])
          }
        }
      }
      assertSnapshot(snap)
      lastScanAt = Date.now() // The baseline for focus throttling (token-stats E1)
      // Memory files join the on-demand read allow-list (the same invariant as artifacts: only files a
      // snapshot listed can be read)
      for (const m of snap.global.memory) for (const f of m.files) artifactWhitelist.add(f.file)
      // The plugin package root registration set (plugins-view H8): an enumeration entry point must hit
      // it, fail-closed
      for (const p of snap.global.plugins) if (p.installPath) pluginRootWhitelist.add(p.installPath)
      for (const c of snap.global.codexPlugins) if (c.root) pluginRootWhitelist.add(c.root)
      current = snap
      mainWindow?.webContents.send(EVT.snapshot, snap)
      return snap
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

handle(CMD.getSnapshot, async () => {
  if (current) return current
  return doScan()
})
// The artifact file allow-list: only files the detail page listed may be read or opened externally,
// closing the arbitrary-path read hole
const artifactWhitelist = new Set<string>()
/** skills-view: the exact readable paths registered by an expansion enumeration */
const skillFileWhitelist = new Set<string>()
/** skills-view C9: project-level enumeration is admitted only for projects whose detail page has been
 * opened (fail-closed, the same pattern as the session allow-list) */
const openedProjects = new Set<string>()
/** plugins-view H8: the plugin package root registration set — only a summary-source package root
 * registered by the scan or detail may be enumerated */
const pluginRootWhitelist = new Set<string>()

handle(CMD.getProjectDetail, (_e, path: unknown) => {
  if (typeof path !== 'string' || path === '') throw appError(ERR.badArgs, { channel: 'getProjectDetail', field: 'path' })
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  // Exit validation: contract drift throws at the boundary rather than rendering as undefined (the same
  // rule as the snapshot).
  // It covers the whole detail payload including the stats.sessions block (validateProjectDetail reuses
  // that validator internally).
  assertProjectDetail(detail)
  for (const a of detail.artifacts) artifactWhitelist.add(a.file)
  for (const t of detail.memory.topics) artifactWhitelist.add(t.file)
  openedProjects.add(path)
  for (const p of detail.plugins) if (p.installPath) pluginRootWhitelist.add(p.installPath)
  return detail
})
handle(CMD.getSessionPage, async (_e, raw: unknown) => {
  // The allow-list comes first: an invalid path is not even stat-ed (fail-closed; the pure judging
  // function is in security.ts)
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  if (!tokenEngine) throw appError(ERR.engineNotReady)
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
    return { i: idx + 1, text, at: rec[3], tools: rec[4], subagents: rec[5] }
  })
  const page: SessionPage = {
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
  return page
})
handle(CMD.sessionFresh, (_e, raw: unknown) => {
  // The same allow-list comes first (fail-closed); the predicate is read-only and triggers no rebuild
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  return tokenEngine ? tokenEngine.isFresh(file) : false
})
handle(CMD.getSessionTurn, async (_e, raw: unknown) => {
  const a = raw as SessionTurnArgs
  const file = sessionReadTarget(sessionWhitelist, a?.file)
  if (!file) throw appError(ERR.sessionNotWhitelisted)
  if (typeof a?.i !== 'number' || !Number.isInteger(a.i) || a.i < 0)
    throw appError(ERR.badArgs, { channel: 'getSessionTurn', field: 'i' })
  if (!tokenEngine) throw appError(ERR.engineNotReady)
  // The range comes from the main process's own index (sessionQuestions rebuilds the single file when
  // the signature does not match),
  // and a byte range from the renderer is not accepted — all this channel can fetch is "the turn of a
  // given question"
  const q = await tokenEngine.sessionQuestions(realRoots(), file)
  if (a.i >= q.questions.length) throw appError(ERR.turnOutOfRange, { i: a.i, total: q.questions.length })
  const rec = q.questions[a.i]
  // A whole turn = from after the question up to the next one ([turn start, turn end); the page already
  // has the question in full, so it is not fetched again)
  const { texts, bytesRead } = await readRanges(file, [{ start: rec[1], end: rec[2] }])
  const turn: SessionTurn = { blocks: turnBlocksFromText(q.side, texts[0]), bytesRead }
  assertSessionTurn(turn)
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
handle(CMD.readArtifact, (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw appError(ERR.artifactNotWhitelisted)
  const raw = readFileSync(file, 'utf8')
  // Only report whether it was truncated; the renderer appends the marker in the current language
  // (ticket 07)
  return raw.length > 500_000
    ? { text: raw.slice(0, 500_000), truncated: true }
    : { text: raw, truncated: false }
})
handle(CMD.copyText, (_e, text: unknown) => {
  if (typeof text !== 'string' || text === '')
    throw appError(ERR.badArgs, { channel: 'copyText', field: 'text' })
  clipboard.writeText(text)
})

handle(CMD.openArtifact, async (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw appError(ERR.artifactNotWhitelisted)
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
handle(CMD.listSkillFiles, (_e, args: unknown): ListSkillFilesResult => {
  const a = checkListSkillFilesArgs(args)
  let root: string | null
  if (a.scope === 'plugin') {
    // H8: the package root must hit the scan's registration set (fail-closed); the skill name is
    // sanitised inside the resolver
    if (!pluginRootWhitelist.has(a.pluginRoot as string)) {
      throw appError(ERR.pluginRootNotRegistered)
    }
    root = resolvePluginSkillRoot(a.pluginRoot as string, a.name)
  } else {
    if (a.scope === 'project' && !openedProjects.has(a.projectPath as string)) {
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
  for (const f of listing.files) skillFileWhitelist.add(f.absPath)
  return {
    files: listing.files,
    deep: listing.deep,
    deepPaths: listing.deepPaths,
  }
})
handle(CMD.readSkillFile, (_e, args: unknown): CappedText => {
  const a = args as { absPath?: unknown }
  if (typeof a?.absPath !== 'string' || !a.absPath) throw appError(ERR.badArgs, { channel: 'readSkillFile', field: 'absPath' })
  if (!skillFileWhitelist.has(a.absPath)) throw appError(ERR.skillFileNotWhitelisted)
  try {
    return readSkillFileText(a.absPath)
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
  archive = new UsageArchive(app.getPath('userData'))
  createWindow()
  applyMenu()
  void doScan()
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
