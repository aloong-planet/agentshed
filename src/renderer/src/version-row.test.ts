// The settings version row (app-update::REQ-003/AC-04, REQ-004, US-003/AC-02, US-005/AC-02): what its result
// line shows and what its one button offers, from the update lifecycle, settings' own check and whether this
// run checks for updates at all.
import { describe, expect, it } from 'vitest'
import { versionButton, versionLine } from './version-row'
import type { SettingsCheck, UpdateState } from '@shared/update'

const IDLE: UpdateState = { phase: 'idle', version: null, progress: 0 }
const CHECKING: UpdateState = { phase: 'checking', version: null, progress: 0 }
const DOWNLOADING: UpdateState = { phase: 'downloading', version: '0.2.0', progress: 40 }
const READY: UpdateState = { phase: 'ready', version: '0.2.0', progress: 100 }
const INSTALLING: UpdateState = { phase: 'installing', version: '0.2.0', progress: 100 }
const NONE: SettingsCheck = { checking: false, outcome: null }
const ASKING: SettingsCheck = { checking: true, outcome: null }
const UP_TO_DATE: SettingsCheck = { checking: false, outcome: 'upToDate' }
const FAILED: SettingsCheck = { checking: false, outcome: 'failed' }

describe('versionLine', () => {
  it('an update in flight shows, whichever check found it and whatever settings found before (REQ-004/AC-01)', () => {
    for (const check of [NONE, ASKING, UP_TO_DATE, FAILED]) {
      expect(versionLine(DOWNLOADING, check, true)).toEqual({ kind: 'downloading', version: '0.2.0' })
      expect(versionLine(READY, check, true)).toEqual({ kind: 'ready', version: '0.2.0' })
      expect(versionLine(INSTALLING, check, true)).toEqual({ kind: 'installing' })
    }
  })

  it('with no update in flight: settings\' own check, then its outcome, else nothing (REQ-004/AC-02, D2)', () => {
    for (const update of [IDLE, CHECKING]) {
      expect(versionLine(update, ASKING, true)).toEqual({ kind: 'checking' })
      expect(versionLine(update, UP_TO_DATE, true)).toEqual({ kind: 'upToDate' })
      expect(versionLine(update, FAILED, true)).toEqual({ kind: 'failed' })
      expect(versionLine(update, NONE, true)).toBeNull()
    }
  })

  it('a development run shows no line, not even the post-update one (US-005/AC-02)', () => {
    expect(versionLine(IDLE, UP_TO_DATE, false)).toBeNull()
  })
})

describe('versionButton', () => {
  it('"Install now" while an update is ready, unavailable while it installs (REQ-003/AC-04, C10)', () => {
    expect(versionButton(READY, NONE, true)).toEqual({ action: 'install', enabled: true })
    expect(versionButton(INSTALLING, NONE, true)).toEqual({ action: 'install', enabled: false })
  })

  it('"Check now", unavailable while its own check runs and while an update downloads (US-003/AC-02)', () => {
    expect(versionButton(IDLE, NONE, true)).toEqual({ action: 'check', enabled: true })
    expect(versionButton(IDLE, UP_TO_DATE, true)).toEqual({ action: 'check', enabled: true })
    expect(versionButton(IDLE, ASKING, true)).toEqual({ action: 'check', enabled: false })
    expect(versionButton(DOWNLOADING, NONE, true)).toEqual({ action: 'check', enabled: false })
    // An automatic check in flight: asking joins it (US-003/AC-05)
    expect(versionButton(CHECKING, NONE, true)).toEqual({ action: 'check', enabled: true })
  })

  it('a development run cannot check (US-005/AC-02)', () => {
    expect(versionButton(IDLE, NONE, false)).toEqual({ action: 'check', enabled: false })
  })
})
