// skills-view:点文件开抽屉读正文;md 默认可预览(frontmatter 卡片+消毒 HTML)。
import { useEffect, useState } from 'react'
import { isMarkdownName, renderMarkdown } from './md'

export interface SkillFileDrawerProps {
  skill: string
  sideLabel: string
  levelLabel: string
  filePath: string
  absPath: string
  onClose: () => void
}

export function SkillFileDrawer({
  skill,
  sideLabel,
  levelLabel,
  filePath,
  absPath,
  onClose
}: SkillFileDrawerProps): JSX.Element {
  const canPreview = isMarkdownName(filePath)
  const [mode, setMode] = useState<'raw' | 'preview'>(canPreview ? 'preview' : 'raw')
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setText(null)
    setErr(null)
    setMode(isMarkdownName(filePath) ? 'preview' : 'raw')
    void window.agentshed
      .readSkillFile({ absPath })
      .then((t) => {
        if (alive) setText(t)
      })
      .catch((e: unknown) => {
        if (alive) setErr(String(e))
      })
    return () => {
      alive = false
    }
  }, [absPath, filePath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showPreview = canPreview && mode === 'preview'

  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="drawer skill-drawer">
        <button type="button" className="drawer-close" onClick={onClose} title="关闭">
          ×
        </button>
        <div className="d-top">
          <div className="d-title mono">{skill}</div>
          <div className="d-meta">
            {levelLabel} · {sideLabel} · {filePath}
          </div>
        </div>
        <div className="d-body">
          <div className="md-preview skill-md">
            <div className="md-preview-bar">
              <span className="md-preview-name mono">{filePath}</span>
              {canPreview && (
                <div className="md-preview-seg">
                  <button
                    type="button"
                    className={mode === 'raw' ? 'on' : ''}
                    onClick={() => setMode('raw')}
                  >
                    原文
                  </button>
                  <button
                    type="button"
                    className={mode === 'preview' ? 'on' : ''}
                    onClick={() => setMode('preview')}
                  >
                    预览
                  </button>
                </div>
              )}
            </div>
            <div className={`md-preview-body ${showPreview ? 'preview' : 'raw'}`}>
              {err && <div className="md-preview-empty">{err}</div>}
              {!err && text === null && <div className="md-preview-empty">加载中…</div>}
              {!err && text === '' && <div className="md-preview-empty">空文件</div>}
              {!err && text !== null && text !== '' && showPreview && (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
              )}
              {!err && text !== null && text !== '' && !showPreview && text}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
