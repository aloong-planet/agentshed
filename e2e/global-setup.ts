// e2e 全局准备:macOS 上把 Electron 指向「测试静音」副本(LSUIElement=true)。
//
// Dock 图标在 Electron 原生引导期就按 Info.plist 注册,主进程 JS 的 dock.hide()
// 追不上——18 个实例连跑就是 Dock 图标持续闪现抖动。副本由 scripts/quiet-electron.sh
// 生成(幂等、Electron 版本感知);ELECTRON_OVERRIDE_DIST_PATH 是 electron npm 壳的
// 原生机制,playwright 的 electron.launch 在 worker 里 require('electron') 解析路径,
// worker 继承本进程 env,故在这里设置即可全局生效。
//
// Linux(CI xvfb)无 Dock 概念,脚本自身空操作,这里也不设变量——行为与原先一致。
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

export default function globalSetup(): void {
  if (process.platform !== 'darwin') return
  execSync('bash scripts/quiet-electron.sh', { stdio: 'inherit' })
  process.env['ELECTRON_OVERRIDE_DIST_PATH'] = resolve('node_modules/.cache/electron-quiet/dist')
}
