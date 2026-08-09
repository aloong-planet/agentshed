// Deciding where a rendered markdown link goes.
// Background (a 2026-08-02 bug): with relative links left unintercepted, clicking one **navigates the
// whole window** — in dev, vite
// falling back to index.html looks like "returning to the home page", and the packaged build leaves a
// blank screen; both lose all app state.
// So a rendered link never gets its default behaviour, and this function decides its destination; the
// allow-list (files the detail page listed)
// is the only basis for admitting an internal link, the same invariant as the artifact read channel.
import { ERR, type ErrorCode } from '@shared/errors'
export type MdLinkTarget =
  | { kind: 'internal'; file: string }
  | { kind: 'external'; url: string }
  | { kind: 'anchor' }
  // A link with no clear destination: carries an **error code** rather than a whole-sentence reason, with
  // the renderer producing the wording in the current language
  | { kind: 'unresolved'; code: ErrorCode }

/** A minimal normalisation without node:path: handles . and .., without resolving symlinks (the
 * allow-list registers real paths anyway) */
function resolveRelative(dir: string, rel: string): string {
  const parts = dir.split('/').filter(Boolean)
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return `/${parts.join('/')}`
}

/**
 * @param href The link's raw value
 * @param baseDir The current document's directory (an absolute path)
 * @param readable The readable file allow-list (absolute paths a detail page or snapshot has listed)
 */
export function resolveMdLink(href: string, baseDir: string, readable: string[]): MdLinkTarget {
  if (href.startsWith('#')) return { kind: 'anchor' }
  if (/^https?:\/\//i.test(href)) return { kind: 'external', url: href }
  // Anything else carrying a protocol is refused (javascript:, file:, data: and so on); the sanitising
  // layer already blocks some, and this is the second line
  if (/^[a-z][a-z0-9+.-]*:/i.test(href))
    return { kind: 'unresolved', code: ERR.linkProtocolUnsupported }
  const path = href.split('#')[0]
  if (path === '') return { kind: 'anchor' }
  const abs = resolveRelative(baseDir, path)
  if (!readable.includes(abs)) return { kind: 'unresolved', code: ERR.linkOutOfScope }
  return { kind: 'internal', file: abs }
}

/** A file's directory (as above, without node:path) */
export function dirOf(file: string): string {
  const i = file.lastIndexOf('/')
  return i <= 0 ? '/' : file.slice(0, i)
}

/**
 * Click handling on a rendered markdown container: internal and unresolved are intercepted and handled
 * here;
 * external and anchor are **deliberately let through** — external is taken over by the main process's
 * will-navigate guard
 * (which intercepts it and hands it to the system browser), and anchor uses the browser's default
 * scrolling; neither is a navigation escape.
 */
export function handleMdClick(
  e: { target: EventTarget | null; preventDefault: () => void },
  ctx: { baseDir: string; readable: string[] },
  on: { internal: (file: string) => void; unresolved: (code: ErrorCode) => void }
): void {
  const el = (e.target as HTMLElement | null)?.closest?.('a[href]')
  const href = el?.getAttribute('href')
  if (!href) return
  const t = resolveMdLink(href, ctx.baseDir, ctx.readable)
  if (t.kind === 'internal') {
    e.preventDefault()
    on.internal(t.file)
  } else if (t.kind === 'unresolved') {
    e.preventDefault()
    on.unresolved(t.code)
  }
}
