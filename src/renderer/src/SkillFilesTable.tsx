// skills-view/plugins-view 共用:skill 包内文件表(表头/文件行/深度提示/加载与错误态)。
// 磁盘 skill 展开区与插件 skill 展开区必须一致演化(spec H2 与序列 C 同规),故单一组件。
import type { ListSkillFilesResult, SkillFileEntry } from '@shared/ipc'
import { useDict } from './language'

export function formatSize(bytes: number): string {
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

export function SkillFilesTable({
  listing,
  loading,
  error,
  onOpen
}: {
  listing: ListSkillFilesResult | null
  loading: boolean
  error: string | null
  onOpen: (f: SkillFileEntry) => void
}): JSX.Element | null {
  const t = useDict()
  if (loading) {
    return (
      <div className="files">
        <div className="empty">列举中…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="files">
        <div className="empty">{error}</div>
      </div>
    )
  }
  if (!listing) return null
  return (
    <>
      {listing.deep && (
        <div className="sk-tip">
          {t.skillDeepHint}
          {listing.deepPaths.length > 0 && (
            <>
              <br />
              <span style={{ opacity: 0.85 }}>更深路径未列入: {listing.deepPaths.join(', ')}</span>
            </>
          )}
        </div>
      )}
      <div className="files-card">
        <div className="files-head">
          <span>文件</span>
          <span>行数</span>
          <span>大小</span>
          <span>修改日期</span>
        </div>
        <div className="files">
          {listing.files.length === 0 && <div className="empty">包内无可预览文本文件</div>}
          {listing.files.map((f) => {
            const { label, kind } = extKind(f.path)
            return (
              <button type="button" key={f.absPath} onClick={() => onOpen(f)}>
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
    </>
  )
}
