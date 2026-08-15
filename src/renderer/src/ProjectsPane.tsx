import { useMemo, useState } from 'react'
import type { AgentSide, ProjectEntry, Snapshot } from '@shared/domain'
import type { Language } from '@shared/i18n'
import { relativeDays } from '@shared/format'
import { useDict, useLanguage } from './language'
import { Search } from './icons'

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
  const t = useDict()
  const [kw, setKw] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | AgentSide>('all')
  const [showStale, setShowStale] = useState(false)
  const now = snap.scannedAt

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
        <div className="fseg">
          {(['all', 'claude', 'codex'] as const).map((f) => (
            <button
              key={f}
              className={sideFilter === f ? 'on' : ''}
              onClick={() => setSideFilter(f)}
            >
              {f === 'all' ? t.projects.filterAll : f === 'claude' ? 'Claude' : 'Codex'}
            </button>
          ))}
        </div>
        <div className="opts">
          <label>
            <input
              type="checkbox"
              checked={showStale}
              onChange={(e) => setShowStale(e.target.checked)}
            />
            {t.projects.showStale}
          </label>
          {!showStale && staleFiltered > 0 && <span className="cnt">{t.projects.staleFiltered(staleFiltered)}</span>}
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
      <span className="meta">
        {fmtAgo(lang, p.lastSessionAt, now)} · {p.sessionCount}
      </span>
      <span className="bdg">
        {p.sides.includes('claude') && <span className="badge cl">CC</span>}
        {p.sides.includes('codex') && <span className="badge cx">CX</span>}
      </span>
    </div>
  )
}
