// What the page's download buttons say and where they lead, per download state (landing-page::REQ-002).
//
// The page as served is in the list state (landing-page::REQ-001/AC-04): it names no version and leads to
// GitHub's release list, which is a valid way to download whatever exists.
import { ui, type Locale } from './i18n/ui'
import { dmgName, type GitHubRead, type PointerRead } from './releases'

export const REPOSITORY = 'https://github.com/aloong-planet/agentshed'
export const RELEASE_LIST = `${REPOSITORY}/releases`

export type DownloadState =
  | { kind: 'formal-r2'; version: string; url: string }
  | { kind: 'formal-github'; version: string; dmg: boolean }
  | { kind: 'test'; version: string }
  | { kind: 'list' }

export interface DownloadLink {
  label: string
  href: string
  /** Links to GitHub open in a new tab; the R2 download starts in place (landing-page::REQ-002/AC-05) */
  newTab: boolean
  kind: 'primary' | 'ghost'
}

export interface DownloadView {
  /** The hero's button */
  hero: DownloadLink
  /** The pill on the platform line beneath the hero's button */
  pill: string | null
  /** The note beneath the platform line */
  note: string | null
  /** The link to every version, beneath the platform line */
  every: DownloadLink | null
  /** The download section: its line under the title (with a pill before it), and its row's buttons */
  section: { pill: string | null; line: string; buttons: DownloadLink[] }
}

/** A version's DMG on GitHub and its release page there: GitHub's URLs for a release, with the DMG named as packaged */
const githubDmg = (version: string): string => `${RELEASE_LIST}/download/v${version}/${dmgName(version)}`
const releasePage = (version: string): string => `${RELEASE_LIST}/tag/v${version}`

/**
 * The state the page shows, from the two reads (landing-page::REQ-001): a readable pointer means a formal release
 * on R2; otherwise GitHub's latest formal release, else its newest pre-release; otherwise, or when GitHub was not
 * read or could not be, the release list. A version only ever comes from a read.
 */
export function decide(pointer: PointerRead, github?: GitHubRead): DownloadState {
  if (pointer.kind === 'formal') return { kind: 'formal-r2', version: pointer.version, url: pointer.url }
  if (github?.kind === 'formal') return { kind: 'formal-github', version: github.version, dmg: github.dmg }
  if (github?.kind === 'pre') return { kind: 'test', version: github.version }
  return { kind: 'list' }
}

const fill = (template: string, version: string): string => template.replace('{version}', version)
const github = (label: string, href: string, kind: DownloadLink['kind'] = 'primary'): DownloadLink => ({ label, href, newTab: true, kind })

export function view(state: DownloadState, locale: Locale): DownloadView {
  const copy = ui[locale].download
  switch (state.kind) {
    case 'formal-r2': {
      const r2: DownloadLink = { label: fill(copy.formal.hero, state.version), href: state.url, newTab: false, kind: 'primary' }
      return {
        hero: r2,
        pill: null,
        note: null,
        every: github(copy.formal.every, RELEASE_LIST),
        section: {
          pill: null,
          line: fill(copy.formal.line, state.version),
          buttons: [
            { ...r2, label: copy.formal.download },
            github(copy.formal.github, githubDmg(state.version), 'ghost')
          ]
        }
      }
    }
    case 'formal-github': {
      // A release without its DMG is not offered as a direct download: its page is (landing-page Failure A8)
      const href = state.dmg ? githubDmg(state.version) : releasePage(state.version)
      return {
        hero: github(fill(copy.formal.hero, state.version), href),
        pill: null,
        note: null,
        every: github(copy.formal.every, RELEASE_LIST),
        section: { pill: null, line: fill(copy.formal.line, state.version), buttons: [github(copy.formal.download, href)] }
      }
    }
    case 'test':
      return {
        hero: github(fill(copy.test.hero, state.version), releasePage(state.version)),
        pill: copy.test.pill,
        note: copy.test.note,
        every: null,
        section: {
          pill: copy.test.pill,
          line: fill(copy.test.line, state.version),
          buttons: [github(copy.test.button, releasePage(state.version))]
        }
      }
    case 'list':
      return {
        hero: github(copy.list.hero, RELEASE_LIST),
        pill: null,
        note: null,
        every: null,
        section: { pill: null, line: copy.list.line, buttons: [github(copy.list.button, RELEASE_LIST)] }
      }
  }
}
