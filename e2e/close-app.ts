// Closing the app under test, with a bound (#227): every e2e case closes its app through this helper. Measured under
// CPU load, the app's own quit — before-quit, the display cache's flush, will-quit, the process's exit event — took
// about 15 ms, and the Electron process then kept running at its native shutdown for seconds to minutes. Playwright's
// close waits, with no bound, for the process to exit and its stdio pipes to close; the app is spawned as its own
// process group. Killing the main process alone still left closes of up to 69 s, and killing the group ends them at
// once. Past the bound the whole group is killed, and the case is annotated and a warning printed, so a slow close
// shows instead of eating the case's time.
import { test } from '@playwright/test'

/** The part of Playwright's ElectronApplication this needs */
export interface ClosableApp {
  close(): Promise<void>
  process(): { pid?: number }
}

/** How long a close may take before the process group is killed: a normal close takes well under a second */
export const CLOSE_BOUND_MS = 10_000

/** Kills the app's process group: Playwright spawns the app detached, so its pid is the group's */
function killGroupOf(pid: number): void {
  process.kill(-pid, 'SIGKILL')
}

/** Where a kill is reported: the list reporter shows no annotations, so the warning is what a run's reader sees */
function warn(note: string): void {
  console.warn(`[e2e teardown] ${note}`)
}

export async function closeApp(
  app: ClosableApp,
  {
    boundMs = CLOSE_BOUND_MS,
    killGroup = killGroupOf,
    report = warn
  }: { boundMs?: number; killGroup?: (pid: number) => void; report?: (note: string) => void } = {}
): Promise<void> {
  const closed = app.close()
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), boundMs)
  })
  const outcome = await Promise.race([closed.then(() => 'closed' as const), late])
  clearTimeout(timer)
  if (outcome === 'closed') return
  const pid = app.process().pid
  if (pid === undefined) throw new Error(`app.close() had not finished after ${boundMs} ms, and the app has no process to kill`)
  try {
    killGroup(pid)
  } catch (error) {
    // The close can finish in the instant after the bound passes, and the group is then gone: nothing was killed
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    await closed
    return
  }
  const note = `app.close() had not finished after ${boundMs} ms; the app's process group (pid ${pid}) was killed`
  test.info().annotations.push({ type: 'teardown', description: note })
  report(note)
  // Playwright's close settles once the group's pipes have closed
  await closed
}
