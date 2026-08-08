import { useMemo, useState } from 'react'
import type { AgentSide, ProjectEntry, Snapshot } from '@shared/domain'
import { useDict } from './language'

/** 相对时间(展示用):今天/昨天/N天前/N月前 */
export function fmtAgo(ms: number | null, now: number): string {
  if (ms === null) return '—'
  const days = Math.floor((now - ms) / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}月前`
}

interface Props {
  snap: Snapshot
  selected: string | null
  onSelect: (path: string) => void
  /** 详情区域(票03 填充;当前占位) */
  detail: React.ReactNode
}

export function ProjectsPane({ snap, selected, onSelect, detail }: Props): JSX.Element {
  const t = useDict()
  const [kw, setKw] = useState('')
  const [sideFilter, setSideFilter] = useState<'all' | AgentSide>('all')
  const [showStale, setShowStale] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const now = snap.scannedAt

  const { visible, hiddenList, staleFiltered } = useMemo(() => {
    const k = kw.trim().toLowerCase()
    const base = snap.projects
      .filter((p) => sideFilter === 'all' || p.sides.includes(sideFilter))
      .filter((p) => !k || p.name.toLowerCase().includes(k) || p.path.toLowerCase().includes(k))
    const hiddenList = base.filter((p) => p.hidden)
    const notHidden = base.filter((p) => !p.hidden)
    const visible = notHidden.filter((p) => showStale || !p.stale)
    const staleFiltered = notHidden.length - visible.length
    const byActivity = (a: ProjectEntry, b: ProjectEntry): number =>
      (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0)
    visible.sort(byActivity)
    hiddenList.sort(byActivity)
    return { visible, hiddenList, staleFiltered }
  }, [snap, kw, sideFilter, showStale])

  return (
    <>
      <aside className="side">
        <div className="sh">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            // 图标字符留在组件内,不进六份语言字典(票 08 AC;SVG 化见 #51)
            placeholder={`🔍 ${t.projects.searchPlaceholder}`}
          />
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
        {hiddenList.length > 0 && (
          <button className="hidden-entry" onClick={() => setShowHidden((v) => !v)}>
            ▸ {t.projects.hiddenCount(hiddenList.length)}
            {showHidden ? t.projects.collapseHint : t.projects.expandHint}
          </button>
        )}
        {showHidden && hiddenList.length > 0 && (
          <div className="hidden-panel">
            {hiddenList.map((p) => (
              <Row key={p.path} p={p} now={now} selected={false} onSelect={onSelect} inHidden />
            ))}
          </div>
        )}
      </aside>
      <section className="detail">{detail}</section>
    </>
  )
}

function Row({
  p,
  now,
  selected,
  onSelect,
  inHidden = false
}: {
  p: ProjectEntry
  now: number
  selected: boolean
  onSelect: (path: string) => void
  inHidden?: boolean
}): JSX.Element {
  const t = useDict()
  return (
    <div
      className={`row ${p.stale ? 'stale' : ''} ${selected ? 'sel' : ''}`}
      onClick={() => !inHidden && onSelect(p.path)}
      title={p.path}
    >
      <span className="nm">{p.name}</span>
      {p.stale && <span className="stale-tag">{t.projects.staleTag}</span>}
      <span className="meta">
        {fmtAgo(p.lastSessionAt, now)} · {p.sessionCount}
      </span>
      <span className="bdg">
        {p.sides.includes('claude') && <span className="badge cl">CC</span>}
        {p.sides.includes('codex') && <span className="badge cx">CX</span>}
      </span>
      <button
        className="hide-btn"
        onClick={(e) => {
          e.stopPropagation()
          void window.agentshed.setHidden({ projectPath: p.path, hidden: !inHidden ? true : false })
        }}
      >
        {inHidden ? t.projects.restore : t.projects.hide}
      </button>
    </div>
  )
}
