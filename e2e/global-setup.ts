// e2e global setup: on macOS, point Electron at the "test-silenced" copy (LSUIElement=true).
//
// The Dock icon is registered from Info.plist during Electron's native bootstrap, and the main process's
// dock.hide()
// cannot catch up — 18 instances back to back make the Dock icon flash continuously. The copy is produced
// by scripts/quiet-electron.sh
// (idempotent and Electron-version-aware); ELECTRON_OVERRIDE_DIST_PATH is a native mechanism of the
// electron npm wrapper,
// and playwright's electron.launch resolves the path with require('electron') inside a worker
// which inherits this process's env, so setting it here takes effect globally.
//
// Linux (CI xvfb) has no Dock, the script is a no-op there, and no variable is set here either — the
// behaviour is unchanged.
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

export default function globalSetup(): void {
  if (process.platform !== 'darwin') return
  execSync('bash scripts/quiet-electron.sh', { stdio: 'inherit' })
  process.env['ELECTRON_OVERRIDE_DIST_PATH'] = resolve('node_modules/.cache/electron-quiet/dist')
}
