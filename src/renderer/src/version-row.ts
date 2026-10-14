// The settings version row (app-update::REQ-003, REQ-004): what its result line shows and what its one button
// offers. Pure, so the rules are tested apart from the page; the page maps them to its copy.
import { isUpdateInFlight, type SettingsCheck, type UpdateState } from '@shared/update'

export type VersionLine =
  | { kind: 'downloading' | 'ready'; version: string }
  | { kind: 'installing' | 'checking' | 'upToDate' | 'failed' }
  | null

/**
 * An update in flight shows whichever check found it (REQ-004/AC-01); with none, settings' own check while it
 * runs and then its outcome, or the post-update line (REQ-004/AC-02, AC-04). A development run shows nothing.
 */
export function versionLine(update: UpdateState, check: SettingsCheck, available: boolean): VersionLine {
  if (!available) return null
  if (update.phase === 'installing') return { kind: 'installing' }
  if (update.version !== null && (update.phase === 'downloading' || update.phase === 'ready')) {
    return { kind: update.phase, version: update.version }
  }
  if (check.checking) return { kind: 'checking' }
  return check.outcome ? { kind: check.outcome } : null
}

/**
 * "Install now" while an update is ready or installing, and unavailable while it installs (REQ-003/AC-04).
 * Otherwise "Check now", unavailable in a development run, while settings' own check runs and while an update
 * downloads, when a click could change nothing (US-003/AC-02).
 */
export function versionButton(update: UpdateState, check: SettingsCheck, available: boolean): { action: 'check' | 'install'; enabled: boolean } {
  if (update.phase === 'ready' || update.phase === 'installing') return { action: 'install', enabled: update.phase === 'ready' }
  return { action: 'check', enabled: available && !check.checking && !isUpdateInFlight(update.phase) }
}
