// What the page's download buttons say and where they lead, per download state (landing-page::REQ-002).
//
// The page as served is in the list state (landing-page::REQ-001/AC-04): it names no version and leads to
// GitHub's release list, which is a valid way to download whatever exists.
import { ui, type Locale } from './i18n/ui'

export const REPOSITORY = 'https://github.com/aloong-planet/agentshed'
export const RELEASE_LIST = `${REPOSITORY}/releases`

export interface DownloadLink {
  label: string
  href: string
  /** Links to GitHub open in a new tab (landing-page::REQ-002/AC-05) */
  newTab: boolean
}

export interface DownloadView {
  /** The hero's button */
  hero: DownloadLink
  /** The download section: its line under the title, and its row's buttons */
  section: { line: string; buttons: DownloadLink[] }
}

/** The list state: neither source could be read, or the page's script has not run */
export function listView(locale: Locale): DownloadView {
  const copy = ui[locale].download.list
  return {
    hero: { label: copy.hero, href: RELEASE_LIST, newTab: true },
    section: { line: copy.line, buttons: [{ label: copy.button, href: RELEASE_LIST, newTab: true }] }
  }
}
