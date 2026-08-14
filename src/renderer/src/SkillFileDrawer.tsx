// skills-view: clicking a file opens a drawer to read it; markdown previews by default (a frontmatter
// card + sanitised HTML).
import { useEffect, useState } from 'react'
import { isMarkdownName, renderMarkdown } from './md'
import { useDict } from './language'
import { X } from './icons'

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
  const dict = useDict()
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
      .then((cap) => {
        if (alive) setText(cap.truncated ? `${cap.text}\n${dict.placeholder.truncated}` : cap.text)
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
        <button type="button" className="drawer-close" onClick={onClose} title={dict.skills.close}>
          <X size={15} />
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
                    {dict.skills.raw}
                  </button>
                  <button
                    type="button"
                    className={mode === 'preview' ? 'on' : ''}
                    onClick={() => setMode('preview')}
                  >
                    {dict.skills.preview}
                  </button>
                </div>
              )}
            </div>
            <div className={`md-preview-body ${showPreview ? 'preview' : 'raw'}`}>
              {err && <div className="md-preview-empty">{err}</div>}
              {!err && text === null && <div className="md-preview-empty">{dict.skills.loading}</div>}
              {!err && text === '' && <div className="md-preview-empty">{dict.skills.emptyFile}</div>}
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
