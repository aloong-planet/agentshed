# Landing page

> Related: [ADR-0031](../adr/0031-macos-release-line.md) · [mac-distribution](mac-distribution.md) (the
> releases and the pointer it reads) · [app-update](app-update.md) (the update button its install steps
> mention)
>
> Pending: the landing page is live at `agentshed.aloongplanet.com`. Until it is there is no feature
> entry to link.

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

- landing-page::US-003/AC-01: The features section presents four steps in order — the overview, what
  each project has, token usage and trends, and sessions revisited — each with a screenshot of that
  view (landing-page::REQ-004, landing-page::REQ-005).

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

### landing-page::REQ-004 The scroll-linked features section

- landing-page::REQ-004/AC-01: On a wide screen the four text steps sit on the left and move with the
  page. One screenshot frame on the right stays in place, centred under the header and never tucked
  beneath it, and shows the step whose text is nearest its middle. Scrolling down visits the steps in
  order.
- landing-page::REQ-004/AC-02: The current step has an accent bar at its left and a darker title. The
  other steps have grey titles. A hovered step shows a stronger grey bar and a darker title, and the
  current step keeps its accent bar while hovered.
- landing-page::REQ-004/AC-03: Each step is about a third of a screen tall, so the steps either side of
  the current one stay at least partly in view and the column reads as a list to pick from.
- landing-page::REQ-004/AC-04: Clicking a step, or pressing Enter on it, scrolls it level with the
  frame's middle, and the frame follows. Keyboard focus shows a ring inside the step's own box.
- landing-page::REQ-004/AC-05: The frame's screenshots cross-fade, and switch at once under reduced
  motion. Only the shown screenshot is visible to the pointer and to assistive technology.
- landing-page::REQ-004/AC-06: Below 760px there is no fixed frame. Each step's own screenshot sits
  under its text, with a clear gap before the next step's title.
- landing-page::REQ-004/AC-07: Switching language keeps the current step and the scroll position.

### landing-page::REQ-005 The screenshots

- landing-page::REQ-005/AC-01: The screenshots come from the built app over the owner's own agent data,
  approved for publication by the owner on 2026-10-13. There is one set per language, taken in the light
  appearance.
- landing-page::REQ-005/AC-02: The hero screenshot is the whole window. Each feature screenshot is cut
  to the part of the window its step is about. All four are the same size (16:9) at the same zoom, so
  the text stays one size as the frame switches. Each cut ends between list rows, and the token cut
  leaves out the recent-sessions list.
- landing-page::REQ-005/AC-03: Every screenshot's space is held before it loads, so nothing jumps.

### landing-page::REQ-006 Copy (direct acceptance)

The copy is in Chinese and English only. Where the page refers to the agents Agentshed reads, it names
examples without presenting them as the complete set ("Claude Code, Codex and other coding agents"),
so a new agent side does not make it untrue. The page uses the app's own palette, in light and dark,
following the visitor's system appearance.

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
the app speaks six languages, and the landing page is a front door outside ADR-0013's scope (ADR-0031
option 6).

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
  is a valid way to download.
- A8 GitHub's answer includes drafts or releases without the expected DMG → drafts are ignored. A
  release without the DMG is not offered as a direct download; the page offers its release page
  instead.

**Sequence B: languages and navigation**

- B1 A direct visit to `/en` → English, with the toggle on EN. Toggling goes to the other language's
  page.
- B2 The navigation's GitHub link opens the repository in a new tab. The section links scroll within
  the page.

**Sequence C: the features section**

- C1 A fast scroll or a jump to the download section and back → the frame always shows the step nearest
  its middle (landing-page::REQ-004/AC-01).
- C2 Resizing across 760px → the layout switches between the fixed frame and stacked screenshots
  without leaving a stale current step.
- C3 A short window: the step above the current one may slide under the sticky header, as any scrolled
  content does. Its text body stays visible.
- C4 Screenshots not yet loaded → their space is held (landing-page::REQ-005/AC-03).

**Sequence D: appearance**

- D1 Light and dark both carry the page's palette. Switching the system appearance recolours the page.
  Screenshots are taken in the light appearance and stay light in both.

**Content brought in from outside**

- E1 The pointer and GitHub's answer are external data. Only validated version strings and URLs on the
  expected hosts (the download host and github.com) reach the page, rendered as text and as link
  targets. Release notes and other release text are never inserted into the page.
- E2 The screenshots show real project names, paths, usage and session text by the owner's decision
  (landing-page::REQ-005/AC-01). Retaking them is the only way to change what they show.

## Implementation Decisions

- **The Astro project follows Transfer's site**: an i18n configuration with Chinese as the default at
  `/` and English under `/en`, a base layout, one component per section, and a two-language
  dictionary. Pages is configured as in Transfer's Pages guide (root directory `site`).
- **Deciding the download state is one pure function** from the two read results (pointer: a version,
  absent or unreadable; GitHub: a latest formal release, a newest pre-release, nothing, or unreadable)
  to one of the four states. A small browser script performs the reads and applies the result. The
  served HTML renders the list state.
- **The GitHub read** uses the unauthenticated public REST API for this repository's releases. Drafts
  are ignored; the latest formal release is taken first and the newest pre-release otherwise.
- **The palette** is the app's purple palette, with light and dark both declared and switched by the
  system appearance. Icons are inline SVG copied from Lucide (download).
- **The features section** is built as the prototype was: a sticky frame, the nearest-to-middle rule
  computed on scroll (throttled to animation frames), a click scrolling the step to the frame's middle,
  and stacked screenshots below 760px.
- **The screenshots** ship as static assets with their width and height declared.

## Testing Decisions

Seams confirmed by the owner on 2026-10-13:

- **The download-state function**: unit tests cover every branch of landing-page::REQ-001, malformed
  pointer and GitHub bodies, drafts, a release without the DMG, and URLs on unexpected hosts.
- **A check of the built site**: both pages are generated, the served HTML is in the list state with
  the release-list links, both languages' copy and screenshots are present, and every screenshot
  declares its size.
- **Evidence**: the features section's scroll and click behaviour, the four states' rendering, and
  landing-page::QR-001 are measured in a browser, as they were on the prototype (geometry and computed
  styles, not pixels), and the measurement record is kept.

Prior art: Transfer's site tests for its download configuration, and the prototype's browser checks.

## Out of Scope

- Download statistics (deferred, ADR-0031 option 10).
- More than two languages (ADR-0031 option 6).
- A copy of the page in mainland China (ADR-0031 option 8).
- A version constant built into the site (rejected 2026-10-13 in favour of reading at run time).

## Further Notes

- Prototype gate: passed on 2026-10-13 for the page structure, the copy, the privacy-flavoured subtitle,
  the install steps, the scroll-linked features section and the cropped screenshots. The owner also
  chose to read the pointer at run time and approved the screenshots for publication. The same day the
  owner confirmed the revised prototype's list state (landing-page::REQ-002/AC-04) and its
  formal-from-GitHub state (landing-page::REQ-002/AC-02).

- The download host is still being decided (mac-distribution::REQ-004). The page reads the pointer
  from whichever host is chosen.
