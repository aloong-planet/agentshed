import { useMemo, useState } from 'react'
import { renderMarkdown } from './md'
import type { Snapshot } from '@shared/domain'
import { fmtTok, ModelBars, TotalsCards, TrendChart } from './TokenViz'
import { GlobalSubagentsTab } from './SubagentsView'
import { GlobalMemoryTab } from './MemoryView'
import { GlobalPluginsTab } from './PluginsView'
import { toast } from './Toast'
import { SkillExpandBlock } from './SkillExpandBlock'

type Tab = 'token' | 'skills' | 'subagents' | 'plugins' | 'mcp' | 'memory' | 'cfg'

export function AgentsPane({ snap }: { snap: Snapshot }): JSX.Element {
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
            sub={`${clCount} 项目 · ${clSkills} 全局 skills · ${clSubs} subagents`}
          />
          <SideCard
            label="CODEX"
            cls="cx"
            detected={snap.sides.codex.detected}
            error={snap.sides.codex.error}
            total={snap.tokens.bySide.codex.total}
            sub={`${cxCount} 项目 · ${cxSkills} 全局 skills · ${cxSubs} subagents`}
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
        {!snap.sides.claude.detected && !snap.sides.codex.detected && (
          <div className="empty">
            <div className="big">🛖</div>
            <div>
              本机未检测到 Claude Code 或 Codex 的数据目录
              <br />
              安装并使用任一 agent 后,点 rail 底部 ↻ 刷新即可看到全景
            </div>
          </div>
        )}
        {tab === 'token' && (
          <div>
            <TotalsCards stats={snap.tokens} note="含已隐藏/失效项目" />
            <TrendChart stats={snap.tokens} anchor={snap.scannedAt} archivedDays={snap.archivedDays} />
            {snap.archivedDays.length > 0 && (
              <div className="arch-note">
                其中 {snap.archivedDays.length} 天(最早 {snap.archivedDays[0]})源会话文件已被 agent
                自动清理,数值来自本地归档(斜纹柱)
              </div>
            )}
            <div className="grp-t">按模型拆分(跨项目;Codex 侧为会话主模型近似)</div>
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
  const [openFor, setOpenFor] = useState<string | null>(null)
  if (snap.global.skills.length === 0) return <Empty msg="两侧全局库均为空" />
  const targets = snap.projects
    .filter((p) => !p.stale)
    .sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))

  async function install(skill: (typeof snap.global.skills)[number], projectPath: string): Promise<void> {
    setOpenFor(null)
    const project = snap.projects.find((p) => p.path === projectPath)
    if (!project) return
    const sides = skill.sides.filter((s) => project.sides.includes(s))
    if (sides.length === 0) {
      toast('err', `${project.name} 不属于该 skill 所在的 agent 侧`)
      return
    }
    for (const side of sides) {
      const r = await window.agentshed.installSkill({
        skillName: skill.name,
        side,
        targetProjectPath: projectPath
      })
      if (r.ok) toast('ok', `已安装 ${skill.name} → ${project.name}(${side});仅局部刷新该项目`)
      else toast('err', `${skill.name} → ${project.name}(${side}):${r.message}`)
    }
  }

  return (
    <div>
      <div className="grp-t">
        合并单列 · 点行展开包内文件 · 点文件预览 · 无跨侧 diff · 插件只读
      </div>
      <div className="card sk-card">
        {snap.global.skills.map((s) => (
          <div className="rel" key={s.name}>
            <SkillExpandBlock
              name={s.name}
              sides={s.sides}
              origin={s.origin}
              symlink={s.symlink.claude || s.symlink.codex}
              scope="global"
              levelLabel="全局库"
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
                    安装到…
                  </button>
                ) : undefined
              }
            />
            {openFor === s.name && s.origin === 'disk' && (
              <div className="pop">
                <div className="pop-t">选择目标项目(复制落地;失效项目已排除)</div>
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
    return renderMarkdown(md)
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
