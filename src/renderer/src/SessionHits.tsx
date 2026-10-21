// A session's search hits, drawn the same by a project's own session search and by global search (the
// prototypes' shared session-hits piece): the card header naming the session, then one row per hit.
import type { AgentSide, ForkState } from '@shared/domain'
import { useDisplayClock } from './DisplayClock'
import { useDict, useLanguage } from './language'
import { fmtAgo } from './ProjectsPane'
import { SIDE_BADGE } from './side-badge'
import { GitFork } from './icons'

/** Highlighting matched text (case-insensitive; split as plain text, never through HTML) */
export function Highlight({ text, needle }: { text: string; needle: string }): JSX.Element {
  if (needle === '') return <>{text}</>
  const lower = text.toLowerCase()
  const k = needle.toLowerCase()
  const parts: JSX.Element[] = []
  let from = 0
  for (let n = 0; ; n++) {
    const i = lower.indexOf(k, from)
    if (i === -1) break
    if (i > from) parts.push(<span key={`t${n}`}>{text.slice(from, i)}</span>)
    parts.push(<mark key={`m${n}`}>{text.slice(i, i + needle.length)}</mark>)
    from = i + needle.length
  }
  parts.push(<span key="tail">{text.slice(from)}</span>)
  return <>{parts}</>
}

/**
 * One session's card: a header that opens the session (side badge, title, fork marker, hit count), then a row
 * per hit that opens it at that question (its number, the text with the keyword marked, a body marker for a
 * full-text hit, and when it was asked).
 */
export function SessionHitCard({
  side,
  title,
  forkState,
  hits,
  needle,
  onOpen,
  onOpenHit
}: {
  side: AgentSide
  /** null = no title; the card draws the untitled fallback */
  title: string | null
  forkState: ForkState
  /** `text` is what the row shows: the question, or a full-text hit's snippet */
  hits: ReadonlyArray<{ i: number; text: string; at: number | null; inBody?: boolean }>
  needle: string
  onOpen: () => void
  onOpenHit: (i: number) => void
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const now = useDisplayClock()
  return (
    <div className="grp">
      <button className="gh row-btn" onClick={onOpen}>
        <span className={`badge ${SIDE_BADGE[side].cls}`}>{SIDE_BADGE[side].label}</span>
        <span className="t">{title ?? t.placeholder.untitledSession}</span>
        {forkState === 'stripped' && (
          <span className="pill fork">
            <GitFork size={10} /> fork
          </span>
        )}
        {forkState === 'uncertain' && (
          <span className="pill forkq">
            <GitFork size={10} /> {t.detail.forkUncertain}
          </span>
        )}
        <span className="d">{t.detail.hitCount(hits.length)}</span>
      </button>
      {hits.map((h, hi) => (
        <button className="hit row-btn" key={`${h.i}-${h.inBody ? 'b' : 'q'}-${hi}`} onClick={() => onOpenHit(h.i)}>
          <span className="idx">{String(h.i).padStart(2, '0')}</span>
          <span className="t">
            <Highlight text={h.text} needle={needle} />
          </span>
          {h.inBody && <span className="bd">{t.detail.inBody}</span>}
          <span className="d">{fmtAgo(lang, h.at, now)}</span>
        </button>
      ))}
    </div>
  )
}
