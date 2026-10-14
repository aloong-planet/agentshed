// The toasts the app answers update notices with (app-update::US-003/AC-01, AC-04, REQ-002/AC-03): which
// notice gets which toast, in which form, in the language of the moment.
import { describe, expect, it } from 'vitest'
import { dictOf } from '@shared/i18n'
import { noticeToast } from './update-toasts'

const en = dictOf('en')
const menu = (outcome: Parameters<typeof noticeToast>[0] & { code: 'menuCheck' }) => outcome

describe('noticeToast', () => {
  it('a menu check reports up to date with the running version, a failure, or the update found (US-003/AC-01, A6)', () => {
    expect(noticeToast(menu({ code: 'menuCheck', outcome: { kind: 'upToDate' } }), en, '0.1.0')).toEqual({ kind: 'ok', text: 'Agentshed is up to date (0.1.0)' })
    expect(noticeToast(menu({ code: 'menuCheck', outcome: { kind: 'failed' } }), en, '0.1.0')).toEqual({ kind: 'err', text: 'Couldn’t check for updates' })
    expect(noticeToast(menu({ code: 'menuCheck', outcome: { kind: 'found', version: '0.2.0' } }), en, '0.1.0')).toEqual({ kind: 'ok', text: 'Version 0.2.0 found — downloading in the background' })
  })

  it('a menu check while an update is in flight reports that state instead (US-003/AC-04)', () => {
    const inFlight = (phase: 'downloading' | 'ready' | 'installing') =>
      noticeToast({ code: 'menuCheck', outcome: { kind: 'inFlight', state: { phase, version: '0.2.0', progress: 50 } } }, en, '0.1.0')
    expect(inFlight('downloading')).toEqual({ kind: 'ok', text: 'Version 0.2.0 found — downloading in the background' })
    expect(inFlight('ready')).toEqual({ kind: 'ok', text: 'Version 0.2.0 is ready to install' })
    expect(inFlight('installing')).toEqual({ kind: 'ok', text: 'Installing update…' })
  })

  it('a menu check in a development run reports nothing: the item is disabled there (US-005/AC-02)', () => {
    expect(noticeToast({ code: 'menuCheck', outcome: { kind: 'unavailable' } }, en, '0.1.0')).toBeNull()
  })

  it('a failed install after the click is an error (REQ-002/AC-03)', () => {
    expect(noticeToast({ code: 'installFailed' }, en, '0.1.0')).toEqual({ kind: 'err', text: 'Couldn’t install the update' })
  })

  it('the copy is the language passed in', () => {
    expect(noticeToast({ code: 'menuCheck', outcome: { kind: 'failed' } }, dictOf('fr'), '0.1.0')).toEqual({ kind: 'err', text: 'Impossible de vérifier les mises à jour' })
  })
})
