import { useTrendSpan } from './TrendSpan'
import { StartupHint } from './StartupHint'
import { useDisplayClock } from './DisplayClock'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SIDE_BADGE, SIDE_CHIP_LABEL, SIDE_FULL_NAME, SIDE_ORDER, type SideBadgeClass } from './side-badge'
import { ConfigSection } from './ConfigSection'
import type { AgentSide, GlobalSkill, ProjectEntry, Snapshot } from '@shared/domain'
import type { SkillHoldings } from '@shared/ipc'
import { skillLandings, type SkillLanding } from '@shared/skill-landing'
import { fmtTok, ModelBars, TotalsCards, TrendChart, useWindowLabel } from './TokenViz'
import { sliceUsage, type UsageWindow } from '@shared/usage'
import { GlobalSubagentsTab } from './SubagentsView'
import { GlobalMemoryTab } from './MemoryView'
import { GlobalPluginsTab } from './PluginsView'
import { AntigravityMcpGroup, McpServerRow } from './McpServers'
import { toast } from './Toast'
import { FloatingBox } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'
import { SkillExpandBlock } from './SkillExpandBlock'
import { SkillSearch } from './SkillSearch'
import { filterByName } from './skill-filter'
import { errorText } from '@shared/error-text'
import { ERR, appError, type AppError } from '@shared/errors'
import { useLanguage, useDict } from './language'
import { Inbox } from './icons'

type Tab = 'token' | 'skills' | 'subagents' | 'plugins' | 'mcp' | 'memory' | 'cfg'

/**
 * The section tabs whose labels are language-independent (product/technical names); the configuration
 * tab's label lives in the dictionaries and is appended by the render. Exported so the startup
 * skeleton renders the same set — adding a section (spec B1) lands here once for both.
 */
export const STATIC_TABS = [
  ['token', 'Token'],
  ['skills', 'Skills'],
  ['subagents', 'Subagents'],
  ['plugins', 'Plugins'],
  ['mcp', 'MCP'],
  ['memory', 'Memory']
] as const

export function AgentsPane({ snap }: { snap: Snapshot }): JSX.Element {
  const now = useDisplayClock()
  const t = useDict()
  const [tab, setTab] = useState<Tab>('token')
  // The selected time window lives **above the tab switch**, so it survives moving between tabs (G11)
  // — and above the side cards, whose figures it governs on every tab, not only this one.
  const [win, setWin] = useState<UsageWindow>('all')
  const { span: trendSpan, onSpan: setTrendSpan } = useTrendSpan()
  const winLabel = useWindowLabel()
  const slice = useMemo(() => sliceUsage(snap.tokens.rows, win, now, trendSpan), [snap.tokens.rows, win, now, trendSpan])
  // One accessor over the side rather than nine hand-named variables: the card row below maps over
  // SIDE_ORDER, so a new side gets its card (and its counts) by construction. The skill count is the side's
  // global library — its on-disk names — and not the plugin entries the Skills section also lists
  // (skills-view::REQ-001/AC-05)
  const sideStats = (side: AgentSide): { projects: number; skills: number; subs: number } => ({
    projects: snap.projects.filter((p) => p.sides.includes(side)).length,
    skills: snap.global.skills.filter((s) => s.origin === 'disk' && s.sides.includes(side)).length,
    subs: snap.global.subagents.filter((s) => s.sides.includes(side)).length
  })

  return (
    <div className="pane">
      <header className="pane-head">
        <div className="h1-row"><h1>Agents</h1><StartupHint /></div>
        <TotalsCards
          slice={slice}
          rows={snap.tokens.rows}
          anchor={now}
          window={win}
          onWindow={setWin}
        />
        <div className="stats">
          {SIDE_ORDER.map((side) => {
            const st = sideStats(side)
            return (
              <SideCard
                key={side}
                label={SIDE_CHIP_LABEL[side]}
                cls={SIDE_BADGE[side].cls}
                detected={snap.sides[side].detected}
                error={snap.sides[side].error}
                unreadable={snap.sides[side].unreadable ?? 0}
                total={slice.bySide[side]}
                sub={t.agents.sideSummary(st.projects, st.skills, st.subs)}
              />
            )
          })}
        </div>
        <nav className="tabs">
          {([...STATIC_TABS, ['cfg', t.agents.tabCfg]] as const).map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        {SIDE_ORDER.every((side) => !snap.sides[side].detected) && (
          <div className="empty">
            <div className="big">
              <Inbox size={30} />
            </div>
            <div>
              {t.agents.notDetected}
              <br />
              {/* The button's own label is passed in rather than written into each language's string: the copy
                  points at a control, so renaming that control must not be able to leave the sentence
                  naming a button that no longer exists. */}
              {t.agents.notDetectedHint}
            </div>
          </div>
        )}
        {tab === 'token' && (
          <div>
            <TrendChart
              stats={snap.tokens}
              span={trendSpan}
              onSpan={setTrendSpan}
              anchor={now}
              archivedDays={snap.archivedDays}
              window={win}
            />
            {snap.archivedDays.length > 0 && (
              <div className="arch-note">
                {t.agents.archivedNote(snap.archivedDays.length, snap.archivedDays[0])}
              </div>
            )}
            <div className="grp-t">{t.token.byModelIn(t.agents.byModel, winLabel(win))}</div>
            <ModelBars models={slice.byModel} />
          </div>
        )}
        {tab === 'skills' && <SkillsTab snap={snap} />}
        {tab === 'subagents' && <GlobalSubagentsTab snap={snap} />}
        {tab === 'plugins' && <GlobalPluginsTab snap={snap} />}
        {tab === 'mcp' && <McpTab snap={snap} />}
        {tab === 'memory' && <GlobalMemoryTab snap={snap} />}
        {tab === 'cfg' && <CfgTab snap={snap} />}
      </div>
    </div>
  )
}

function SideCard({
  label,
  cls,
  detected,
  error,
  unreadable,
  total,
  sub
}: {
  label: string
  cls: SideBadgeClass
  detected: boolean
  error?: AppError
  /** Sessions the scan could not read in the supported format (only the Antigravity CLI side counts any) */
  unreadable: number
  total: number
  sub: string
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  return (
    <div className="stat">
      <div className="k">
        <span className={`badge ${cls}`}>{label}</span>
        {detected ? t.agents.detected : t.agents.undetected}
      </div>
      <div className="v">{fmtTok(total)}</div>
      {/* The third line: the side's error explanation (A3) first; else the count of conversations the scan could not
          read, in the warning colour with its reason on hover, the figure above staying (agents-overview::REQ-003/AC-02,
          the owner's ruling of 2026-10-28); else the side's counts */}
      {error ? (
        <div className="stat-err">{errorText(lang, appError(error.code, error.params))}</div>
      ) : unreadable > 0 ? (
        <div className="s side-warn" title={t.agents.unreadableTip}>{t.agents.unreadableConversations(unreadable)}</div>
      ) : (
        <div className="s">{sub}</div>
      )}
    </div>
  )
}

/**
 * Where the install-to popover sits. It is a `fixed` layer (theme.css explains why), so it has no
 * automatic relationship to the row that opened it and must be handed viewport coordinates.
 *
 * `top` and `bottom` are exclusive: the popover opens downwards by default and flips upwards when there is
 * not enough room below. Flipping matters more here than for a popover inside the document flow — being
 * fixed, no amount of scrolling can bring an off-screen part of it back.
 */
interface PopAt {
  skill: string
  top?: number
  bottom?: number
  right: number
  maxHeight: number
}

/** The popover's own ceiling, matching `.pop`'s max-height; the available space narrows it further */
const POP_MAX_HEIGHT = 300
/** Breathing room kept between the popover and the window edge */
const POP_MARGIN = 12

function popAt(skill: string, btn: HTMLElement): PopAt {
  const r = btn.getBoundingClientRect()
  const right = window.innerWidth - r.right
  const below = window.innerHeight - r.bottom - POP_MARGIN
  const above = r.top - POP_MARGIN
  // Prefer downwards; flip only when below is genuinely the worse side, so the direction does not
  // flap between neighbouring rows
  const up = below < Math.min(POP_MAX_HEIGHT, above)
  return up
    ? { skill, bottom: window.innerHeight - r.top + 4, right, maxHeight: Math.min(POP_MAX_HEIGHT, above) }
    : { skill, top: r.bottom + 4, right, maxHeight: Math.min(POP_MAX_HEIGHT, below) }
}

function SkillsTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [openFor, setOpenFor] = useState<PopAt | null>(null)
  // The keyword belongs to this section, which is what makes it survive a snapshot refresh (the section
  // is re-rendered, not remounted) and vanish when the tab is left (it is). Neither needed arranging.
  const [kw, setKw] = useState('')
  // The button this popover was measured from, so a resize can re-measure it. Kept in a ref rather than
  // in the position state: it is not something to render, and putting a DOM node in state would make
  // every reposition a state change carrying an element around.
  const trigger = useRef<HTMLElement | null>(null)
  // The popover element itself: it is scrollable, and scrolling **its** contents must not close it
  const popRef = useRef<HTMLDivElement | null>(null)
  // Which projects already hold the open popover's skill, asked of the main process each time a popover opens (it
  // probes its own project list; the renderer names only the skill). Until it answers, no row is tagged and the
  // install itself still refuses a same name (A4)
  const [held, setHeld] = useState<{ skill: string; holdings: SkillHoldings } | null>(null)
  const openSkill = openFor?.skill ?? null
  useEffect(() => {
    if (openSkill === null) return
    let live = true
    window.agentshed.skillHoldings(openSkill).then(
      (holdings) => {
        if (live) setHeld({ skill: openSkill, holdings })
      },
      () => {} // The tag is advisory: without it a same-name install is still refused at install time
    )
    return () => {
      live = false
    }
  }, [openSkill])

  // Repositioned rather than closed on resize: the user is part-way through choosing a target project,
  // and a window resize is not them changing their mind. (The language dropdown already behaved this
  // way; the two are the same kind of thing and now agree.)
  useAnchorInvalidation(openFor !== null, popRef, {
    onResize: 'reposition',
    dismiss: () => setOpenFor(null),
    reposition: () => {
      const btn = trigger.current
      // A node that has left the document reports an all-zero rect without erroring, so re-measuring
      // it would place the popover at the top-left corner rather than fail. Closing is the honest
      // outcome when the anchor is gone.
      if (openFor === null || btn === null || !document.contains(btn)) {
        setOpenFor(null)
        return
      }
      setOpenFor(popAt(openFor.skill, btn))
    }
  })
  if (snap.global.skills.length === 0) return <Empty msg={t.agents.emptyGlobalLib} />
  // Every project, a stale one listed disabled and labelled rather than left out (skill-install::REQ-003/AC-01)
  const targets = [...snap.projects].sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))
  // Where this skill would land in that project: one landing per directory, of the skill's sides the project is
  // registered on (A8); the shared skills directory is one landing naming both its loaders (skill-install::REQ-001)
  const landingsIn = (skill: GlobalSkill, project: ProjectEntry): SkillLanding[] =>
    skillLandings(skill.sides.filter((s) => project.sides.includes(s)))
  // A landing that already holds the name: the same test the install refuses by (A4)
  const heldIn = (skill: GlobalSkill, project: ProjectEntry): string[] =>
    held?.skill === skill.name ? (held.holdings[project.path] ?? []) : []
  /** A landing's place in a notice: its side, or for the shared directory the directory itself */
  const where = (l: { dir: string; loaders: AgentSide[] }): string => (l.loaders.length > 1 ? l.dir : l.loaders[0])

  async function install(skill: GlobalSkill, project: ProjectEntry): Promise<void> {
    setOpenFor(null)
    const lands = landingsIn(skill, project)
    if (lands.length === 0) {
      toast('err', t.agents.sideMismatch(project.name))
      return
    }
    // "Same name installed": the blocked notice, and nothing installed into any landing (skill-install::REQ-003/AC-02)
    const holding = lands.filter((l) => heldIn(skill, project).includes(l.dir))
    if (holding.length > 0) {
      for (const l of holding) toast('err', `${skill.name} → ${project.name}(${where(l)}):${errorText(lang, appError(ERR.skillConflict))}`)
      return
    }
    const results = await window.agentshed.installSkill({
      skillName: skill.name,
      sides: lands.flatMap((l) => l.sides),
      targetProjectPath: project.path
    })
    for (const r of results) {
      if (!r.result.ok) {
        toast('err', `${skill.name} → ${project.name}(${where(r)}):${errorText(lang, appError(r.result.reason, r.result.params))}`)
      } else if (r.loaders.length > 1) {
        toast('ok', t.agents.installedShared(skill.name, project.name, r.loaders.map((s) => SIDE_FULL_NAME[s]).join(t.detail.sideJoin)))
      } else {
        toast('ok', t.agents.installed(skill.name, project.name, r.loaders[0]))
      }
    }
  }

  const shown = filterByName(snap.global.skills, kw)

  return (
    <div>
      <SkillSearch
        value={kw}
        onChange={(v) => {
          setKw(v)
          // The popover is a fixed layer positioned from a row's rect, and the row it was measured
          // against may be about to leave the list (spec E8)
          setOpenFor(null)
        }}
      />
      <div className="grp-t">
        {t.agents.skillsHint}
        {snap.sides.grok.detected && <span className="hint2"> · {t.agents.grokBorrowHint}</span>}
      </div>
      {shown.length === 0 ? (
        <Empty msg={t.skills.noNameMatch} />
      ) : (
      <div className="card sk-card">
        {shown.map((s) => (
          <div className="rel" key={s.name}>
            <SkillExpandBlock
              name={s.name}
              source={
                s.origin === 'plugin'
                  ? {
                      kind: 'plugin',
                      // A plugin entry's sides are always its plugin's own one side (plugins-view G4)
                      side: s.sides[0],
                      pluginRoot: s.pluginRoot,
                      bareName: s.pluginSkillName ?? s.name
                    }
                  : { kind: 'global', sides: s.sides }
              }
              symlink={SIDE_ORDER.some((side) => s.symlink[side])}
              levelLabel={s.origin === 'plugin' ? t.agents.levelPluginPkg : t.agents.levelGlobalLib}
              pkgBySide={s.pkg}
              installSlot={
                s.origin === 'disk' ? (
                  <button
                    type="button"
                    className="ins"
                    onClick={(e) => {
                      e.stopPropagation()
                      trigger.current = e.currentTarget
                      setOpenFor(openFor?.skill === s.name ? null : popAt(s.name, e.currentTarget))
                    }}
                  >
                    {t.agents.installTo}
                  </button>
                ) : undefined
              }
            />
            {openFor?.skill === s.name && s.origin === 'disk' && (
              <FloatingBox
                ref={popRef}
                className="pop"
                at={{
                  top: openFor.top,
                  bottom: openFor.bottom,
                  right: openFor.right,
                  maxHeight: openFor.maxHeight
                }}
              >
                <div className="pop-t">{t.agents.pickTarget}</div>
                {targets.map((p) => {
                  const lands = landingsIn(s, p)
                  const has = lands.some((l) => heldIn(s, p).includes(l.dir))
                  return (
                    // A stale project cannot be chosen; one that went stale after this was drawn is refused at
                    // install time (A5)
                    <button className="pop-p" key={p.path} disabled={p.stale} onClick={() => void install(s, p)}>
                      <span className="t">{p.name}</span>
                      {p.stale ? (
                        <span className="pop-why">{t.agents.pickStale}</span>
                      ) : has ? (
                        <span className="pop-have">{t.agents.pickHasSame}</span>
                      ) : null}
                      {/* One mark per landing directory; the shared one an outlined group of its loaders */}
                      <span className="pop-lands">
                        {lands.map((l) =>
                          l.loaders.length > 1 ? (
                            <span key={l.dir} className="pop-shared" title={t.detail.secShared}>
                              {l.loaders.map((side) => (
                                <span key={side} className={`badge ${SIDE_BADGE[side].cls}`}>{SIDE_BADGE[side].label}</span>
                              ))}
                            </span>
                          ) : (
                            <span key={l.dir} className={`badge ${SIDE_BADGE[l.loaders[0]].cls}`}>
                              {SIDE_BADGE[l.loaders[0]].label}
                            </span>
                          )
                        )}
                      </span>
                    </button>
                  )
                })}
              </FloatingBox>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function McpTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const claude = snap.global.mcp.filter((m) => m.side === 'claude')
  const codex = snap.global.mcp.filter((m) => m.side === 'codex')
  return (
    <div>
      <div className="grp-t">
        <span className={`badge ${SIDE_BADGE.claude.cls}`}>{SIDE_CHIP_LABEL.claude}</span> {t.agents.globalMcp}
      </div>
      {claude.length === 0 ? (
        <Empty msg={t.agents.noGlobalMcp} />
      ) : (
        <div className="card">
          {claude.map((m, i) => (
            <McpServerRow key={`${m.name}-${i}`} m={m} />
          ))}
        </div>
      )}
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className={`badge ${SIDE_BADGE.codex.cls}`}>{SIDE_CHIP_LABEL.codex}</span> config.toml [mcp_servers.*]
      </div>
      {codex.length === 0 ? (
        <Empty msg={t.agents.noMcpSection} />
      ) : (
        <div className="card">
          {codex.map((m, i) => (
            <McpServerRow key={`${m.name}-${i}`} m={m} />
          ))}
        </div>
      )}
      <AntigravityMcpGroup snap={snap} />
    </div>
  )
}

/**
 * The Configuration section (agents-overview::REQ-004): CLAUDE.md, and AGENTS.md holding every global AGENTS.md a
 * side loads that exists, in the order the main process sends them. No settings summary for any side.
 */
function CfgTab({ snap }: { snap: Snapshot }): JSX.Element {
  const lang = useLanguage()
  return (
    <ConfigSection
      claudeMd={snap.global.claudeMd === null ? [] : [snap.global.claudeMd]}
      agentsMd={snap.global.agentsMd}
      links={{
        // The global configuration card has no in-app targets wired, so every relative link gets
        // the explicit out-of-scope notice (the invariant's fallback) — onInternal is unreachable
        baseDir: '',
        readable: [],
        onInternal: () => {},
        onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
      }}
    />
  )
}

function Empty({ msg }: { msg: string }): JSX.Element {
  return <div className="none">{msg}</div>
}
