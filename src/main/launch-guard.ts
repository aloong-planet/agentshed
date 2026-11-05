// The launch guard (ADR-0042). Imported first by the main module, so it decides while that module loads: the debugging server
// has not started by then and no other process has (measured on Electron 43.2.0), and app.exit ends the process there and
// then, so nothing after it runs.
import { app } from 'electron'
import { launchRefusal } from './launch-inputs'

const refusal = launchRefusal({ packaged: app.isPackaged, argv: process.argv, env: process.env })
if (refusal) {
  console.error(refusal.message)
  app.exit(refusal.exitCode)
}
