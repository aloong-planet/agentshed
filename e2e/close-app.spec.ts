// The bounded teardown every e2e case closes its app through (close-app.ts, #227). H1–H3, H5 and H6 launch no app: a
// stand-in for Playwright's application object, the only part of it the helper reads, with the group killer and the
// report sink injected — the killer stands for the operating system's signal, the sink for the terminal. H4 runs the
// default killer on a process group the case starts itself.
// Gap, with its condition: Electron's native shutdown under load, the reason for the bound, is not reproduced here; it
// needs a loaded machine (docs/.workings/e2e-teardown/evidence/ticket-227/, the runs under busy processes).
import { spawn } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'

/** A pid no process group can have, so a killer that bypassed the injection would end in ESRCH, not a real kill */
const NO_SUCH_PID = 2 ** 30
/** How long after the kill the stand-in's close settles, as Playwright's does once the group's pipes have closed */
const SETTLE_MS = 150

/** Process groups a case started; ended after every case, since a case that times out never reaches a finally */
const started: number[] = []
test.afterEach(() => {
  for (const pid of started.splice(0)) {
    try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
  }
})

/** A stand-in whose close finishes after `closeAfterMs`, or `SETTLE_MS` after its process group has been killed; a
 *  `null` pid stands for an app with no process */
function standIn(closeAfterMs: number | 'onKill', pid: number | null = NO_SUCH_PID) {
  const killed: number[] = []
  const reported: string[] = []
  let release = (): void => {}
  const closed = new Promise<void>((resolve) => {
    release = () => setTimeout(resolve, SETTLE_MS)
    if (closeAfterMs !== 'onKill') setTimeout(resolve, closeAfterMs)
  })
  const app = { close: () => closed, process: () => ({ pid: pid ?? undefined }) }
  /** Records the group it would kill, so no real process is signalled, and lets the stand-in's close settle */
  const killGroup = (target: number): void => {
    killed.push(target)
    release()
  }
  const report = (note: string): void => {
    reported.push(note)
  }
  return { killed, reported, app, killGroup, report }
}

test('a close that finishes within the bound returns, kills nothing and reports nothing', async () => {
  const { killed, reported, app, killGroup, report } = standIn(20)
  const notes = test.info().annotations.length
  const t0 = Date.now()
  await closeApp(app, { boundMs: 500, killGroup, report })
  expect(Date.now() - t0).toBeLessThan(500)
  expect(killed).toEqual([])
  expect(reported).toEqual([])
  expect(test.info().annotations).toHaveLength(notes)
})

test('a close that outlasts the bound kills the app\'s process group, reports and notes it, and returns once the close has settled', async () => {
  test.setTimeout(5000)
  const { killed, reported, app, killGroup, report } = standIn('onKill')
  const t0 = Date.now()
  await closeApp(app, { boundMs: 100, killGroup, report })
  const took = Date.now() - t0
  expect(killed).toEqual([NO_SUCH_PID])
  expect(took).toBeGreaterThanOrEqual(100 + SETTLE_MS)
  expect(took).toBeLessThan(1500)
  expect(reported).toEqual([expect.stringContaining('100 ms')])
  expect(test.info().annotations.filter((a) => a.type === 'teardown')).toEqual([
    { type: 'teardown', description: expect.stringContaining('100 ms') }
  ])
})

test('a group already gone when the bound passes is no error, and nothing is reported or noted', async () => {
  test.setTimeout(5000)
  const { killed, reported, app, killGroup, report } = standIn('onKill')
  const notes = test.info().annotations.length
  // As process.kill throws for a group that no longer exists
  const goneAlready = (pid: number): void => {
    killGroup(pid)
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
  }
  const t0 = Date.now()
  await closeApp(app, { boundMs: 100, killGroup: goneAlready, report })
  expect(Date.now() - t0).toBeGreaterThanOrEqual(100 + SETTLE_MS)
  expect(killed).toEqual([NO_SUCH_PID])
  expect(reported).toEqual([])
  expect(test.info().annotations).toHaveLength(notes)
})

test('the default killer ends a real process group whose member still holds the pipes', async () => {
  test.setTimeout(5000)
  // A detached parent with piped output, as Playwright launches the app, and a child that inherits that output and
  // keeps running, as the app's helper processes do
  const parent = spawn(
    process.execPath,
    ['-e', "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'inherit'] }); setInterval(() => {}, 1000)"],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  if (parent.pid !== undefined) started.push(parent.pid)
  parent.stdout.resume()
  parent.stderr.resume()
  const exited = new Promise<NodeJS.Signals | null>((resolve) => parent.once('exit', (_code, signal) => resolve(signal)))
  // Playwright's close settles on the child process's close event: its exit, and its pipes closed
  const closed = new Promise<void>((resolve) => parent.once('close', () => resolve()))
  const { reported, report } = standIn('onKill')
  const t0 = Date.now()
  await closeApp({ close: () => closed, process: () => ({ pid: parent.pid }) }, { boundMs: 200, report })
  expect(Date.now() - t0).toBeLessThan(3000)
  expect(await exited).toBe('SIGKILL')
  expect(reported).toHaveLength(1)
})

test('a close past the bound with no process to kill is an error', async () => {
  const { killed, app, killGroup, report } = standIn('onKill', null)
  await expect(closeApp(app, { boundMs: 100, killGroup, report })).rejects.toThrow('no process to kill')
  expect(killed).toEqual([])
})

test('a kill that fails for another reason than a group already gone is an error', async () => {
  const { app, report } = standIn('onKill')
  const refused = (): void => {
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  }
  await expect(closeApp(app, { boundMs: 100, killGroup: refused, report })).rejects.toThrow('EPERM')
})
