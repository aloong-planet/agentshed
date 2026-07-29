import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CMD, EVT, type SetHiddenArgs } from '@shared/ipc'
import type { ProjectStats, Snapshot } from '@shared/domain'
import { assertSnapshot } from '@shared/validate'
import { mergeKey } from '@shared/path-key'
import { scan } from './providers/scan'
import { readProjectDetail } from './providers/project-detail'
import { TokenEngine } from './providers/token-stats'
import { realRoots } from './roots'
import { HiddenStore } from './hidden-store'

// 单实例锁:第二个实例什么都没初始化,直接 exit 最安全(quit 会走 before-quit 可能卡住)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null
let hiddenStore: HiddenStore | null = null
let tokenEngine: TokenEngine | null = null
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
      }
      assertSnapshot(snap)
      current = snap
      mainWindow?.webContents.send(EVT.snapshot, snap)
      return snap
    } finally {
      inflight = null
    }
  })()
  return inflight
}

ipcMain.handle(CMD.getSnapshot, async () => {
  if (current) return current
  return doScan()
})
ipcMain.handle(CMD.refresh, async () => doScan())
// 产物文件白名单:只允许读/外开「详情里列出过」的文件,堵任意路径读取口
const artifactWhitelist = new Set<string>()

ipcMain.handle(CMD.getProjectDetail, (_e, path: unknown) => {
  if (typeof path !== 'string' || path === '') throw new Error('getProjectDetail 参数不合契约')
  const detail = readProjectDetail(realRoots(), path)
  detail.stats = perProjectStats.get(mergeKey(path)) ?? null
  for (const a of detail.artifacts) artifactWhitelist.add(a.file)
  return detail
})
ipcMain.handle(CMD.readArtifact, (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw new Error('产物路径不在白名单')
  const raw = readFileSync(file, 'utf8')
  return raw.length > 500_000 ? `${raw.slice(0, 500_000)}\n…(已截断)` : raw
})
ipcMain.handle(CMD.openArtifact, async (_e, file: unknown) => {
  if (typeof file !== 'string' || !artifactWhitelist.has(file)) throw new Error('产物路径不在白名单')
  await shell.openPath(file)
})
ipcMain.handle(CMD.setHidden, (_e, args: unknown) => {
  const a = args as SetHiddenArgs
  if (typeof a?.projectPath !== 'string' || typeof a?.hidden !== 'boolean') {
    throw new Error('setHidden 参数不合契约')
  }
  hiddenStore?.setHidden(a.projectPath, a.hidden)
  // 局部更新快照并广播,不触发全量重扫
  if (current) {
    for (const p of current.projects) {
      if (p.path.toLowerCase() === a.projectPath.replace(/\/+$/, '').toLowerCase()) {
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
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

void app.whenReady().then(() => {
  if (!gotTheLock) return
  hiddenStore = new HiddenStore(app.getPath('userData'))
  tokenEngine = new TokenEngine(app.getPath('userData'))
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
