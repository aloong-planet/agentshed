import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import type { ProjectDetail, ProjectSkillEntry, Snapshot } from '@shared/domain'
import { emptyTokenStats } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { fmtAgo } from './ProjectsPane'

type Tab = 'ov' | 'skills' | 'plugins' | 'mcp' | 'cfg' | 'arts'

export function DetailPane({ snap, path }: { snap: Snapshot; path: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>('ov')
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const entry = snap.projects.find((p) => p.path === path)

  useEffect(() => {
    setDetail(null)
    let alive = true
    void window.agentshed.getProjectDetail(path).then((d) => {
      if (alive) setDetail(d)
    })
    return () => {
      alive = false
    }
  }, [path, snap.scannedAt])

  if (!entry) return <div className="empty">项目不在快照中(刷新后重试)</div>

  return (
    <div className="pane">
      <header className="pane-head">
        <div className="det-title">
          <h1>{entry.name}</h1>
          {entry.sides.includes('claude') && <span className="badge cl">CLAUDE</span>}
          {entry.sides.includes('codex') && <span className="badge cx">CODEX</span>}
          {entry.stale && <span className="stale-tag">失效</span>}
        </div>
        <div className="det-path mono">{entry.path}</div>
        <nav className="tabs">
          {(
            [
              ['ov', '概览'],
              ['skills', 'Skills'],
              ['plugins', 'Plugins'],
              ['mcp', 'MCP'],
              ['cfg', '配置'],
              ['arts', '产物']
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        {detail === null ? (
          <div className="none">读取中…</div>
        ) : (
          <>
            {tab === 'ov' && <OverviewTab detail={detail} snap={snap} />}
            {tab === 'skills' && <SkillsTab detail={detail} />}
            {tab === 'plugins' && <PluginsTab snap={snap} />}
            {tab === 'mcp' && <McpTab detail={detail} />}
            {tab === 'cfg' && <CfgTab detail={detail} />}
            {tab === 'arts' && (
              <div className="empty">
                <div className="big">📚</div>
                <div>产物(票 05 填充)</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({ detail, snap }: { detail: ProjectDetail; snap: Snapshot }): JSX.Element {
  const stats = detail.stats ?? { tokens: emptyTokenStats(), sessions: [] }
  return (
    <div>
      <TotalsCards stats={stats.tokens} />
      <TrendChart stats={stats.tokens} anchor={snap.scannedAt} />
      <div className="grp-t">按模型拆分</div>
      <ModelBars stats={stats.tokens} />
      <div className="grp-t">会话(主线程,元数据即止;subagent 计 token 不列出)</div>
      {stats.sessions.length === 0 ? (
        <div className="none">该项目暂无会话</div>
      ) : (
        <div className="card">
          {stats.sessions.map((s, i) => (
            <div className="se" key={i}>
              <span className={`badge ${s.side === 'claude' ? 'cl' : 'cx'}`}>
                {s.side === 'claude' ? 'CL' : 'CX'}
              </span>
              <span className="t">{s.title}</span>
              <span className="tok">{fmtTok(s.tokens)}</span>
              <span className="d">{fmtAgo(s.at, snap.scannedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SkillRow({ s }: { s: ProjectSkillEntry }): JSX.Element {
  return (
    <div className={`it ${s.shadowed ? 'shadowed' : ''}`}>
      <span className="nm mono">{s.name}</span>
      <span className={`pill ${s.level === 'project' ? 'prj' : 'glb'}`}>
        {s.level === 'project' ? '项目级' : '全局'}
      </span>
      {s.symlink && <span className="pill ln">⤷ 软链</span>}
      {s.shadows && <span className="pill shadow">遮蔽全局</span>}
      {s.shadowed && <span className="pill shadow">被项目级遮蔽</span>}
      <span className="ds">{s.description ?? ''}</span>
    </div>
  )
}

function SkillsTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const groups = useMemo(() => {
    const g = {
      clProject: [] as ProjectSkillEntry[],
      clGlobal: [] as ProjectSkillEntry[],
      cxProject: [] as ProjectSkillEntry[],
      cxGlobal: [] as ProjectSkillEntry[]
    }
    for (const s of detail.skills) {
      if (s.side === 'claude') (s.level === 'project' ? g.clProject : g.clGlobal).push(s)
      else (s.level === 'project' ? g.cxProject : g.cxGlobal).push(s)
    }
    return g
  }, [detail])
  const section = (title: string, items: ProjectSkillEntry[]): JSX.Element | null =>
    items.length === 0 ? null : (
      <div key={title}>
        <div className="grp-t">{title}({items.length})</div>
        <div className="card">
          {items.map((s) => (
            <SkillRow key={`${s.side}-${s.level}-${s.name}`} s={s} />
          ))}
        </div>
      </div>
    )
  const any = detail.skills.length > 0
  return (
    <div>
      {section('项目级 · .claude/skills', groups.clProject)}
      {section('全局层 · Claude', groups.clGlobal)}
      {section('项目级 · .agents/skills', groups.cxProject)}
      {section('全局层 · Codex', groups.cxGlobal)}
      {!any && <div className="none">该项目无生效 skills</div>}
    </div>
  )
}

function PluginsTab({ snap }: { snap: Snapshot }): JSX.Element {
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> plugins(user-scope 全局,生效于所有项目;只读)
      </div>
      {snap.global.plugins.length === 0 ? (
        <div className="none">未安装任何 plugin</div>
      ) : (
        <div className="card">
          {snap.global.plugins.map((p) => (
            <div className="it" key={p.name}>
              <span className="nm mono">{p.name}</span>
              <span className={`pill ${p.enabled ? 'on' : 'off'}`}>{p.enabled ? '已启用' : '未启用'}</span>
              <span className="ds">scope: {p.scope ?? '—'}</span>
              <span className="src mono">{p.version ? `v${p.version}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function McpTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  return (
    <div>
      <div className="grp-t">项目级 · .mcp.json(enabled/disabled 来自项目设置)</div>
      {detail.mcp.length === 0 ? (
        <div className="none">项目无 .mcp.json;全局 MCP 见 Agents 页</div>
      ) : (
        <div className="card">
          {detail.mcp.map((m) => (
            <div className="it" key={m.name}>
              <span className="nm mono">{m.name}</span>
              <span className={`pill ${m.enabled === true ? 'on' : m.enabled === false ? 'off' : 'glb'}`}>
                {m.enabled === true ? '已启用' : m.enabled === false ? '已禁用' : '默认'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CfgTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const [which, setWhich] = useState<'cl' | 'cx' | 'settings'>('cl')
  const html = useMemo(() => {
    const md = which === 'cl' ? detail.configs.claudeMd : which === 'cx' ? detail.configs.agentsMd : null
    return md === null ? null : marked.parse(md, { async: false })
  }, [which, detail])
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['cl', 'CLAUDE.md'],
            ['cx', 'AGENTS.md'],
            ['settings', 'settings 摘要']
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      {which === 'settings' ? (
        detail.configs.settingsSummary === null ? (
          <div className="none">项目键无可展示设置</div>
        ) : (
          <pre className="md mono">{detail.configs.settingsSummary}</pre>
        )
      ) : html === null ? (
        <div className="none">文件不存在</div>
      ) : (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}
