// Settings' own update checks (app-update::US-003/AC-02) and the outcome its result line shows when no
// update is in flight (REQ-004/AC-02). Kept here in the main process for the run, apart from the update
// controller, which owns the lifecycle: settings asks through this, and the controller answers.
import type { CheckOutcome, SettingsCheck, UpdateState } from '@shared/update'

export interface SettingsChecksDeps {
  /** The update controller's check, which a settings check joins when one is in flight */
  check: () => Promise<CheckOutcome>
  publish: (state: SettingsCheck) => void
  /** This run is the first after the app's version went up (app-update::REQ-004/AC-04) */
  firstRunAfterUpdate: boolean
}

export class SettingsChecks {
  private current: SettingsCheck

  constructor(private readonly deps: SettingsChecksDeps) {
    // The post-update line is the run's first outcome: it describes where the user stands until a settings
    // check says otherwise (app-update::REQ-004/AC-04)
    this.current = { checking: false, outcome: deps.firstRunAfterUpdate ? 'upToDate' : null }
  }

  state(): SettingsCheck {
    return this.current
  }

  /** "Check now" in settings */
  async check(): Promise<CheckOutcome> {
    this.set({ ...this.current, checking: true })
    try {
      const outcome = await this.deps.check()
      this.set({ checking: false, outcome: lineOutcome(outcome) })
      return outcome
    } finally {
      // The controller's check answers every failure with an outcome; should it ever reject instead, the
      // button must not stay unavailable for the rest of the run
      if (this.current.checking) this.set({ ...this.current, checking: false })
    }
  }

  /**
   * The lifecycle moved. An update found by any check, from any surface, makes an earlier "up to date" or
   * failure untrue, so it goes, and a download that then fails leaves the line empty (app-update::REQ-004/AC-02)
   */
  onUpdateState(state: UpdateState): void {
    if (state.phase === 'downloading' && this.current.outcome !== null) this.set({ ...this.current, outcome: null })
  }

  private set(next: SettingsCheck): void {
    this.current = next
    this.deps.publish(next)
  }
}

/** What a settings check leaves in the line: only "up to date" and "failed" are outcomes to show; an update
 *  found or already in flight shows through the lifecycle instead (app-update::REQ-004/AC-01) */
function lineOutcome(outcome: CheckOutcome): SettingsCheck['outcome'] {
  if (outcome.kind === 'upToDate') return 'upToDate'
  if (outcome.kind === 'failed') return 'failed'
  return null
}
