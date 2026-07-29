import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { CMD, EVT } from '@shared/ipc'
import type { Snapshot } from '@shared/domain'
import { assertSnapshot } from '@shared/validate'
import { scan } from './providers/scan'
import { realRoots } from './roots'

// 单实例锁:第二个实例什么都没初始化,直接 exit 最安全(quit 会走 before-quit 可能卡住)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null

// ── 快照与刷新(去重:进行中忽略再次触发)──
let current: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

async function doScan(): Promise<Snapshot> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const snap = await scan(realRoots(), { now: () => Date.now() })
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
