// The body of a Configuration entry, shared by the agents page and a project's page (agents-overview::REQ-004,
// project-detail::REQ-002/AC-02): the entry's files one after another in one card, each headed by its path, or
// "None" in the card when the entry has no file — both as the prototypes draw them. A file that exists but could
// not be read keeps its heading, with the unreadable sentence under it in the "None" line's form: the prototypes
// draw no unreadable state, so it is made of the two forms they do draw.
import { Fragment } from 'react'
import type { ConfigFile } from '@shared/domain'
import { MarkdownBody, type MdLinkCtx } from './MarkdownBody'
import { useDict } from './language'

export function ConfigFiles({ files, links }: { files: ConfigFile[]; links: MdLinkCtx }): JSX.Element {
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
