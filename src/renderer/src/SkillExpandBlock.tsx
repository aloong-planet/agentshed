// skills-view: a skill expands into a file table and clicking a file opens a drawer (on-disk and plugin
// entries on equal footing, A4/ADR-0012)
import { useRef, useState } from 'react'
import type { AgentSide, SkillPkgStats } from '@shared/domain'
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { useLanguage, useDict } from './language'

const SIDE_LABEL: Record<AgentSide, string> = { claude: 'Claude', codex: 'Codex' }
const SIDE_ORDER: AgentSide[] = ['claude', 'codex']

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
  const [listing, setListing] = useState<ListSkillFilesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<SkillFileEntry | null>(null)

  const pkg = pkgBySide?.[side] ?? null
  // A4/ADR-0012: plugin namespace rows are on equal footing with on-disk ones — expandable only when the
  // package root is in the registration set and the stats are readable
  const expandable =
    source.kind === 'plugin' ? source.pluginRoot != null && pkg !== null : sidesArr.length > 0
  // A race guard: when sides change quickly, an old side's result must not be attributed to the new side
  // (sideways pollution)
  const seq = useRef(0)

  async function load(forSide: AgentSide): Promise<void> {
    const my = ++seq.current
    setLoading(true)
    setListErr(null)
    try {
      const r = await window.agentshed.listSkillFiles(
        source.kind === 'plugin'
          ? {
              side: forSide,
              name: source.bareName,
              scope: 'plugin',
              pluginRoot: source.pluginRoot as string
            }
          : source.kind === 'project'
            ? { side: forSide, name, scope: 'project', projectPath: source.projectPath }
            : { side: forSide, name, scope: 'global' }
      )
      if (seq.current === my) setListing(r)
    } catch (e) {
      if (seq.current === my) {
        setListing(null)
        setListErr(String(e))
      }
      toast('err', t.skills.listFailed(errorText(lang, e)))
    } finally {
      if (seq.current === my) setLoading(false)
    }
  }

  async function toggle(): Promise<void> {
    if (!expandable) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    await load(side)
  }

  async function switchSide(s: AgentSide): Promise<void> {
    setSide(s)
    await load(s)
  }

  return (
    <div className={`sk ${open ? 'open' : ''}`}>
      <div
        className={`sk-head ${expandable ? 'disk' : 'plugin'}`}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={() => void toggle()}
        onKeyDown={(e) => {
          // Keyboard activation of the inline action buttons (install/uninstall) bubbles here; respond
          // only to the row itself so it does not expand as a side effect (A7)
          if (e.target !== e.currentTarget) return
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void toggle()
          }
        }}
      >
        <span className="chev">{expandable ? '▸' : '·'}</span>
        <span className="nm mono">{name}</span>
        <span className="bdg">
          {SIDE_ORDER.map((s) =>
            sidesArr.includes(s) ? (
              <span key={s} className={`badge ${s === 'claude' ? 'cl' : 'cx'}`}>
                {s === 'claude' ? 'CC' : 'CX'}
              </span>
            ) : (
              <span key={s} className="badge miss">
                —
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
                  onClick={() => void switchSide(s)}
                >
                  {SIDE_LABEL[s]}
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
          sideLabel={SIDE_LABEL[side]}
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
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
