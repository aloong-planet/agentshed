// The order a quit settles things in (quit.ts), over the real display store on a temporary directory and a
// stand-in for stopping the scan worker. That the app's quit handler calls it with the display store's flush and the
// scan client's close is wiring no case drives: e2e cannot make a scan's result arrive while the worker stops,
// which takes a scan with a long synchronous stretch, that is, a home of real size.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { emptySnapshot } from '@shared/domain'
import { emptyDisplayData } from '@shared/display-data'
import { DisplayStore } from './display-store'
import { settleForQuit } from './quit'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-quit-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** The scan time of the display copy on disk */
const onDisk = (): number | undefined => new DisplayStore(dir).get().snapshot?.scannedAt

it('a quit waits for the scan worker to stop, and a display save that landed while it stopped is on disk when the quit goes on', async () => {
  const store = new DisplayStore(dir)
  const save = (scannedAt: number): void => store.save({ ...emptyDisplayData(), snapshot: emptySnapshot(scannedAt) })
  let stops = 0
  let stopped = (): void => {}
  let settled = false
  save(1)

  const quitting = settleForQuit(
    () => store.flush(),
    () => {
      stops++
      return new Promise<void>((resolve) => (stopped = resolve))
    }
  ).then(() => {
    settled = true
  })
  await expect.poll(onDisk).toBe(1)
  expect(settled, 'the worker has not stopped yet').toBe(false)
  // The scan's result arriving while the worker finishes its step
  save(2)
  stopped()
  await quitting

  expect(stops).toBe(1)
  expect(onDisk()).toBe(2)
})
