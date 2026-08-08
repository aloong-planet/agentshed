import { app, BrowserWindow, ipcMain, nativeTheme, protocol, session, shell } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CMD,
  EVT,
  type SearchSessionsArgs,
  type SessionTurnArgs,
  type SetHiddenArgs,
  type SkillOpArgs,
  type ListSkillFilesArgs,
  type ListSkillFilesResult
} from '@shared/ipc'
import type { ProjectStats, SessionPage, SessionTurn, Snapshot } from '@shared/domain'
import { assertSnapshot, assertProjectDetail, assertSessionPage, assertSessionTurn, assertSearchResult } from '@shared/validate'
import { mergeKey } from '@shared/path-key'
import { providerOf } from '@shared/provider'
import { scan } from './providers/scan'
import { readRanges } from './providers/range-read'
import { questionTextAt } from './providers/question-index'
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
import { HiddenStore } from './hidden-store'
import { rescanIntervalMs, shouldRescanOnFocus } from './rescan'
import { PrefsStore } from './prefs-store'
import { applyAppearanceMode } from './appearance-mode'
import { createPrefsHandlers } from './prefs-handlers'
import { effectiveLanguage, type Language } from '@shared/i18n'
import { LANG_ARG, SYS_LANGS_ARG } from '@shared/ipc'
import { DEFAULT_PREFS } from '@shared/prefs'
import { systemPreferredLanguages } from './system-language'
import {
  listSkillPackageFiles,
  readSkillFileText,
  resolvePluginSkillRoot,
  resolveSkillRoot,
  SKILL_DEEP_HINT
} from './providers/skill-package'

// app:// scheme 必须在 app ready **之前**注册特权(#18);dev 走 vite http,不加载
// app://,注册也无副作用。standard=非 opaque origin(安全上下文 + storage 快路径),
// secure=等价 https,supportFetchAPI=modulepreload 需要。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// 单实例锁:第二个实例什么都没初始化,直接 exit 最安全(quit 会走 before-quit 可能卡住)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

// 测试静音(e2e/smoke 注入,与 AGENTSHED_HOME_OVERRIDE 同类 seam;生产不设此变量):
// 一轮本地验证要起二十来个实例,macOS 上每次启动都激活抢前台,期间用户没法干别的。
// **实测 activation policy 拦不住**(accessory / dock.hide 下仍 12-13/15 tick 抢台
// ——抢台来自 BrowserWindow 默认 show 的 makeKey+激活,不是 Dock),所以静音模式
// 直接不显示窗口:Playwright 走 CDP 驱动,DOM/布局断言不需要窗口可见;配套关掉
// backgroundThrottling,免得隐藏窗口的定时器降频给测试引入新的时序 flake。
const QUIET = process.platform === 'darwin' && Boolean(process.env['AGENTSHED_NO_FOREGROUND'])
if (QUIET) {
  app.setActivationPolicy('accessory')
  app.dock?.hide()
}

let mainWindow: BrowserWindow | null = null
let hiddenStore: HiddenStore | null = null
let prefsStore: PrefsStore | null = null
let tokenEngine: TokenEngine | null = null
let archive: UsageArchive | null = null
let perProjectStats = new Map<string, ProjectStats>()
// 会话读白名单(票 04):主进程扫描时自己产出的精确路径 Set,区间读只认它。
// 含入列会话与 subagent/嵌套转写(07 要展开后者)。
let sessionWhitelist = new Set<string>()
// file → tokens:会话页头的消耗数,与列表同源(同一趟 build 算出的 SessionMeta)
let sessionTokens = new Map<string, number>()

// ── 快照与刷新(去重:进行中忽略再次触发)──
let current: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null
/** 上次成功扫描时刻;聚焦触发的节流基准(token-stats E1) */
let lastScanAt: number | null = null

async function doScan(): Promise<Snapshot> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const snap = await scan(realRoots(), {
        now: () => Date.now(),
        isHidden: (p) => hiddenStore?.isHidden(p) ?? false
      })
      if (tokenEngine) {
        const claudePaths = snap.projects
          .filter((p) => p.sides.includes('claude'))
          .map((p) => p.path)
        const registered = new Set(snap.projects.map((p) => mergeKey(p.path)))
        const t = await tokenEngine.build(realRoots(), claudePaths, registered)
        snap.tokens = t.global
        perProjectStats = t.perProject
        // 会话数与会话分栏同源。scan() 给的是**文件数**(含预热与 subagent),
        // 而分栏按 spec A3a/A3 只列真会话——两个数字都叫"会话数"就会打架
        // (实测某项目 1511 vs 507)。这里回填,数据是上面刚算完的,零额外开销。
        // 只在 token 引擎跑过时回填:引擎缺席时保留文件数,不让整列归零。
        for (const p of snap.projects) {
          p.sessionCount = t.perProject.get(mergeKey(p.path))?.sessions.length ?? 0
        }
        sessionWhitelist = t.sessionFiles
        const tok = new Map<string, number>()
        for (const ps of t.perProject.values()) for (const s of ps.sessions) tok.set(s.file, s.tokens)
        sessionTokens = tok
        // 归档:实时值覆盖仍可见的天,已被 agent 清理的天从归档补回趋势
        if (archive) {
          archive.merge(t.rows, t.liveDays)
          const archivedDays = archive.archivedOnlyDays(t.liveDays)
          snap.archivedDays = archivedDays
          if (archivedDays.length) {
            const set = new Set(archivedDays)
            const byDay = new Map(snap.tokens.byDay.map((d) => [d.day, d]))
            for (const r of archive.rows()) {
              if (!set.has(r.day)) continue
              const d = byDay.get(r.day) ?? { day: r.day, claude: 0, codex: 0, byProvider: {} }
              d[r.side] += r.total
              const prov = providerOf(r.model)
              d.byProvider[prov] = (d.byProvider[prov] ?? 0) + r.total
              byDay.set(r.day, d)
            }
            snap.tokens.byDay = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
          }
        }
      }
      assertSnapshot(snap)
      lastScanAt = Date.now() // 聚焦节流的基准(token-stats E1)
      // memory 文件加入按需读取白名单(与产物同一不变量:快照列出过的文件才可读)
      for (const m of snap.global.memory) for (const f of m.files) artifactWhitelist.add(f.file)
      // 插件包根登记集(plugins-view H8):列举入口必须命中,fail-closed
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
 * IPC 注册的唯一入口(#17):所有 handler 经此包装,先校验 sender 再执行。
 * 用包装器而非逐个 handler 里加一行——**逐个加必然漏**,包装器让"新增 handler
 * 自动受校验"成为默认,漏接的形态是编译不过而不是静默无防护。
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
handle(CMD.refresh, async () => doScan())
// 产物文件白名单:只允许读/外开「详情里列出过」的文件,堵任意路径读取口
const artifactWhitelist = new Set<string>()
/** skills-view:展开列举登记的精确可读路径 */
const skillFileWhitelist = new Set<string>()
/** skills-view C9:项目级列举只对「打开过详情」的项目放行(fail-closed,同 session 白名单模式) */
const openedProjects = new Set<string>()
/** plugins-view H8:插件包根登记集——扫描/详情登记的摘要同源包根才可列举 */
const pluginRootWhitelist = new Set<string>()

handle(CMD.getProjectDetail, (_e, path: unknown) => {
  if (typeof path !== 'string' || path === '') throw new Error('getProjectDetail 参数不合契约')
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  // 出口校验:契约漂移在边界抛,而不是渲染成 undefined(与快照同规矩)。
  // 覆盖整份详情,含 stats.sessions 那块(validateProjectDetail 内部复用其校验器)。
  assertProjectDetail(detail)
  for (const a of detail.artifacts) artifactWhitelist.add(a.file)
  for (const t of detail.memory.topics) artifactWhitelist.add(t.file)
  openedProjects.add(path)
  for (const p of detail.plugins) if (p.installPath) pluginRootWhitelist.add(p.installPath)
  return detail
})
handle(CMD.getSessionPage, async (_e, raw: unknown) => {
  // 白名单在最前:不合法的路径连 stat 都不做(fail-closed,判定纯函数见 security.ts)
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw new Error('会话路径不在白名单(先打开项目详情或全局刷新)')
  if (!tokenEngine) throw new Error('扫描引擎未就绪')
  const q = await tokenEngine.sessionQuestions(realRoots(), file)
  // 文本按区间现读(spec D2a:索引里没有文本);readRanges 绝不整读
  const { texts } = await readRanges(file, q.questions.map((r) => ({ start: r[0], end: r[1] })))
  const questions = q.questions.map((rec, idx) => {
    // 单行坏了只自伤:该条显示占位,不连累其余提问、不拖垮整页
    let text: string | null = null
    try {
      const obj: unknown = JSON.parse(texts[idx].trim())
      if (typeof obj === 'object' && obj !== null) text = questionTextAt(q.side, obj as Record<string, unknown>)
    } catch {
      text = null
    }
    return { i: idx + 1, text: text ?? '(该行已无法读取)', at: rec[3], tools: rec[4], subagents: rec[5] }
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
  // 同一道白名单在最前(fail-closed);谓词只读,不触发重建
  const file = sessionReadTarget(sessionWhitelist, raw)
  if (!file) throw new Error('会话路径不在白名单(先打开项目详情或全局刷新)')
  return tokenEngine ? tokenEngine.isFresh(file) : false
})
handle(CMD.getSessionTurn, async (_e, raw: unknown) => {
  const a = raw as SessionTurnArgs
  const file = sessionReadTarget(sessionWhitelist, a?.file)
  if (!file) throw new Error('会话路径不在白名单(先打开项目详情或全局刷新)')
  if (typeof a?.i !== 'number' || !Number.isInteger(a.i) || a.i < 0)
    throw new Error('getSessionTurn 参数不合契约:i 需为非负整数')
  if (!tokenEngine) throw new Error('扫描引擎未就绪')
  // 区间来自主进程自己的索引(签名不符时 sessionQuestions 单文件重建),
  // 不接受渲染层直接给字节区间——通道能取的只有"某条提问的那一轮"
  const q = await tokenEngine.sessionQuestions(realRoots(), file)
  if (a.i >= q.questions.length) throw new Error(`轮次下标越界:${a.i}(共 ${q.questions.length} 轮)`)
  const rec = q.questions[a.i]
  // 整轮 = 提问之后到下一条提问之前([轮次起, 轮次止);提问全文页面已有,不重复取)
  const { texts, bytesRead } = await readRanges(file, [{ start: rec[1], end: rec[2] }])
  const turn: SessionTurn = { blocks: turnBlocksFromText(q.side, texts[0]), bytesRead }
  assertSessionTurn(turn)
  return turn
})
handle(CMD.searchSessions, async (_e, raw: unknown) => {
  const a = raw as SearchSessionsArgs
  if (typeof a?.path !== 'string' || a.path === '') throw new Error('searchSessions 参数不合契约:path')
  if (typeof a?.needle !== 'string' || a.needle.length > 200)
    throw new Error('searchSessions 参数不合契约:needle 需为 ≤200 字符的 string')
  if (typeof a?.fullText !== 'boolean') throw new Error('searchSessions 参数不合契约:fullText')
  if (!tokenEngine) throw new Error('扫描引擎未就绪')
  // 会话集合来自主进程自身的统计(渲染层给不了文件路径);未注册项目自然为空
  const sessions = perProjectStats.get(mergeKey(a.path))?.sessions ?? []
  const r = await searchProjectSessions(tokenEngine, realRoots(), sessions, a.needle, a.fullText)
  assertSearchResult(r)
  return r
})
handle(CMD.readArtifact, (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw new Error('产物路径不在白名单')
  const raw = readFileSync(file, 'utf8')
  return raw.length > 500_000 ? `${raw.slice(0, 500_000)}\n…(已截断)` : raw
})
handle(CMD.openArtifact, async (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw new Error('产物路径不在白名单')
  await shell.openPath(file)
})
function checkSkillOpArgs(args: unknown): SkillOpArgs {
  const a = args as SkillOpArgs
  if (
    typeof a?.skillName !== 'string' ||
    (a?.side !== 'claude' && a?.side !== 'codex') ||
    typeof a?.targetProjectPath !== 'string'
  ) {
    throw new Error('skill 装卸参数不合契约')
  }
  return a
}
handle(CMD.installSkill, (_e, args: unknown) => installSkill(realRoots(), checkSkillOpArgs(args)))
handle(CMD.uninstallSkill, (_e, args: unknown) => uninstallSkill(checkSkillOpArgs(args)))

function checkListSkillFilesArgs(args: unknown): ListSkillFilesArgs {
  const a = args as ListSkillFilesArgs
  if (
    typeof a?.name !== 'string' ||
    (a?.side !== 'claude' && a?.side !== 'codex') ||
    (a?.scope !== 'global' && a?.scope !== 'project' && a?.scope !== 'plugin')
  ) {
    throw new Error('listSkillFiles 参数不合契约')
  }
  if (a.scope === 'project' && typeof a.projectPath !== 'string') {
    throw new Error('listSkillFiles project 缺少 projectPath')
  }
  if (a.scope === 'plugin' && typeof a.pluginRoot !== 'string') {
    throw new Error('listSkillFiles plugin 缺少 pluginRoot')
  }
  return a
}
handle(CMD.listSkillFiles, (_e, args: unknown): ListSkillFilesResult => {
  const a = checkListSkillFilesArgs(args)
  let root: string | null
  if (a.scope === 'plugin') {
    // H8:包根必须命中扫描登记集(fail-closed);skill 名消毒在 resolver 内
    if (!pluginRootWhitelist.has(a.pluginRoot as string)) {
      throw new Error('插件包根不在登记集(先刷新或打开详情)')
    }
    root = resolvePluginSkillRoot(a.pluginRoot as string, a.name)
  } else {
    if (a.scope === 'project' && !openedProjects.has(a.projectPath as string)) {
      throw new Error('项目未打开(先打开项目详情)')
    }
    // 容器检查(C9,作用于解析前入口)在 resolveSkillRoot 内完成
    root = resolveSkillRoot({
      side: a.side,
      name: a.name,
      scope: a.scope,
      projectPath: a.projectPath,
      roots: realRoots()
    })
  }
  if (!root) {
    throw new Error('skill 包不可用或不在允许根下')
  }
  const listing = listSkillPackageFiles(root)
  for (const f of listing.files) skillFileWhitelist.add(f.absPath)
  return {
    files: listing.files,
    deep: listing.deep,
    deepPaths: listing.deepPaths,
    deepHint: SKILL_DEEP_HINT
  }
})
handle(CMD.readSkillFile, (_e, args: unknown): string => {
  const a = args as { absPath?: unknown }
  if (typeof a?.absPath !== 'string' || !a.absPath) throw new Error('readSkillFile 参数不合契约')
  if (!skillFileWhitelist.has(a.absPath)) throw new Error('skill 文件路径不在白名单')
  try {
    return readSkillFileText(a.absPath)
  } catch {
    throw new Error('skill 文件不可读')
  }
})

// 偏好类 handler 的逻辑在 ./prefs-handlers(可注入、有单测);这里只做接线。
// store 传取值函数而非实例:prefsStore 要到 whenReady 才赋值,而通道此刻就注册了。
const prefsHandlers = createPrefsHandlers({ store: () => prefsStore, theme: nativeTheme })
handle(CMD.getPrefs, () => prefsHandlers.getPrefs())
handle(CMD.setScheme, (_e, scheme: unknown) => prefsHandlers.setScheme(scheme))
handle(CMD.setLanguage, (_e, language: unknown) => prefsHandlers.setLanguage(language))
handle(CMD.setMode, (_e, mode: unknown) => prefsHandlers.setMode(mode))
handle(CMD.setHidden, (_e, args: unknown) => {
  const a = args as SetHiddenArgs
  if (typeof a?.projectPath !== 'string' || typeof a?.hidden !== 'boolean') {
    throw new Error('setHidden 参数不合契约')
  }
  hiddenStore?.setHidden(a.projectPath, a.hidden)
  // 局部更新快照并广播,不触发全量重扫
  if (current) {
    for (const p of current.projects) {
      if (mergeKey(p.path) === mergeKey(a.projectPath)) {
        p.hidden = a.hidden
      }
    }
    mainWindow?.webContents.send(EVT.snapshot, current)
  }
})

const PRELOAD = join(__dirname, '../preload/index.cjs')

/** 窗口创建时刻的生效语言 = 偏好 + 系统语言列表。偏好为「跟随系统」时才看系统 */
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
      // 生效语言随窗口一同创建,让 renderer **首帧**就能用上正确语言。
      // 走 IPC 异步取的话首帧必然是默认语言,整页文字随后跳变一次——
      // 换外观方案只是变色不易察觉,换语言是全部文字都变,必须避免。
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
    void mainWindow.loadURL(`app://${APP_HOST}/index.html`) // #18:不用 file://
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// 宿主安全守卫(官方 Security Checklist #5/#12/#13/#14/#15,判定层见 security.ts)。
// 挂 web-contents-created 而非单个窗口:覆盖全部 webContents,新建的自动受管。
// 判据与逐条现状见 docs/ops/electron-security.md。
app.on('web-contents-created', (_e, contents) => {
  installNavigationGuards(contents, process.env['ELECTRON_RENDERER_URL'])
})

void app.whenReady().then(() => {
  if (!gotTheLock) return
  installPermissionGuards(session.defaultSession)
  installCsp(session.defaultSession, Boolean(process.env['ELECTRON_RENDERER_URL']))
  // handler 必须在建窗(loadURL app://…)之前注册;__dirname = out/main,产物在 out/renderer
  registerAppProtocol(join(__dirname, '../renderer'))
  hiddenStore = new HiddenStore(app.getPath('userData'))
  prefsStore = new PrefsStore(app.getPath('userData'))
  // 必须在建窗**之前**:themeSource 决定首帧的 prefers-color-scheme 求值结果,
  // 建窗后再设会先渲染一帧系统明暗、随后整页跳变一次(spec 实现决策)
  applyAppearanceMode(nativeTheme, prefsStore.get().mode)
  tokenEngine = new TokenEngine(app.getPath('userData'))
  archive = new UsageArchive(app.getPath('userData'))
  createWindow()
  void doScan()
  // 快照自动保鲜(token-stats 序列 E):聚焦(节流)+ 定时兜底,与手动 ↻ 共用
  // doScan(inflight 去重,E2);自动触发失败静默保留现快照等下个触发点(E3),
  // 手动 ↻ 的失败仍经 CMD.refresh 抛给调用方。参数环境注入是测试 seam(E5)。
  const autoScan = (): void => {
    void doScan().catch((e: unknown) => {
      // E3:静默保留现快照,但失败要留痕——编程错误不许被无声吞掉
      console.error('[auto-rescan] 扫描失败,保留现有快照:', e)
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
  // 图鉴型工具无后台职责,全窗关闭即退出(含 macOS)
  app.quit()
})

// dev 下防孤儿:electron-vite(Ctrl+C)退出后不 kill electron,Electron 又吞 SIGINT——
// 轮询父进程存活,父(vite)没了就退出,避免留 Dock 变僵尸。仅 dev。
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
