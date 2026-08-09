import { useMemo, useState } from 'react'
import { renderMarkdown } from './md'
import type { Snapshot } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { GlobalSubagentsTab } from './SubagentsView'
import { GlobalMemoryTab } from './MemoryView'
import { GlobalPluginsTab } from './PluginsView'
import { toast } from './Toast'
import { SkillExpandBlock } from './SkillExpandBlock'
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

function SkillsTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [openFor, setOpenFor] = useState<string | null>(null)
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

  return (
    <div>
      <div className="grp-t">
        {t.agents.skillsHint}
      </div>
      <div className="card sk-card">
        {snap.global.skills.map((s) => (
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
                      setOpenFor(openFor === s.name ? null : s.name)
                    }}
                  >
                    {t.agents.installTo}
                  </button>
                ) : undefined
              }
            />
            {openFor === s.name && s.origin === 'disk' && (
              <div className="pop">
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
              </div>
            )}
          </div>
        ))}
      </div>
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
