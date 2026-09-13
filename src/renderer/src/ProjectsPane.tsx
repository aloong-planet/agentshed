import { useDisplayClock } from './DisplayClock'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSide, ProjectEntry, Snapshot } from '@shared/domain'
import type { Language } from '@shared/i18n'
import { relativeDays } from '@shared/format'
import { useDict, useLanguage } from './language'
import { Bot, Check, ChevronDown, Search } from './icons'
import { FloatingBox } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'

/**
 * Side names in full — product names, identical in all six languages, so they live here rather than
 * in the dictionaries (the same rule as PROVIDER_LABEL's proper nouns).
 */
const SIDE_NAME: Record<AgentSide, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' }

/** The gap between the count badge and the layer below it */
const TIP_OFFSET = 6

/**
 * The filter's option order: "all", then the sides in SIDE_NAME's order. Derived rather than
 * written out, so the option list is complete by construction — SIDE_NAME is a Record over
 * AgentSide, and typecheck makes a fourth side land there before it can be forgotten here.
 */
const FILTER_OPTIONS: ReadonlyArray<'all' | AgentSide> = [
  'all',
  ...(Object.keys(SIDE_NAME) as AgentSide[])
]

/**
 * Relative time (for display): today / yesterday / N days ago / N months ago, in the current language
 * (ticket 12).
 * The wording comes from `Intl.RelativeTimeFormat` rather than concatenating "N + days ago" — the
 * position of the measure word and
 * the plural form differ per language, so concatenation is bound to be wrong.
 */
export function fmtAgo(lang: Language, ms: number | null, now: number): string {
  if (ms === null) return '—'
  return relativeDays(lang, Math.floor((now - ms) / 86_400_000))
}

interface Props {
  snap: Snapshot
  selected: string | null
  onSelect: (path: string) => void
  /** The detail area (filled in by ticket 03; currently a placeholder) */
  detail: React.ReactNode
}

export function ProjectsPane({ snap, selected, onSelect, detail }: Props): JSX.Element {
  const now = useDisplayClock()
  const t = useDict()
  const [kw, setKw] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | AgentSide>('all')
  const [showStale, setShowStale] = useState(false)

  const { visible, staleFiltered } = useMemo(() => {
    const k = kw.trim().toLowerCase()
    const base = snap.projects
      .filter((p) => sideFilter === 'all' || p.sides.includes(sideFilter))
      .filter((p) => !k || p.name.toLowerCase().includes(k) || p.path.toLowerCase().includes(k))
    const visible = base.filter((p) => showStale || !p.stale)
    const staleFiltered = base.length - visible.length
    visible.sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))
    return { visible, staleFiltered }
  }, [snap, kw, sideFilter, showStale])

  return (
    <>
      <aside className="side">
        <div className="sh">
          {/* The icon is a sibling rather than part of the placeholder: an input's placeholder takes a
              string, so an SVG cannot live in it — and keeping it out is also what keeps it from being
              carried into the six dictionaries along with the copy. */}
          <div className="sh-field">
            <Search size={13} />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder={t.projects.searchPlaceholder}
            />
          </div>
        </div>
        <div className="opts">
          <SideFilter value={sideFilter} onChange={setSideFilter} />
          <label>
            <input
              type="checkbox"
              checked={showStale}
              onChange={(e) => setShowStale(e.target.checked)}
            />
            {t.projects.showStale}
          </label>
          {/* The title carries the full sentence: the counter ellipsizes under squeeze (ruled
              2026-08-16 — the display layer truncates, the data layer stays whole) */}
          {!showStale && staleFiltered > 0 && (
            <span className="cnt" title={t.projects.staleFiltered(staleFiltered)}>
              {t.projects.staleFiltered(staleFiltered)}
            </span>
          )}
        </div>
        <div className="list">
          {visible.map((p) => (
            <Row key={p.path} p={p} now={now} selected={selected === p.path} onSelect={onSelect} />
          ))}
          {visible.length === 0 && <div className="list-empty">{t.projects.noMatch}</div>}
        </div>
      </aside>
      <section className="detail">{detail}</section>
    </>
  )
}

/**
 * Side filtering as a single-choice dropdown (spec C5): the row of controls has to stay readable
 * as sides are added, and in the narrowest supported sidebar the longest of the six UI languages
 * must not push it out of the column. Only "All" varies with the language — the side names are
 * product names, identical in all six.
 *
 * Being operated rather than glanced at, it answers a resize by **repositioning** (spec C7) — the
 * user choosing a side has not changed their mind — while any scroll but the layer's own
 * dismisses it like every anchored layer.
 */
function SideFilter({
  value,
  onChange
}: {
  value: 'all' | AgentSide
  onChange: (v: 'all' | AgentSide) => void
}): JSX.Element {
  const t = useDict()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const trigRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const label = (v: 'all' | AgentSide): string =>
    v === 'all' ? t.projects.filterAll : SIDE_NAME[v]

  // Left-aligned below the trigger; anchoring by the trigger's own rect needs no measurement of
  // the layer, so opening and repositioning share this one computation
  const place = useCallback((): void => {
    const r = trigRef.current?.getBoundingClientRect()
    if (r) setAt({ left: r.left, top: r.bottom + 6 })
  }, [])

  useAnchorInvalidation(open, popRef, {
    onResize: 'reposition',
    dismiss: () => setOpen(false),
    reposition: place
  })

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      const el = e.target as Node
      if (!popRef.current?.contains(el) && !trigRef.current?.contains(el)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="dd-trigger"
        ref={trigRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else {
            place()
            setOpen(true)
          }
        }}
      >
        <span>{label(value)}</span>
        <span className="chev">
          <ChevronDown size={11} />
        </span>
      </button>
      {open && (
        <FloatingBox ref={popRef} className="side-pop" at={at} style={{ padding: 4 }}>
          <div role="listbox">
            {FILTER_OPTIONS.map((o) => (
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                className={`dd-opt${o === value ? ' on' : ''}`}
                key={o}
                onClick={() => {
                  setOpen(false)
                  onChange(o)
                }}
              >
                {/* A dot marks a side; "All" is not a side and gets none */}
                {o !== 'all' && <i className={`dot ${o}`} />}
                <span className="n">{label(o)}</span>
                <span className="ck">
                  <Check size={13} />
                </span>
              </button>
            ))}
          </div>
        </FloatingBox>
      )}
    </>
  )
}

function Row({
  p,
  now,
  selected,
  onSelect
}: {
  p: ProjectEntry
  now: number
  selected: boolean
  onSelect: (path: string) => void
}): JSX.Element {
  const lang = useLanguage()
  const t = useDict()
  return (
    <div
      className={`row ${p.stale ? 'stale' : ''} ${selected ? 'sel' : ''}`}
      onClick={() => onSelect(p.path)}
      title={p.path}
    >
      <span className="nm">{p.name}</span>
      {p.stale && <span className="stale-tag">{t.projects.staleTag}</span>}
      <span className="meta">{fmtAgo(lang, p.lastSessionAt, now)}</span>
      <SideCount sides={p.sides} />
    </div>
  )
}

/**
 * The row says **how many** sides use the directory; **which** ones is answered by this hover layer
 * naming them in full (stories 1/1a) — the count is what the eye needs while scanning, and a count
 * rather than one badge per side keeps the row's width independent of how many sides exist. The
 * badge deliberately carries no side's colour: colouring a "how many" would read as a "which".
 */
function SideCount({ sides }: { sides: AgentSide[] }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState<{ right: number; top: number } | null>(null)

  // A glance, not an interaction: dismissed on any scroll but its own, and on resize (spec C6)
  useAnchorInvalidation(at !== null, tipRef, { onResize: 'dismiss', dismiss: () => setAt(null) })

  const reveal = (): void => {
    const el = ref.current
    if (el === null) return
    const r = el.getBoundingClientRect()
    // Right edges aligned (the badge sits near the row's right edge); anchoring by `right` needs no
    // measurement of the layer's own width, so no second render to place it
    setAt({ right: window.innerWidth - r.right, top: r.bottom + TIP_OFFSET })
  }

  return (
    <>
      <span className="cnt-b" ref={ref} onMouseEnter={reveal} onMouseLeave={() => setAt(null)}>
        <Bot size={11} />
        {sides.length}
      </span>
      {at !== null && (
        // The padding overrides the surface's uniform 6px: a class rule cannot beat the surface's
        // inline style, so the override rides the style prop FloatingBox applies last
        <FloatingBox ref={tipRef} className="sides-tip" at={at} style={{ padding: '6px 9px' }}>
          {sides.map((s) => (
            <div className="st" key={s}>
              <i className={`dot ${s}`} />
              {SIDE_NAME[s]}
            </div>
          ))}
        </FloatingBox>
      )}
    </>
  )
}
