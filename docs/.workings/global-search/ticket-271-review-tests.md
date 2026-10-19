# Test review — #271

Ticket: [#271](https://github.com/aloong-planet/agentshed/issues/271) · feature `global-search` · branch
`feat/global-search`. Scope: every test this ticket adds or changes — the question corpus over fixture homes,
the global search payload's contract, the grouping and page-state functions, the query layer, and the e2e
cases under Electron; plus the existing e2e assertions on the rail's item count, which the new item changes.

## Design review

Checked 2026-10-19. Implementation version: 57a6a5c (main, where the work began). Requirement source:
[the global-search spec](../../specs/global-search.md) at bedc384, and #271's product acceptance.

### Test design table

Seams are the spec's (Testing Decisions): the providers seam (an injected `ScanRoots` over a fixture home, a
real `TokenEngine` and the real `scan`), the presentation functions, the contract validators, the query layer
over a real `QueryClient`, and e2e under the built Electron app with a fixture home
(`AGENTSHED_HOME_OVERRIDE`). Expected values are literals written from the fixture's own definitions, never
recomputed by the code under test's algorithm.

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U1 | question-corpus.test · what is searched | REQ-001; S11; B2 (cited) | providers | a home with: a registered Claude project, a registered Codex project (a parent, a fork that replays the parent's question and adds one, a cold twin of a plain rollout, a paginated rollout), a Grok session under the Claude project's path, a stale project (registered, directory absent, sessions present), an unregistered directory with Claude and Codex sessions, a warmup session, a nested subagent transcript, a word that appears only in an answer | for each keyword, the exact set of (file, question number) hits; the stale project's sessions carry `stale: true`; the cold twin's hits equal the plain one's. Expected sets written by hand from the fixture | the Claude session keeps a real sample's line shape (parent/uuid chain, an `isMeta` line, a tool-result user line, `cwd`/`sessionId`/`version` fields — read from a real session on this machine, 2026-10-19); the paginated Codex rollout keeps the real paginated shape (an ordinal on every line, `item_completed` with a `UserMessage` item whose content is `[{type:'text', text, text_elements}]`, a usage record); Codex legacy, cold-twin and Grok shapes are the ones the existing providers tests took from real samples | none over 1 s (a fixture home and a build are milliseconds); a fresh home per case (`beforeEach`), as the providers tests do |
| U2 | question-corpus.test · every hit | US-001/AC-09; S5 | providers | one session with 600 questions containing the keyword | 600 hits for it — above any plausible cap (100, 200, 500) | generated lines in the Claude shape of U1 | as U1 |
| U3 | question-corpus.test · case beyond ASCII | S6; US-001/AC-02 (case) | providers | questions "Ébauche du plan" and "ПРИВЕТ мир"; keywords "éBAUCHE", "привет" | each finds its question | as U1 | as U1 |
| U4 | question-corpus.test · escaped characters | S7 | providers | questions holding a double quote, a backslash and a line break | the keywords `"hi"`, `C:\path` and `one\nline` find them, and the hit text is the parsed text | as U1 | as U1 |
| U5 | question-corpus.test · reading once | REQ-002/AC-01 (idempotent); S16 | providers | two concurrent `load` calls, then a third after it resolves | each listed session's file is read once in all; the third call reads nothing | as U1 | as U1 |
| U6 | question-corpus.test · searches read nothing | REQ-002/AC-03 | providers | three searches after the corpus is read, one session file having gained a question since (no scan in between) | no file read during them, and the new question is not found until a scan brings it in | as U1 | as U1 |
| U7 | question-corpus.test · a search waits for a reading under way | REQ-002/AC-02 (main side) | providers | a reading held open by the pause hook; a search started meanwhile | the search has not resolved while the reading is held, and resolves with the hits once it is released | as U1 | as U1 |
| U8 | question-corpus.test · an unreadable session | REQ-003/AC-03; S13 | providers | one listed session's file removed after the scan | its hits are absent and it is not counted; the other sessions' hits are listed | as U1 | as U1 |
| U9 | question-corpus.test · reading fails as a whole | S15 | providers | the pause hook rejects once | `load` and a search reject (never an empty result); the next `load` reads and the search then hits | as U1 | as U1 |
| U10 | question-corpus.test · bringing the texts up to date | REQ-004/AC-02; D1 | providers | after the first read and a rebuild: a question appended to one session, an answer appended to another, a new session, a removed session | only the session with the new question and the new session are read; the new hit appears; the removed session's hits are gone; the answer-only change is not re-read | as U1 | as U1 |
| U14 | question-corpus.test · a search right after a scan's update | REQ-004/AC-01 (main side: the order the main process relies on) | providers | the update asked for, not awaited, then a search at once | the search answers with the question the update brought in. Expected literal | as U1 | as U1 |
| U11 | question-corpus.test · never asked, never built | ADR-0034 decision; Implementation Decisions | providers | `refresh` after a scan with no prior `load` | no file read | as U1 | as U1 |
| U12 | question-corpus.test · the data changes underneath | D2; D3 | providers | a project removed from the registry; another project's directory deleted; scan and rebuild; `refresh` | the first project's sessions leave the results; the second's stay, now `stale: true` | as U1 | as U1 |
| U13 | question-corpus.test · nothing written to disk | CON-001 | providers | the cache directory's files hashed before and after reading and three searches | the same files with the same bytes; no file there holds a question text that is not a title | as U1 | as U1 |
| C1 | validate.test · global search payload | CON-003 | contract | a well-formed payload after a structured-clone round trip; then one malformed field at a time (sessions not an array, project stale not a boolean, an unknown side, an unknown fork state, a hit text that is null, an empty file) | valid → ok; each malformed → not ok with that field's path. Expected paths written by hand | the payload type this ticket defines | none |
| P1 | global-search-groups.test · grouping and newest first | US-001/AC-04 (grouping); US-001/AC-07 | presentation | sessions of three projects with distinct last-activity times, payload order shuffled | projects ordered by their newest session, sessions by their own last activity, hits in question order; per-project session and hit counts; the totals. Expected order and counts written by hand | the payload type | none |
| P2 | global-search-groups.test · oldest first | US-001/AC-07 | presentation | the same input, oldest first | the exact reverse of P1's order on both layers, written out by hand | as P1 | none |
| P3 | global-search-groups.test · missing times and ties | US-001/AC-07 | presentation | sessions with `at: null` and two with equal times | null sorts last when newest first; equal times keep payload order | as P1 | none |
| P4 | global-search-groups.test · what the results area shows | REQ-002/AC-02; REQ-003/AC-01; REQ-006; US-001/AC-02, AC-08; S3; S15 | presentation | each combination of: nothing to search, empty keyword, reading under way, no data yet, a failed search, a search with no hit, a search with hits | the state the prototype's order gives: nothing to search → the no-session note; empty keyword → idle; reading or no data → blank; failed → the failure line; no hit → the no-hit line; else hits. Order from the prototype's render function | none | none |
| Q1 | global-search-query.test · the fetch wrapper and keys | REQ-003/AC-01 (no throw); REQ-003/AC-02 (keyword change) | query layer | a resolving and a rejecting search | `{ ok: true, result, keyword }` / `{ ok: false, error, keyword }`; two keywords give two keys | none | none |
| Q2 | global-search-query.test · a rescan retries | REQ-003/AC-02; REQ-004/AC-01 | query layer (real `QueryClient`, a mounted observer) | a global search query whose first fetch failed; then the snapshot invalidation | the query function runs again. The existing six query names are invalidated as before | none | none |
| I1 | counted-nouns.test · the global search counts | CON-004 (plural forms) | the dictionaries | each counted entry at the counts where its language changes plural category (French 0, Spanish 0, Russian 1/2/5/21) | the rendered text, spelled out by hand per language | none | none |
| Q3 | global-search-query.test · asking for the reading | REQ-002/AC-01; S15; S16 | query layer (real `QueryClient`, observers mounted and unmounted as a page is shown and left) | a reading that succeeds, shown twice; one that fails once, shown three times | the main process is asked once, and twice. Expected counts written by hand | none | none |
| E1 | global-search.spec · the page | US-001/AC-01…AC-09; REQ-005; REQ-003/AC-01, AC-02 (keyword); S3; S4; S8; S14; introduced content; appearance D1; Evidence for AC-01, AC-04, AC-06, REQ-005 | e2e | a home with 22 filler projects, a target project whose sessions are old (one with a long question, one multi-line, one holding HTML, one with 150 questions sharing a letter), a Codex fork pair and an orphan fork, a stale project, two projects with the same name, a registered project without sessions and an unregistered directory; clicks and typing through the rail and the box | rail: four items, Search third with its tooltip, selected after the click; placeholder with the fixture's literal counts; idle note; typed keyword → literal header counts, the headings (folder icon, stale marking, path tooltips, the twin names), cards (badge, pills, hit count), rows (number, every occurrence marked, relative time); HTML shown as characters with no element created; sort toggles both layers; clearing and spaces → idle; no-hit line; a 201-character keyword → the failure line, then a shorter one → results; 150 rows for the shared letter; equal row heights and an ellipsis on the long one; the box's position unchanged after scrolling the results; then dark appearance through settings and back — the page as left | fixture lines in the shapes of the existing e2e homes (which came from real samples), the fork pair from `mkForkHome`'s shape | one Electron launch; the build is `pnpm e2e`'s one `electron-vite build` |
| E2 | global-search.spec · reading the texts | REQ-002/AC-01, AC-02; S1; S16; Evidence for AC-02 | e2e | `AGENTSHED_FETCH_DELAY_MS` held on the reading channel; the page shown, the keyword typed at once; leaving through the rail and coming back during the reading | the reading hint shows before any typing; the startup hint is not rendered meanwhile; the idle note shows for an empty keyword; nothing at all in the results area for a typed keyword, sampled inside the delay window; the hint again after coming back; then the results for the latest keyword and no hint | the E1 home | one launch |
| E3 | global-search.spec · going to a hit | US-002/AC-01, AC-02, AC-03; US-003/AC-05 (rail and restart); J1; J2; J9; S12; CON-002 (sort independence); projects-list C8 | e2e | `AGENTSHED_FETCH_DELAY_MS`; a click on the target project's hit (its row below the list's fold); a card header click on a cached session; two quick clicks on two uncached hits; a stale project's hit; the global sort changed, then the project Sessions tab's; a relaunch on the same userData | inside the delay: the search page still on screen; then Projects, the target row selected and in view with the list scrolled, the session page at that question with the arrival highlight; the card header opens without one, at once; the later of two clicks wins and the earlier page opens at once afterwards; the stale hit opens its session with no visible selected row; the rail's Search brings the page back as left (keyword, sort, scroll); the two sorts do not follow each other; after the relaunch the page is empty | the E1 home | two launches (the second is the restart under test) |
| E4 | global-search.spec · a hit whose file is gone | J8 | e2e | a session file removed after the results are drawn; its hit clicked | the session page's own error state, after holding the search page; exactly one handler error, carrying `sessionFileUnreadable` | the E1 home | one launch |
| E5 | global-search.spec · results follow the data | REQ-004/AC-01; D1; D4 | e2e | `AGENTSHED_RESCAN_MS`; a keyword, oldest first and a scrolled body; a matching question appended to a session; then every session file removed | after the rescan: the new hit appears with keyword, sort and scroll unchanged; after the next: the no-session state with the keyword still in the box | the E1 home | one launch |
| E6 | global-search.spec · nothing to search | REQ-006 | e2e | a home with one registered project and no session | the box, a placeholder without a number, the no-session note | `mkEmptyProjectHome`'s shape | one launch |
| E7 | global-search.spec · during the startup scan | S2 | e2e | a first launch to save the display data, then a relaunch with `AGENTSHED_SCAN_DELAY_MS` holding the scan | the search over the restored sessions hits while the scan is under way, and the snapshot then keeps the results | the E1 home | two launches (the restored state is what is under test) |
| X1 | app.spec · cold start; app-update.spec · the update slot | appearance D1 (the rail holds four items now) | e2e (existing) | unchanged | the rail counts 4 (and 5 with an update in flight); the update slot still moves no other item, the Search item included | unchanged | unchanged |
| X2 | existing project search unit and e2e cases | CON-002 | as they are | unchanged | unchanged | unchanged | unchanged |

### Coverage

The failure-modes section, item by item against the table: S1 E2; S2 E7; S3 E1, P4; S4 E1 (spaces, the 201-character
refusal and the retry); S5 U2, E1; S6 U3; S7 U4; S8 E1; S9 — the corpus holds exactly the question index's shown set
(U1 asserts it on a stripped fork), so an uncertain strip's replayed questions hit wherever the index keeps them; no
case of its own; S10 — the same: the corpus has no other source of questions; S11 U1; S12 E3; S13 U8; S14 E1; S15
U9 (main) and P4 (the results area once the reading has failed); S16 U5, E2. J1, J2, J9 E3; J8 E4; J3–J7 and J10
belong to #272 and #273. D1 U10, E5; D2, D3 U12; D4 E5. Introduced content E1.

Gaps, recorded rather than filled:

- **The untitled fallback (US-001/AC-06).** Every listed session has a title: the indexers fall back to the file name
  when no title source exists, so no fixture can reach the fallback through the real pipeline. The card draws
  `title ?? untitled` exactly as the project lists do; a case becomes possible only if a title can be null for a
  listed session.
- **S15's renderer side end to end.** No seam fails the reading as a whole in the running app; P4 covers the
  results area's branch, U9 the main side. Re-test condition: an injected reading failure, should one be added.

### Case design

- No module of this repository is replaced (`vi.mock` / `vi.spyOn`): searched before writing, none planned.
- **Exemption, stated:** U5, U6, U10 and U11 count file reads through the corpus's injected reader, which wraps the
  real range reader. The count of reads is the requirement itself (REQ-002/AC-03, REQ-004/AC-02 — "does not wait on
  reading files", "reads only the sessions whose questions changed"), and the reader is the corpus's boundary to the
  file system, so this is the external-boundary exception, not an internal call count.
- U7 and U9 use the corpus's pause hook, which exists for the e2e delay seam; it is a constructor option, not a
  replaced module.
- No private member is read and no state is written directly: every case goes through `load`, `refresh` and
  `search`, and the e2e cases through the window.

### False greens (judged on the design)

- Always-true assertions: U2's 600 questions exceed any cap a regression could plausibly add; E1's 150 rows exceed
  100. Every e2e "nothing shows" assertion (E2's blank results area, E3's held page) is paired with the positive
  state that follows it, so a test that never reached the state cannot pass silently.
- Tautologies: every expected value is a literal from the fixture's definitions; none is computed by the grouping
  or matching code under test.
- Old paths: the assertions target the new page, its new classes and the new channels; the existing rail-count
  assertions are updated to the new count rather than left asserting the old one.

### Resource reuse

The expensive resources are the Electron launch (a few seconds each) and the renderer build (once per `pnpm e2e`,
by its own script). Every e2e case in this repository launches its own instance on its own userData — what this
ticket's cases assert depends on a fresh run (reading on first show, the restart, the startup scan), so an
instance cannot be shared between them; E3 and E7 launch twice because the second launch is the behaviour under
test. Assertions that can share an instance are grouped into one case (E1 holds the whole page's checks). Nine
launches in all (E1, E2, E4, E5, E6 once; E3, E7 twice). Fixture homes and token builds are milliseconds and are made per case.

### Design changes during the TDD cycle

- **U14 and Q3 added, 2026-10-19, from the code review.** Two facts the implementation relies on were held only
  by reasoning: that a search sent right after the main process asks for an update waits for it (the main
  process orders the update before the snapshot), and that showing the page again never asks for a finished
  reading but does ask again after a failed one (the hint would otherwise flash on every return). Reviewed: the
  first drives the order through the corpus's public calls; the second mounts real observers on a real query
  client, the reading's options extracted so the hook and the test share them.

- **I1 added, 2026-10-19.** The dictionaries' counted-noun test covers every entry that puts a number next to a
  noun; the three new ones join it (the table's first draft missed this existing guard). Reviewed: literal
  expected text per language, at each language's category boundaries.

- **U6, 2026-10-19.** As first designed (three searches, nothing changed) it stayed green under a mutation that
  makes every search run a reading pass: the identity check then skips every unchanged session, so no file is
  read and the count cannot tell. A search must not wait on files at all (REQ-002/AC-03), and the difference
  shows only when a file has changed since the reading: the row now appends a question to one session before
  the searches. Re-reviewed: the input reaches the branch (a pass would re-index and re-read that file), the
  expected counts stay literals, and the mutation now turns it red.

## Post-implementation check

Checked 2026-10-19 on a025015, after the full verification gateway passed there (`pnpm verify` exit 0:
863 unit, 102 site, every check, 142 e2e, smoke).

### Coverage

The written tests against the table, row by row:
- U1–U14, C1, P1–P4, Q1–Q3, I1, X1, X2: as designed (U6, U14, Q3 and I1 as amended above). U1 is written as three
  cases (what is searched; questions only and the cold twin; every side's shape).
- E1: as designed, with one change — the dark evidence is taken by emulating the dark colour scheme, because
  every launcher here pins light (Playwright's default), so the settings' Dark choice does not reach the page's
  media queries; the case asserts the dark rules applied (a card's computed background changes) before the
  screenshot. The trip through settings stays, for US-003/AC-05's "from anywhere".
- E3: as designed, with two changes — the kept scroll position is the one measured after the click, since the
  click scrolls the row into view first; and the cached child hit is asserted by its located row rather than
  the page title, since a stripped fork's page title is the token index's (the code review's outside finding).
- E2, E4–E7: as designed (E4 searches "twin", E7 "stale", to keep each to one or two hits).
- The gaps are noted in the test file headers: the untitled fallback (both files), S15's renderer side end to
  end and the box's focus (the e2e file).

### Case design

No module of this repository is replaced: `rg -n "vi\.mock|vi\.spyOn" src/main/providers/question-corpus.test.ts src/renderer/src/global-search-groups.test.ts src/renderer/src/global-search-query.test.ts src/shared/validate.test.ts src/shared/i18n/counted-nouns.test.ts`
returns nothing (exit 1). The read counting stays the stated boundary exemption.

### False greens

Red-first in the cycle, each red at its assertion for the reason designed: U1 (empty results from a stub), U5
(two reads per file), U10 and U12 (a stub update), C1 (a permissive validator), P1–P4 (stubs), Q1–Q2 (a stub
wrapper and an empty invalidation). Green on first run, then proved by a mutation that reached the code under
test and turned the case red at the predicted assertion, every file restored byte-identical by hash:

| Mutation | Case turned red, and where |
|---|---|
| hits capped at 500 | U2: 500 instead of 600 |
| ASCII-only case folding | U3: no hit for "éBAUCHE" |
| matching the JSON-escaped text | U4: no hit for `"hi"` |
| the pause hook removed | U7: the search answered while held; U9: load resolved instead of rejecting |
| an unreadable session fails the pass | U8: load rejected with `session-file-unreadable` from `sessionQuestions` |
| every load reads again | U6, after its amendment (it survived as first designed — see above) |
| an update for a corpus never asked for | U11: 9 reads instead of 0 |
| the identity counts a turn's end | U10: the answer-only session re-read |
| the corpus writes its texts beside the cache | U13: the cache directory gains a file |
| the update scheduled a tick late | U14: no hit for the new question |
| the reading always stale / always fresh | Q3: asked 2 times instead of 1 / 1 instead of 2 |
| a French plural by an n === 1 test | I1: the 0-project placeholder |
| the rail exemption removed | `pnpm check:ui`: 48 verbatim-name failures, the first at zh's own title |

E2e cases, each mutation rebuilt before the run (the runner rebuilds after applying and before restoring):

| Mutation | Case turned red, and where |
|---|---|
| no fetch before the jump | E3: the stage on Projects inside the delay |
| no scroll into view | E3: the selected row's viewport ratio 0 |
| no reading hint | E2: the hint not found |
| the page does not ask for the reading | E2: the hint not found |
| the snapshot does not refresh global search | E5: 150 rows instead of 151 |
| no corpus update after a scan | E5: 150 rows instead of 151 |
| the keyword not kept | E3: an empty box on return |
| hit text may wrap | E1: row heights 29, 29, 29, 29, 66 |

Browser assertions, "when would it be red": every "nothing shows" check is paired with the state that follows
it (E2's blank area with the visible hint at the same moment and the results later; E3's held page with the
switch after it); the one-line geometry is measured on a width-constrained element (`min-width: 0`, flex), so the
ellipsis check can fail, and the wrap mutation above shows the height check failing.

### Resource reuse

From the gateway's log: one `electron-vite build` (its three bundles) for the whole e2e run. The launches leave no
output of their own; by the code, nine across the seven global search cases (E3 and E7 twice), each on its own
userData as designed. Fixture homes and token builds stay per case, in milliseconds.
