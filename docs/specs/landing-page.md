# Landing page

> Related: [ADR-0050](../adr/0050-landing-page-in-this-repository.md) · [ADR-0031](../adr/0031-macos-release-line.md) ·
> [ADR-0055](../adr/0055-download-count.md) · [ADR-0056](../adr/0056-download-count-collected-by-a-cloudflare-worker.md) ·
> [mac-distribution](mac-distribution.md) (the releases and the pointer it reads) ·
> [app-update](app-update.md) (the update button its install steps mention)

## Problem Statement

People who have never seen the repository need a place that says what Agentshed is and lets them
download it. The README is written for people already on GitHub. Releases come in two kinds,
pre-releases and formal releases, and the R2 mirror holds formal releases only. So the page has to offer
whichever release exists, say plainly when that is a test version, and keep doing so release after
release without being edited. A visitor weighing an app they have
never heard of also looks for a sign that other people download it.

## Solution

A `site/` project in this repository, built with Astro and deployed by Cloudflare Pages at
`agentshed.aloongplanet.com`, in English (at `/`) and Chinese (at `/zh/`). It is
one long page (form "L1"): header, hero with the download, a scroll-linked features section, three
install steps, a download section and a footer. The visitor's browser decides what to offer. It reads
the R2 latest pointer for a formal release. Failing that, it reads GitHub's public releases API, which
gives the latest formal release if there is one and otherwise the newest pre-release. Failing both, it
offers GitHub's release list. A release therefore never needs a site change. The download section also says
how many times the app has been downloaded. The screenshots are real app screenshots.

## User Stories

### landing-page::US-001 Understand what Agentshed is and download it

As a visitor, I want to see at a glance what Agentshed does and get it in one click, so that I can try
it without reading the repository.

- landing-page::US-001/AC-01: The hero shows the app icon, the title, a one-paragraph description, the
  download button with the platform line "macOS 12 or later · Apple Silicon", and a walkthrough with captions in the page language.
- landing-page::US-001/AC-02: When a formal release exists, the hero button downloads that release's
  DMG directly.
- landing-page::US-001/AC-03: When only pre-releases exist, the hero button leads to the newest
  pre-release on GitHub, and the page says plainly that it is a pre-release version and that no stable release
  exists yet.
- landing-page::US-001/AC-04: When the page cannot tell what exists, the button still leads to the
  downloads: GitHub's release list.

### landing-page::US-002 Read the page in my language

As a visitor, I want the page in Chinese or English, so that I can read it comfortably.

- landing-page::US-002/AC-01: English is served at `/`, regardless of the browser language, and Chinese
  at `/zh/`. A toggle at the right of the header links directly between them.
- landing-page::US-002/AC-02: Both languages carry the same sections, the same download states and
  their own set of screenshots.
- landing-page::US-002/AC-03: Old `/en` and `/en/` links permanently redirect to `/`, preserving
  query parameters and page fragments, including when JavaScript is disabled.

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
- landing-page::REQ-002/AC-03: **Test**: the hero button reads "Download pre-release version <version>" and
  leads to that pre-release's page on GitHub. Beneath it, the platform line carries a "Pre-release version"
  pill, followed by the note "No stable release yet. The pre-release version downloads from GitHub and may
  still be rough in places." The download section reads "Only a pre-release version so far: <version>", with
  the pill, and its one button reads "Download the pre-release version from GitHub".
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

- landing-page::REQ-005/AC-01: The overview, project, token and
  Chinese session screenshots come from the built app over the owner's own agent data, approved for
  publication by the owner. The memory and search screenshots come from the built app over a made-up
  home whose projects, memory files and questions have the shape of real ones, the same projects in
  both. There is one set per language, taken in the light appearance. The English session screenshot
  is retaken from the built app over an English example conversation, including English questions,
  replies and tool details.
- landing-page::REQ-005/AC-02: Each feature screenshot is cut to the part of the window its step is about. All six are the
  same size (16:9) at the same zoom, so the text stays one size as the steps turn. Each cut ends between
  list rows. The token cut leaves out the recent-sessions list. The memory cut shows a memory file open
  in the drawer as rendered Markdown, over the Agents page's Memory section with that file's project
  expanded, and ends between the drawer's lines too. The search cut starts at the search box and keeps
  each row's hit count and time.
- landing-page::REQ-005/AC-03: Every screenshot's space is held before it loads, so nothing jumps.

### landing-page::REQ-006 Copy (direct acceptance)

The copy is in Chinese and English only. Where the page refers to the agents Agentshed reads, it names
examples without presenting them as the complete set ("Claude Code, Codex and other coding agents").
The page uses the app's own palette, in light and dark,
following the visitor's system appearance.

### landing-page::REQ-007 The hero's heading (direct acceptance)

The hero's heading is "Your coding agents, in full view" in English.

### landing-page::REQ-008 What the project step names (direct acceptance)

The features section's project step lists what a project has using the app's own word for the section
([project-detail::REQ-004](project-detail.md)): "Skills, subagents, plugins, MCP servers and instructions" in English,
and the same list with the section's Chinese label in Chinese.

### landing-page::REQ-009 Walkthrough video

- landing-page::REQ-009/AC-01: Both pages show the approved local poster in the existing window frame. The playback entry reads
  “Watch demo · 1:07” in English and uses its localized label with the same duration in Chinese. Each page opens its own video with
  English narration and captions in the page language.
- landing-page::REQ-009/AC-02: No YouTube player, thumbnail, preconnect or script loads before activation.
  Clicking the entry or activating it with Enter replaces the poster with the privacy-enhanced YouTube
  player and requests playback. The player supports inline playback and fullscreen; browser playback
  restrictions may require another press of the player's Play control. The frame stays 16:9 throughout.
- landing-page::REQ-009/AC-03: “Watch on YouTube” remains available below the frame. Without site scripts,
  the poster is also a direct YouTube link. Modified clicks keep normal link behavior.
- landing-page::REQ-009/AC-04: The video is hosted on YouTube. Only the poster and the published video's
  link ship in the website repository; the narration and music are the ones the owner approved.

### landing-page::REQ-010 Author homepage (direct acceptance)

In both languages, the existing footer copyright line links the author name "aloongplanet" to
`https://aloongplanet.com` in a new tab, with the existing footer layout and styling.

### landing-page::REQ-011 The download count

- landing-page::REQ-011/AC-01: Below its download row, the download section shows one line with the
  download count: "Downloads so far: N" in English and its Chinese counterpart, N being the count floored
  to a whole number and grouped as the page's language groups numbers. The line's space is held from the
  first render, so nothing on the page moves when its text appears.
- landing-page::REQ-011/AC-02: The count is the sum, over every published release, formal or pre-release,
  of its disk image's downloads: on GitHub, the download count GitHub reports for the DMG asset; on the
  download host, the bytes the DMG was served in successful `GET` requests from visitors (status 200 or 206)
  divided by the DMG's size. Drafts, the update ZIPs, their blockmaps, the update metadata, the latest
  pointer and the statistics file count for nothing. A download is an event: nothing is de-duplicated
  between the two sources or between visitors.
- landing-page::REQ-011/AC-03: The count never goes down. A DMG asset deleted from GitHub keeps the last
  count read for it, and a DMG removed from the bucket keeps the bytes it was served.
- landing-page::REQ-011/AC-04: The count is brought up to date every hour and published as the statistics
  file `stats/downloads.json` on the download host. Each update counts the download host's traffic up to the
  last full hour that ended at least 30 minutes before the update started.

  > Pending: the Worker writes `stats/downloads.json` (Implementation Decisions "The shadow period").
- landing-page::REQ-011/AC-05: The line stays empty, and the rest of the page is unaffected, when the
  statistics file is absent, cannot be fetched (the network, CORS, the time limit, an answer other than
  2xx), is not JSON, has a `schemaVersion` other than 1, or holds a total, GitHub share or R2 share that is
  negative or not finite, a total above 9007199254740991, or a total that differs from the sum of the two
  shares by more than 0.000001. Without scripts the line stays empty.
- landing-page::REQ-011/AC-06: The read of the statistics file never changes or delays the download the
  page offers, in any of the four states, whether it succeeds, fails or is still pending.

### landing-page::REQ-012 Back to the aloong planet homepage

- landing-page::REQ-012/AC-01: The header's left end shows, in order, "aloong planet", the separator "/"
  and the brand. "aloong planet" is a link that opens `https://aloongplanet.com/` in the current tab; the
  "/" is not a link and assistive technology does not read it; the brand keeps its link. Both languages
  show "aloong planet", untranslated.
- landing-page::REQ-012/AC-02: "aloong planet" and "/" take the size and grey of the header's navigation
  links, with 10px between each of the three ("aloong planet", "/", the brand); in the narrow window of
  landing-page::REQ-012/AC-03, "aloong planet" and "/" are 4px apart. Hovering "aloong planet" turns it the
  navigation links' hover colour.
- landing-page::REQ-012/AC-03: In a window 400px wide or narrower, "aloong planet /" shrinks to 11px, with a
  line height 1.3 times that size, on its own line 1px above the brand's line; the header keeps its height
  and the language toggle stays at the right.

## Quality Requirements

### landing-page::QR-001 Layout holds across widths, languages and appearances

Applies to: the whole page, in both languages, both appearances and all four download states.

- landing-page::QR-001/AC-01: At the widths the confirmed prototype was verified at (400, 900, 1280
  and 1440px), the page never scrolls sideways, every button stays inside its card, and the hero keeps
  its side gutters.

## Constraints

### landing-page::CON-001 Where the site lives (direct acceptance)

Applies to: the landing page. A `site/` project in this repository, built with Astro and deployed by
Cloudflare Pages at `agentshed.aloongplanet.com` (ADR-0050). It is not a single static file and not a
separate repository (ADR-0050 option 3).

### landing-page::CON-002 Two languages (direct acceptance)

Applies to: every page and string of the site. Chinese and English only, by choice and not by omission:
the landing page is a front door outside ADR-0013's scope (ADR-0050 option 2). The app speaks the same
two languages (ADR-0035).

### landing-page::CON-003 What the page reads (direct acceptance)

Applies to: the visitor's browser. To decide what download to offer, the page reads the R2 latest pointer
and GitHub's public releases API, and no other source. Its only other read is the statistics file, for
the download count (landing-page::REQ-011). The walkthrough additionally loads YouTube only after the
visitor activates its poster (REQ-009). Pre-releases are never looked for on R2, since they never reach it
(mac-distribution::CON-004).

### landing-page::CON-004 What the collection may cost (direct acceptance)

Applies to: the collection and every Cloudflare resource it uses (Implementation Decisions "The collection"). It
runs within Cloudflare's Workers Free plan and triggers no paid plan.

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

- B1 A direct visit to `/` → English, even with a Chinese browser preference; `/zh/` → Chinese.
  Old `/en` and `/en/` links redirect to `/`, including links with query parameters or a section fragment,
  without requiring scripts (landing-page::US-002/AC-03). The toggle links to the other language directly.
- B2 The navigation's GitHub link opens the repository in a new tab. The section links scroll within
  the page. The footer author name opens the owner's homepage in a new tab (landing-page::REQ-010).

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
- C7 A visitor without scripts → the stacked steps show at every width, each with its screenshot: nothing
  would turn the showcase, which would stay on its first step while its block scrolled by.

**Sequence D: appearance**

- D1 Light and dark both carry the page's palette. Switching the system appearance recolours the page.
  Screenshots are taken in the light appearance and stay light in both.

**Content brought in from outside**

- E1 The pointer and GitHub's answer are external data. Only validated version strings and URLs on the
  expected hosts (the download host and github.com) reach the page, rendered as text and as link
  targets. Release notes and other release text are never inserted into the page.
- E2 The overview, project, token and Chinese session screenshots show real project names, paths,
  usage and session text by the owner's decision; the English session, memory and search screenshots show none of the
  owner's data (landing-page::REQ-005/AC-01). Retaking them is the only way to change what they show, so the
  overview and project screenshots keep showing the Instructions section's former name and place until they are
  next retaken.
- E3 The statistics file is external data too. Only its validated total (landing-page::REQ-011/AC-05)
  reaches the page, as the number in the count's text; nothing else it holds is inserted into the page.
- E4 The run record's entries, whose failures quote what GitHub, Cloudflare or the bucket answered, are external
  data in the watchdog's log (Failure G8): each is printed as one line of JSON, so no text in it is read as a
  workflow command.

**Sequence F: watching the walkthrough in either language**

- F1 A visitor opens the page → only the local poster loads; no sound or YouTube request starts.
- F2 A mouse click or Enter on the poster → one player replaces it without changing the frame size;
  focus moves to the iframe. Playback starts when allowed by the browser.
- F3 Scripts disabled → the poster and the separate link open YouTube. A modified click also opens
  YouTube using normal browser link behavior.
- F4 YouTube is blocked, unavailable or refuses embedded playback → its player owns the error;
  “Watch on YouTube” stays reachable, as do the site's download links. Direct playback also requires
  YouTube access. Reloading the page restores the poster.
- F5 Resize or use a phone → poster and player fit the same responsive 16:9 area, without horizontal overflow.

**The download count**

- G1 A statistics file that exists in the bucket but cannot be read, is not JSON, has a `schemaVersion`
  other than 1 or does not match the statistics file's fields (Implementation Decisions) → the run fails
  and writes nothing. The count starts over only when the bucket holds no such object.
- G2 A run in which any read fails or answers what the run cannot validate (GitHub's releases, GitHub
  refusing a read without a token for its rate limit included; the bucket's listing; the analytics or their
  limits) → it writes nothing and the cursor stays where it was; the next run counts the hours this one missed.
- G3 A cursor older than the oldest full hour the analytics still hold, after the collection stopped or its
  runs kept failing → every run fails, until the gap is accepted: a run whose cursor equals the Worker's
  `ACCEPT_GAP_FROM` setting resumes from the oldest full hour the analytics hold and records the skipped hours
  in `r2Gaps`, and a run whose cursor differs from the setting ignores it. Those hours are never counted.
- G4 No DMG mirrored yet, while only pre-releases exist → the download host's share is zero and the run
  succeeds.
- G5 A mirrored DMG whose size in the bucket differs from the size the statistics file recorded for it →
  the run fails.
- G6 The project's own downloads count like anyone's: the release workflow reads each mirrored DMG back
  once per formal release ([mac-distribution::REQ-003](mac-distribution.md)), and that read counts as one
  download.
- G7 The page served from any origin other than the landing page's, such as a Pages preview → the
  count's line stays empty ([mac-distribution::REQ-004/AC-03](mac-distribution.md)).
- G8 The collection stops for any reason, the Worker no longer running included → the statistics file's
  `updatedAt` stops moving. The watchdog, which holds no secret, fails its run, and so GitHub notifies, when the
  file read through the download host answers other than 200, is not JSON, has a `schemaVersion` other than 1, or
  has an `updatedAt` more than 6 hours before the watchdog's clock or more than 5 minutes after it; the failed run
  shows the run record's newest 24 entries.

  > Pending: the Download count workflow is the watchdog.
- G9 A run record or comparison record that cannot be read, or that is not one (Implementation Decisions) →
  the statistics file is counted and written as in any other run; nothing is appended to that record, which is
  left as it is, and the run reports it. A run whose run-record entry was not appended counts as missing.
- G10 Two runs overlapping → a run writes its file only if it is still the object the run read, and creates it
  only if there is none; the run that finds it changed fails (Failure G2), so an older read never replaces a
  newer count.

## Implementation Decisions

- **The hero video** uses a local 1600×900 poster and a progressively enhanced YouTube link.
  Activation creates an iframe on `youtube-nocookie.com` with playback requested, inline playback
  and fullscreen allowed, and the `strict-origin-when-cross-origin` referrer policy, which sends YouTube
  the embedding origin. No YouTube API library is loaded.

- **The Pages project** has its root directory set to `site`. It permanently redirects the legacy English URLs; the static build includes a fallback for local previews.
- **The pointer read** takes a pointer only when its version is a formal version and its files name the
  arm64 DMG, by its packaged name, at exactly the URL the mirror's layout gives that version. Anything
  else is unreadable; a 404 means there is no pointer yet.
- **The GitHub read** uses the unauthenticated public REST API for this repository's releases, one request
  for the first hundred. A release counts when it is published (drafts are ignored) and its tag is `v`
  followed by a version of its kind: a suffix exactly when GitHub marks it a pre-release
  (mac-distribution Failure A2); any other entry is passed over. The newest by publication date is taken,
  the latest formal release first and the newest pre-release otherwise; the answer's order is not relied
  on. A release's DMG counts only once its upload has finished.
- **Every read** (the pointer, GitHub and the statistics file) gives up after five seconds (Failure A5) and
  sends no header that needs a CORS preflight.
  Every link is built from the validated version, never taken from an answer (Failure E1).
- **Applying a state** replaces, in place and as text, the hero's download block (the button, the pill on
  the platform line, the note or the link beneath it) and the download section's line and row; the list
  state rebuilds the markup as served. When a state lands while the hero's download block is above the
  visitor's view (the view starts below the sticky header), the page scrolls by the block's change, so
  what the visitor sees does not move; while the block is in view it changes in view (Failure A7).
- **The palette** is the app's purple palette, with light and dark both declared and switched by the
  system appearance. The pre-release version's pill and note use the app's warning pair. The GitHub
  button beside Download is a secondary button: the card ground with the strong line, and the accent
  border on the soft accent ground on hover. The text is set in the system font stack; the page
  loads no web font.
- **The app icon** is the production artwork with its transparent exterior. In the hero its shadow
  follows the icon's outline. The browser tab shows the app icon and "Agentshed — " followed by the
  hero title; the page's description is the hero paragraph.
- **The language toggle** is a link to the other language's page, so it works without scripts. Before
  leaving, a script notes the element in view, its distance from the top of the window and the current
  step; the other page puts the same element back at the same distance and makes the same step current
  (landing-page::REQ-004/AC-07). The pinned showcase is never that element (Failure C5).
- **The header's trail** (landing-page::REQ-012) is a navigation landmark named "Breadcrumb" in English and
  its Chinese counterpart in Chinese. It holds "aloong planet" and the brand as an ordered list of two links,
  and the brand is marked as the current page.
- **The features section**: the showcase is pinned inside a block one window tall plus 60% of a
  window for each further step, so the number of steps sets the block's height. The current step is
  the distance scrolled past the point where it pins, in turns, rounded and kept within the steps,
  both measured from the page; it is computed on scroll and on resize. The steps' texts share one
  place, and so do their screenshots; the others are hidden with visibility as well as opacity, and
  take no pointer.
- **The screenshots** ship as static assets with their width and height declared. They are taken at 2×
  pixels from a window 1280pt wide and 800pt tall. Each feature cut is 920×517pt (16:9) and holds the
  token page's trend chart and per-model figures whole. The search and memory screenshots are taken from a
  window narrowed to 984pt, in which the pane reflows into the 920pt cut; the memory cut expands a project
  with only a few memory files, with other projects still in view. The English session retake uses a 1240pt
  window, in which the session pane fits the 920pt cut with its right edge whole.
- **The collection** is a Cloudflare Worker that a Cron Trigger runs every hour, running the modules of the
  agentshed commit that aloong-planet/infra pins, each checked against its pinned SHA-256 (ADR-0056). A DMG is an
  asset or object named `Agentshed-<version>-mac-<arch>.dmg`, the packaged name, with `<version>` an `x.y.z`
  version, optionally with a pre-release suffix, and `<arch>` one of `arm64`, `x64` and `universal`. A run
  reads the previous statistics file from the bucket itself, through the Worker's binding to it, never through
  the download host's cache; GitHub's releases, every page, drafts skipped, without a token and with a
  User-Agent; the bucket's listing under `releases/`, every page of it; and Cloudflare's
  `httpRequestsAdaptiveGroups` for the zone, filtered to the download host as `clientRequestHTTPHost`, to the
  method and statuses landing-page::REQ-011/AC-02 counts, to `clientRequestPath` under `/releases/` and to
  `requestSource` `eyeball`, summing `edgeResponseBytes` by `clientRequestPath`. It first reads the dataset's
  `notOlderThan`, `maxDuration` and `maxPageSize` from the analytics' `settings`, queries from the cursor to the hour
  landing-page::REQ-011/AC-04 counts to, in ranges no wider than `maxDuration`, each asking for `maxPageSize`
  rows, and on a first run starts at the oldest full hour `notOlderThan` allows. A range answered with a full
  page fails the run, and so does an analytics answer that carries `errors`, even with HTTP 200, or that is
  not for exactly one zone. It writes the new file (Failures G2, G10) as `application/json` with
  `public, max-age=300`. A run without its credentials fails.
- **The statistics file** is JSON with these fields; the page reads `schemaVersion` and `summary` only.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1`; another value: landing-page::REQ-011/AC-05, Failure G1 |
| `updatedAt` | string, ISO 8601 UTC | When the run that wrote the file read its sources |
| `r2Cursor` | string, ISO 8601 UTC, on the hour | The download host's traffic before this hour is counted, and none after it |
| `r2Gaps` | array of `{ from, to }`, each ISO 8601 UTC on the hour | The ranges accepted as never counted (Failure G3); empty when there are none |
| `summary.total` | number | `summary.sources.github` plus `summary.sources.r2`, unrounded |
| `summary.sources.github` | number | The sum of `downloads` over `github.assets` |
| `summary.sources.r2` | number | The sum of `bytes` divided by `size` over `r2.objects`, unrounded |
| `github.assets` | object keyed by GitHub's asset ID | `{ name, downloads }`: the DMG's file name and the highest count read for it |
| `r2.objects` | object keyed by the object's key in the bucket | `{ name, size, bytes }`: the DMG's file name, its size in bytes and the bytes it was served in counted requests |

- **The run record** is `stats/worker-runs.json` in the bucket, written by the Worker alone after every run,
  as `application/json` with `public, max-age=300`. Another `schemaVersion`, or any other shape: Failure G9.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1` |
| `seed` | `{ at, r2Cursor, r2Bytes }` or null | The statistics file the shadow file started from ("The shadow period"): when it was read, its `r2Cursor`, and the sum of `bytes` over its `r2.objects` |
| `runs` | array, oldest first | The newest 336 runs; appending one more drops the oldest |
| `runs[].scheduledTime` | string, ISO 8601 UTC | The Cron Trigger's scheduled time for the run |
| `runs[].coreSha256` | string, 64 lowercase hex digits | The pinned SHA-256 of the core module the run used |
| `runs[].key` | string | The file the run writes, `stats/downloads.json` or `stats/downloads-shadow.json` |
| `runs[].written` | boolean | Whether the run wrote that file |
| `runs[].github` | `ok`, `rate-limited`, `failed` or `not-read` | GitHub's read. `rate-limited`: GitHub answered 403 or 429 with `x-ratelimit-remaining` `0`, or with a message naming a secondary rate limit; `failed`: any other failed read or answer the run cannot validate; `not-read`: the run failed before that read |
| `runs[].analytics` | `ok`, `failed` or `not-read` | The analytics' settings and traffic reads, as for `github` |
| `runs[].bucket` | `ok`, `failed` or `not-read` | The previous file, the listing and the write, as for `github` |
| `runs[].failure` | string or null | What failed the run, never a credential; null when it wrote its file |
| `runs[].r2Cursor` | string, ISO 8601 UTC, on the hour, or null | The cursor of the file the run wrote; null when it wrote nothing |

- **The shadow period** lasts until the switch below. The Worker writes `stats/downloads-shadow.json`, a
  statistics file in every respect but its key (Failures G1 to G5, G10 apply to it), and the Download count
  workflow keeps collecting into the statistics file, one run at a time, on GitHub's schedule and when run by
  hand, accepting a gap only in a manual run asked to. While the shadow file is absent, the Worker takes the
  statistics file as the previous file, starting over only when that is absent too (Failure G1), and records it
  as the run record's `seed`.

  After each run in which it wrote the statistics file, the workflow compares it with the shadow file and appends
  the comparison to `stats/shadow-comparisons.json`, which it alone writes, with the run record's content type and
  cache control. A comparison never fails the run.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1` |
| `comparisons` | array, oldest first | Every comparison of the shadow period |
| `comparisons[].at` | string, ISO 8601 UTC | When the workflow compared |
| `comparisons[].workflowRunId` | number | The workflow run that compared |
| `comparisons[].workflowCommit` | string, 40 lowercase hex digits | The commit that run used |
| `comparisons[].workflowCoreSha256` | string, 64 lowercase hex digits | The SHA-256 of the core module at that commit |
| `comparisons[].workerScheduledTime` | string, ISO 8601 UTC, or null | The newest run record entry that wrote the shadow file |
| `comparisons[].workerCoreSha256` | string, 64 lowercase hex digits, or null | That entry's `coreSha256` |
| `comparisons[].r2Cursor` | `{ statistics, shadow }`, each ISO 8601 UTC or null | Each file's `r2Cursor` |
| `comparisons[].status` | `cursors-differ`, `equal` or `not-equal` | `cursors-differ` when the two cursors differ, in which case nothing else is compared; otherwise `equal` when every check holds and `not-equal` when one fails |
| `comparisons[].checks` | `{ r2Bytes, githubAssets, core }`, each boolean, or null | `r2Bytes`: every key of either file's `r2.objects` has the same bytes in the other, a key one file lacks counting as 0, and the same size where both have it; `githubAssets`: every asset of the file with the earlier `updatedAt` is in the other with at least its downloads; `core`: the two core hashes are equal. Null for `cursors-differ` |
| `comparisons[].r2BytesSinceSeed` | number or null | The sum of `bytes` over the statistics file's `r2.objects` minus the seed's `r2Bytes` |

  The Worker takes the statistics file over only when, over a window of at least 7 consecutive UTC days and at
  least 168 scheduled hours, all five hold:

  1. scheduled hours with no run record entry are at most 5% of the scheduled hours;
  2. entries whose `github` is `ok` are at least 95% of the scheduled hours;
  3. every comparison other than `cursors-differ` is `equal`, at least one is made on every UTC day of the window,
     and at least one has an `r2BytesSinceSeed` above 0;
  4. landing-page::CON-004 holds;
  5. the workflow's scheduled runs started on every UTC day of the window.

  The switch deletes the shadow file and the run record's `seed`, leaves the comparison record as it is, written no
  more, and makes the workflow the watchdog (Failure G8).

## Out of Scope

- Retaking the screenshots only because the Instructions section changed its name and place (E2).
- A count per release, per period or per source on the page: the figure answers one question, how many
  times Agentshed has been downloaded (ADR-0055).
- More than two languages (ADR-0050 option 2).
- A copy of the page in mainland China (ADR-0050 option 4).
- A version constant built into the site (rejected in favour of reading at run time).
- Clicking or keying between the feature steps: the showcase shows one step at a time and turns with the
  scroll (landing-page::REQ-004/AC-08).
- Any download other than the disk image for Macs with Apple Silicon on macOS 12 or later: there is
  no Intel, Windows or Linux download.
- Keeping the hero's heading and paragraph word for word the same as the README's opening (the owner
  does not need the two to match).
- The homepage's Apps and Agents menus in the header: the header only links back to the homepage
  (landing-page::REQ-012).

## Further Notes

- The download host is `dl.agentshed.aloongplanet.com` (mac-distribution::REQ-004), and the pointer is
  `latest.json` at its root; the pointer's shape is in mac-distribution's Implementation Decisions.
