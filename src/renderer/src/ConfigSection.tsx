// The Configuration section, shared by the agents page and a project's page (agents-overview::REQ-004,
// project-detail::REQ-002/AC-02): two entries named by their files, CLAUDE.md and AGENTS.md, not grouped by side.
// An entry shows its files one after another in one card, each headed by its path, or "None" in the card when the
// entry has no file — both as the prototypes draw them. A file that exists but could not be read keeps its heading,
// with the unreadable sentence under it in the "None" line's form: the prototypes draw no unreadable state, so it is
// made of the two forms they do draw.
import { Fragment, useState } from 'react'
import type { ConfigFile } from '@shared/domain'
import { MarkdownBody, type MdLinkCtx } from './MarkdownBody'
import { useDict } from './language'

export function ConfigSection({
  claudeMd,
  agentsMd,
  links
}: {
  claudeMd: ConfigFile[]
  agentsMd: ConfigFile[]
  links: MdLinkCtx
}): JSX.Element {
  const [which, setWhich] = useState<'claude' | 'agents'>('claude')
  return (
    <div>
      <div className="cfg-switch">
        {(
          [
            ['claude', 'CLAUDE.md'],
            ['agents', 'AGENTS.md']
          ] as const
        ).map(([w, label]) => (
          <button key={w} className={which === w ? 'on' : ''} onClick={() => setWhich(w)}>
            {label}
          </button>
        ))}
      </div>
      <ConfigFiles files={which === 'claude' ? claudeMd : agentsMd} links={links} />
    </div>
  )
}

function ConfigFiles({ files, links }: { files: ConfigFile[]; links: MdLinkCtx }): JSX.Element {
  const t = useDict()
  if (files.length === 0)
    return (
      <div className="md cfg-files">
        <div className="none">{t.config.none}</div>
      </div>
    )
  return (
    <div className="md cfg-files">
      {files.map((f) => (
        <Fragment key={f.file}>
          <div className="cfg-path mono">{f.file}</div>
          {f.content === null ? (
            <div className="none">{t.config.unreadable}</div>
          ) : (
            <MarkdownBody
              // The truncation marker is appended by the renderer in the current language (ticket 07)
              text={f.content.truncated ? `${f.content.text}\n${t.placeholder.truncated}` : f.content.text}
              links={links}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}
