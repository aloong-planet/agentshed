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
import { SIDE_BADGE, SIDE_ORDER, SIDE_SHORT_NAME } from './side-badge'

/** The sides whose definitions are read, each with its definition format (Grok's are not parsed: no sample) */
const DEFINITION_FORMAT = { claude: '.md', codex: '.toml', antigravity: '.md' } as const
type DefinitionSide = keyof typeof DEFINITION_FORMAT
const DEFINITION_SIDES = SIDE_ORDER.filter((s): s is DefinitionSide => s in DEFINITION_FORMAT)
/** The project-level directory each of those sides reads (subagents-view; Antigravity's, REQ-001/AC-01) */
const PROJECT_AGENTS_DIR: Record<DefinitionSide, string> = {
  claude: '.claude/agents',
  codex: '.codex/agents',
  antigravity: '.agents/agents'
}

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
              {DEFINITION_SIDES.map((side) =>
                s.sides.includes(side) ? (
                  <span key={side} className={`badge ${SIDE_BADGE[side].cls}`}>{SIDE_BADGE[side].label}</span>
                ) : (
                  <span key={side} className="badge miss"><Minus size={10} /></span>
                )
              )}
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

/** The detail page's effective view tab, grouped as the confirmed prototype draws it: each side's project level, then
 * each side's global level. Claude and Codex shadow at the project level (unlike skills' Codex coexistence, see the
 * comments in domain); Antigravity rows carry no shadowing (subagents-view::REQ-001/AC-05) */
export function ProjectSubagentsTab({ detail }: { detail: ProjectDetail }): JSX.Element {
  const t = useDict()
  const [open, setOpen] = useState<ProjectSubagentEntry | null>(null)
  if (detail.subagents.length === 0)
    return <div className="none">{t.subagents.noneProject}</div>
  const groups = (['project', 'global'] as const).flatMap((level) =>
    SIDE_ORDER.map((side) => ({
      level,
      side,
      items: detail.subagents.filter((s) => s.level === level && s.side === side)
    }))
  ).filter((g) => g.items.length > 0)
  const heading = (level: 'project' | 'global', side: AgentSide): string =>
    level === 'project'
      ? t.subagents.projectGroup(side in PROJECT_AGENTS_DIR ? PROJECT_AGENTS_DIR[side as DefinitionSide] : SIDE_SHORT_NAME[side])
      : t.subagents.globalGroup(SIDE_SHORT_NAME[side])
  return (
    <div>
      <div className="grp-t">{t.subagents.projectHint}</div>
      {groups.map((g) => (
        <div key={`${g.level}-${g.side}`}>
          <div className="grp-t">{heading(g.level, g.side)}({g.items.length})</div>
          <div className="card">
            {g.items.map((s, i) => (
              <button
                className={`it row-btn ${s.shadowed ? 'shadowed' : ''}`}
                key={`${s.side}-${s.level}-${s.name}-${i}`}
                onClick={() => setOpen(s)}
              >
                <span className="nm mono">{s.name}</span>
                <span className={`badge ${SIDE_BADGE[s.side].cls}`}>
                  {SIDE_BADGE[s.side].label}
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
        </div>
      ))}
      {open && (
        <SubagentDrawer
          entry={toDrawerEntry(open)}
          meta={`${open.level === 'project' ? t.subagents.levelProject : t.subagents.levelGlobal} · ${SIDE_SHORT_NAME[open.side]}${open.shadows ? t.subagents.metaShadows : ''}${open.shadowed ? t.subagents.metaShadowed : ''}`}
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
    antigravity: p.side === 'antigravity' ? p.detail : null,
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

export function SubagentFlags({ s }: { s: SubagentEntry }): JSX.Element {
  const t = useDict()
  // The first side, in side order, whose definition carries an error
  const err = DEFINITION_SIDES.map((side) => s[side]?.error ?? null).find((e) => e !== null)
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
  // The sides that define this name, in side order; one of them is shown, the switch appearing for two or more
  const defined = DEFINITION_SIDES.filter((s) => entry[s] !== null)
  const [side, setSide] = useState<DefinitionSide>(defined[0] ?? 'claude')
  const cur = entry[side]
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
        {defined.length > 1 && (
          <div className="sideseg">
            {defined.map((s) => (
              <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
                {SIDE_SHORT_NAME[s]}({DEFINITION_FORMAT[s]})
              </button>
            ))}
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
              ) : side === 'codex' ? (
                <>
                  <span className="k2">model</span>
                  <span>{cur.model ?? '—'}</span>
                  <span className="k2">sandbox_mode</span>
                  <span>{cur.sandbox ?? '—'}</span>
                </>
              ) : (
                // The front matter keys agy reads, as written; an absent model claims nothing about agy's default
                <>
                  <span className="k2">tools</span>
                  <span>{cur.tools ?? '—'}</span>
                  <span className="k2">subagent</span>
                  <span>{cur.subagent ?? '—'}</span>
                  <span className="k2">mainAgent</span>
                  <span>{cur.mainAgent ?? '—'}</span>
                  <span className="k2">model</span>
                  <span>{cur.model ?? '—'}</span>
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
