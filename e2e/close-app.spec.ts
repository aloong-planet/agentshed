// The bounded teardown every e2e case closes its app through (close-app.ts, #227). No app is launched: a stand-in for
// Playwright's application object, the only part of it the helper reads, closes when told to.
import { test, expect } from '@playwright/test'
import { closeApp } from './close-app'

/** A stand-in whose close finishes after `closeAfterMs`, or only once its process group has been killed */
function standIn(closeAfterMs: number | 'onKill') {
  const killed: number[] = []
  let release = (): void => {}
  const closed = new Promise<void>((resolve) => {
    release = resolve
    if (closeAfterMs !== 'onKill') setTimeout(resolve, closeAfterMs)
  })
  const app = { close: () => closed, process: () => ({ pid: 4242 }) }
  /** Records the group it would kill, so no real process is signalled, and lets the stand-in's close settle */
  const killGroup = (pid: number): void => {
    killed.push(pid)
    release()
  }
  return { killed, app, killGroup }
}

test('a close that finishes within the bound returns, kills nothing and notes nothing', async () => {
  const { killed, app, killGroup } = standIn(20)
  const notes = test.info().annotations.length
  const t0 = Date.now()
  await closeApp(app, { boundMs: 500, killGroup })
  expect(Date.now() - t0).toBeLessThan(500)
  expect(killed).toEqual([])
  expect(test.info().annotations).toHaveLength(notes)
})

test('a close that outlasts the bound kills the app\'s process group, notes it on the case, and returns once it is gone', async () => {
  test.setTimeout(5000)
  const { killed, app, killGroup } = standIn('onKill')
  const t0 = Date.now()
  await closeApp(app, { boundMs: 100, killGroup })
  const took = Date.now() - t0
  expect(killed).toEqual([4242])
  expect(took).toBeGreaterThanOrEqual(100)
  expect(took).toBeLessThan(1000)
  expect(test.info().annotations.filter((a) => a.type === 'teardown')).toEqual([
    { type: 'teardown', description: expect.stringContaining('100 ms') }
  ])
})

test('a group already gone when the bound passes is no error, and nothing is noted', async () => {
  const { app, killGroup } = standIn('onKill')
  const notes = test.info().annotations.length
  // As process.kill throws for a group that no longer exists
  const goneAlready = (pid: number): void => {
    killGroup(pid)
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
  }
  await closeApp(app, { boundMs: 100, killGroup: goneAlready })
  expect(test.info().annotations).toHaveLength(notes)
})
