// The update controller (docs/specs/app-update.md, Implementation Decisions): the one owner of the app
// update lifecycle, and the only thing that talks to the update source.
import { IDLE_UPDATE, isReleaseVersion, isUpdateInFlight, type CheckOutcome, type UpdateNotice, type UpdateState } from '@shared/update'

/** An app update the source found; its download has already started (automatic download, ADR-0032) */
export interface FoundUpdate {
  version: string
  /** Settles when the download completes or fails */
  downloaded: Promise<void>
  /** Drops the download, so nothing of it is installed */
  cancel(): void
}

/** Where updates come from: electron-updater over GitHub Releases in production, a script under e2e */
export interface UpdateSource {
  /** Ask the feed. Resolves with the newer update found, or null when up to date; rejects on failure */
  check(onProgress: (percent: number) => void): Promise<FoundUpdate | null>
  /** Install the ready update and restart. Never settles when it works (the app quits); rejects when not */
  install(): Promise<void>
}

export interface UpdateControllerDeps {
  /** null in a development run, which never checks (app-update::US-005) */
  source: UpdateSource | null
  /** The automatic-checks switch, read as it stands at each automatic check (app-update::REQ-006/AC-01) */
  autoChecksOn: () => boolean
  now: () => number
  /** Arms a one-shot timer and returns its cancel */
  setTimer: (fn: () => void, ms: number) => () => void
  publish: (state: UpdateState) => void
  notify: (notice: UpdateNotice) => void
}

/** One automatic check per this period while the app runs (app-update::REQ-006) */
export const CHECK_PERIOD_MS = 24 * 60 * 60 * 1000

export class UpdateController {
  private current: UpdateState = IDLE_UPDATE
  /** The check in flight, which any further check joins (app-update::US-003/AC-05) */
  private pending: Promise<CheckOutcome> | null = null
  /** When the next automatic check falls due, in wall-clock time */
  private nextDue = 0
  private cancelTimer: (() => void) | null = null

  constructor(private readonly deps: UpdateControllerDeps) {}

  state(): UpdateState {
    return this.current
  }

  /** The launch check, and the 24-hour schedule after it */
  start(): void {
    this.tick()
  }

  /**
   * The Mac woke from sleep: one check now if one fell due while it slept, and the schedule runs on from it
   * (app-update::REQ-006/AC-02). This does not rely on when the timer itself catches up after a sleep: if
   * it fires late, the check made here has already re-armed it, so it adds no second check.
   */
  wake(): void {
    if (this.cancelTimer && this.deps.now() >= this.nextDue) this.tick()
  }

  /** One update check. The automatic ones are this controller's own (see tick); any other is the user's */
  check(): Promise<CheckOutcome> {
    const source = this.deps.source
    if (!source) return Promise.resolve({ kind: 'unavailable' })
    // An update on its way or waiting is installed first: no request, no second download (REQ-006/AC-03)
    if (isUpdateInFlight(this.current.phase)) {
      return Promise.resolve({ kind: 'inFlight', state: this.current })
    }
    if (this.pending) return this.pending
    this.set({ phase: 'checking', version: null, progress: 0 })
    const pending = source.check((percent) => this.onProgress(percent)).then((found): CheckOutcome => {
      if (!found) {
        this.set(IDLE_UPDATE)
        return { kind: 'upToDate' }
      }
      // The feed is external content: a version the release line would never tag is a malformed answer,
      // and it must neither reach the renderer nor be installed (Failures A6, H1)
      if (!isReleaseVersion(found.version)) {
        // The dropped download's rejection is expected; left unobserved it would be an unhandled rejection
        found.downloaded.catch(() => {})
        found.cancel()
        this.set(IDLE_UPDATE)
        return { kind: 'failed' }
      }
      this.set({ phase: 'downloading', version: found.version, progress: 0 })
      void found.downloaded.then(
        () => this.set({ phase: 'ready', version: found.version, progress: 100 }),
        // Codex's lifecycle has no failure state: the button goes and the next check downloads again
        () => this.set(IDLE_UPDATE)
      )
      return { kind: 'found', version: found.version }
    }, (): CheckOutcome => {
      // Silent here: an automatic check's failure shows nothing (REQ-002/AC-01); a manual one is reported
      // by the surface that asked, from this outcome
      this.set(IDLE_UPDATE)
      return { kind: 'failed' }
    }).finally(() => {
      this.pending = null
    })
    this.pending = pending
    return pending
  }

  /** The user clicked to install the ready update */
  install(): void {
    const source = this.deps.source
    if (!source || this.current.phase !== 'ready') return
    this.set({ ...this.current, phase: 'installing' })
    // Success never comes back: the app quits into the new version. A failure answers the click the user
    // made, and the button goes as after a failed download (REQ-002/AC-03)
    source.install().catch(() => {
      this.set(IDLE_UPDATE)
      this.deps.notify({ code: 'installFailed' })
    })
  }

  /** One automatic check, honouring the switch as it stands now, and the next one armed a period later */
  private tick(): void {
    this.cancelTimer?.()
    if (this.deps.autoChecksOn()) void this.check()
    this.nextDue = this.deps.now() + CHECK_PERIOD_MS
    this.cancelTimer = this.deps.setTimer(() => this.tick(), CHECK_PERIOD_MS)
  }

  private onProgress(percent: number): void {
    // The contract carries a whole percentage from 0 to 100; anything else from the feed is not progress
    if (this.current.phase !== 'downloading' || !Number.isFinite(percent)) return
    const progress = Math.min(100, Math.max(0, Math.round(percent)))
    if (progress !== this.current.progress) this.set({ ...this.current, progress })
  }

  private set(next: UpdateState): void {
    this.current = next
    this.deps.publish(next)
  }
}
