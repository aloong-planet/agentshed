# Landing page

> Related: [features](../features/landing-page.md) · [ADR-0031](../adr/0031-macos-release-line.md) ·
> [mac-distribution](mac-distribution.md) (the releases and the pointer it reads) ·
> [app-update](app-update.md) (the update button its install steps mention)

## Problem Statement

People who have never seen the repository need a place that says what Agentshed is and lets them
download it. The README is written for people already on GitHub. Releases come in two kinds, and for a
while only pre-releases will exist: the first release is `v0.1.0-beta`, and the R2 mirror holds formal
releases only. So the page has to offer whichever release exists, say plainly when that is a test
version, and keep doing so release after release without being edited.

## Solution

A `site/` project in this repository, built with Astro and deployed by Cloudflare Pages at
`agentshed.aloongplanet.com`, in Chinese (at `/`) and English (at `/en`), as Transfer's site is. It is
one long page (form "L1"): header, hero with the download, a scroll-linked features section, three
install steps, a download section and a footer. The visitor's browser decides what to offer. It reads
the R2 latest pointer for a formal release. Failing that, it reads GitHub's public releases API, which
gives the latest formal release if there is one and otherwise the newest pre-release. Failing both, it
offers GitHub's release list. A release therefore never needs a site change. The screenshots are real
app screenshots.

## User Stories

### landing-page::US-001 Understand what Agentshed is and download it

As a visitor, I want to see at a glance what Agentshed does and get it in one click, so that I can try
it without reading the repository.

- landing-page::US-001/AC-01: The hero shows the app icon, the title, a one-paragraph description, the
  download button with the platform line "macOS 12 or later · Apple Silicon", and a screenshot of the
  whole app window.
- landing-page::US-001/AC-02: When a formal release exists, the hero button downloads that release's
  DMG directly.
- landing-page::US-001/AC-03: When only pre-releases exist, the hero button leads to the newest
  pre-release on GitHub, and the page says plainly that it is a test version and that no stable release
  exists yet.
- landing-page::US-001/AC-04: When the page cannot tell what exists, the button still leads to the
  downloads: GitHub's release list.

### landing-page::US-002 Read the page in my language

As a visitor, I want the page in Chinese or English, so that I can read it comfortably.

- landing-page::US-002/AC-01: Chinese is at `/` and English at `/en`. A toggle at the right of the
  header switches between them.
- landing-page::US-002/AC-02: Both languages carry the same sections, the same download states and
  their own set of screenshots.

### landing-page::US-003 See what the app shows

As a visitor, I want to see the app's main views next to a short description of each, so that I know
what I would get.

- landing-page::US-003/AC-01: The features section presents six steps in order — the overview, what
  each project has, what the agents remember, token usage and trends, sessions revisited, and search
  across projects — each with a screenshot of that view (landing-page::REQ-004, landing-page::REQ-005).
- landing-page::US-003/AC-02: The sessions step speaks of searching within the project, and the search
  step of searching what you asked across every project, so the two read as different features. The
  search step names no keyboard shortcut.

### landing-page::US-004 Know what installing involves

As a visitor, I want to know the install steps and what the first launch will show, so that the system
notice does not alarm me.

- landing-page::US-004/AC-01: Three steps: download the DMG for Apple Silicon; open it and drag
  Agentshed into Applications; open it. The third step says macOS will report that Apple checked it for
  malicious software and found none, that clicking Open is enough, and that when a new version comes
  out an update button appears at the bottom left of the app.

## Functional Requirements

### landing-page::REQ-001 Deciding what to offer

- landing-page::REQ-001/AC-01: If the visitor's browser reads the R2 latest pointer, the page shows the
  formal state from R2, with that pointer's version.
- landing-page::REQ-001/AC-02: If the pointer is absent or cannot be read (offline, blocked, malformed),
  the page reads GitHub's public releases API. It takes the latest formal release if there is one,
  shown in the formal state with every link on GitHub; otherwise it takes the newest pre-release, shown
  in the test state.
- landing-page::REQ-001/AC-03: If neither source can be read, or GitHub lists no release at all, the
  page shows the list state.
- landing-page::REQ-001/AC-04: The page as first served, before its script runs (and for a visitor
  without scripts), is in the list state.
- landing-page::REQ-001/AC-05: No release requires the site to be edited or redeployed.

### landing-page::REQ-002 What each state shows

- landing-page::REQ-002/AC-01: **Formal (from R2)**: the hero button reads "Download Agentshed <version>"
  and downloads the DMG from the download host. Beneath it are the platform line and a link, "See every
  version on GitHub". The download section reads "Current version <version>", and its row has two
  buttons: Download (the R2 DMG) and GitHub (the same DMG on GitHub).
- landing-page::REQ-002/AC-02: **Formal (from GitHub)**: the same as AC-01, except that every link goes
  to GitHub and the download row has the one Download button.
- landing-page::REQ-002/AC-03: **Test**: the hero button reads "Download test version <version>" and
  leads to that pre-release's page on GitHub. Beneath it, the platform line carries a "Test version"
  pill, followed by the note "No stable release yet. The test version downloads from GitHub and may
  still be rough in places." The download section reads "Only a test version so far: <version>", with
  the pill, and its one button reads "Download the test version from GitHub".
- landing-page::REQ-002/AC-04: **List**: the hero button reads "Download Agentshed from GitHub" and leads
  to the release list. Beneath it is the platform line, with no pill and no version anywhere in the
  buttons. The download section reads "Version details can't be loaded right now — download from
  GitHub", with one button, "Download from GitHub".
- landing-page::REQ-002/AC-05: Links to GitHub open in a new tab. The R2 download starts in place.

### landing-page::REQ-003 Page structure (direct acceptance)

The header holds the brand (icon and name), the navigation (Features, Install, Download, GitHub; hidden
below 760px) and the language toggle, and it stays at the top while scrolling. Below it come the hero,
the features section (title "One app, the whole picture", subtitle "It only reads the files your coding
agents leave on your Mac."), the install section, the download section, and a footer with GitHub,
Releases and the copyright line.

### landing-page::REQ-004 The pinned features section

- landing-page::REQ-004/AC-01: On a wide screen the section pins a showcase under the header while the
  page scrolls past it. A narrow column on the left shows the current step's number and the count of steps
  (as "03 / 06"), its title and its text; the step's screenshot stands large on the right in the window
  frame, whole under the header even in a short window. There are no progress dots and no hint to
  scroll.
- landing-page::REQ-004/AC-05: A step turns by cross-fading its text and its screenshot together, in
  place: nothing moves, and every step's text starts on the same line. Under reduced motion the switch
  is instant. Only the current step's text and screenshot are visible to the pointer and to assistive
  technology.
- landing-page::REQ-004/AC-06: Below 760px nothing is pinned. Each step's own screenshot sits under its
  text, with a clear gap before the next step's title.
- landing-page::REQ-004/AC-07: Switching language keeps the current step and the scroll position.
- landing-page::REQ-004/AC-08: The page scrolls as usual and nothing captures the wheel. The first step
  shows when the showcase pins, and each further 60% of the window's height scrolled turns to the next
  step; scrolling back turns back. Before the showcase pins the first step shows, and once it has
  scrolled past, the last.

### landing-page::REQ-005 The screenshots

- landing-page::REQ-005/AC-01: The hero screenshot and the overview, project, token and session
  screenshots come from the built app over the owner's own agent data, approved for publication by the
  owner (on 2026-10-13; the hero's retake on 2026-10-21). The memory and search screenshots come from the
  built app over a made-up home whose projects, memory files and questions have the shape of real
  ones, the same projects in both (the owner's choice, 2026-10-21). There is one set per language, taken
  in the light appearance.
- landing-page::REQ-005/AC-02: The hero screenshot is the whole window, its rail showing the Search
  item. Each feature screenshot is cut to the part of the window its step is about. All six are the
  same size (16:9) at the same zoom, so the text stays one size as the steps turn. Each cut ends between
  list rows. The token cut leaves out the recent-sessions list. The memory cut shows a memory file open
  in the drawer as rendered Markdown, over the Agents page's Memory section with that file's project
  expanded, and ends between the drawer's lines too. The search cut starts at the search box and keeps
  each row's hit count and time.
- landing-page::REQ-005/AC-03: Every screenshot's space is held before it loads, so nothing jumps.

### landing-page::REQ-006 Copy (direct acceptance)

The copy is in Chinese and English only. Where the page refers to the agents Agentshed reads, it names
examples without presenting them as the complete set ("Claude Code, Codex and other coding agents"),
so a new agent side does not make it untrue. The page uses the app's own palette, in light and dark,
following the visitor's system appearance.

### landing-page::REQ-007 The hero's heading and summary (direct acceptance)

The hero's heading is the README's opening line in the same language without its full stop ("Your
coding agents, in full view" in English). Its paragraph is the README's opening summary in the same
language, word for word.

## Quality Requirements

### landing-page::QR-001 Layout holds across widths, languages and appearances

Applies to: the whole page, in both languages, both appearances and all four download states.

- landing-page::QR-001/AC-01: At the widths the confirmed prototype was verified at (400, 900, 1280
  and 1440px), the page never scrolls sideways, every button stays inside its card, and the hero keeps
  its side gutters.

## Constraints

### landing-page::CON-001 Where the site lives (direct acceptance)

Applies to: the landing page. A `site/` project in this repository, built with Astro and deployed by
Cloudflare Pages at `agentshed.aloongplanet.com` (ADR-0031). It is not a single static file and not a
separate repository (ADR-0031 option 7).

### landing-page::CON-002 Two languages (direct acceptance)

Applies to: every page and string of the site. Chinese and English only, by choice and not by omission:
the landing page is a front door outside ADR-0013's scope (ADR-0031 option 6). The app speaks the same
two languages (ADR-0035).

### landing-page::CON-003 What the page reads (direct acceptance)

Applies to: the visitor's browser. The page reads the R2 latest pointer and GitHub's public releases
API, and nothing else at run time, to decide what to offer. Pre-releases are never looked for on R2,
since they never reach it (mac-distribution::CON-004).

## Failure modes and boundaries

**Sequence A: deciding the download**

- A1 Before any release exists: no pointer, and GitHub lists none → the list state, leading to an empty
  release list. The site goes live pointing at the first pre-release (ADR-0031), so this state lasts
  only as long as the site is up before that release.
- A2 Only `v0.1.0-beta` exists → the test state with `0.1.0-beta` (landing-page::REQ-001/AC-02).
- A3 A formal release has just been published on GitHub and its mirroring is still running → the
  pointer still names the previous formal release, which the page offers from R2 until the pointer
  moves (mac-distribution::REQ-003). For the first formal release there is no pointer yet, and GitHub
  supplies it in the formal state from GitHub.
- A4 A pre-release newer than the latest formal release → the page offers the formal release. The
  pre-release is reached through "See every version on GitHub".
- A5 The pointer cannot be read because of CORS, the network, a timeout or a malformed body → the
  GitHub path (landing-page::REQ-001/AC-02). The page never guesses a version.
- A6 GitHub rate-limits the visitor (unauthenticated requests are limited per IP) or answers with an
  error → treated as unreadable (landing-page::REQ-001/AC-03).
- A7 A read resolves after the page is shown → the state updates in place. Until then the list state
  is a valid way to download. If the visitor has already moved past the hero's download block (scrolled,
  or put back there by a language switch), what they are looking at does not move.
- A8 GitHub's answer includes drafts or releases without the expected DMG → drafts are ignored. A
  release without the DMG is not offered as a direct download; the page offers its release page
  instead.

**Sequence B: languages and navigation**

- B1 A direct visit to `/en` → English, with the toggle on EN. Toggling goes to the other language's
  page.
- B2 The navigation's GitHub link opens the repository in a new tab. The section links scroll within
  the page.

**Sequence C: the features section**

- C1 A fast scroll, or a jump to the download section and back → the showcase shows the step the scroll
  position gives (landing-page::REQ-004/AC-08), never one left over from before the jump.
- C2 Resizing across 760px, or changing the window's height → the layout switches between the pinned
  showcase and the stacked steps, and the step shown follows the scroll position under the new height,
  with no stale step.
- C3 A short window → the screenshot shrinks so that the whole of it stays under the header
  (landing-page::REQ-004/AC-01).
- C4 Screenshots not yet loaded → their space is held (landing-page::REQ-005/AC-03).
- C5 A language switch while the showcase is pinned → the other page shows the same step
  (landing-page::REQ-004/AC-07). The pinned showcase stays at one distance from the top wherever the
  visitor is within it, so it cannot be what marks the visitor's place.
- C6 A screen reader on a wide screen meets the current step only; the other steps are reached by
  scrolling (landing-page::REQ-004/AC-05).

**Sequence D: appearance**

- D1 Light and dark both carry the page's palette. Switching the system appearance recolours the page.
  Screenshots are taken in the light appearance and stay light in both.

**Content brought in from outside**

- E1 The pointer and GitHub's answer are external data. Only validated version strings and URLs on the
  expected hosts (the download host and github.com) reach the page, rendered as text and as link
  targets. Release notes and other release text are never inserted into the page.
- E2 The hero and the overview, project, token and session screenshots show real project names, paths,
  usage and session text by the owner's decision; the memory and search screenshots show none of the
  owner's data (landing-page::REQ-005/AC-01). Retaking them is the only way to change what they show.

## Implementation Decisions

- **The Astro project follows Transfer's site**: an i18n configuration with Chinese as the default at
  `/` and English under `/en`, a base layout, one component per section, and a two-language
  dictionary. Pages is configured as in Transfer's Pages guide (root directory `site`).
- **Deciding the download state is one pure function** from the two read results (pointer: a version,
  absent or unreadable; GitHub: a latest formal release, a newest pre-release, nothing, or unreadable)
  to one of the four states. A small browser script performs the reads and applies the result. The
  served HTML renders the list state.
- **The pointer read** takes a pointer only when its version is a formal version and its files name the
  arm64 DMG, by its packaged name, at exactly the URL the mirror's layout gives that version. Anything
  else is unreadable; a 404 means there is no pointer yet.
- **The GitHub read** uses the unauthenticated public REST API for this repository's releases, one request
  for the first hundred. A release counts when it is published (drafts are ignored) and its tag is `v`
  followed by a version of its kind: a suffix exactly when GitHub marks it a pre-release
  (mac-distribution Failure A2); any other entry is passed over. The newest by publication date is taken,
  the latest formal release first and the newest pre-release otherwise; the answer's order is not relied
  on. A release's DMG counts only once its upload has finished.
- **Both reads** give up after five seconds (Failure A5) and send no header that needs a CORS preflight.
  Every link is built from the validated version, never taken from an answer (Failure E1).
- **Applying a state** replaces, in place and as text, the hero's download block (the button, the pill on
  the platform line, the note or the link beneath it) and the download section's line and row; the list
  state rebuilds the markup as served. When a state lands while the hero's download block is above the
  visitor's view (the view starts below the sticky header), the page scrolls by the block's change, so
  what the visitor sees does not move; while the block is in view it changes in view (Failure A7).
- **The palette** is the app's purple palette, with light and dark both declared and switched by the
  system appearance. The test version's pill and note use the app's warning pair. The GitHub button
  beside Download is a secondary button: the card ground with the strong line, and the accent border on
  the soft accent ground on hover. Icons are inline SVG copied from Lucide (download).
- **The app icon** is the production artwork with its transparent exterior. In the hero its shadow follows
  the icon's outline: a shadow round the image's square box showed the transparent margin as a tile
  (decided 2026-10-18). The browser tab shows the app icon and "Agentshed — " followed by the hero title;
  the page's description is the hero paragraph.
- **The language toggle** is a link to the other language's page, so it works without scripts. Before
  leaving, a script notes the element in view, its distance from the top of the window and the current
  step; the other page puts the same element back at the same distance and makes the same step current
  (landing-page::REQ-004/AC-07). An element rather than a scroll offset, because the two languages' texts
  wrap to different heights. The pinned showcase is never that element (Failure C5).
- **The features section** is built as the prototype was: the showcase is pinned inside a block one
  window tall plus 60% of a window for each further step. The current step is the distance scrolled past
  the point where it pins, over 60% of the window's height, rounded and kept within the steps; it is
  computed on scroll and on resize, throttled to animation frames. The steps' texts share one place, and
  so do their screenshots; the others are hidden with visibility as well as opacity, since a transparent
  screenshot would still lie on top and take the pointer. The screenshot's width is capped by the
  window's height so that it stays whole. Below 760px the stacked steps replace the showcase.
- **The screenshots** ship as static assets with their width and height declared.

## Testing Decisions

Seams confirmed by the owner on 2026-10-13:

- **The download-state function**: unit tests cover every branch of landing-page::REQ-001, malformed
  pointer and GitHub bodies, drafts, a release without the DMG, and URLs on unexpected hosts.
- **A check of the built site**: both pages are generated, the served HTML is in the list state with
  the release-list links, both languages' copy and screenshots are present, and every screenshot
  declares its size. It reads a fresh build made for the run, never a previous one.
- **The palette**: a unit test holds every token the page shares with the app to the app's purple values,
  in light and in dark, and every token to a declaration in both.

Beside them, for the parts the state function does not reach:

- **The two reads**, through an injected fetch, so no case reaches the network: real-shaped answers (the
  pointer as the release script writes it, GitHub's answer as GitHub gives it) and each way they can be
  unreadable.
- **A state applied to the built page**: each state's view applied to a fresh copy of the served page,
  read back from the page; the requests the page's script makes, at the injected fetch (landing-page::CON-003).
- **Evidence**: the features section's scroll behaviour, the four states' rendering, and
  landing-page::QR-001 are measured in a browser, as they were on the prototype (geometry and computed
  styles, not pixels), and the measurement record is kept.

Prior art: Transfer's site tests for its download configuration, and the prototype's browser checks.

## Out of Scope

- Download statistics (deferred, ADR-0031 option 10).
- More than two languages (ADR-0031 option 6).
- A copy of the page in mainland China (ADR-0031 option 8).
- A version constant built into the site (rejected 2026-10-13 in favour of reading at run time).
- Clicking or keying between the feature steps: the showcase shows one step at a time and turns with the
  scroll (landing-page::REQ-004/AC-08).

## Further Notes

- Prototype gate: passed on 2026-10-13 for the page structure, the copy, the privacy-flavoured subtitle,
  the install steps, the scroll-linked features section and the cropped screenshots. The owner also
  chose to read the pointer at run time and approved the screenshots for publication. The same day the
  owner confirmed the revised prototype's list state (landing-page::REQ-002/AC-04) and its
  formal-from-GitHub state (landing-page::REQ-002/AC-02). On 2026-10-18 the owner chose the app icon for
  the browser tab, and confirmed the revised prototype's hero icon: the real artwork, its shadow on its
  outline. On 2026-10-19 the owner confirmed the revised prototype's dark warning colours, brought to the
  app's own (the test state's pill and note). On 2026-10-21 the owner confirmed the revised prototype:
  a step for memory and one for search across projects, the sessions step's wording, the retaken hero,
  the pinned features section (after the layout of a reference page the owner supplied; a slide between
  steps was tried and dropped, since it made the screenshot jump), the heading and the README's summary
  in the hero, and made-up data in the memory and search screenshots.

- The download host is `dl.agentshed.aloongplanet.com` (mac-distribution::REQ-004), and the pointer is
  `latest.json` at its root; the pointer's shape is in mac-distribution's Implementation Decisions.
