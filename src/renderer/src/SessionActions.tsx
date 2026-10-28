// The session page header's three buttons (session-view::US-001, the form confirmed in the session page
// prototype on 2026-10-28): copy the session ID, show the record file in Finder, copy the resume command.
// The product only writes the clipboard and asks Finder to show a file (session-view::CON-001); the command is
// built by the shared builder, which quotes the agent data it carries (session-view::CON-002).
//
// The tooltip is a floating layer and owes CONTEXT's two obligations, as the rail's update button tooltip does:
// the shared surface's viewport positioning escapes clipping, and the shared hook dismisses it when a scroll or
// a resize makes its measured position stale (it is glanced at, so a resize dismisses rather than repositions).
// It hangs below its button, anchored by the button's right edge — the buttons sit at the window's right, so
// the layer grows leftwards and needs no measuring of its own width. It is instant: the native title waits
// about a second.
import { useEffect, useRef, useState, type JSX } from 'react'
import type { SessionPage } from '@shared/domain'
import { resumeCommand } from '@shared/session-resume'
import { errorText } from '@shared/error-text'
import { FloatingBox, TIP_LOOK, type FloatingAt } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'
import { Check, Copy, FolderOpen, SquareTerminal } from './icons'
import { useDict, useLanguage } from './language'
import { toast } from './Toast'

type Act = 'id' | 'reveal' | 'resume'
const ICON: Record<Act, (p: { size?: number }) => JSX.Element> = { id: Copy, reveal: FolderOpen, resume: SquareTerminal }
/** How long a copied button keeps its check (session-view::US-001/AC-06) */
const COPIED_MS = 1500

export function SessionActions({
  page,
  projectDir,
  stale
}: {
  page: SessionPage
  /** The directory of the project the page belongs to, which the resume command changes into */
  projectDir: string
  /** The project's directory is gone (session-view::US-001/AC-08) */
  stale: boolean
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [tip, setTip] = useState<{ act: Act; at: FloatingAt } | null>(null)
  const [copied, setCopied] = useState<Act | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const layer = useRef<HTMLDivElement | null>(null)
  useAnchorInvalidation(tip !== null, layer, { onResize: 'dismiss', dismiss: () => setTip(null) })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const id = page.sessionId
  const command = id === null ? null : resumeCommand(page.side, id, projectDir)
  const label: Record<Act, string> = { id: t.session.copyId, reveal: t.session.revealFile, resume: t.session.copyResume }
  // Copying the ID and the command both need the ID; showing the record file does not (AC-09)
  const disabled = (act: Act): boolean => act !== 'reveal' && id === null

  const place = (act: Act, el: HTMLElement): void => {
    const r = el.getBoundingClientRect()
    setTip({ act, at: { top: r.bottom + 6, right: window.innerWidth - r.right, maxWidth: 440 } })
  }
  const copy = (act: Act, text: string): void => {
    window.agentshed.copyText(text).then(
      () => {
        setCopied(act)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(null), COPIED_MS)
      },
      () => toast('err', t.session.copyFailed)
    )
  }
  const act = (a: Act): void => {
    if (disabled(a)) return
    if (a === 'reveal') {
      window.agentshed.revealSessionFile(page.file).catch((e: unknown) => toast('err', t.session.revealFailed(errorText(lang, e))))
    } else if (a === 'id' && id !== null) copy(a, id)
    else if (a === 'resume' && command !== null) copy(a, command)
  }

  const tipBody = (a: Act): JSX.Element => {
    if (disabled(a)) return <>{t.session.idUnreadable}</>
    return (
      <>
        {copied === a ? t.detail.staleCopied : label[a]}
        {a === 'resume' && command !== null && <div className="stip-cmd">{command}</div>}
        {a === 'resume' && stale && <div className="stip-warn">{t.session.resumeStale}</div>}
      </>
    )
  }

  return (
    <span className="sacts">
      {(['id', 'reveal', 'resume'] as const).map((a) => {
        const Icon = copied === a ? Check : ICON[a]
        return (
          <button
            key={a}
            type="button"
            className={`sact${copied === a ? ' done' : ''}`}
            data-act={a}
            aria-label={label[a]}
            aria-disabled={disabled(a) || undefined}
            onClick={() => act(a)}
            onMouseEnter={(e) => place(a, e.currentTarget)}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => place(a, e.currentTarget)}
            onBlur={() => setTip(null)}
          >
            <Icon size={12} />
          </button>
        )
      })}
      {tip && (
        <FloatingBox
          ref={layer}
          at={tip.at}
          // The shared tooltip form. The buttons carry their names, so the layer is hidden from assistive technology
          style={{ ...TIP_LOOK, fontSize: 12, lineHeight: 1.55 }}
        >
          <div data-testid="session-tip" aria-hidden="true">
            {tipBody(tip.act)}
          </div>
        </FloatingBox>
      )}
    </span>
  )
}
