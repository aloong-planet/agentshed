// The update controller driven through its public surface with a fake update source and a fake clock —
// the seam app-update's Testing Decisions confirm. Covers the lifecycle table, gating by the switch and by
// the development run, joined checks, the schedule and every failure path of the spec's sequences A–C.
import { describe, expect, it } from 'vitest'
import { CHECK_PERIOD_MS, UpdateController, type FoundUpdate, type UpdateSource } from './update-controller'
import type { UpdateNotice, UpdateState } from '@shared/update'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every settled promise run its continuations */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r))

/** The feed: each request waits until the test answers it */
class FakeSource implements UpdateSource {
  requests = 0
  installs = 0
  progress: ((percent: number) => void) | null = null
  download = deferred<void>()
  installing = deferred<void>()
  private answers: Deferred<FoundUpdate | null>[] = []

  check(onProgress: (percent: number) => void): Promise<FoundUpdate | null> {
    this.requests++
    this.progress = onProgress
    const d = deferred<FoundUpdate | null>()
    this.answers.push(d)
    return d.promise
  }
  install(): Promise<void> {
    this.installs++
    this.installing = deferred<void>()
    return this.installing.promise
  }
  upToDate(): void {
    this.next().resolve(null)
  }
  fail(): void {
    this.next().reject(new Error('net::ERR_INTERNET_DISCONNECTED'))
  }
  cancelled = 0
  found(version: string): void {
    this.download = deferred<void>()
    const download = this.download
    // As the real updater does, a cancelled download rejects its promise
    this.next().resolve({ version, downloaded: download.promise, cancel: () => {
      this.cancelled++
      download.reject(new Error('cancelled'))
    } })
  }
  private next(): Deferred<FoundUpdate | null> {
    const d = this.answers.shift()
    if (!d) throw new Error('no request is waiting for an answer')
    return d
  }
}

/** Wall-clock time with one-shot timers. `advance` lets time pass awake, firing timers as they fall due;
 *  `sleep` moves the wall clock without firing anything, as a sleeping Mac does */
class FakeClock {
  t = 1_000_000
  private timers: { at: number; fn: () => void; live: boolean }[] = []
  now = (): number => this.t
  setTimer = (fn: () => void, ms: number): (() => void) => {
    const timer = { at: this.t + ms, fn, live: true }
    this.timers.push(timer)
    return () => {
      timer.live = false
    }
  }
  advance(ms: number): void {
    const end = this.t + ms
    for (;;) {
      const due = this.timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.t = Math.max(this.t, due.at)
      due.live = false
      due.fn()
    }
    this.t = end
  }
  sleep(ms: number): void {
    this.t += ms
  }
}

function harness(opts: { packaged?: boolean; autoChecks?: boolean } = {}) {
  const source = new FakeSource()
  const clock = new FakeClock()
  const states: UpdateState[] = []
  const notices: UpdateNotice[] = []
  const switchState = { on: opts.autoChecks ?? true }
  const controller = new UpdateController({
    source: opts.packaged === false ? null : source,
    autoChecksOn: () => switchState.on,
    now: clock.now,
    setTimer: clock.setTimer,
    publish: (s) => states.push(s),
    notify: (n) => notices.push(n)
  })
  return { source, clock, states, notices, switchState, controller }
}

describe('UpdateController', () => {
  it('a launch check that finds an update downloads it at once, shows its progress, then makes it ready', async () => {
    const h = harness()
    h.controller.start()
    expect(h.source.requests).toBe(1)
    expect(h.controller.state()).toEqual({ phase: 'checking', version: null, progress: 0 })
    h.source.found('0.2.0')
    await flush()
    expect(h.controller.state()).toEqual({ phase: 'downloading', version: '0.2.0', progress: 0 })
    h.source.progress?.(41.6)
    expect(h.controller.state()).toEqual({ phase: 'downloading', version: '0.2.0', progress: 42 })
    h.source.download.resolve()
    await flush()
    expect(h.controller.state()).toEqual({ phase: 'ready', version: '0.2.0', progress: 100 })
    // Every step reached the renderer, in order
    expect(h.states.map((s) => s.phase)).toEqual(['checking', 'downloading', 'downloading', 'ready'])
  })

  it('a check that finds nothing newer returns to idle and reports up to date', async () => {
    const h = harness()
    const outcome = h.controller.check()
    h.source.upToDate()
    expect(await outcome).toEqual({ kind: 'upToDate' })
    expect(h.controller.state()).toEqual({ phase: 'idle', version: null, progress: 0 })
  })

  it('a failed check returns to idle, reports the failure to whoever asked, and shows nothing (REQ-002/AC-01)', async () => {
    const h = harness()
    const outcome = h.controller.check()
    h.source.fail()
    expect(await outcome).toEqual({ kind: 'failed' })
    expect(h.controller.state()).toEqual({ phase: 'idle', version: null, progress: 0 })
    expect(h.notices).toEqual([])
  })

  it('a failed background download shows nothing, the button goes, and the next check downloads again (REQ-002/AC-02)', async () => {
    const h = harness()
    h.controller.start()
    h.source.found('0.2.0')
    await flush()
    h.source.progress?.(30)
    h.source.download.reject(new Error('ENOSPC'))
    await flush()
    expect(h.controller.state()).toEqual({ phase: 'idle', version: null, progress: 0 })
    expect(h.notices).toEqual([])
    const again = h.controller.check()
    h.source.found('0.2.0')
    expect(await again).toEqual({ kind: 'found', version: '0.2.0' })
    expect(h.source.requests).toBe(2)
    expect(h.controller.state().phase).toBe('downloading')
  })

  it('a found version that is not a valid release version counts as a failed check, and its download is dropped (Failure A6)', async () => {
    for (const bad of ['v0.2.0', '0.2', '0.2.0+build.7', '<b>0.2.0</b>', '9'.repeat(70) + '.0.0']) {
      const h = harness()
      const outcome = h.controller.check()
      h.source.found(bad)
      expect(await outcome, bad).toEqual({ kind: 'failed' })
      expect(h.source.cancelled, bad).toBe(1)
      // The malformed string never reached the renderer
      expect(h.states.map((s) => s.phase), bad).toEqual(['checking', 'idle'])
    }
  })

  it('while an update is downloading, ready or installing, a check makes no request and a manual one gets that state (REQ-006/AC-03, US-003/AC-04)', async () => {
    const h = harness()
    h.controller.start()
    h.source.found('0.2.0')
    await flush()
    h.source.progress?.(10)
    const downloading = { phase: 'downloading', version: '0.2.0', progress: 10 }
    expect(await h.controller.check()).toEqual({ kind: 'inFlight', state: downloading })
    expect(await h.controller.check()).toEqual({ kind: 'inFlight', state: downloading })
    h.source.download.resolve()
    await flush()
    const ready = { phase: 'ready', version: '0.2.0', progress: 100 }
    expect(await h.controller.check()).toEqual({ kind: 'inFlight', state: ready })
    h.controller.install()
    const installing = { phase: 'installing', version: '0.2.0', progress: 100 }
    expect(await h.controller.check()).toEqual({ kind: 'inFlight', state: installing })
    // Only the launch check reached the feed, and the state was never knocked back to checking
    expect(h.source.requests).toBe(1)
    expect(h.controller.state()).toEqual(installing)
  })

  async function ready(h: ReturnType<typeof harness>): Promise<void> {
    h.controller.start()
    h.source.found('0.2.0')
    await flush()
    h.source.download.resolve()
    await flush()
  }

  it('installing is one action: further clicks before the restart start no second install (Failure C10)', async () => {
    const h = harness()
    await ready(h)
    h.controller.install()
    h.controller.install()
    h.controller.install()
    expect(h.source.installs).toBe(1)
    expect(h.controller.state()).toEqual({ phase: 'installing', version: '0.2.0', progress: 100 })
  })

  it('a click while no update is ready installs nothing (only the ready button can be clicked, REQ-001/AC-03)', async () => {
    const h = harness()
    h.controller.install()
    h.controller.start()
    h.controller.install()
    h.source.found('0.2.0')
    await flush()
    h.controller.install()
    expect(h.source.installs).toBe(0)
    expect(h.controller.state().phase).toBe('downloading')
  })

  it('a failed install sends the install-failed notice, the button goes, and the next check downloads again (REQ-002/AC-03)', async () => {
    const h = harness()
    await ready(h)
    h.controller.install()
    h.source.installing.reject(new Error('Squirrel: could not replace the app'))
    await flush()
    expect(h.notices).toEqual([{ code: 'installFailed' }])
    expect(h.controller.state()).toEqual({ phase: 'idle', version: null, progress: 0 })
    const again = h.controller.check()
    h.source.found('0.2.0')
    expect(await again).toEqual({ kind: 'found', version: '0.2.0' })
  })

  it('a check asked for while another is in flight joins it: one request, the same outcome for both (US-003/AC-05)', async () => {
    for (const answer of ['upToDate', 'fail', 'found'] as const) {
      const h = harness()
      const first = h.controller.check()
      const second = h.controller.check()
      const third = h.controller.check()
      if (answer === 'found') h.source.found('0.2.0')
      else if (answer === 'fail') h.source.fail()
      else h.source.upToDate()
      const outcomes = await Promise.all([first, second, third])
      expect(h.source.requests, answer).toBe(1)
      expect(outcomes[1], answer).toEqual(outcomes[0])
      expect(outcomes[2], answer).toEqual(outcomes[0])
    }
  })

  const MINUTE = 60_000

  it('while the app stays open there is one automatic check every 24 hours after the launch check (US-001/AC-02, REQ-006/AC-01)', async () => {
    const h = harness()
    h.controller.start()
    h.source.upToDate()
    await flush()
    h.clock.advance(CHECK_PERIOD_MS - MINUTE)
    expect(h.source.requests).toBe(1)
    h.clock.advance(MINUTE)
    expect(h.source.requests).toBe(2)
    h.source.fail()
    await flush()
    // A failed automatic check is retried by the next tick, not sooner (REQ-002/AC-01)
    h.clock.advance(CHECK_PERIOD_MS - MINUTE)
    expect(h.source.requests).toBe(2)
    h.clock.advance(MINUTE)
    expect(h.source.requests).toBe(3)
  })

  it('with automatic checks off nothing checks on its own, a manual check still does, and turning them on starts no check (US-002/AC-01, AC-04)', async () => {
    const h = harness({ autoChecks: false })
    h.controller.start()
    h.clock.advance(CHECK_PERIOD_MS)
    expect(h.source.requests).toBe(0)
    const manual = h.controller.check()
    h.source.upToDate()
    expect(await manual).toEqual({ kind: 'upToDate' })
    expect(h.source.requests).toBe(1)
    // On again: the next tick looks, not the switch itself
    h.switchState.on = true
    h.clock.advance(CHECK_PERIOD_MS - MINUTE)
    expect(h.source.requests).toBe(1)
    h.clock.advance(MINUTE)
    expect(h.source.requests).toBe(2)
  })

  it('turning automatic checks off neither cancels a download under way nor discards an update ready (US-002/AC-03)', async () => {
    const h = harness()
    h.controller.start()
    h.source.found('0.2.0')
    await flush()
    h.switchState.on = false
    h.source.download.resolve()
    await flush()
    expect(h.controller.state()).toEqual({ phase: 'ready', version: '0.2.0', progress: 100 })
    h.clock.advance(CHECK_PERIOD_MS)
    h.controller.install()
    expect(h.source.installs).toBe(1)
  })

  it('a Mac that sleeps through several ticks makes one check on waking, never a burst (REQ-006/AC-02)', async () => {
    const h = harness()
    h.controller.start()
    h.source.upToDate()
    await flush()
    h.clock.sleep(3 * CHECK_PERIOD_MS + 5 * MINUTE)
    h.controller.wake()
    expect(h.source.requests).toBe(2)
    h.source.upToDate()
    await flush()
    // The timers that fell due during the sleep fire late, and must not add checks of their own
    h.clock.advance(0)
    h.controller.wake()
    expect(h.source.requests).toBe(2)
    // The schedule runs on from the waking check
    h.clock.advance(CHECK_PERIOD_MS - MINUTE)
    expect(h.source.requests).toBe(2)
    h.clock.advance(MINUTE)
    expect(h.source.requests).toBe(3)
  })

  it('without a wake event, the overdue timer alone makes the one check (REQ-006/AC-02)', async () => {
    const h = harness()
    h.controller.start()
    h.source.upToDate()
    await flush()
    h.clock.sleep(2 * CHECK_PERIOD_MS)
    h.clock.advance(0)
    expect(h.source.requests).toBe(2)
  })

  it('download progress reaches the renderer as a whole percentage within 0–100, whatever the feed reports', async () => {
    const h = harness()
    h.controller.start()
    h.source.found('0.2.0')
    await flush()
    const seen: number[] = []
    for (const p of [-3, 0.4, 57.5, 100.2, Number.NaN, 250]) {
      h.source.progress?.(p)
      seen.push(h.controller.state().progress)
    }
    expect(seen).toEqual([0, 0, 58, 100, 100, 100])
    // Progress from a download that is no longer the one in hand changes nothing
    h.source.download.resolve()
    await flush()
    h.source.progress?.(12)
    expect(h.controller.state()).toEqual({ phase: 'ready', version: '0.2.0', progress: 100 })
  })

  it('a development run never checks, from any trigger, and has nothing to install (US-005/AC-01)', async () => {
    const h = harness({ packaged: false })
    h.controller.start()
    h.clock.advance(2 * CHECK_PERIOD_MS)
    h.controller.wake()
    expect(await h.controller.check()).toEqual({ kind: 'unavailable' })
    h.controller.install()
    expect(h.source.requests).toBe(0)
    expect(h.source.installs).toBe(0)
    expect(h.states).toEqual([])
  })
})
