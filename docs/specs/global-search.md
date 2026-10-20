# Global search

> Related: [features](../features/global-search.md) · [ADR-0034](../adr/0034-global-search-question-corpus-in-memory.md)
> (question texts held in memory) · [ADR-0028](../adr/0028-tanstack-query-as-the-renderer-query-layer.md)
> (query layer, page switches as Transitions) · [ADR-0015](../adr/0015-structured-ipc-errors.md) /
> [ADR-0016](../adr/0016-no-natural-language-across-ipc.md) · [session-view](session-view.md) (the session
> page a hit opens, and a project's own session search) · CONTEXT: **Global search**, **Session**,
> **Project**, **Stale project**, **Transfusion**
> Status: specified 2026-10-19 (prototype gate passed the same day); the page, its search, a hit's jump
> into its project, and the way back to the results or on into the project shipped 2026-10-19.
>
> Pending: ⌘⇧F and the Edit menu's "Search Sessions…" open the page (global-search::US-004).

## Problem Statement

A project's own session search only looks inside that project. When the user remembers what they asked
but not where they were working, they have to guess a project, search it, and try the next — there are
dozens of projects. They need one place that searches what they asked in every project and takes them
straight to the session, inside its project.

## Solution

A Search page joins the rail as its third top item. Its box searches the questions of every listed
session in every project as the user types, and lists the hits grouped by project, then by session. A
hit opens that session at that question, inside the Projects section with its project selected; the
session page then offers a way back to the results and a way into the project. The question texts are
read into memory when the page first opens in a run, so searching after that does not read files
(ADR-0034).

## User Stories

### global-search::US-001 Find a session by what I asked, without knowing its project

As a user who remembers what I asked but not where, I want to search my questions across every project,
so that I can find the session without guessing its project.

- global-search::US-001/AC-01: The rail's top group carries a Search item directly below Projects, drawn
  with the magnifier icon and the tooltip "Search" in the in-app language. Clicking it shows the global
  search page and marks the item selected.
- global-search::US-001/AC-02: Typing in the page's search box searches as the user types, once typing
  pauses for 200 ms, with no button and no Enter needed. The keyword is trimmed; matching is
  case-insensitive. While the trimmed keyword is empty, the results area shows the idle hint (what the
  page searches, and that a hit opens its session).
- global-search::US-001/AC-03: The search box's placeholder says how many sessions in how many projects
  are searched — the projects counted are those with at least one searched session. With nothing to
  search it names no number (global-search::REQ-006).
- global-search::US-001/AC-04: The results are grouped by project. Each project is a heading — a folder
  icon, the project's name, and that project's session and hit counts; its tooltip is the project's full
  path, since projects can share a name. Under the heading are that project's matching sessions, one card
  each.
- global-search::US-001/AC-05: A stale project's heading draws its name struck through with the stale
  tag, as the project list draws a stale row; its sessions are searched and listed like any other's.
- global-search::US-001/AC-06: A session card's header shows the side badge, the session title (the
  untitled fallback where it has none), the fork marker or the uncertain-strip marker where the session
  carries one, and the session's hit count. Under it, one row per matching question: the question's
  original turn number in the session, the question on one line with every occurrence of the keyword
  highlighted, and the question's time as a relative time.
- global-search::US-001/AC-07: Above the results a header line gives the hit, session and project counts,
  with a newest-first / oldest-first segment. Newest first (the default) orders projects by their most
  recently active matching session and the sessions inside a project by their own last activity; oldest
  first is that whole order reversed, both layers. Hits inside a session stay in question order either
  way.
- global-search::US-001/AC-08: With no hit, the results area says so on one line and points to a
  project's Sessions tab, switched to full text, for answers and tool output.
- global-search::US-001/AC-09: Every hit is listed: there is no cap, pagination or "show more".

### global-search::US-002 Go from a hit straight to its session, inside its project

As a user who found the hit, I want one click to take me to that session in its project, so that I am
looking at it where it lives.

- global-search::US-002/AC-01: Clicking a hit row switches the rail to Projects, selects the hit's
  project in the project list — scrolling the list so the selected row is in view when it is outside the
  visible part — and opens the session page at that question with the arrival highlight that a project
  search hit gives ([session-view](session-view.md) D4).
- global-search::US-002/AC-02: Clicking a session card's header does the same without locating a
  question.
- global-search::US-002/AC-03: The jump never shows an intermediate frame: the search page stays on screen
  until the session page can be drawn whole, then the stage switches at once; a session with a saved page
  opens at once ([session-view](session-view.md) P1, P4).

### global-search::US-003 Get back to my results, or go on into the project

As a user checking hits one after another, I want to return to the same results from the session I
opened, or go on into its project, so that looking through hits does not mean searching again.

- global-search::US-003/AC-01: A session opened directly from a global search hit — by its row, or by its
  session card's header (global-search::US-002/AC-02) — shows, in its header where the single back
  control otherwise sits, one row of two exits: first "Back to search results" with a left chevron, then
  "Go to <project> · Sessions" with a right chevron.
- global-search::US-003/AC-02: "Back to search results" shows the global search page as it was left: the
  same keyword, results, sort and scroll position. The results are the current ones for that keyword
  (global-search::REQ-004).
- global-search::US-003/AC-03: "Go to <project> · Sessions" shows that project's detail on its Sessions
  tab. For a stale project the exit reads "Go to <project>", without "· Sessions", and shows the project's
  stale note page, which has no Sessions tab.
- global-search::US-003/AC-04: Only the session opened directly from a hit has the two exits. A fork
  parent reached through that session's banner, a session opened after going into the project, and any
  session opened inside a project show the single back control ("Back to <project> · Sessions"), as
  before.
- global-search::US-003/AC-05: The rail's Search item shows the page as it was left, from anywhere in
  the app, for the rest of the run. After the app restarts the page starts empty.

### global-search::US-004 Open search from the keyboard

As a user in the middle of something else, I want a shortcut to search, so that I do not have to reach
for the rail.

- global-search::US-004/AC-01: ⌘⇧F opens the global search page and puts the focus in its search box,
  from any page, settings included.
- global-search::US-004/AC-02: The Edit menu carries "Search Sessions…" with ⌘⇧F, after a separator below
  the standard editing items; choosing it does what the shortcut does. Its copy follows the in-app
  language, like the other menu items.

## Functional Requirements

### global-search::REQ-001 What is searched (direct acceptance)

The searched sessions are the listed sessions of every project in the project list, stale projects
included: the same set each project's Sessions tab lists ([session-view](session-view.md) A2, A3, A3a,
B2), so warmup sessions, subagent sessions and sessions emptied by fork stripping are not searched, and
a session in a directory that no agent side's registry records is not searched. Of each session, only
its displayed questions are matched — never answers, tool calls, thinking or anything else in the turn.

### global-search::REQ-002 Reading the question texts

- global-search::REQ-002/AC-01: Showing the page in a run where the question texts have not been read
  starts reading them; the user does not have to type first.
- global-search::REQ-002/AC-02: While they are being read, the page header's hint slot shows "Reading the
  sessions' questions…" with the spinning hint icon, in place of the startup scan's hint when both are
  under way; the results area shows nothing for a keyword typed meanwhile — no "searching" state — and
  the results for the latest keyword appear once the reading is done. The idle hint still shows while the
  keyword is empty.
- global-search::REQ-002/AC-03: Once read, a search does not wait on reading files.

### global-search::REQ-003 A search that fails

- global-search::REQ-003/AC-01: A search that fails as a whole shows, where the results would be, one
  line saying it could not be completed and that changing the keyword tries again. It never shows as
  "no hits".
- global-search::REQ-003/AC-02: A failed search is tried again when the keyword changes and after the
  next automatic rescan.
- global-search::REQ-003/AC-03: A session whose questions cannot be read is left out of the results and
  out of the counts; the other sessions' hits are listed as normal.

### global-search::REQ-004 Results follow the data

- global-search::REQ-004/AC-01: After each automatic rescan, the results on the page — or kept for it —
  are replaced by the current results for the same keyword by transfusion: keyword, sort and scroll
  position stay; a session that gained a matching question gains the hit; a session that left the
  listed set (removed, compressed under a new identity, its project's registration gone) leaves the
  results.
- global-search::REQ-004/AC-02: Bringing the texts up to date after a rescan reads only the sessions whose
  questions changed or that are new to the listed set.

### global-search::REQ-005 The search page's frame (direct acceptance)

The page has the Agents page's frame — the rail, a header and a scrolling body, no project column. The
header holds the page title with the hint slot beside it (the startup scan's hint, global-search::REQ-002
for reading) and the search box below them, so the box stays in view while the results scroll.

### global-search::REQ-006 Nothing to search (direct acceptance)

When no project has a searched session, the search box stays, its placeholder names no number, and the
results area says there is no session to search yet and that one appears once an agent has had a
conversation in a registered project.

## Constraints

### global-search::CON-001 Question texts stay in memory (direct acceptance)

Applies to: global search. The question texts it searches are held in the main process's memory for the
rest of the run and are never written to disk — not to the accounting and question-index cache, not to
the display cache ([ADR-0034](../adr/0034-global-search-question-corpus-in-memory.md);
[session-view](session-view.md) D2a). The keyword, results and page state are not persisted either.

### global-search::CON-002 A project's own session search is unchanged (direct acceptance)

Applies to: the Sessions tab of project detail. Its questions/full-text toggle, its reads from disk, its
"searching" line and its sort choice behave as before; global search does not read or change that sort
choice, and the Sessions tab does not read global search's.

### global-search::CON-003 No natural language from the main process (direct acceptance)

Applies to: everything global search sends across IPC. Results carry data only; failures cross as
structured errors (ADR-0015, ADR-0016); every sentence on the page and in the menu comes from the
renderer's dictionaries.

### global-search::CON-004 Copy in every supported language (direct acceptance)

Applies to: every new string — the rail tooltip, the menu item, the page's title, placeholders, hints,
counts, the reading hint, the failure line, the two exits. Each exists in all six supported languages,
with plural forms through the existing plural rules; no string enumerates the agent sides as a set.

## Failure modes and boundaries

**Sequence S: searching**
- S1 Open the page for the first time in a run and type at once: the reading hint shows in the header,
  the results area stays empty, the results for the keyword as it stands when reading ends appear
  (global-search::REQ-002/AC-02).
- S2 Open the page during the startup scan: the search runs over the sessions known from the saved
  display data, the header hint follows global-search::REQ-002/AC-02, and the first scan's snapshot then
  updates the results by transfusion (global-search::REQ-004). On a first launch, with no saved display data,
  no session is known yet: the page is global-search::REQ-006's until the first scan's snapshot arrives.
- S3 Type, then clear the box: the idle hint, at once; clearing never searches.
- S4 A keyword of only spaces is empty (global-search::US-001/AC-02). A keyword longer than 200
  characters is refused at the IPC boundary as it is for a project's search, and the page shows the
  failure line (global-search::REQ-003/AC-01); shortening the keyword searches again.
- S5 A one-letter keyword can hit thousands of questions: all are listed (global-search::US-001/AC-09).
- S6 Case: matching ignores case for every letter the platform lowercases, not only ASCII — a project's
  own byte-level question pass folds ASCII only, so a non-ASCII letter's other case can hit here and miss
  there. Accepted; recorded so it is not reported as a defect.
- S7 Keywords with quotes or backslashes match the question as written, since the texts are matched after
  parsing (a project's own search misses them in their escaped form, session-view D4). A question written
  over several lines is matched as the session page shows it, its line breaks as spaces, so the words either
  side of a break match with a space between them; the box itself takes no line break.
- S8 A long question or title is cut with an ellipsis on its line; its full text is on the session page.
  A question written over several lines shows on one line.
- S9 A session marked uncertain strip may carry a few replayed questions at its start
  ([session-view](session-view.md) B2), so the same sentence can hit in it and in its parent.
- S10 Questions inside a compacted window are not in a session's question set and cannot be found
  ([session-view](session-view.md) Out of Scope).
- S11 A cold rollout is searched like any other session; reading it is part of the first read.
- S12 Change the sort, leave the page, come back: the sort is as left (global-search::US-003/AC-05); the
  project Sessions tab's sort is untouched (global-search::CON-002).
- S13 A search fails as a whole: global-search::REQ-003/AC-01. A session cannot be read: it is left
  out (global-search::REQ-003/AC-03), the degradation hurting only itself.
- S14 Two projects with the same name: two headings with the same name, told apart by the tooltip.
- S15 Reading the texts fails as a whole: the reading hint goes, a keyword shows the failure line
  (global-search::REQ-003/AC-01), and reading is tried again the next time the page is shown or after
  the next automatic rescan.
- S16 Leave the page while the texts are being read: the reading goes on and is not started twice;
  coming back before it ends shows the reading hint again until it does.

**Sequence J: going to a hit and coming back**
- J1 Click a hit: global-search::US-002/AC-01 and US-002/AC-03; the header shows the two exits
  (global-search::US-003/AC-01).
- J2 Click a hit in a stale project: the project is selected, and the project list hides stale rows by
  default, so the selected row is not on screen — the scroll into view cannot show what the list hides.
  Accepted. The second exit is "Go to <project>" (global-search::US-003/AC-03).
- J3 Back to search results: the page as left (global-search::US-003/AC-02), its scroll position
  included, refreshed if a rescan happened meanwhile (global-search::REQ-004).
- J4 Go to <project> · Sessions, then open another session there: single back control
  (global-search::US-003/AC-04).
- J5 Follow the fork banner to the parent: single back control on the parent's page; its back control
  leads to the project's Sessions tab.
- J6 While a session opened from search is on screen, click another project in the list: the project page
  replaces it, as any project selection does; the way back to the search is the rail's Search item.
- J7 While a session opened from search is on screen, switch to Search with the rail, change the keyword,
  then switch back to Projects: the session page is still there with its two exits, and "Back to search
  results" now shows the new results.
- J8 Click a hit whose session file disappeared since the results were drawn (cleaned up, or compressed
  by Codex): the session page opens to its existing error state ([session-view](session-view.md) P6),
  holding the search page until then; the next rescan takes the hit away or moves it to the compressed
  identity (global-search::REQ-004).
- J9 Click a hit, then click another hit before the first session page arrives: the later click wins,
  the earlier page is kept when it arrives (session-view P8).
- J10 Use ⌘⇧F on the session page or anywhere else: the search page as left, focus in the box
  (global-search::US-004/AC-01).
- J11 A long project name, or a narrow window: the exits stay on one line, each cut with an ellipsis, as the
  single back control in the same row is.

**Sequence D: the data changes underneath**
- D1 A session gains a question that matches while its results are on screen: after the next automatic
  rescan its card gains the hit, keyword and scroll unchanged (global-search::REQ-004/AC-01).
- D2 A project is removed from every registry: its sessions leave the results after the rescan.
- D3 A project's directory is deleted: it becomes stale and stays searched, its heading now marked stale.
- D4 Everything goes: no session left to search — global-search::REQ-006, with the box and keyword
  intact.

**Introduced content**
- The texts shown are the user's own questions and session titles from agent records. They are drawn as
  plain text, the highlight split as text rather than through markup, so a question containing HTML or
  markdown shows its characters and creates no link, image, script or form. Nothing on the page navigates
  the window: the only targets are the session page, a project's page and this page, all inside the app.

## Implementation Decisions

- **Main process**: a question corpus for global search — the displayed question texts of every listed
  session in every project — built on first demand in a run and kept in memory (ADR-0034). It is read
  through the existing range reader (cold rollouts in one streaming pass each) with the existing bounded
  concurrency, from the question index the token engine already keeps, and each session's texts are
  keyed by that session's question-index identity — the file (device and inode) and the byte ranges of its
  displayed questions — so an index whose questions moved, grew or were stripped differently replaces the
  texts, while an answer appended to a session does not. After each scan, a corpus that exists is brought
  up to date for the changed, new and removed sessions, asked for before the snapshot is sent so the
  renderer's search on receiving it waits for the update; a corpus never asked for is not built. Matching
  folds case on the parsed texts.
- **IPC**: two channels — one that starts reading (idempotent; it resolves when the texts are read), and
  one that searches a keyword and resolves with the matching sessions, each carrying its project's
  path, name and stale flag, its title, side, fork state and last activity, and its hits (turn number,
  question text, time). The search waits for a reading under way. Both are validated on both sides from
  the shared contract (ADR-0001); failures are structured errors (global-search::CON-003). The keyword's
  length limit is the project search's.
- **Presentation order**: grouping by project and the two sort directions are one pure function over the
  payload, so the order is tested without the page.
- **Renderer**: the rail gains a fourth dimension, search, third in its top group. The page keeps its
  keyword, sort, scroll position and last answer for the run across leaving and returning; its query is a
  non-suspense query keyed by the keyword (ADR-0028), invalidated by every snapshot like the session page's,
  so a rescan refreshes it by transfusion. While the next keyword's answer is on its way the previous one
  stays, highlighted with its own keyword, so the area never empties between keystrokes. The page asks the
  main process to start reading when it is shown — once per run when the reading succeeds, again on the
  next showing after a failure — and its box takes the focus, as the prototype's does.
- **The jump**: one transitioned update switches the dimension to Projects, selects the project, and
  opens the session (with the question to locate, for a hit) — with the session page's data fetched
  before the switch, so the search page holds until the session page can be drawn whole. The open session
  carries whether it was opened from a hit, so replacing or leaving it drops that origin — the fork-parent
  jump, going into the project, any other session or project selection — while the rail leaves it; going into
  the project is the single back control's own move, to the project's Sessions tab.
- **The application menu**: the Edit menu gains a separator and "Search Sessions…" with
  CmdOrCtrl+Shift+F; it reaches the renderer the way the Settings item does.
- **Copy and icons**: dictionary entries in the six languages; the rail label is exempted in the
  shared-UI check's rail-label rule by its rail key, as the other rail labels are ordinary words; the
  magnifier and both chevrons are already in the icon module.

## Testing Decisions

Following ADR-0002's dual seam, through the seams that already exist:

1. **Providers seam (fixture homes)**: the corpus and its search over a fixture home with several
   projects — a stale one, a directory with sessions but no registry record, warmup and subagent
   sessions, a stripped fork, a cold rollout and its plain twin. Assert what is and is not searched
   (global-search::REQ-001), case folding beyond ASCII and escaped characters (S6, S7), and that a session
   whose file changes is re-read while unchanged ones are not (global-search::REQ-004/AC-02). At least one
   fixture keeps the shape of a real sample, as session-view's do.
2. **Presentation**: the grouping-and-order function — the projects' order by their newest session, the
   sessions' order inside a project, the oldest-first reversal of both layers, hits in question order
   (global-search::US-001/AC-07).
3. **IPC contract**: the validation round trip of both channels' payloads and the refusal of a malformed
   one.
4. **e2e (Playwright under Electron, fixture home)**: the rail item → type → grouped results → click a
   hit → the session page at that question with the two exits → back to the results as left → go to the
   project's Sessions tab → the fork parent's single back control; ⌘⇧F through the application menu; the
   empty home's no-session state; the reading state, held open by the existing injected fetch-delay knob
   extended to the reading channel, sampled inside the delay window.

Prior art: the project search's providers tests and its query-layer test, the session page's e2e under
the injected delay, and the application menu's e2e (Settings and Check for Updates).

## Out of Scope

- Answers, tool output and other turn content in global search; full text stays a project's own search
  (global-search::REQ-001).
- Sessions in directories that are not projects.
- Persisting the keyword, the results or the page state across restarts.
- Artifacts, memories, configuration and components in global search.
- A side filter on the results.
- A project heading that opens the project; the way into the project is the session page's exit.
- Moving a project's own session search onto the in-memory texts (global-search::CON-002).
- An index over the texts, a cap or pagination on the results, search history and suggestions.

## Further Notes

- **Prototype gate: passed 2026-10-19.** Interface points and where each was confirmed: the rail's Search
  item and its magnifier (the global search prototype and every page with the shared rail); the page
  frame and header with its hint slot; the search box and its placeholders; the idle hint; the results
  header with the sort segment; the project heading with the stale marking; the session cards and hit
  rows (shared with the project search's hits); the no-hit line; the no-session state; the reading state;
  the failure line — all on the global search prototype; the session page's two exits and their
  chevrons — on the session page prototype. **Exemptions, declared:** the Edit menu item is a native menu
  (the i18n spec's exemption for the application menu applies: no design freedom, only copy); the stale
  project's exit text "Go to <project>" is a copy variant of a drawn control; the project list scrolling
  its selected row into view adds no visible state; the atomic jump adds no visible state
  (global-search::US-002/AC-03, as session-view's atomic opening).
- The costs behind ADR-0034 (measured 2026-10-19, under Electron, on this machine): one search over every
  project read from disk took about 3.2 s, dominated by cold rollouts; reading every question text took
  about 3.3 s for 4776 questions and 2.27 MB of text; a match over them took about 4 ms; full text over
  every project took 18–23 s with about 2.6 GB at peak, which is part of why global search matches
  questions only.
- On this machine, 945 listed sessions in 461 directories that are not projects are outside global search,
  most of them test fixtures and runtime directories; a user who works in such a directory registers it
  with its agent to have it searched.
