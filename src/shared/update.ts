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

/** A one-off event the renderer answers with a toast: a failed install after the user clicked to install */
export interface UpdateNotice {
  code: 'installFailed'
}

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
  // A version belongs to exactly the phases that have an update in hand
  const hasUpdate = p === 'downloading' || p === 'ready' || p === 'installing'
  if (hasUpdate !== (version !== null)) return null
  return { phase: p, version, progress }
}

export function parseUpdateNotice(raw: unknown): UpdateNotice | null {
  if (typeof raw !== 'object' || raw === null) return null
  return (raw as Record<string, unknown>)['code'] === 'installFailed' ? { code: 'installFailed' } : null
}
