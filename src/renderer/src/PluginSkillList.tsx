// plugins-view 序列 H:插件展开区 Skills tab 的行式列表——
// 每行 名+描述+包统计,点行折叠展开文件表,点文件开抽屉;可读与启用态无关(ADR-0012)。
// 不可读(包根缺失/统计为 null)行置灰不可点(H6,fail 早于点击);原生 disabled 不出
// title,故用类名置灰保留提示。
import { useRef, useState } from 'react'
import type { PluginSkillSummary } from '@shared/domain'
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { useLanguage } from './language'

export function PluginSkillList({
  ns,
  side,
  root,
  skills
}: {
  /** 命名空间前缀(插件名 @ 前段) */
  ns: string
  side: 'claude' | 'codex'
  /** 摘要同源包根;null=安装目录缺失(整表置灰) */
  root: string | null
  skills: PluginSkillSummary[]
}): JSX.Element {
  const lang = useLanguage()
  const [openName, setOpenName] = useState<string | null>(null)
  const [listing, setListing] = useState<ListSkillFilesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ f: SkillFileEntry; skill: string } | null>(null)
  // 竞态守卫:快速换行时,旧请求的结果不得安到新行名下(同层污染)
  const seq = useRef(0)

  async function toggle(name: string): Promise<void> {
    if (openName === name) {
      seq.current++
      setOpenName(null)
      setListing(null)
      return
    }
    const my = ++seq.current
    setOpenName(name)
    setListing(null)
    setErr(null)
    setLoading(true)
    try {
      const r = await window.agentshed.listSkillFiles({
        side,
        name,
        scope: 'plugin',
        pluginRoot: root!
      })
      if (seq.current === my) setListing(r)
    } catch (e) {
      if (seq.current === my) setErr(String(e))
      toast('err', `列举失败:${errorText(lang, e)}`)
    } finally {
      if (seq.current === my) setLoading(false)
    }
  }

  return (
    <div className="psk-list">
      {skills.map((s) => {
        const readable = root !== null && s.pkg !== null
        const on = openName === s.name
        const reason = root === null ? '安装目录缺失' : 'skill 包不可读'
        return (
          <div key={s.name}>
            <button
              type="button"
              className={`psk ${on ? 'on' : ''} ${readable ? '' : 'dis'}`}
              title={readable ? undefined : reason}
              onClick={() => {
                if (readable) void toggle(s.name)
              }}
            >
              <span className="cv">{readable ? (on ? '▾' : '▸') : '·'}</span>
              <span className="nm mono">
                {ns}:{s.name}
              </span>
              <span className="ds">{s.description ?? ''}</span>
              <span className="meta">
                {s.pkg ? `${s.pkg.files} 个文件 · ${formatSize(s.pkg.bytes)}` : reason}
              </span>
            </button>
            {on && (
              <div className="psk-body">
                <SkillFilesTable
                  listing={listing}
                  loading={loading}
                  error={err}
                  onOpen={(f) => setDrawer({ f, skill: `${ns}:${s.name}` })}
                />
              </div>
            )}
          </div>
        )
      })}
      {drawer && (
        <SkillFileDrawer
          skill={drawer.skill}
          sideLabel={side === 'claude' ? 'Claude' : 'Codex'}
          levelLabel="插件包"
          filePath={drawer.f.path}
          absPath={drawer.f.absPath}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
