// Plugins 分栏(spec: subagents-memory-plugin 序列 E/F)。
// 按侧分组两个 section,不做同名跨侧合并(E9);
// Claude 组:全局页启用口径=user 层(E4),详情页=有效启用集 local > project > user(F1),
//   行点击展开内含组件(E5),installPath 缺失降级(E6),hooks 仅事件摘要(E7);
// Codex 组:探测式(缓存空则整组不显示),仅列存在,启用态/展开不建模(E8)。
import { useState } from 'react'
import type { PluginContents, PluginInstallRecord, ProjectDetail, Snapshot } from '@shared/domain'

/** 路径尾段(renderer 无 node:path;显示用途,不做规范化) */
function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

function installsSummary(installs: PluginInstallRecord[]): string {
  const parts = installs.map((r) =>
    r.projectPath
      ? `${r.scope} · ${basename(r.projectPath)}${r.projectMissing ? '(项目已失联)' : ''}`
      : r.scope
  )
  const head = parts.join(' / ')
  return installs.length > 1 ? `${head} · ${installs.length} 条安装记录` : head
}

/** 展开区:安装记录 + 内含组件四类(命名空间标注插件 skills) */
function PluginExpand({
  name,
  installs,
  contents
}: {
  name: string
  installs: PluginInstallRecord[]
  contents: PluginContents
}): JSX.Element {
  if (contents.missing)
    return <div className="exp-area none">安装目录缺失(缓存已清理)——仅注册表记录可见,内含组件无法读取</div>
  const ns = name.split('@')[0]
  const empty =
    contents.skills.length === 0 &&
    contents.agents.length === 0 &&
    contents.hooks.length === 0 &&
    contents.mcp.length === 0
  return (
    <div className="exp-area">
      <div className="sect">安装记录</div>
      {installs.map((r, i) => (
        <span className="chip" key={i}>
          {r.scope}
          {r.projectPath ? ` · ${basename(r.projectPath)}` : ''}
          {r.projectMissing ? '(项目已失联)' : ''}
        </span>
      ))}
      {contents.skills.length > 0 && (
        <>
          <div className="sect">内含 skills(命名空间调用)</div>
          {contents.skills.map((s) => (
            <span className="chip" key={s.name} title={s.description ?? undefined}>
              {ns}:{s.name}
            </span>
          ))}
        </>
      )}
      {contents.agents.length > 0 && (
        <>
          <div className="sect">内含 subagents</div>
          {contents.agents.map((a) => (
            <span className="chip" key={a}>
              {a}
            </span>
          ))}
        </>
      )}
      {contents.hooks.length > 0 && (
        <>
          <div className="sect">内含 hooks(事件摘要)</div>
          {contents.hooks.map((h) => (
            <span className="chip" key={h.event}>
              {h.event} × {h.matchers}
            </span>
          ))}
        </>
      )}
      {contents.mcp.length > 0 && (
        <>
          <div className="sect">内含 MCP servers</div>
          {contents.mcp.map((m) => (
            <span className="chip" key={m}>
              {m}
            </span>
          ))}
        </>
      )}
      {empty && <div className="none">四类内含组件均无</div>}
    </div>
  )
}

function CodexGroup({ snap, detailNote }: { snap: Snapshot; detailNote?: boolean }): JSX.Element | null {
  if (snap.global.codexPlugins.length === 0) return null // 探测式:空则整组不显示
  return (
    <>
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className="badge cx">CODEX</span> 缓存枚举
      </div>
      <div className="card">
        {snap.global.codexPlugins.map((p) => (
          <div className="it" key={`${p.marketplace}/${p.name}`}>
            <span className="nm mono">
              {p.name}@{p.marketplace}
            </span>
            <span className="src mono">
              {p.version ? `v${p.version}` : ''}
              {p.cachedVersions > 1 ? `(${p.cachedVersions} 个版本缓存)` : ''}
            </span>
            <span className="ds">仅缓存枚举</span>
          </div>
        ))}
      </div>
      <div className="none" style={{ textAlign: 'left', padding: '4px 2px' }}>
        Codex 组仅列缓存中存在的插件;启用态与内含组件语义未接入
        {detailNote ? ';Codex 插件为全局生效,无项目级启用语义' : ''}。
      </div>
    </>
  )
}

export function GlobalPluginsTab({ snap }: { snap: Snapshot }): JSX.Element {
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
        <span className="badge cl">CLAUDE CODE</span> 启用口径:user 层 · 点条目展开内含组件
      </div>
      {snap.global.plugins.length === 0 ? (
        <div className="none">未安装任何 plugin</div>
      ) : (
        <div className="card">
          {snap.global.plugins.map((p) => (
            <div key={p.name}>
              <button className="it row-btn" onClick={() => toggle(p.name)}>
                <span className="nm mono">{p.name}</span>
                <span className="src mono">{p.version ? `v${p.version}` : ''}</span>
                <span className={`pill ${p.enabled ? 'on' : 'off'}`}>{p.enabled ? '已启用' : '未启用'}</span>
                <span className="ds">{installsSummary(p.installs)}</span>
              </button>
              {expanded.has(p.name) && (
                <PluginExpand name={p.name} installs={p.installs} contents={p.contents} />
              )}
            </div>
          ))}
        </div>
      )}
      <CodexGroup snap={snap} />
    </div>
  )
}

const FROM_LABEL = { local: 'local 层', project: 'project 层', user: 'user 层' } as const

export function ProjectPluginsTab({
  detail,
  snap
}: {
  detail: ProjectDetail
  snap: Snapshot
}): JSX.Element {
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
        <span className="badge cl">CLAUDE CODE</span> 启用口径:本项目有效启用集(local &gt; project &gt; user)
      </div>
      {detail.plugins.length === 0 ? (
        <div className="none">未安装任何 plugin</div>
      ) : (
        <div className="card">
          {detail.plugins.map((p) => (
            <div key={p.name}>
              <button className="it row-btn" onClick={() => toggle(p.name)}>
                <span className="nm mono">{p.name}</span>
                <span className="src mono">{p.version ? `v${p.version}` : ''}</span>
                <span className={`pill ${p.enabled ? 'on' : 'off'}`}>{p.enabled ? '启用' : '未启用'}</span>
                <span className="ds">
                  {p.enabledFrom === null
                    ? '任何层均未提及'
                    : `${p.enabled ? '启用' : '禁用'}判定来自 ${FROM_LABEL[p.enabledFrom]}`}
                  {' · '}
                  {installsSummary(p.installs)}
                </span>
              </button>
              {expanded.has(p.name) && (
                <PluginExpand name={p.name} installs={p.installs} contents={p.contents} />
              )}
            </div>
          ))}
        </div>
      )}
      <CodexGroup snap={snap} detailNote />
    </div>
  )
}
