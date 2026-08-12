import { useMemo, useRef, useState } from 'react'
import { renderMarkdown } from './md'
import type { Snapshot } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { GlobalSubagentsTab } from './SubagentsView'
import { GlobalMemoryTab } from './MemoryView'
import { GlobalPluginsTab } from './PluginsView'
import { toast } from './Toast'
import { FloatingBox } from './FloatingBox'
import { useAnchorInvalidation } from './useAnchorInvalidation'
import { SkillExpandBlock } from './SkillExpandBlock'
import { SkillSearch } from './SkillSearch'
import { filterByName } from './skill-filter'
import { errorText } from '@shared/error-text'
import { appError, type AppError } from '@shared/errors'
import { useLanguage, useDict } from './language'

type Tab = 'token' | 'skills' | 'subagents' | 'plugins' | 'mcp' | 'memory' | 'cfg'

export function AgentsPane({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const [tab, setTab] = useState<Tab>('token')
  const clCount = snap.projects.filter((p) => p.sides.includes('claude')).length
  const cxCount = snap.projects.filter((p) => p.sides.includes('codex')).length
  const clSkills = snap.global.skills.filter((s) => s.sides.includes('claude')).length
  const cxSkills = snap.global.skills.filter((s) => s.sides.includes('codex')).length
  const clSubs = snap.global.subagents.filter((s) => s.sides.includes('claude')).length
  const cxSubs = snap.global.subagents.filter((s) => s.sides.includes('codex')).length

  return (
    <div className="pane">
      <header className="pane-head">
        <h1>Agents</h1>
        <div className="stats">
          <SideCard
            label="CLAUDE CODE"
            cls="cl"
            detected={snap.sides.claude.detected}
            error={snap.sides.claude.error}
            total={snap.tokens.bySide.claude.total}
            sub={t.agents.sideSummary(clCount, clSkills, clSubs)}
          />
          <SideCard
            label="CODEX"
            cls="cx"
            detected={snap.sides.codex.detected}
            error={snap.sides.codex.error}
            total={snap.tokens.bySide.codex.total}
            sub={t.agents.sideSummary(cxCount, cxSkills, cxSubs)}
          />
        </div>
        <nav className="tabs">
          {(
            [
              ['token', 'Token'],
              ['skills', 'Skills'],
              ['subagents', 'Subagents'],
              ['plugins', 'Plugins'],
              ['mcp', 'MCP'],
              ['memory', 'Memory'],
              ['cfg', t.agents.tabCfg]
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        {!snap.sides.claude.detected && !snap.sides.codex.detected && (
          <div className="empty">
            <div className="big">🛖</div>
            <div>
              {t.agents.notDetected}
              <br />
              {t.agents.notDetectedHint}
            </div>
          </div>
        )}
        {tab === 'token' && (
          <div>
            <TotalsCards stats={snap.tokens} note={t.agents.totalsNote} />
            <TrendChart stats={snap.tokens} anchor={snap.scannedAt} archivedDays={snap.archivedDays} />
            {snap.archivedDays.length > 0 && (
              <div className="arch-note">
                {t.agents.archivedNote(snap.archivedDays.length, snap.archivedDays[0])}
              </div>
            )}
            <div className="grp-t">{t.agents.byModel}</div>
            <ModelBars stats={snap.tokens} />
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
  total,
  sub
}: {
  label: string
  cls: 'cl' | 'cx'
  detected: boolean
  error?: AppError
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
      {error ? (
        <div className="stat-err">{errorText(lang, appError(error.code, error.params))}</div>
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

  // Repositioned rather than closed on resize: the user is part-way through choosing a target project,
  // and a window resize is not them changing their mind. (The language dropdown already behaved this
  // way; the two are the same kind of thing and now agree.)
  useAnchorInvalidation(openFor !== null, {
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
  const targets = snap.projects
    .filter((p) => !p.stale)
    .sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))

  async function install(skill: (typeof snap.global.skills)[number], projectPath: string): Promise<void> {
    setOpenFor(null)
    const project = snap.projects.find((p) => p.path === projectPath)
    if (!project) return
    const sides = skill.sides.filter((s) => project.sides.includes(s))
    if (sides.length === 0) {
      toast('err', t.agents.sideMismatch(project.name))
      return
    }
    for (const side of sides) {
      const r = await window.agentshed.installSkill({
        skillName: skill.name,
        side,
        targetProjectPath: projectPath
      })
      if (r.ok) toast('ok', t.agents.installed(skill.name, project.name, side))
      else toast('err', `${skill.name} → ${project.name}(${side}):${errorText(lang, appError(r.reason, r.params))}`)
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
                      side: 'claude',
                      pluginRoot: s.pluginRoot,
                      bareName: s.pluginSkillName ?? s.name
                    }
                  : { kind: 'global', sides: s.sides }
              }
              symlink={s.symlink.claude || s.symlink.codex}
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
                className="pop"
                at={{
                  top: openFor.top,
                  bottom: openFor.bottom,
                  right: openFor.right,
                  maxHeight: openFor.maxHeight
                }}
              >
                <div className="pop-t">{t.agents.pickTarget}</div>
                {targets.map((p) => (
                  <button className="pop-p" key={p.path} onClick={() => void install(s, p.path)}>
                    <span className="t">{p.name}</span>
                    <span className="bdg">
                      {p.sides.includes('claude') && <span className="badge cl">CC</span>}
                      {p.sides.includes('codex') && <span className="badge cx">CX</span>}
                    </span>
                  </button>
                ))}
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
  const srcLabel = {
    'global-config': t.agents.srcGlobalConfig,
    plugin: t.agents.srcPlugin,
    'config.toml': 'config.toml'
  }
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> {t.agents.globalMcp}
      </div>
      {claude.length === 0 ? (
        <Empty msg={t.agents.noGlobalMcp} />
      ) : (
        <div className="card">
          {claude.map((m, i) => (
            <div className="it" key={`${m.name}-${i}`}>
              <span className="nm mono">{m.name}</span>
              <span className="src mono">{srcLabel[m.source]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className="badge cx">CODEX</span> config.toml [mcp_servers.*]
      </div>
      {codex.length === 0 ? (
        <Empty msg={t.agents.noMcpSection} />
      ) : (
        <div className="card">
          {codex.map((m, i) => (
            <div className="it" key={`${m.name}-${i}`}>
              <span className="nm mono">{m.name}</span>
              <span className="src mono">config.toml</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CfgTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const [which, setWhich] = useState<'cl' | 'cx' | 'toml'>('cl')
  const html = useMemo(() => {
    const md =
      which === 'cl' ? snap.global.claudeGlobalMd : which === 'cx' ? snap.global.codexAgentsMd : null
    if (md === null) return null
    // The truncation marker is appended by the renderer in the current language (ticket 07): the main
    // process only reports whether it was truncated
    return renderMarkdown(md.truncated ? `${md.text}\n${t.placeholder.truncated}` : md.text)
  }, [which, snap, t])
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['cl', t.agents.cfgClaudeMd],
            ['cx', t.agents.cfgAgentsMd],
            ['toml', t.agents.cfgToml]
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      {which === 'toml' ? (
        snap.global.codexConfigSummary === null ? (
          <Empty msg={t.agents.tomlMissing} />
        ) : (
          <pre className="md mono">
            {t.codexConfig(
              snap.global.codexConfigSummary.model ?? t.placeholder.notSet,
              snap.global.codexConfigSummary.projectCount,
              snap.global.codexConfigSummary.mcpCount
            )}
          </pre>
        )
      ) : html === null ? (
        <Empty msg={t.agents.fileMissing} />
      ) : (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

function Empty({ msg }: { msg: string }): JSX.Element {
  return <div className="none">{msg}</div>
}
