// skills-view:磁盘 skill 折叠文件表 + 点文件开抽屉
import { useState } from 'react'
import type { AgentSide, SkillPkgStats } from '@shared/domain'
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'

const SIDE_LABEL: Record<AgentSide, string> = { claude: 'Claude', codex: 'Codex' }
const SIDE_ORDER: AgentSide[] = ['claude', 'codex']

export interface SkillExpandBlockProps {
  name: string
  /** 可展开的侧(磁盘);插件传空 */
  sides: AgentSide[]
  origin: 'disk' | 'plugin'
  symlink?: boolean
  levelLabel?: string
  level?: 'project' | 'global' | 'plugin'
  scope: 'global' | 'project'
  projectPath?: string
  /** 详情行已绑死一侧时固定,不展示侧切换 */
  fixedSide?: AgentSide
  /** 各侧包统计(行内展示);切侧时行上数字随动 */
  pkgBySide?: Partial<Record<AgentSide, SkillPkgStats | null>>
  installSlot?: JSX.Element
  uninstallSlot?: JSX.Element
}

export function SkillExpandBlock(props: SkillExpandBlockProps): JSX.Element {
  const {
    name,
    sides,
    origin,
    symlink,
    levelLabel,
    level,
    scope,
    projectPath,
    fixedSide,
    pkgBySide,
    installSlot,
    uninstallSlot
  } = props
  const disk = origin === 'disk' && sides.length > 0
  const sorted = SIDE_ORDER.filter((s) => sides.includes(s))
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<AgentSide>(fixedSide ?? sorted[0] ?? 'claude')
  const [listing, setListing] = useState<ListSkillFilesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<SkillFileEntry | null>(null)

  async function load(forSide: AgentSide): Promise<void> {
    setLoading(true)
    setListErr(null)
    try {
      const r = await window.agentshed.listSkillFiles({
        side: forSide,
        name,
        scope,
        projectPath
      })
      setListing(r)
    } catch (e) {
      setListing(null)
      setListErr(String(e))
      toast('err', `列举失败:${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  async function toggle(): Promise<void> {
    if (!disk) return
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

  const pkg = pkgBySide?.[side] ?? null

  return (
    <div className={`sk ${open ? 'open' : ''}`}>
      <div
        className={`sk-head ${disk ? 'disk' : 'plugin'}`}
        role={disk ? 'button' : undefined}
        tabIndex={disk ? 0 : undefined}
        onClick={() => void toggle()}
        onKeyDown={(e) => {
          // 行内动作按钮(装/卸)的键盘激活会冒泡到这里;只响应行自身,免得连带展开(A7)
          if (e.target !== e.currentTarget) return
          if (disk && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void toggle()
          }
        }}
      >
        <span className="chev">{disk ? '▸' : '·'}</span>
        <span className="nm mono">{name}</span>
        <span className="bdg">
          {SIDE_ORDER.map((s) =>
            sides.includes(s) ? (
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
        {origin === 'plugin' && <span className="pill plg">插件</span>}
        {level === 'project' && <span className="pill prj">项目级</span>}
        {level === 'global' && <span className="pill glb">全局</span>}
        {symlink && <span className="pill ln">⤷ 软链</span>}
        {disk && (
          <span className="sk-meta">
            {pkg ? `${pkg.files} 个文件 · ${formatSize(pkg.bytes)}` : ''}
          </span>
        )}
        {installSlot}
        {uninstallSlot}
      </div>
      {open && disk && (
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
          levelLabel={levelLabel ?? (scope === 'global' ? '全局库' : '项目')}
          filePath={drawer.path}
          absPath={drawer.absPath}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
