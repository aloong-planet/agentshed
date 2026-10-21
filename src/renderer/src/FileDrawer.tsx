// The file drawer: reads one file of a set — a skill package's files (SkillFileDrawer) or a memory
// directory's (MemoryFileDrawer) — in one form (spec memory-view::CON-001): a title block naming the set, then
// the preview frame — the file's name, the raw / preview switch for markdown, the body. Markdown previews by
// default through the shared carrier, so its links go through the shared interception; an internal target is
// handed back to the host, which switches the drawer to that file (skills-view D3, memory-view::US-001/AC-05).
import { useEffect, useState } from 'react'
import { isMarkdownName } from './md'
import { MarkdownBody, type MdLinkCtx } from './MarkdownBody'
import { useDict } from './language'
import { X } from './icons'

export interface FileDrawerProps {
  /** The set the file belongs to (the skill, or the memory's owner) */
  title: string
  meta: string
  /** The file's display name, shown in the bar; it also decides whether the file previews */
  fileName: string
  /** The file's identity: another file starts in its own default mode, scrolled to the top */
  fileKey: string
  /** The text read; null while it is being read or when the read failed */
  text: string | null
  /** The read failure, worded for display; null when there is none */
  error: string | null
  loadingText: string
  links: MdLinkCtx
  onClose: () => void
}

export function FileDrawer({
  title,
  meta,
  fileName,
  fileKey,
  text,
  error,
  loadingText,
  links,
  onClose
}: FileDrawerProps): JSX.Element {
  const dict = useDict()
  const canPreview = isMarkdownName(fileName)
  const [mode, setMode] = useState<'raw' | 'preview'>(canPreview ? 'preview' : 'raw')
  // Another file starts in its own default mode
  const [modeFor, setModeFor] = useState(fileKey)
  if (fileKey !== modeFor) {
    setModeFor(fileKey)
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
      <div className="drawer file-drawer">
        <button type="button" className="drawer-close" onClick={onClose} title={dict.skills.close}>
          <X size={15} />
        </button>
        <div className="d-top">
          <div className="d-title mono">{title}</div>
          <div className="d-meta">{meta}</div>
        </div>
        <div className="d-body">
          <div className="md-preview file-md">
            <div className="md-preview-bar">
              <span className="md-preview-name mono">{fileName}</span>
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
            {/* Keyed by the file, so a switched-to file starts at the top rather than at the last one's scroll */}
            <div key={fileKey} className={`md-preview-body ${showPreview ? 'preview' : 'raw'}`}>
              {error && <div className="md-preview-empty">{error}</div>}
              {!error && text === null && <div className="md-preview-empty">{loadingText}</div>}
              {!error && text === '' && <div className="md-preview-empty">{dict.skills.emptyFile}</div>}
              {!error && text !== null && text !== '' && showPreview && <MarkdownBody text={text} links={links} />}
              {!error && text !== null && text !== '' && !showPreview && text}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
