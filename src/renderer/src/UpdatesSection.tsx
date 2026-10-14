// The settings "Updates" section (app-update::REQ-003, REQ-004), the form confirmed in the settings prototype
// (2026-10-13): one card with the automatic-checks switch and the version row — the running version, the
// result line and one button, "Check now" or, while an update is ready or installing, "Install now" — and the
// footnote below it. In a development run the controls are unavailable and the footnote says why
// (app-update::US-005/AC-02).
//
// What the line and the button show is decided by version-row.ts; settings' own check and its outcome are
// kept by the main process for the run, so leaving the page and coming back keeps them (REQ-004/AC-03).
import { useEffect, useState, type JSX } from 'react'
import type { SettingsCheck } from '@shared/update'
import { dictOf } from '@shared/i18n'
import { useLanguage } from './language'
import { useUpdateState } from './useUpdateState'
import { versionButton, versionLine } from './version-row'

const NO_CHECK: SettingsCheck = { checking: false, outcome: null }

export function UpdatesSection({
  autoCheck,
  onAutoCheck
}: {
  autoCheck: boolean
  onAutoCheck: (on: boolean) => void
}): JSX.Element {
  const lang = useLanguage()
  const t = dictOf(lang).settings
  const tu = dictOf(lang).update
  const available = window.agentshed.updatesAvailable
  const update = useUpdateState()
  const [check, setCheck] = useState<SettingsCheck>(NO_CHECK)

  useEffect(() => {
    let alive = true
    let pushed = false
    const off = window.agentshed.onSettingsCheck((c) => {
      pushed = true
      setCheck(c)
    })
    // As for the lifecycle (useUpdateState): the read on mount answers only if no push has overtaken it
    void window.agentshed.getSettingsCheck().then((c) => {
      if (alive && !pushed) setCheck(c)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const line = versionLine(update, check, available)
  const button = versionButton(update, check, available)
  const lineText = !line
    ? ''
    : line.kind === 'downloading'
      ? t.versionDownloading(line.version)
      : line.kind === 'ready'
        ? t.versionReady(line.version)
        : line.kind === 'installing'
          ? tu.tipInstalling
          : line.kind === 'checking'
            ? t.checking
            : line.kind === 'upToDate'
              ? t.upToDate
              : t.checkFailed
  // The ok form for "up to date" and "ready to install", the error form for a failed check
  const tone = line?.kind === 'upToDate' || line?.kind === 'ready' ? 'ok' : line?.kind === 'failed' ? 'err' : ''

  const act = (): void => {
    if (!button.enabled) return
    if (button.action === 'install') void window.agentshed.installUpdate()
    else void window.agentshed.checkForUpdates()
  }

  return (
    <>
      <div className="settings-sec-t settings-sec-gap">{t.sectionUpdates}</div>
      <div className="field" data-testid="updates-field">
        <div className="frow">
          <span className="flabel">{t.autoCheckUpdates}</span>
          <span className="seg seg-field" role="radiogroup" aria-label={t.autoCheckUpdates} data-testid="auto-check-seg">
            {[true, false].map((on) => (
              <button
                type="button"
                key={String(on)}
                role="radio"
                aria-checked={autoCheck === on}
                aria-disabled={!available}
                data-auto-option={on ? 'on' : 'off'}
                className={autoCheck === on ? 'on' : ''}
                onClick={() => {
                  if (available && autoCheck !== on) onAutoCheck(on)
                }}
              >
                {on ? t.switchOn : t.switchOff}
              </button>
            ))}
          </span>
        </div>
        <div className="frow">
          <span className="flabel">
            {t.currentVersion}{' '}
            <span className="ver" data-testid="app-version">
              {window.agentshed.appVersion}
            </span>
          </span>
          <span className="ver-ctl">
            <span className={`chk-out ${tone}`} role="status" data-testid="update-line">
              {lineText}
            </span>
            <button
              type="button"
              className="cfg-btn"
              aria-disabled={!button.enabled}
              data-testid="version-action"
              onClick={act}
            >
              {button.action === 'install' ? t.installNow : t.checkNow}
            </button>
          </span>
        </div>
      </div>
      <p className="settings-foot" data-testid="updates-foot">
        {available ? t.updatesFoot : t.updatesDevFoot}
      </p>
    </>
  )
}
