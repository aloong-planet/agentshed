// Subagents 分栏(spec: subagents-memory-plugin):全局 tab + 定义抽屉。
// 承载结构按原型裁决:点行直开抽屉;双端切换在抽屉内原地刷新,不关闭抽屉。
import { useEffect, useState } from 'react'
import type {
  AgentSide,
  ProjectDetail,
  ProjectSubagentEntry,
  Snapshot,
  SubagentEntry,
  SubagentSideDetail
} from '@shared/domain'
import type { Locale } from '@shared/i18n'
import { useDict, useLanguage } from './language'
import { ERR, appError } from '@shared/errors'
import { errorText } from '@shared/error-text'

export function GlobalSubagentsTab({ snap }: { snap: Snapshot }): JSX.Element {
  const [open, setOpen] = useState<SubagentEntry | null>(null)
  if (snap.global.subagents.length === 0)
    return <div className="none">两侧均无 subagent 定义(~/.claude/agents 与 ~/.codex/agents)</div>
  return (
    <div>
      <div className="grp-t">双端合并单列 · 同名一行(不做内容 diff) · 点条目看完整定义</div>
      <div className="card">
        {snap.global.subagents.map((s) => (
          <button className="it row-btn" key={s.name} onClick={() => setOpen(s)}>
            <span className="nm mono">{s.name}</span>
            <span className="bdg">
              {s.sides.includes('claude') ? <span className="badge cl">CC</span> : <span className="badge miss">—</span>}
              {s.sides.includes('codex') ? <span className="badge cx">CX</span> : <span className="badge miss">—</span>}
            </span>
            <SubagentFlags s={s} />
            <span className="ds">{s.description ?? '(无 description)'}</span>
          </button>
        ))}
      </div>
      {open && <SubagentDrawer entry={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** 详情页生效视图 tab:两侧均为项目级遮蔽(与 skills 的 Codex 共存不同,见 domain 注释) */
export function ProjectSubagentsTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const t = useDict()
  const [open, setOpen] = useState<ProjectSubagentEntry | null>(null)
  if (detail.subagents.length === 0)
    return <div className="none">项目级与全局层均无 subagent 定义</div>
  return (
    <div>
      <div className="grp-t">生效视图 · Claude/Codex 均为项目级遮蔽 · 点条目看完整定义</div>
      <div className="card">
        {detail.subagents.map((s, i) => (
          <button
            className={`it row-btn ${s.shadowed ? 'shadowed' : ''}`}
            key={`${s.side}-${s.level}-${s.name}-${i}`}
            onClick={() => setOpen(s)}
          >
            <span className="nm mono">{s.name}</span>
            <span className={`badge ${s.side === 'claude' ? 'cl' : 'cx'}`}>
              {s.side === 'claude' ? 'CC' : 'CX'}
            </span>
            <span className={`pill ${s.level === 'project' ? 'prj' : 'glb'}`}>
              {s.level === 'project' ? '项目级' : '全局'}
            </span>
            {s.detail.error && (
              <span className="pill warn">{errLabel(s.detail.error, t)}</span>
            )}
            {s.overridesBuiltin && <span className="pill warn">覆盖内置</span>}
            {s.shadows && <span className="pill shadow">遮蔽同名</span>}
            {s.shadowed && <span className="pill shadow">被项目级遮蔽</span>}
            <span className="ds">{s.description ?? ''}</span>
          </button>
        ))}
      </div>
      {open && (
        <SubagentDrawer
          entry={toDrawerEntry(open)}
          meta={`${open.level === 'project' ? '项目级' : '全局'} · ${open.side === 'claude' ? 'Claude' : 'Codex'}${open.shadows ? ' · 压过同名低层定义' : ''}${open.shadowed ? ' · 被项目级定义遮蔽(未生效)' : ''}`}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function toDrawerEntry(p: ProjectSubagentEntry): SubagentEntry {
  return {
    name: p.name,
    sides: [p.side],
    description: p.description,
    claude: p.side === 'claude' ? p.detail : null,
    codex: p.side === 'codex' ? p.detail : null,
    overridesBuiltin: p.overridesBuiltin
  }
}

/**
 * 失败类别 → 展示标签。
 *
 * **按类别判,不按措辞判**:早先这里写的是 `error.includes('不可读')`,
 * 措辞一改该分支就静默失效、且没有任何测试会红(ADR-0015 点名的隐患)。
 * 现在类别是语言无关的枚举,措辞怎么改都不影响分支。
 */
export function errLabel(err: SubagentSideDetail['error'], t: Locale): string {
  return err?.code === ERR.subagentUnreadable ? t.subagentError.unreadable : t.subagentError.parseFailed
}

export function SubagentFlags({ s }: { s: { overridesBuiltin?: boolean; claude?: SubagentSideDetail | null; codex?: SubagentSideDetail | null } }): JSX.Element {
  const t = useDict()
  const side = s.claude?.error ? s.claude : s.codex
  const err = side?.error
  return (
    <>
      {err && <span className="pill warn">{errLabel(err, t)}</span>}
      {s.overridesBuiltin && <span className="pill warn">覆盖内置</span>}
    </>
  )
}

/** 定义抽屉:kv 元数据 + 原文;双端条目在抽屉内切侧,原地刷新 */
export function SubagentDrawer({
  entry,
  onClose,
  meta
}: {
  entry: SubagentEntry
  onClose: () => void
  /** 额外元信息行(详情页生效视图用:来源层级/遮蔽说明) */
  meta?: string
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const both = entry.claude !== null && entry.codex !== null
  const [side, setSide] = useState<AgentSide>(entry.claude ? 'claude' : 'codex')
  const cur = side === 'claude' ? entry.claude : entry.codex
  useEffect(() => {
    // 原型确认交互:Esc 与遮罩点击等价关闭
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="drawer">
        <h2 className="mono">{entry.name}</h2>
        <div className="meta">{meta ?? entry.description ?? ''}</div>
        {both && (
          <div className="sideseg">
            <button className={side === 'claude' ? 'on' : ''} onClick={() => setSide('claude')}>
              Claude(.md)
            </button>
            <button className={side === 'codex' ? 'on' : ''} onClick={() => setSide('codex')}>
              Codex(.toml)
            </button>
          </div>
        )}
        {cur === null ? (
          <div className="none">该侧无定义</div>
        ) : cur.error !== null ? (
          <div className="none">{t.subagentError.detail(errorText(lang, appError(cur.error.code, cur.error.params)))}</div>
        ) : (
          <>
            <div className="kv">
              {side === 'claude' ? (
                <>
                  <span className="k2">tools</span>
                  <span>{cur.tools ?? '—'}</span>
                  <span className="k2">model</span>
                  <span>{cur.model ?? '—(继承)'}</span>
                </>
              ) : (
                <>
                  <span className="k2">model</span>
                  <span>{cur.model ?? '—'}</span>
                  <span className="k2">sandbox_mode</span>
                  <span>{cur.sandbox ?? '—'}</span>
                </>
              )}
            </div>
            {cur.content !== null && (
              <div className="raw mono">
                {cur.content.truncated
                  ? `${cur.content.text}\n${t.placeholder.truncated}`
                  : cur.content.text}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
