import { useDict } from './language'
import { ChevronDown, RefreshCw, Search } from './icons'
import { useWindowLabel } from './TokenViz'
import { STATIC_TABS } from './AgentsPane'
import { USAGE_WINDOWS } from '@shared/usage'
import { TREND_MODE_LABEL, type TrendMode } from '@shared/trend'

/**
 * The startup skeleton (specs agents-overview A4 family, projects-list A10–A13): what each dimension
 * renders before this launch's first snapshot. The page's real structure with its static labels, a
 * placeholder block in every data slot, and no interaction — `.sk-page` turns pointer events off
 * wholesale, so nothing here carries a handler.
 *
 * Placeholder widths and the chart's bar heights are fixed arrays, not random: the skeleton must
 * look the same on every launch, and staggered values are what keeps a column of placeholders
 * reading as "text of varying length will land here" rather than as a table rule.
 *
 * A placeholder standing in for a line of text must not decide its row's height — font metrics
 * differ per platform, so a pixel value measured on one OS shifts the fill on another (caught by
 * CI: the same anchors that were 0px here moved 2.5px on Linux). SkLine therefore pairs the block
 * with a zero-width space in the same inline context: the strut gives the row the current font's
 * own line box, identical to the text that will replace it, on every platform by construction.
 */

/** A placeholder block; width/height inline because each slot mirrors its own data's shape */
function Sk({ w, h, d }: { w: number; h: number; d?: number }): JSX.Element {
  return (
    <span
      className="sk-ph"
      style={{ width: w, height: h, animationDelay: d !== undefined ? `${d}s` : undefined }}
    />
  )
}

/** A placeholder for a line of text: the zero-width space is the strut that gives the row the real
 * font's line box (see the header note). Hard rule for `h`: at most ~0.75 of the line's font size —
 * an inline block taller than the platform font's ascent lifts the line box (Linux ascents run
 * ~0.93em), and a few tenths across several rows is exactly the 1px drift CI caught twice. */
function SkLine({ w, h, d }: { w: number; h: number; d?: number }): JSX.Element {
  return (
    <span className="sk-line">
      {'\u200B'}
      <Sk w={w} h={h} d={d} />
    </span>
  )
}

/** The trend chart's placeholder bar heights (%): one fixed shape, reproducible across launches */
const BARS = [
  18, 32, 24, 46, 38, 58, 42, 66, 50, 74, 60, 84, 68, 90, 72, 62, 78, 54, 70, 44, 58, 36, 48, 28,
  40, 52, 64, 46, 34, 26
]

/** The side cards' static identity; the figures and secondary rows are placeholders */
const SIDES = [
  { cls: 'cl', label: 'CLAUDE CODE' },
  { cls: 'cx', label: 'CODEX' },
  { cls: 'gk', label: 'GROK' }
] as const

/** The sidebar's placeholder rows: name widths staggered like real project names (A10) */
const ROW_WIDTHS = [128, 96, 142, 88, 150, 104, 120, 134, 92]

export function ProjectsSkeleton(): JSX.Element {
  const t = useDict()
  return (
    <>
      <aside className="side sk-page" aria-hidden="true">
        <div className="sh">
          <div className="sh-field">
            <Search size={13} />
            <input disabled placeholder={t.projects.searchPlaceholder} />
          </div>
        </div>
        <div className="opts">
          {/* The filter row's real occupants, inert: the dropdown trigger and the stale toggle */}
          <button type="button" className="dd-trigger" tabIndex={-1}>
            <span>{t.projects.filterAll}</span>
            <span className="chev">
              <ChevronDown size={11} />
            </span>
          </button>
          <label>
            <input type="checkbox" disabled />
            {t.projects.showStale}
          </label>
        </div>
        <div className="list">
          {ROW_WIDTHS.map((w, i) => (
            <div key={i} className="row">
              <span className="nm">
                <SkLine w={w} h={10} d={(i % 6) * 0.12} />
              </span>
              {/* The side-count badge's slot: the badge is a 17px rounded pill */}
              <span
                className="sk-ph"
                style={{
                  width: 26,
                  height: 17,
                  borderRadius: 9,
                  animationDelay: `${(i % 6) * 0.12}s`
                }}
              />
              <span className="meta">
                <SkLine w={34} h={8} d={(i % 6) * 0.12} />
              </span>
            </div>
          ))}
        </div>
      </aside>
      <section className="detail sk-page">
        {/* The scanning hint sits where the pick-a-project guidance will: with nothing to pick yet,
            that guidance would be false (A10) */}
        <div className="empty">
          <div className="big scan-spin">
            <RefreshCw size={26} />
          </div>
          <div className="scan-hint">{t.shell.scanning}</div>
        </div>
      </section>
    </>
  )
}

export function AgentsSkeleton(): JSX.Element {
  const t = useDict()
  const label = useWindowLabel()
  return (
    <div className="pane sk-page" aria-hidden="true">
      <header className="pane-head">
        {/* The hint shares the title's row so its disappearance causes no vertical shift (A4b) */}
        <div className="h1-row">
          <h1>Agents</h1>
          <span className="scan-hint">
            <RefreshCw size={12} />
            {t.shell.scanning}
          </span>
        </div>
        <div className="tot-row">
          {USAGE_WINDOWS.map((w, i) => (
            <div key={w} className="tot-c">
              <div className="k">{label(w, t.agents.totalsNote)}</div>
              <div className="v">
                <SkLine w={[64, 44, 52, 52][i]} h={18} />
              </div>
            </div>
          ))}
        </div>
        {/* The composition bar's placeholder: .comp's own background is the placeholder grey, so the
            empty track is the placeholder; the legend line keeps the loaded legend's line box so the
            fill moves nothing below it (A4b) */}
        <div className="comp-block">
          <div className="comp" />
          <div className="comp-lg" style={{ alignItems: 'center' }}>
            <SkLine w={64} h={8} />
            <SkLine w={84} h={8} />
            <SkLine w={56} h={8} />
          </div>
        </div>
        <div className="stats">
          {SIDES.map((s, i) => (
            <div key={s.cls} className="stat">
              {/* SkLine, not Sk: the loaded row carries detection copy at the row's own font size,
                  and the badge's smaller type alone gives the row a shorter line box off-platform */}
              <div className="k">
                <span className={`badge ${s.cls}`}>{s.label}</span>
                <SkLine w={38} h={8} />
              </div>
              <div className="v">
                <SkLine w={[58, 46, 50][i]} h={13} />
              </div>
              <div className="s">
                <SkLine w={[150, 140, 120][i]} h={8} />
              </div>
            </div>
          ))}
        </div>
        <nav className="tabs">
          {[...STATIC_TABS.map(([, l]) => l), t.agents.tabCfg].map((l, i) => (
            <span key={l} className={`tab ${i === 0 ? 'on' : ''}`}>
              {l}
            </span>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        <div className="grp-t">
          {t.token.trendTitle}
          <span className="seg">
            {(Object.keys(TREND_MODE_LABEL) as TrendMode[]).map((m, i) => (
              <button key={m} type="button" className={i === 0 ? 'on' : ''} tabIndex={-1}>
                {TREND_MODE_LABEL[m] ?? t.label.trendTotal}
              </button>
            ))}
          </span>
        </div>
        <div className="chart">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="sk-ph-bar"
              style={{ height: `${h}%`, animationDelay: `${(i % 8) * 0.1}s` }}
            />
          ))}
        </div>
        <div className="xaxis">
          <Sk w={420} h={9} />
        </div>
        {/* minHeight on this and the title below: a placeholder bar is shorter than the text line
            box it stands in for, and the gap would shift everything under it on fill (A4b). The
            values are the measured loaded line boxes; the e2e anchor assertion re-measures them. */}
        <div className="legend">
          <SkLine w={72} h={9} />
          <SkLine w={64} h={9} />
          <SkLine w={90} h={9} />
        </div>
        <div className="grp-t">
          <SkLine w={260} h={8} />
        </div>
        {/* The row count is nominal — the model count is unknown until the scan lands (A4b) */}
        <div className="models">
          {[150, 120, 135, 100, 128].map((w, i) => (
            <div key={i} className="m">
              <span className="nm2 mono">
                <SkLine w={w} h={9} d={i * 0.12} />
              </span>
              <span className="tr">
                <span
                  className="sk-ph sk-ph-deep"
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${[88, 64, 42, 20, 12][i]}%`,
                    borderRadius: 4,
                    animationDelay: `${i * 0.12}s`
                  }}
                />
              </span>
              <span className="num">
                <SkLine w={40} h={9} d={i * 0.12} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
