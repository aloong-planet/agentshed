// The single React carrier for rendered markdown: every surface renders through it, so the
// sanitising exit (renderMarkdown) and the link-interception invariant (CONTEXT: a rendered link
// never navigates the whole window) hold by construction instead of by every call site remembering
// to wire them. The link context is deliberately required: a surface with no in-app targets passes
// an empty readable list, which routes every relative link to the explicit out-of-scope notice.
// Content styling hangs off the `md-body` class (one selector set in theme.css for all surfaces).
import { useMemo } from 'react'
import { renderMarkdown } from './md'
import { handleMdClick } from './md-links'
import type { ErrorCode } from '@shared/errors'

export interface MdLinkCtx {
  /** The current document's directory; relative links resolve against it */
  baseDir: string
  /** Absolute paths that may open in-app; anything else gets the out-of-scope notice */
  readable: string[]
  onInternal: (file: string) => void
  onUnresolved: (code: ErrorCode) => void
}

export function MarkdownBody({
  text,
  links,
  className
}: {
  text: string
  links: MdLinkCtx
  className?: string
}): JSX.Element {
  const html = useMemo(() => renderMarkdown(text), [text])
  return (
    <div
      className={className ? `md-body ${className}` : 'md-body'}
      onClick={(e) =>
        handleMdClick(
          e,
          { baseDir: links.baseDir, readable: links.readable },
          { internal: links.onInternal, unresolved: links.onUnresolved }
        )
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
