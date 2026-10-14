// The app update contract (docs/specs/app-update.md): the lifecycle the main process pushes to the renderer,
// and the outcome of an update check.
//
// Only states, versions, progress and codes cross IPC (app-update::CON-003, ADR-0016): every word the user
// reads comes from the renderer's dictionaries. A version string from the release feed is external content,
// so it reaches the renderer only after `isReleaseVersion` has accepted it (app-update Failures A6, H1).

/** The lifecycle Codex renders, and the only states there are: a failure returns to idle (ADR-0032, amended) */
export const UPDATE_PHASES = ['idle', 'checking', 'downloading', 'ready', 'installing'] as const
export type UpdatePhase = (typeof UPDATE_PHASES)[number]

export interface UpdateState {
  phase: UpdatePhase
  /** The version being downloaded, ready or installing; null while idle or checking */
  version: string | null
  /** Download progress, a whole number from 0 to 100; 0 outside a download, 100 once ready */
  progress: number
}

export const IDLE_UPDATE: UpdateState = { phase: 'idle', version: null, progress: 0 }

/**
 * An update in flight: downloading, ready or installing. Only these phases carry a version, show the rail's
 * update button (app-update::REQ-001/AC-01), and answer a check without a request (REQ-006/AC-03).
 */
export function isUpdateInFlight(phase: UpdatePhase): boolean {
  return phase === 'downloading' || phase === 'ready' || phase === 'installing'
}

/**
 * What settings' result line reports when no update is in flight (app-update::REQ-004/AC-02): its own
 * check while it runs, then that check's outcome. The first run after the version went up starts with
 * "up to date" (REQ-004/AC-04). An update found by any check clears the outcome. Kept by the main process
 * for the run, so leaving settings and coming back keeps it (REQ-004/AC-03).
 */
export interface SettingsCheck {
  /** A check asked from settings is running (app-update::US-003/AC-02) */
  checking: boolean
  outcome: 'upToDate' | 'failed' | null
}

/** A one-off event the renderer answers with a toast */
export type UpdateNotice =
  /** A failed install after the user clicked to install (app-update::REQ-002/AC-03) */
  | { code: 'installFailed' }
  /** The outcome of a check from the application menu, which only a toast reports (app-update::US-003/AC-01, AC-04) */
  | { code: 'menuCheck'; outcome: CheckOutcome }

/** What an update check found, for the surface that asked */
export type CheckOutcome =
  | { kind: 'upToDate' }
  | { kind: 'failed' }
  | { kind: 'found'; version: string }
  /** An update is already downloading, ready or installing: no request was made (app-update::US-003/AC-04) */
  | { kind: 'inFlight'; state: UpdateState }
  /** A development run never checks (app-update::US-005) */
  | { kind: 'unavailable' }

/**
 * A release version as the release line tags it: `major.minor.patch` with an optional pre-release part
 * (`0.1.0-beta`, `0.1.0-beta.2`). Anything else from the feed — build metadata, a leading `v`, an
 * overlong string — counts as a malformed answer.
 */
export function isReleaseVersion(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length <= 64 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(v)
  )
}

/** The IPC entry check for a pushed or fetched state; null when it does not meet the contract */
export function parseUpdateState(raw: unknown): UpdateState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const phase = r['phase']
  const version = r['version']
  const progress = r['progress']
  if (!(UPDATE_PHASES as readonly unknown[]).includes(phase)) return null
  if (version !== null && !isReleaseVersion(version)) return null
  if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100) return null
  const p = phase as UpdatePhase
  // A version belongs to exactly the phases with an update in flight
  if (isUpdateInFlight(p) !== (version !== null)) return null
  return { phase: p, version, progress }
}

export function parseUpdateNotice(raw: unknown): UpdateNotice | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r['code'] === 'installFailed') return { code: 'installFailed' }
  if (r['code'] !== 'menuCheck') return null
  const outcome = parseCheckOutcome(r['outcome'])
  return outcome ? { code: 'menuCheck', outcome } : null
}

/** The IPC entry check for settings' check record; null when it does not meet the contract */
export function parseSettingsCheck(raw: unknown): SettingsCheck | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const checking = r['checking']
  const outcome = r['outcome']
  if (typeof checking !== 'boolean') return null
  if (outcome !== null && outcome !== 'upToDate' && outcome !== 'failed') return null
  return { checking, outcome }
}

/** The IPC entry check for a manual check's outcome: a version shown to the user only once validated (A6, H1) */
export function parseCheckOutcome(raw: unknown): CheckOutcome | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  switch (r['kind']) {
    case 'upToDate':
    case 'failed':
    case 'unavailable':
      return { kind: r['kind'] }
    case 'found':
      return isReleaseVersion(r['version']) ? { kind: 'found', version: r['version'] } : null
    case 'inFlight': {
      const state = parseUpdateState(r['state'])
      return state && isUpdateInFlight(state.phase) ? { kind: 'inFlight', state } : null
    }
    default:
      return null
  }
}
