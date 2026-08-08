// skills-view:skill 折叠文件表 + 点文件开抽屉(磁盘与插件同权,A4/ADR-0012)
import { useRef, useState } from 'react'
import type { AgentSide, SkillPkgStats } from '@shared/domain'
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { useLanguage } from './language'

const SIDE_LABEL: Record<AgentSide, string> = { claude: 'Claude', codex: 'Codex' }
const SIDE_ORDER: AgentSide[] = ['claude', 'codex']

/**
 * 列举来源(判别联合):三种来源各自的必填项由类型钉死,不再靠 optional props
 * 的占用规则约定(scope=plugin 必带 pluginRoot 之类)。新增来源 = 加一个 variant。
 */
export type SkillSource =
  | { kind: 'global'; sides: AgentSide[]; fixedSide?: AgentSide }
  | { kind: 'project'; side: AgentSide; projectPath: string }
  | {
      kind: 'plugin'
      side: AgentSide
      /** 摘要同源包根(plugins-view H5);null=不可展开(fail-closed 展示) */
      pluginRoot: string | null
      /** 裸 skill 名(数据层随条目下发,不从命名空间名反解) */
      bareName: string
    }

export interface SkillExpandBlockProps {
  name: string
  source: SkillSource
  symlink?: boolean
  levelLabel?: string
  level?: 'project' | 'global'
  /** 各侧包统计(行内展示);切侧时行上数字随动 */
  pkgBySide?: Partial<Record<AgentSide, SkillPkgStats | null>>
  installSlot?: JSX.Element
  uninstallSlot?: JSX.Element
}

export function SkillExpandBlock(props: SkillExpandBlockProps): JSX.Element {
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
  // A4/ADR-0012:插件命名空间行与磁盘同权——包根在登记集且统计可读才可展开
  const expandable =
    source.kind === 'plugin' ? source.pluginRoot != null && pkg !== null : sidesArr.length > 0
  // 竞态守卫:快速切侧时,旧侧请求的结果不得安到新侧名下(同层污染)
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
      toast('err', `列举失败:${errorText(lang, e)}`)
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
          // 行内动作按钮(装/卸)的键盘激活会冒泡到这里;只响应行自身,免得连带展开(A7)
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
        {source.kind === 'plugin' && <span className="pill plg">插件</span>}
        {level === 'project' && <span className="pill prj">项目级</span>}
        {level === 'global' && <span className="pill glb">全局</span>}
        {symlink && <span className="pill ln">⤷ 软链</span>}
        <span className="sk-meta">
          {pkg ? `${pkg.files} 个文件 · ${formatSize(pkg.bytes)}` : ''}
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
            (source.kind === 'plugin' ? '插件包' : source.kind === 'project' ? '项目' : '全局库')
          }
          filePath={drawer.path}
          absPath={drawer.absPath}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
