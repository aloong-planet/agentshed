// The page's download script (landing-page::REQ-001): reads the pointer and, only when it cannot offer a formal
// release from R2, GitHub's releases; decides the state; and shows it in place over the list state the page was
// served in (Failure A7). The list state needs no change: it is what the page already shows.
import { decide, view, type DownloadState } from '../download'
import { HTML_LANG, LOCALES, type Locale } from '../i18n/ui'
import { readGitHub, readPointer, type Fetch } from '../releases'
import { applyView } from './apply-download'

const localeOf = (doc: Document): Locale => LOCALES.find((l) => HTML_LANG[l] === doc.documentElement.lang) ?? 'zh'

/**
 * Makes a change to the hero without moving what the visitor is looking at, when the hero's download block is above
 * their view (a place restored after a language switch, say): the state lands after the page is shown, and that
 * block's height depends on the state. Their view starts below the sticky header, so a block hidden under it counts
 * as above. Some browsers keep the place themselves (scroll anchoring), but not always; what is left after the
 * change is measured and scrolled away, so it works either way. While the block is in view, it changes in view.
 */
function keepPlace(doc: Document, change: () => void): void {
  const block = doc.querySelector('.hero .cta')
  const next = doc.getElementById('features')
  if (!block || !next) return change()
  const viewTop = doc.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0
  const above = block.getBoundingClientRect().bottom <= viewTop
  const before = next.getBoundingClientRect().top
  change()
  const shift = next.getBoundingClientRect().top - before
  if (above && shift !== 0) doc.defaultView?.scrollBy({ top: shift, behavior: 'instant' })
}

export async function initDownload(doc: Document, fetch: Fetch): Promise<DownloadState> {
  const pointer = await readPointer(fetch)
  const github = pointer.kind === 'formal' ? undefined : await readGitHub(fetch)
  const state = decide(pointer, github)
  if (state.kind !== 'list') keepPlace(doc, () => applyView(doc, view(state, localeOf(doc))))
  return state
}
