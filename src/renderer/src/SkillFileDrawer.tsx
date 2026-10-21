import { useSkillContentQuery } from './skill-content-query'
// skills-view: clicking a file opens a drawer to read it; markdown previews by default (a frontmatter
// card + sanitised HTML). Links in the preview follow spec D3: an in-package relative link switches
// the drawer to that file, anything else gets the shared interception (external → system browser via
// the main-process guard, out-of-scope → an explicit notice).
import type { SkillFileEntry } from '@shared/ipc'
import { FileDrawer } from './FileDrawer'
import { dirOf } from './md-links'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { appError } from '@shared/errors'
import { useDict, useLanguage } from './language'

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
  const data = useSkillContentQuery(absPath)
  const text = data?.ok ? (data.text.truncated ? `${data.text.text}\n${dict.placeholder.truncated}` : data.text.text) : null
  const err = data?.ok === false ? errorText(lang, data.error) : null
  return (
    <FileDrawer
      title={skill}
      meta={`${levelLabel} · ${sideLabel} · ${filePath}`}
      fileName={filePath}
      fileKey={absPath}
      text={text}
      error={err}
      loadingText={dict.skills.loading}
      links={{
        baseDir: dirOf(absPath),
        readable: files.map((f) => f.absPath),
        onInternal: (file) => {
          const f = files.find((x) => x.absPath === file)
          if (f) onOpenFile(f)
        },
        onUnresolved: (code) => toast('err', errorText(lang, appError(code)))
      }}
      onClose={onClose}
    />
  )
}
