// The Subagents section (spec: subagents-memory-plugin): the global tab + the definition drawer.
// The container structure follows the prototype ruling: clicking a row opens the drawer directly, and
// switching sides refreshes inside the drawer without closing it.
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
import { Minus } from './icons'

export function GlobalSubagentsTab({ snap }: { snap: Snapshot }): JSX.Element {
  const t = useDict()
  const [open, setOpen] = useState<SubagentEntry | null>(null)
  if (snap.global.subagents.length === 0)
    return <div className="none">{t.subagents.noneGlobal}</div>
  return (
    <div>
      <div className="grp-t">{t.subagents.globalHint}</div>
      <div className="card">
        {snap.global.subagents.map((s) => (
          <button className="it row-btn" key={s.name} onClick={() => setOpen(s)}>
            <span className="nm mono">{s.name}</span>
            <span className="bdg">
              {s.sides.includes('claude') ? <span className="badge cl">CC</span> : <span className="badge miss"><Minus size={10} /></span>}
              {s.sides.includes('codex') ? <span className="badge cx">CX</span> : <span className="badge miss"><Minus size={10} /></span>}
            </span>
            <SubagentFlags s={s} />
            <span className="ds">{s.description ?? t.subagents.noDescription}</span>
          </button>
        ))}
      </div>
      {open && <SubagentDrawer entry={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** The detail page's effective view tab: both sides shadow at the project level (unlike skills' Codex
 * coexistence, see the comments in domain) */
export function ProjectSubagentsTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const t = useDict()
  const [open, setOpen] = useState<ProjectSubagentEntry | null>(null)
  if (detail.subagents.length === 0)
    return <div className="none">{t.subagents.noneProject}</div>
  return (
    <div>
      <div className="grp-t">{t.subagents.projectHint}</div>
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
              {s.level === 'project' ? t.subagents.levelProject : t.subagents.levelGlobal}
            </span>
            {s.detail.error && (
              <span className="pill warn">{errLabel(s.detail.error, t)}</span>
            )}
            {s.overridesBuiltin && <span className="pill warn">{t.subagents.overridesBuiltin}</span>}
            {s.shadows && <span className="pill shadow">{t.subagents.shadows}</span>}
            {s.shadowed && <span className="pill shadow">{t.subagents.shadowed}</span>}
            <span className="ds">{s.description ?? ''}</span>
          </button>
        ))}
      </div>
      {open && (
        <SubagentDrawer
          entry={toDrawerEntry(open)}
          meta={`${open.level === 'project' ? t.subagents.levelProject : t.subagents.levelGlobal} · ${open.side === 'claude' ? 'Claude' : 'Codex'}${open.shadows ? t.subagents.metaShadows : ''}${open.shadowed ? t.subagents.metaShadowed : ''}`}
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
 * A failure category → its display label.
 *
 * **Judged by category, not by wording**: this used to read `error.includes('不可读')`,
 * so a wording change would make the branch fail silently with no test going red (the hazard ADR-0015
 * named).
 * The category is now a language-independent enum, so no wording change affects the branch.
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
      {s.overridesBuiltin && <span className="pill warn">{t.subagents.overridesBuiltin}</span>}
    </>
  )
}

/** The definition drawer: key-value metadata + the source; an entry present on both sides switches inside
 * the drawer, refreshing in place */
export function SubagentDrawer({
  entry,
  onClose,
  meta
}: {
  entry: SubagentEntry
  onClose: () => void
  /** Extra metadata rows (used by the detail page's effective view: the source layer and shadowing
   * explanation) */
  meta?: string
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const both = entry.claude !== null && entry.codex !== null
  const [side, setSide] = useState<AgentSide>(entry.claude ? 'claude' : 'codex')
  const cur = side === 'claude' ? entry.claude : entry.codex
  useEffect(() => {
    // The interaction confirmed by the prototype: Esc and clicking the overlay both close it
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
          <div className="none">{t.subagents.noSideDef}</div>
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
                  <span>{cur.model ?? t.subagents.inherited}</span>
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
