// The app update button in the rail's bottom group (app-update::REQ-001), the form confirmed in the settings
// prototype (2026-10-13): Codex's rail button, present only while an app update is downloading, installing
// or ready. Only the ready button can be clicked; it installs the update and restarts. Being always mounted, it
// also answers the update notices with toasts (update-toasts.ts): a failed install after the click
// (app-update::REQ-002/AC-03) and the outcome of a check from the application menu (US-003/AC-01, AC-04).
//
// The tooltip is a floating layer and owes a floating layer's two obligations: the shared surface's viewport
// positioning escapes clipping, and the shared hook dismisses it when a scroll or a resize makes its
// measured position stale. It is instant, because the native title waits about a second.
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { isUpdateInFlight } from '@shared/update'
import { dictOf } from '@shared/i18n'
import { FloatingBox, TIP_LOOK, type FloatingAt } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'
import { Download, LoaderCircle } from './icons'
import { useLanguage } from './language'
import { useUpdateState } from './useUpdateState'
import { toast } from './Toast'
import { noticeToast } from './update-toasts'

/** The download's progress, drawn as a ring inside the filled circle (Codex draws one there too) */
function Ring({ percent }: { percent: number }): JSX.Element {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg className="upd-ring" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle className="track" cx="9" cy="9" r={r} fill="none" strokeWidth="2.4" />
      <circle
        className="arc"
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(2)}
        strokeDashoffset={(c * (1 - percent / 100)).toFixed(2)}
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

export function UpdateSlot(): JSX.Element | null {
  const lang = useLanguage()
  const t = dictOf(lang).update
  const [tipAt, setTipAt] = useState<FloatingAt | null>(null)
  const state = useUpdateState((s) => {
    // The slot goes when the update does, and an open message goes with it
    if (!isUpdateInFlight(s.phase)) setTipAt(null)
  })
  const anchor = useRef<HTMLElement | null>(null)
  const layer = useRef<HTMLDivElement | null>(null)
  // A notice arrives on an event subscribed once at mount; it must answer in the language of the moment
  const langRef = useRef(lang)
  useLayoutEffect(() => {
    langRef.current = lang
  })

  useEffect(
    () =>
      window.agentshed.onUpdateNotice((notice) => {
        const shown = noticeToast(notice, dictOf(langRef.current), window.agentshed.appVersion)
        if (shown) toast(shown.kind, shown.text)
      }),
    []
  )

  const phase = state.phase
  const shown = isUpdateInFlight(phase)
  const label = phase === 'ready' ? t.tipReady : phase === 'downloading' ? t.tipDownloading(state.progress) : t.tipInstalling

  const place = (): void => {
    const r = anchor.current?.getBoundingClientRect()
    if (r) setTipAt({ left: r.right + 8, top: r.top + r.height / 2 })
  }
  const hide = (): void => setTipAt(null)
  useAnchorInvalidation(tipAt !== null, layer, { onResize: 'dismiss', dismiss: hide })

  if (!shown) return null
  const hover = { onMouseEnter: place, onMouseLeave: hide, onFocus: place, onBlur: hide }
  const tip = tipAt && (
    <FloatingBox
      ref={layer}
      at={tipAt}
      // The chart tooltip's fixed dark form (REQ-001/AC-04), centred on the slot vertically. The text is
      // already the slot's accessible name, so the layer itself is hidden from assistive technology.
      style={{ ...TIP_LOOK, fontSize: 12.5, whiteSpace: 'nowrap', transform: 'translateY(-50%)' }}
    >
      <span data-testid="update-tip" aria-hidden="true">
        {label}
      </span>
    </FloatingBox>
  )

  if (phase === 'ready') {
    return (
      <>
        <button
          ref={(el) => {
            anchor.current = el
          }}
          type="button"
          className="ri upd"
          data-testid="update-slot"
          aria-label={label}
          onClick={() => void window.agentshed.installUpdate()}
          {...hover}
        >
          <span className="upd-dot">
            <Download size={15} />
          </span>
        </button>
        {tip}
      </>
    )
  }
  return (
    <>
      <span
        ref={(el) => {
          anchor.current = el
        }}
        className="ri upd"
        data-testid="update-slot"
        tabIndex={0}
        aria-label={label}
        {...(phase === 'downloading'
          ? { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': state.progress }
          : {})}
        {...hover}
      >
        <span className="upd-dot">
          {phase === 'downloading' ? (
            <Ring percent={state.progress} />
          ) : (
            <span className="upd-spin">
              <LoaderCircle size={15} />
            </span>
          )}
        </span>
      </span>
      {tip}
    </>
  )
}
