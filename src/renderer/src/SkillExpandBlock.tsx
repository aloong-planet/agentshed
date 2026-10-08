// skills-view: a skill expands into a file table and clicking a file opens a drawer (on-disk and plugin
// entries on equal footing, A4/ADR-0012)
import { useEffect, useState } from 'react'
import type { AgentSide, SkillPkgStats } from '@shared/domain'
import type { ListSkillFilesArgs, SkillFileEntry } from '@shared/ipc'
import { NameReveal } from './NameReveal'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { useLanguage, useDict } from './language'
import { ChevronRight, Dot, Minus } from './icons'
import { SIDE_BADGE, SIDE_ORDER, SIDE_SHORT_NAME } from './side-badge'
import { useSkillFilesQuery } from './skill-files-query'

/**
 * The enumeration source (a discriminated union): each of the three sources has its required fields
 * pinned by the type, rather than relying on a convention about which optional props
 * are occupied (scope=plugin must carry pluginRoot, and so on). A new source = one more variant.
 */
export type SkillSource =
  | { kind: 'global'; sides: AgentSide[]; fixedSide?: AgentSide }
  | { kind: 'project'; side: AgentSide; projectPath: string }
  | {
      kind: 'plugin'
      side: AgentSide
      /** The summary-source package root (plugins-view H5); null = not expandable (a fail-closed display) */
      pluginRoot: string | null
      /** The bare skill name (sent down with the entry by the data layer, not parsed back out of the
       * namespaced name) */
      bareName: string
    }

export interface SkillExpandBlockProps {
  name: string
  source: SkillSource
  symlink?: boolean
  levelLabel?: string
  level?: 'project' | 'global'
  /** Per-side package stats (shown inline); the row's numbers follow when switching sides */
  pkgBySide?: Partial<Record<AgentSide, SkillPkgStats | null>>
  installSlot?: JSX.Element
  uninstallSlot?: JSX.Element
}

export function SkillExpandBlock(props: SkillExpandBlockProps): JSX.Element {
  const t = useDict()
  const { name, source, symlink, levelLabel, level, pkgBySide, installSlot, uninstallSlot } = props
  const sidesArr = source.kind === 'global' ? source.sides : [source.side]
  const fixedSide = source.kind === 'global' ? source.fixedSide : source.side
  const sorted = SIDE_ORDER.filter((s) => sidesArr.includes(s))
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<AgentSide>(fixedSide ?? sorted[0] ?? 'claude')
  const [drawer, setDrawer] = useState<SkillFileEntry | null>(null)

  const pkg = pkgBySide?.[side] ?? null
  // A4/ADR-0012: plugin namespace rows are on equal footing with on-disk ones — expandable only when the
  // package root is in the registration set and the stats are readable
  const expandable =
    source.kind === 'plugin' ? source.pluginRoot != null && pkg !== null : sidesArr.length > 0

  function argsFor(forSide: AgentSide): ListSkillFilesArgs {
    return source.kind === 'plugin'
      ? { side: forSide, name: source.bareName, scope: 'plugin', pluginRoot: source.pluginRoot as string }
      : source.kind === 'project'
        ? { side: forSide, name, scope: 'project', projectPath: source.projectPath }
        : { side: forSide, name, scope: 'global' }
  }

  // Not expanded yet → the query is disabled (fetch on first expand); re-expanding after a collapse
  // hits the cache instead of always refetching, unlike the pre-query-layer code.
  const { data: listResult, isLoading: loading } = useSkillFilesQuery(open ? argsFor(side) : null)
  const listing = listResult?.ok ? listResult.listing : null
  const listErr = listResult?.ok === false ? String(listResult.error) : null

  useEffect(() => {
    if (listResult?.ok === false) toast('err', t.skills.listFailed(errorText(lang, listResult.error)))
    // `lang` and `t` are left out on purpose: the toast belongs to a failed result, so switching the UI
    // language must not show it a second time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listResult])

  function toggle(): void {
    if (!expandable) return
    setOpen((o) => !o)
  }

  function switchSide(s: AgentSide): void {
    setSide(s)
  }

  return (
    <div className={`sk ${open ? 'open' : ''}`}>
      <div
        className={`sk-head ${expandable ? 'disk' : 'plugin'}`}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={() => toggle()}
        onKeyDown={(e) => {
          // Keyboard activation of the inline action buttons (install/uninstall) bubbles here; respond
          // only to the row itself so it does not expand as a side effect (A7)
          if (e.target !== e.currentTarget) return
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <span className="chev">{expandable ? <ChevronRight size={12} /> : <Dot size={12} />}</span>
        <NameReveal name={name} />
        <span className="bdg">
          {SIDE_ORDER.map((s) =>
            sidesArr.includes(s) ? (
              <span key={s} className={`badge ${SIDE_BADGE[s].cls}`}>
                {SIDE_BADGE[s].label}
              </span>
            ) : (
              <span key={s} className="badge miss">
                <Minus size={10} />
              </span>
            )
          )}
        </span>
        {source.kind === 'plugin' && <span className="pill plg">{t.skills.pillPlugin}</span>}
        {level === 'project' && <span className="pill prj">{t.skills.pillProject}</span>}
        {level === 'global' && <span className="pill glb">{t.skills.pillGlobal}</span>}
        {symlink && <span className="pill ln">{t.skills.pillSymlink}</span>}
        <span className="sk-meta">
          {pkg ? t.skills.pkgSummary(pkg.files, formatSize(lang, pkg.bytes)) : ''}
        </span>
        {installSlot}
        {uninstallSlot}
      </div>
      {open && expandable && (
        <div className="sk-body" onClick={(e) => e.stopPropagation()}>
          {!fixedSide && sorted.length > 1 && (
            <div className="sk-sides">
              {sorted.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={s === side ? 'on' : ''}
                  onClick={() => switchSide(s)}
                >
                  {SIDE_SHORT_NAME[s]}
                </button>
              ))}
            </div>
          )}
          <SkillFilesTable listing={listing} loading={loading} error={listErr} onOpen={setDrawer} />
        </div>
      )}
      {drawer && (
        <SkillFileDrawer
          skill={name}
          sideLabel={SIDE_SHORT_NAME[side]}
          levelLabel={
            levelLabel ??
            (source.kind === 'plugin'
              ? t.skills.srcPluginPkg
              : source.kind === 'project'
                ? t.skills.srcProject
                : t.skills.srcGlobal)
          }
          filePath={drawer.path}
          absPath={drawer.absPath}
          files={listing?.files ?? []}
          onOpenFile={setDrawer}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
