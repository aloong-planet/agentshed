import { useSkillContentQuery } from './skill-content-query'
// skills-view: clicking a file opens a drawer to read it; markdown previews by default (a frontmatter
// card + sanitised HTML). Links in the preview follow spec D3: an in-package relative link switches
// the drawer to that file, anything else gets the shared interception (external → system browser via
// the main-process guard, out-of-scope → an explicit notice).
import { useEffect, useState } from 'react'
import type { SkillFileEntry } from '@shared/ipc'
import { isMarkdownName } from './md'
import { MarkdownBody } from './MarkdownBody'
import { dirOf } from './md-links'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { appError } from '@shared/errors'
import { useDict, useLanguage } from './language'
import { X } from './icons'

export interface SkillFileDrawerProps {
  skill: string
  sideLabel: string
  levelLabel: string
  filePath: string
  absPath: string
  /** The package's listed files — the readable set for relative links (fail-closed beyond it) */
  files: SkillFileEntry[]
  /** An in-package link's destination: the host switches the drawer to this entry */
  onOpenFile: (f: SkillFileEntry) => void
  onClose: () => void
}

export function SkillFileDrawer({
  skill,
  sideLabel,
  levelLabel,
  filePath,
  absPath,
  files,
  onOpenFile,
  onClose
}: SkillFileDrawerProps): JSX.Element {
  const dict = useDict()
  const lang = useLanguage()
  const canPreview = isMarkdownName(filePath)
  const [mode, setMode] = useState<'raw' | 'preview'>(canPreview ? 'preview' : 'raw')
  const data = useSkillContentQuery(absPath)
  const text = data?.ok ? (data.text.truncated ? `${data.text.text}\n${dict.placeholder.truncated}` : data.text.text) : null
  const err = data?.ok === false ? errorText(lang, data.error) : null
  // Another file starts in its own default mode
  const [modeFor, setModeFor] = useState({ absPath, filePath })
  if (absPath !== modeFor.absPath || filePath !== modeFor.filePath) {
    setModeFor({ absPath, filePath })
    setMode(canPreview ? 'preview' : 'raw')
  }

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
                <MarkdownBody
                  text={text}
                  links={{
                    baseDir: dirOf(absPath),
                    readable: files.map((f) => f.absPath),
                    onInternal: (file) => {
                      const f = files.find((x) => x.absPath === file)
                      if (f) onOpenFile(f)
                    },
                    onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
                  }}
                />
              )}
              {!err && text !== null && text !== '' && !showPreview && text}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
