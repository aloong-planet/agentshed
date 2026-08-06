// skills-view:磁盘 skill 折叠文件表 + 点文件开抽屉
import { useState } from 'react'
import type { AgentSide } from '@shared/domain'
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { toast } from './Toast'

const SIDE_LABEL: Record<AgentSide, string> = { claude: 'Claude', codex: 'Codex' }
const SIDE_ORDER: AgentSide[] = ['claude', 'codex']

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function extKind(path: string): { label: string; kind: string } {
  const base = path.split('/').pop() || path
  if (/\.md$/i.test(base)) return { label: 'MD', kind: 'md' }
  if (/\.(sh|bash|zsh)$/i.test(base)) return { label: 'SH', kind: 'sh' }
  if (/\.(js|ts|mjs|cjs)$/i.test(base)) return { label: 'JS', kind: 'js' }
  if (/\.(ya?ml|toml|json)$/i.test(base)) return { label: 'CFG', kind: 'cfg' }
  const i = base.lastIndexOf('.')
  const ext = (i >= 0 ? base.slice(i + 1) : '?').slice(0, 3).toUpperCase()
  return { label: ext, kind: 'oth' }
}

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

  const files = listing?.files ?? []
  const totalBytes = files.reduce((a, f) => a + f.bytes, 0)
  const totalLines = files.reduce((a, f) => a + f.lines, 0)

  return (
    <div className={`sk ${open ? 'open' : ''}`}>
      <div
        className={`sk-head ${disk ? 'disk' : 'plugin'}`}
        role={disk ? 'button' : undefined}
        tabIndex={disk ? 0 : undefined}
        onClick={() => void toggle()}
        onKeyDown={(e) => {
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
          {listing?.deep && (
            <div className="sk-tip">
              {listing.deepHint}
              {listing.deepPaths.length > 0 && (
                <>
                  <br />
                  <span style={{ opacity: 0.85 }}>
                    更深路径未列入: {listing.deepPaths.join(', ')}
                  </span>
                </>
              )}
            </div>
          )}
          {loading && <div className="files empty">列举中…</div>}
          {listErr && <div className="files empty">{listErr}</div>}
          {!loading && !listErr && listing && (
            <div className="files-card">
              <div className="files-sum">
                <span>
                  <b>{files.length}</b> 个文件
                </span>
                <span className="dot">·</span>
                <span>
                  共 <b>{totalLines.toLocaleString('zh-CN')} 行</b>
                </span>
                <span className="dot">·</span>
                <span>
                  <b>{formatSize(totalBytes)}</b>
                </span>
                <span className="dot">·</span>
                <span>
                  {SIDE_LABEL[side]}
                  {levelLabel ? ` · ${levelLabel}` : ''}
                </span>
              </div>
              <div className="files-head">
                <span>文件</span>
                <span>行数</span>
                <span>大小</span>
                <span>修改日期</span>
              </div>
              <div className="files">
                {files.length === 0 && <div className="empty">包内无可预览文本文件</div>}
                {files.map((f) => {
                  const { label, kind } = extKind(f.path)
                  return (
                    <button type="button" key={f.absPath} onClick={() => setDrawer(f)}>
                      <span className="name-cell">
                        <span className={`ic ${kind}`}>{label}</span>
                        <span className="path mono" title={f.path}>
                          {f.path}
                        </span>
                        {f.path === 'SKILL.md' && <span className="tag">入口</span>}
                      </span>
                      <span className="meta lines">{f.lines.toLocaleString('zh-CN')}</span>
                      <span className="meta">{formatSize(f.bytes)}</span>
                      <span className="meta">{formatDate(f.mtimeMs)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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
