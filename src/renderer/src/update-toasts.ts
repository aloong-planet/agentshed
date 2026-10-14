// The toasts the app answers update notices with: a failed install after the click (app-update::REQ-002/AC-03),
// and the outcome of a check from the application menu, which has no other place to report
// (app-update::US-003/AC-01, AC-04). Pure, so which notice gets which toast is tested apart from the window.
// The copy is the settings line's and the update button's where the words are the same.
import type { Locale } from '@shared/i18n'
import type { UpdateNotice } from '@shared/update'

export function noticeToast(notice: UpdateNotice, t: Locale, appVersion: string): { kind: 'ok' | 'err'; text: string } | null {
  if (notice.code === 'installFailed') return { kind: 'err', text: t.update.installFailed }
  const outcome = notice.outcome
  switch (outcome.kind) {
    case 'upToDate':
      return { kind: 'ok', text: t.update.toastUpToDate(appVersion) }
    case 'failed':
      return { kind: 'err', text: t.settings.checkFailed }
    case 'found':
      return { kind: 'ok', text: t.update.toastFound(outcome.version) }
    case 'inFlight': {
      // No request was made: the toast reports the update already on its way or waiting
      const { phase, version } = outcome.state
      if (phase === 'installing' || version === null) return { kind: 'ok', text: t.update.tipInstalling }
      return { kind: 'ok', text: phase === 'ready' ? t.settings.versionReady(version) : t.update.toastFound(version) }
    }
    case 'unavailable':
      return null
  }
}
