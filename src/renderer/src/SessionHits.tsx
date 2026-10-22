// A session's search hits, drawn the same by a project's own session search and by global search (the
// prototypes' shared session-hits piece): the card header naming the session, then one row per hit.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AgentSide, ForkState } from '@shared/domain'
import { useDisplayClock } from './DisplayClock'
import { hitWindow } from './hit-window'
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

/** The width of the line's ellipsis in this element's font, measured once per font. Measured on a probe laid out in
 *  the element itself: the computed `font` shorthand can be empty (a font-variant the shorthand cannot express
 *  blanks it), and a canvas given an empty font measures in its own default font */
const ellipsisWidths = new Map<string, number>()
function ellipsisWidth(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  let w = ellipsisWidths.get(font)
  if (w === undefined) {
    const probe = document.createElement('span')
    probe.textContent = '…'
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
    el.appendChild(probe)
    w = probe.getBoundingClientRect().width
    probe.remove()
    ellipsisWidths.set(font, w)
  }
  return w
}

/** Whether the first marked occurrence lies wholly in view: when the line overflows, its end shows the ellipsis
 *  rather than text, so the visible text stops short of it */
function firstMarkInView(el: HTMLElement): boolean {
  const mark = el.querySelector('mark')
  if (!mark) return true
  const box = el.getBoundingClientRect()
  const end = el.scrollWidth > el.clientWidth ? box.right - ellipsisWidth(el) : box.right
  const r = mark.getBoundingClientRect()
  return r.left >= box.left - 0.5 && r.right <= end + 0.5
}

type Start = 'full' | 'before' | 'at'

/**
 * A question hit's text (session-view::REQ-002): drawn from the question's beginning; when the first occurrence of
 * the keyword is not wholly in view, it starts 20 characters before it, or at it when even that does not show it.
 * Judged by laying the row out before it is painted, and again, from the beginning, whenever its width changes
 * (a hidden row has none, so it is judged once shown).
 */
function HitText({ text, needle }: { text: string; needle: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)
  const candidates = useMemo(() => hitWindow(text, needle), [text, needle])
  const key = `${width}|${needle}|${text}`
  const [judged, setJudged] = useState<{ key: string; start: Start; done: boolean }>({ key, start: 'full', done: false })
  const current = judged.key === key ? judged : { key, start: 'full' as Start, done: false }

  // The row's width, read before its first paint and followed afterwards
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (current.done || !el || el.clientWidth === 0) return
    const next: Start | null = firstMarkInView(el)
      ? null
      : current.start === 'full'
        ? candidates.before !== null ? 'before' : candidates.at !== null ? 'at' : null
        : current.start === 'before' && candidates.at !== null ? 'at' : null
    setJudged(next === null ? { key, start: current.start, done: true } : { key, start: next, done: false })
    // Each step changes the drawn text, so the next one runs after it is laid out; a new width, keyword or text
    // starts again from the beginning
  }, [current.done, current.start, candidates, key])

  const shown = current.start === 'before' ? candidates.before : current.start === 'at' ? candidates.at : text
  return (
    <span className="t" ref={ref}>
      <Highlight text={shown ?? text} needle={needle} />
    </span>
  )
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
          {h.inBody ? (
            <span className="t">
              <Highlight text={h.text} needle={needle} />
            </span>
          ) : (
            <HitText text={h.text} needle={needle} />
          )}
          {h.inBody && <span className="bd">{t.detail.inBody}</span>}
          <span className="d">{fmtAgo(lang, h.at, now)}</span>
        </button>
      ))}
    </div>
  )
}
