import { app, BrowserWindow, ipcMain, protocol, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CMD, EVT, type SetHiddenArgs, type SkillOpArgs } from '@shared/ipc'
import type { ProjectStats, Snapshot } from '@shared/domain'
import { assertSnapshot, assertProjectDetail } from '@shared/validate'
import { mergeKey } from '@shared/path-key'
import { providerOf } from '@shared/provider'
import { scan } from './providers/scan'
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
  installPermissionGuards
} from './security'
import { HiddenStore } from './hidden-store'

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
let tokenEngine: TokenEngine | null = null
let archive: UsageArchive | null = null
let perProjectStats = new Map<string, ProjectStats>()

// ── 快照与刷新(去重:进行中忽略再次触发)──
let current: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

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
        const t = await tokenEngine.build(realRoots(), claudePaths)
        snap.tokens = t.global
        perProjectStats = t.perProject
        // 会话数与会话分栏同源。scan() 给的是**文件数**(含预热与 subagent),
        // 而分栏按 spec A3a/A3 只列真会话——两个数字都叫"会话数"就会打架
        // (实测某项目 1511 vs 507)。这里回填,数据是上面刚算完的,零额外开销。
        // 只在 token 引擎跑过时回填:引擎缺席时保留文件数,不让整列归零。
        for (const p of snap.projects) {
          p.sessionCount = t.perProject.get(mergeKey(p.path))?.sessions.length ?? 0
        }
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
      // memory 文件加入按需读取白名单(与产物同一不变量:快照列出过的文件才可读)
      for (const m of snap.global.memory) for (const f of m.files) artifactWhitelist.add(f.file)
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

handle(CMD.getProjectDetail, (_e, path: unknown) => {
  if (typeof path !== 'string' || path === '') throw new Error('getProjectDetail 参数不合契约')
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  // 出口校验:契约漂移在边界抛,而不是渲染成 undefined(与快照同规矩)。
  // 覆盖整份详情,含 stats.sessions 那块(validateProjectDetail 内部复用其校验器)。
  assertProjectDetail(detail)
  for (const a of detail.artifacts) artifactWhitelist.add(a.file)
  for (const t of detail.memory.topics) artifactWhitelist.add(t.file)
  return detail
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
      backgroundThrottling: !QUIET
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
  tokenEngine = new TokenEngine(app.getPath('userData'))
  archive = new UsageArchive(app.getPath('userData'))
  createWindow()
  void doScan()
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
