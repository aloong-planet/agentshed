// The launch guard (ADR-0042). Imported first by the main module, so it decides while that module loads: the debugging server
// has not started by then and no other process has (measured on Electron 43.2.0), and app.exit ends the process there and
// then, so nothing after it runs. A run from source is not packaged, which leaves e2e, smoke and development their seams.
import { app } from 'electron'
import { refusedLaunchInputs } from './launch-inputs'

/** EX_USAGE: the packaging check tells a refusal from a crash by this code (mac-distribution::CON-008/AC-05) */
const REFUSED_EXIT_CODE = 64

if (app.isPackaged) {
  const refused = refusedLaunchInputs(process.argv.slice(1), process.env)
  if (refused.length > 0) {
    console.error(`Agentshed: an installed copy does not start with ${refused.join(', ')}.`)
    app.exit(REFUSED_EXIT_CODE)
  }
}
