import { useMemo, useState } from 'react'
import { marked } from 'marked'
import type { Snapshot } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'

type Tab = 'token' | 'skills' | 'plugins' | 'mcp' | 'cfg'

export function AgentsPane({ snap }: { snap: Snapshot }): JSX.Element {
  const [tab, setTab] = useState<Tab>('token')
  const clCount = snap.projects.filter((p) => p.sides.includes('claude')).length
  const cxCount = snap.projects.filter((p) => p.sides.includes('codex')).length
  const clSkills = snap.global.skills.filter((s) => s.sides.includes('claude')).length
  const cxSkills = snap.global.skills.filter((s) => s.sides.includes('codex')).length

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
            sub={`${clCount} 项目 · ${clSkills} 全局 skills`}
          />
          <SideCard
            label="CODEX"
            cls="cx"
            detected={snap.sides.codex.detected}
            error={snap.sides.codex.error}
            total={snap.tokens.bySide.codex.total}
            sub={`${cxCount} 项目 · ${cxSkills} 全局 skills`}
          />
        </div>
        <nav className="tabs">
          {(
            [
              ['token', 'Token'],
              ['skills', 'Skills(全局库)'],
              ['plugins', 'Plugins'],
              ['mcp', 'MCP'],
              ['cfg', '配置']
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="pane-body">
        {tab === 'token' && (
          <div>
            <TotalsCards stats={snap.tokens} note="含已隐藏/失效项目" />
            <TrendChart stats={snap.tokens} anchor={snap.scannedAt} />
            <div className="grp-t">按模型拆分(跨项目;Codex 侧为会话主模型近似)</div>
            <ModelBars stats={snap.tokens} />
          </div>
        )}
        {tab === 'skills' && <SkillsTab snap={snap} />}
        {tab === 'plugins' && <PluginsTab snap={snap} />}
        {tab === 'mcp' && <McpTab snap={snap} />}
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
  error?: string
  total: number
  sub: string
}): JSX.Element {
  return (
    <div className="stat">
      <div className="k">
        <span className={`badge ${cls}`}>{label}</span>
        {detected ? '已检测' : '未检测到'}
      </div>
      <div className="v">{fmtTok(total)}</div>
      {error ? <div className="stat-err">注册表异常:{error}</div> : <div className="s">{sub}</div>}
    </div>
  )
}

function SkillsTab({ snap }: { snap: Snapshot }): JSX.Element {
  if (snap.global.skills.length === 0) return <Empty msg="两侧全局库均为空" />
  return (
    <div>
      <div className="grp-t">合并单列 · 徽标=该侧是否存在 · 安装源(只读)</div>
      <div className="card">
        {snap.global.skills.map((s) => (
          <div className="it" key={s.name}>
            <span className="nm mono">{s.name}</span>
            <span className="bdg">
              {s.sides.includes('claude') ? <span className="badge cl">CL</span> : <span className="badge miss">—</span>}
              {s.sides.includes('codex') ? <span className="badge cx">CX</span> : <span className="badge miss">—</span>}
            </span>
            {(s.symlink.claude || s.symlink.codex) && <span className="pill ln">⤷ 软链</span>}
            {s.differs && <span className="diff">两侧有差异</span>}
            <span className="ds">{s.description ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PluginsTab({ snap }: { snap: Snapshot }): JSX.Element {
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> plugins(user-scope 全局,只读)
      </div>
      {snap.global.plugins.length === 0 ? (
        <Empty msg="未安装任何 plugin" />
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
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className="badge cx">CODEX</span>
      </div>
      <div className="none">Codex 无 plugins 概念,该分组仅 Claude 侧显示</div>
    </div>
  )
}

function McpTab({ snap }: { snap: Snapshot }): JSX.Element {
  const claude = snap.global.mcp.filter((m) => m.side === 'claude')
  const codex = snap.global.mcp.filter((m) => m.side === 'codex')
  const srcLabel = { 'global-config': '全局配置', plugin: 'plugin 自带', 'config.toml': 'config.toml' }
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> 全局 MCP
      </div>
      {claude.length === 0 ? (
        <Empty msg="无全局 MCP(项目级 .mcp.json 的归属在项目详情)" />
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
        <Empty msg="config.toml 无 mcp_servers 段" />
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
  const [which, setWhich] = useState<'cl' | 'cx' | 'toml'>('cl')
  const html = useMemo(() => {
    const md =
      which === 'cl' ? snap.global.claudeGlobalMd : which === 'cx' ? snap.global.codexAgentsMd : null
    if (md === null) return null
    return marked.parse(md, { async: false })
  }, [which, snap])
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['cl', '全局 CLAUDE.md'],
            ['cx', '全局 AGENTS.md'],
            ['toml', 'config.toml 摘要']
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      {which === 'toml' ? (
        snap.global.codexConfigSummary === null ? (
          <Empty msg="config.toml 不存在" />
        ) : (
          <pre className="md mono">{snap.global.codexConfigSummary}</pre>
        )
      ) : html === null ? (
        <Empty msg="文件不存在" />
      ) : (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

function Empty({ msg }: { msg: string }): JSX.Element {
  return <div className="none">{msg}</div>
}
