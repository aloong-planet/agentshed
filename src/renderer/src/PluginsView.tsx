// Plugins 分栏(spec: plugins-view 序列 E/F/H)。
// 按侧分组两个 section,不做同名跨侧合并(E9);
// Claude 组:全局页启用口径=user 层(E4),详情页=有效启用集 local > project > user(F1),
//   安装记录 chips 在行内(E1),行点击展开类目 tab(E5),installPath 缺失降级(E6),
//   hooks 仅事件摘要(E7);Skills tab 可原地预览包,与启用态无关(H 系列,ADR-0012);
// Codex 组:探测式(缓存空则整组不显示),仅 Skills 类目可展开预览(E8)。
import { useState } from 'react'
import type { PluginContents, PluginInstallRecord, ProjectDetail, Snapshot } from '@shared/domain'
import { PluginSkillList } from './PluginSkillList'
import { useDict } from './language'

/** 路径尾段(renderer 无 node:path;显示用途,不做规范化) */
function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/** 安装记录 chips(行内,E1/E2) */
function InstallChips({ installs }: { installs: PluginInstallRecord[] }): JSX.Element {
  const t = useDict()
  return (
    <>
      {installs.map((r, i) => (
        <span className="chip" key={i}>
          {r.scope ?? t.placeholder.unknown}
          {r.projectPath ? ` · ${basename(r.projectPath)}` : ''}
          {r.projectMissing ? t.plugins.projectMissing : ''}
        </span>
      ))}
    </>
  )
}

/** 展开区:类目 tab(Skills/Subagents/Hooks/MCP;空类目不出 tab,默认首个非空,E5) */
function PluginExpand({
  ns,
  side,
  root,
  contents
}: {
  ns: string
  side: 'claude' | 'codex'
  /** 摘要同源包根(H5) */
  root: string | null
  contents: PluginContents
}): JSX.Element {
  const t = useDict()
  const [tab, setTab] = useState(0)
  if (contents.missing)
    return <div className="exp-area none">{t.plugins.installMissing}</div>
  const chips = (names: string[]): JSX.Element => (
    <div className="chips">
      {names.map((n) => (
        <span className="chip" key={n}>
          {n}
        </span>
      ))}
    </div>
  )
  const panels: Array<{ label: string; cnt: number; node: JSX.Element }> = []
  if (contents.skills.length > 0)
    panels.push({
      label: 'Skills',
      cnt: contents.skills.length,
      node: <PluginSkillList ns={ns} side={side} root={root} skills={contents.skills} />
    })
  if (contents.agents.length > 0)
    panels.push({ label: 'Subagents', cnt: contents.agents.length, node: chips(contents.agents) })
  if (contents.hooks.length > 0)
    panels.push({
      label: 'Hooks',
      cnt: contents.hooks.length,
      node: chips(contents.hooks.map((h) => `${h.event} × ${h.matchers}`))
    })
  if (contents.mcp.length > 0)
    panels.push({ label: 'MCP', cnt: contents.mcp.length, node: chips(contents.mcp) })
  if (panels.length === 0) return <div className="exp-area none">{t.plugins.noBundled}</div>
  const cur = Math.min(tab, panels.length - 1)
  return (
    <div className="exp-area">
      <div className="ptabs">
        {panels.map((pa, i) => (
          <button
            type="button"
            key={pa.label}
            className={`ptab ${i === cur ? 'on' : ''}`}
            onClick={() => setTab(i)}
          >
            {pa.label}
            <span className="cnt">{pa.cnt}</span>
          </button>
        ))}
      </div>
      {panels[cur].node}
    </div>
  )
}

function CodexGroup({ snap, detailNote }: { snap: Snapshot; detailNote?: boolean }): JSX.Element | null {
  const t = useDict()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (snap.global.codexPlugins.length === 0) return null // 探测式:空则整组不显示
  function toggle(key: string): void {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }
  return (
    <>
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className="badge cx">CODEX</span> {t.plugins.codexCacheEnum}
      </div>
      <div className="card plug-card">
        {snap.global.codexPlugins.map((p) => {
          const key = `${p.marketplace}/${p.name}`
          const expandable = p.skills.length > 0 // E8:仅 Skills 类目可展开
          const row = (
            <>
              <span className="nm mono">
                {p.name}@{p.marketplace}
              </span>
              <span className="src mono">
                {p.version ? `v${p.version}` : ''}
                {p.cachedVersions > 1 ? t.plugins.cachedVersions(p.cachedVersions) : ''}
              </span>
              <span className="ds">{t.plugins.cacheOnly}</span>
            </>
          )
          return (
            <div key={key}>
              {expandable ? (
                <button className="it row-btn" onClick={() => toggle(key)}>
                  {row}
                </button>
              ) : (
                <div className="it">{row}</div>
              )}
              {expandable && expanded.has(key) && (
                <div className="exp-area">
                  <div className="ptabs">
                    <button type="button" className="ptab on">
                      Skills
                      <span className="cnt">{p.skills.length}</span>
                    </button>
                  </div>
                  <PluginSkillList ns={p.name} side="codex" root={p.root} skills={p.skills} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
        {t.plugins.codexFoot}
        {detailNote ? t.plugins.codexFootDetail : ''}
      </div>
    </>
  )
}

export function GlobalPluginsTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(name: string): void {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> {t.plugins.claudeGlobalHint}
      </div>
      {snap.global.plugins.length === 0 ? (
        <div className="none">{t.plugins.noPlugins}</div>
      ) : (
        <div className="card plug-card">
          {snap.global.plugins.map((p) => (
            <div key={p.name}>
              <button className="it row-btn" onClick={() => toggle(p.name)}>
                <span className="nm mono">{p.name}</span>
                <span className="src mono">{p.version ? `v${p.version}` : ''}</span>
                <span className={`pill ${p.enabled ? 'on' : 'off'}`}>{p.enabled ? t.plugins.enabled : t.plugins.notEnabled}</span>
                <InstallChips installs={p.installs} />
              </button>
              {expanded.has(p.name) && (
                <PluginExpand
                  ns={p.name.split('@')[0]}
                  side="claude"
                  root={p.installPath}
                  contents={p.contents}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <CodexGroup snap={snap} />
    </div>
  )
}



export function ProjectPluginsTab({
  detail,
  snap
}: {
  detail: ProjectDetail
  snap: Snapshot
}): JSX.Element {
  const t = useDict()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggle(name: string): void {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }
  return (
    <div>
      <div className="grp-t">
        <span className="badge cl">CLAUDE CODE</span> {t.plugins.claudeProjectHint}
      </div>
      {detail.plugins.length === 0 ? (
        <div className="none">{t.plugins.noPlugins}</div>
      ) : (
        <div className="card plug-card">
          {detail.plugins.map((p) => (
            <div key={p.name}>
              <button className="it row-btn" onClick={() => toggle(p.name)}>
                <span className="nm mono">{p.name}</span>
                <span className="src mono">{p.version ? `v${p.version}` : ''}</span>
                <span className={`pill ${p.enabled ? 'on' : 'off'}`}>{p.enabled ? t.plugins.enabledShort : t.plugins.notEnabled}</span>
                <InstallChips installs={p.installs} />
                <span className="ds">
                  {p.enabledFrom === null
                    ? t.plugins.noLayerMentions
                    : t.plugins.verdictFrom(
                        p.enabled ? t.plugins.enabledShort : t.plugins.disabledShort,
                        p.enabledFrom === 'local'
                          ? t.plugins.layerLocal
                          : p.enabledFrom === 'project'
                            ? t.plugins.layerProject
                            : t.plugins.layerUser
                      )}
                </span>
              </button>
              {expanded.has(p.name) && (
                <PluginExpand
                  ns={p.name.split('@')[0]}
                  side="claude"
                  root={p.installPath}
                  contents={p.contents}
                />
              )}
            </div>
          ))}
        </div>
      )}
      <CodexGroup snap={snap} detailNote />
    </div>
  )
}
