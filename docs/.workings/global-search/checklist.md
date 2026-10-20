# Global search — Coverage and acceptance checklist

Spec: [global-search](../../specs/global-search.md)
Source commit: bedc384 (main, #269)
Scope: first construction of the feature — every coverage unit of global-search; plus the amended lines
in session-view (P10, Out of Scope), projects-list (C8, Out of Scope), agents-overview, project-detail,
appearance (D1, entry point) and i18n (the application menu)

All sources below are the owner's answers in the requirements conversation of 2026-10-19, translated from the owner's Chinese (the repository's working language is English).

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| S01 "add session search, as its own page under a third menu item" | Confirmed and in force | global-search::US-001/AC-01, global-search::REQ-005 | Third item of the rail's top group, its own page |
| S01 "search a keyword to show the related sessions and their projects" | Confirmed and in force | global-search::US-001/AC-02, AC-04, AC-06 | Sessions shown under their project |
| S01 "clicking a result goes straight to the session under its project" | Confirmed and in force | global-search::US-002/AC-01, AC-02 | Rail to Projects, project selected, session opened |
| S02 "registered projects only" | Confirmed and in force | global-search::REQ-001 | Unregistered directories excluded; Out of Scope repeats it |
| S03 "include them, marking the project stale in the results" | Confirmed and in force | global-search::REQ-001, global-search::US-001/AC-05 | Stale searched and marked |
| S04 "questions only, no full-text toggle" | Confirmed and in force | global-search::REQ-001, global-search::US-001/AC-08 | No toggle; no-hit line points to the project's full text |
| S05 "flat by session, each group naming its project" | Superseded by a later decision | — | Replaced by S17/S18 |
| S06 "back to the project's Sessions tab (current behaviour)" | Superseded by a later decision | — | Replaced by S21–S25 |
| S07 "keep them, for this run only" | Confirmed and in force | global-search::US-003/AC-05, global-search::CON-001 | Kept for the run, not persisted |
| S08 "a newest/oldest sort toggle" | Confirmed and in force | global-search::US-001/AC-07 | Option text also said "sharing one preference"; superseded by S20 (independent) |
| S08 "a shortcut and an application menu entry" | Confirmed and in force | global-search::US-004/AC-01, AC-02 | Focusing the box came from the option's description ("straight to the search page with the box focused"), not asked separately |
| S08 side filter not selected | Explicitly out of scope | Out of Scope "A side filter" | — |
| S09 "keep the question texts in memory, warmed when the page opens" | Confirmed and in force | global-search::REQ-002/AC-01, AC-03, global-search::CON-001, ADR-0034 | — |
| S10 "⌘⇧F" | Confirmed and in force | global-search::US-004/AC-01 | — |
| S11 "yes, scroll it into view when it is out of view" | Confirmed and in force | global-search::US-002/AC-01, projects-list C8 | Hidden stale rows stay hidden (J2) |
| S12 "Global search" | Confirmed and in force | CONTEXT **Global search** | Term, not a coverage unit |
| S13 "the Edit menu, after a separator" | Confirmed and in force | global-search::US-004/AC-02 | — |
| S14 defaults stated before the last batch, not objected: as-you-type at 200 ms; results refresh after a rescan; every hit listed; name with the path as tooltip; the stale tag reused; atomic jump and the arrival highlight reused; project search unchanged; copy settled in the prototype | Confirmed and in force | global-search::US-001/AC-02, AC-04, AC-05, AC-09, global-search::REQ-004, global-search::US-002/AC-01, AC-03, global-search::CON-002, CON-004 | The default's "show searching until the warm-up ends" is superseded by S16 |
| S15 "B: a two-line group header, the project on a line of its own" | Superseded by a later decision | — | Replaced by S17/S18 |
| S16 "while reading, show only the progress up top; the content area shows no searching state" | Confirmed and in force | global-search::REQ-002/AC-02 | Precedence over the startup hint was stated in the delivery and not objected (S28) |
| S17 "show the sessions of one project together" | Confirmed and in force | global-search::US-001/AC-04, AC-07 | — |
| S18 "the project as a section heading, the session cards below it" | Confirmed and in force | global-search::US-001/AC-04, AC-06 | — |
| S19 "with no session data the search bar should still show" | Confirmed and in force | global-search::REQ-006 | Placeholder without a number |
| S20 "settle the three open items as recommended" | Confirmed and in force | global-search::US-001/AC-01 (magnifier), global-search::CON-002 (independent sort) | Stale tag left as is: background, no unit |
| S21 "two exits in the header, one back to the search page, one into or to view Transfer, each with a different icon" | Confirmed and in force | global-search::US-003/AC-01 | Icons and order refined by S24 |
| S22 "that project's Sessions tab" | Confirmed and in force | global-search::US-003/AC-03 | — |
| S22 "still two exits" (the fork parent) | Superseded by a later decision | — | Replaced by S25 |
| S23 "Transfer sessions first, back to search results after" | Superseded by a later decision | — | Replaced by S24 |
| S24 "two arrows. Back to search first, then into the Transfer sessions" | Confirmed and in force | global-search::US-003/AC-01 | Left chevron, then right chevron |
| S24 "after going into the parent, back to search no longer shows" | Confirmed and in force | global-search::US-003/AC-04 | S25 clarified it means the fork parent; going into the project drops it too |
| S24 "going back to search should show the earlier results" | Confirmed and in force | global-search::US-003/AC-02 | — |
| S25 "I mean the fork parent session does not show back to search either" | Confirmed and in force | global-search::US-003/AC-04, session-view P10 | — |
| S26 "confirmed, go on to the next step" | Confirmed and in force | Further Notes (prototype gate) | Prototype confirmed |
| S27 "read 'Go to <project>' and land on the stale note card" | Confirmed and in force | global-search::US-003/AC-03 | — |
| S27 "show a one-line 'search failed' notice" | Confirmed and in force | global-search::REQ-003/AC-01 | Retry on keyword change and after a rescan came from the option's description (REQ-003/AC-02) |
| S28 reading hint takes the hint slot over the startup hint — stated in the delivery, not objected | Confirmed and in force | global-search::REQ-002/AC-02 | — |
| S29 (2026-10-20, after #272's merge) "it counts: keep the two exits" — a session opened from a card's header keeps the exits, as shipped | Confirmed and in force | global-search::US-003/AC-01 | States the shipped behaviour; no code change |

## Spec → tickets → verification

Tickets published 2026-10-19 from bedc384: #271 = the search page, and a hit opening its session inside its project; #272 = the way back from that session; #273 = the shortcut and the menu
item; #274 = the closeout. Links: [global-search spec](../../specs/global-search.md),
[session-view](../../specs/session-view.md), [projects-list](../../specs/projects-list.md),
[appearance](../../specs/appearance.md), [i18n](../../specs/i18n.md).

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| global-search::US-001/AC-01 | Rail Search item below Projects, magnifier, tooltip, selected state | #271: implementation and user-path acceptance | Test: e2e clicks the item, the page shows, the item is selected; Evidence: screenshot of the rail in both appearances |
| global-search::US-001/AC-02 | As you type after a 200 ms pause; trimmed; case-insensitive; idle hint for an empty keyword | #271 | Test: e2e types and sees results without Enter, clears and sees the idle hint; providers unit for case folding |
| global-search::US-001/AC-03 | Placeholder counts sessions and projects with a searched session | #271 | Test: e2e reads the placeholder against the fixture's counts |
| global-search::US-001/AC-04 | Grouped by project: heading with name, counts, path tooltip; session cards under it | #271 | Test: presentation unit (grouping); e2e asserts headings and their cards; Evidence: screenshot |
| global-search::US-001/AC-05 | Stale project's heading struck through with the stale tag; its sessions searched | #271 | Test: providers unit (stale searched); e2e asserts the heading's stale marking |
| global-search::US-001/AC-06 | Card header: badge, title or fallback, fork markers, hit count; hit rows: turn number, highlighted question, relative time | #271 | Test: e2e on a fixture with a stripped fork and an untitled session; Evidence: screenshot |
| global-search::US-001/AC-07 | Counts line; newest/oldest first over both layers; hits in question order | #271 | Test: presentation unit (both orders, both layers); e2e toggles the segment |
| global-search::US-001/AC-08 | No-hit line pointing to the project's full text | #271 | Test: e2e with a keyword that matches nothing |
| global-search::US-001/AC-09 | Every hit listed | #271 | Test: providers unit returns every hit for a one-letter keyword; e2e counts the rows |
| global-search::US-002/AC-01 | Hit → Projects, project selected and scrolled into view, session at that question with the arrival highlight | #271: implementation and user-path acceptance | Test: e2e on a fixture with enough projects to put the target below the fold |
| global-search::US-002/AC-02 | Card header opens the session without locating | #271 | Test: e2e |
| global-search::US-002/AC-03 | Search page holds until the session page can be drawn; a saved page opens at once | #271 | Test: e2e under the injected fetch delay, sampled inside the window |
| global-search::US-003/AC-01 | Two exits in one row: back to results (left chevron), then go to project · Sessions (right chevron); a session opened by a hit row or by its card's header | #272: implementation and user-path acceptance | Test: e2e asserts order and targets, for a hit row, a card's header and a session that cannot be read; Evidence: screenshot |
| global-search::US-003/AC-02 | Back to results: keyword, results, sort, scroll as left | #272 | Test: e2e scrolls, jumps, returns, compares scroll position and sort |
| global-search::US-003/AC-03 | Go to project · Sessions; stale project: "Go to <project>" to the stale note page | #272 | Test: e2e for both, the stale one on a fixture with a stale project |
| global-search::US-003/AC-04 | Single back control for a fork parent, after going into the project, and inside a project | #272 | Test: e2e follows the fork banner and the project path |
| global-search::US-003/AC-05 | Rail Search shows the page as left for the run; empty after a restart | #271: the rail and restart paths; #272: the path from a session page | Test: e2e (#271) leaves and returns through the rail and relaunches; e2e (#272) returns from a session page |
| global-search::US-004/AC-01 | ⌘⇧F opens the page and focuses the box, from any page | #273: implementation and user-path acceptance | Test: e2e triggers the menu accelerator from settings and from a session page |
| global-search::US-004/AC-02 | Edit menu "Search Sessions…" with ⌘⇧F after a separator; copy follows the in-app language | #273 | Test: menu unit (structure and accelerator in each language); e2e clicks the item through the application menu |
| global-search::REQ-001 | Listed sessions of every listed project, stale included; questions only | #271 | Test: providers unit on a fixture home (unregistered directory, warmup, subagent, stripped fork, cold rollout) |
| global-search::REQ-002/AC-01 | Showing the page starts reading | #271 | Test: e2e (the reading channel is called on first show); providers unit (idempotent) |
| global-search::REQ-002/AC-02 | Reading hint in the header slot over the startup hint; empty results area while reading | #271 | Test: e2e under the injected delay extended to the reading channel; Evidence: screenshot |
| global-search::REQ-002/AC-03 | No file reads once read | #271 | Test: providers unit (a search after reading performs no read); Evidence: in-app timing for ADR-0034 |
| global-search::REQ-003/AC-01 | Whole failure shows the failure line, never "no hits" | #271 | Test: e2e with an injected failure; query-layer unit |
| global-search::REQ-003/AC-02 | Retried on keyword change and after a rescan | #271 | Test: query-layer unit (invalidation on snapshot) |
| global-search::REQ-003/AC-03 | An unreadable session is left out of results and counts | #271 | Test: providers unit with an unreadable fixture file |
| global-search::REQ-004/AC-01 | Results refresh by transfusion after a rescan | #271 | Test: e2e appends a matching question to a fixture session and triggers a rescan |
| global-search::REQ-004/AC-02 | Only changed or new sessions re-read | #271 | Test: providers unit counting reads |
| global-search::REQ-005 | Agents page frame; box in the header | #271 | Evidence: screenshot; Test: e2e asserts the box stays in view after scrolling the results |
| global-search::REQ-006 | Nothing to search: box stays, numberless placeholder, message | #271 | Test: e2e on an empty fixture home |
| global-search::CON-001 | Texts in memory only, nothing persisted | #271 | Test: providers unit (no cache file gains question text); Evidence: grep of the caches after a search, command and output recorded |
| global-search::CON-002 | Project search unchanged | #271 (regression) | Test: the existing project-search unit and e2e cases stay green |
| global-search::CON-003 | No natural language across IPC; structured errors | #271 | Test: contract round trip; Gate: the existing IPC validation |
| global-search::CON-004 | New copy in six languages, plural rules, no side enumeration | #271: page and rail; #272: the exits; #273: the menu item | Gate: `pnpm typecheck`, `pnpm check:i18n`, `pnpm check:ui` |
| global-search Failure modes S1–S16 | Searching boundaries | #271 | Test: the providers, presentation and e2e cases above; S6/S7 providers unit |
| global-search Failure modes J1, J2, J8, J9 | Jumping to a hit | #271 | Test: e2e; J8 with a removed fixture file |
| global-search Failure modes J3–J7 | Returning and going on | #272 | Test: e2e |
| global-search Failure modes J11 | A long project name or a narrow window: the exits on one line, each cut with an ellipsis, like the single back control in the row (added on #272's branch, 2026-10-19) | #272 | Test: e2e at the main window's 800 px minimum with a long project name, for the two exits and the single back control (the owner's decision of 2026-10-20, after the independent test check) |
| global-search Failure modes J10 | ⌘⇧F anywhere | #273 | Test: e2e |
| global-search Failure modes D1–D4 | Data changing underneath | #271 | Test: e2e (D1, D4); providers unit (D2, D3) |
| global-search Failure modes, introduced content | Plain-text rendering, no navigation | #271 | Test: e2e with a question containing HTML |
| session-view P10 | Session from a hit has the two exits; fork parent single | #272 | Covered by global-search::US-003/AC-01, AC-04 |
| projects-list C8 | Selected from outside: scrolled into view; filters unchanged | #271 | Covered by global-search::US-002/AC-01 and J2 |
| appearance D1 | Dim includes search | #271 | Covered by global-search::US-001/AC-01 |
| i18n application menu | Edit menu entry | #273 | Covered by global-search::US-004/AC-02 |
| Full-feature acceptance and documentation regression | All of the above together | #274: closeout | Evidence: final-regression.md |

## Current verification

#271's rows: verified on a025015 and re-run whole by the gateway on 2d0a2ce, after the owner's refactors (R1–R3)
and the prototype's hit-row alignment; the refactors change no behaviour. The mutations the test review cites
were taken on a025015; of the lines they targeted, only the hit card's markup moved, into a shared component
drawing the same DOM. Merged by #276 as 28c3c11 on 2026-10-19, its tree identical to the PR head 539c432, which
holds 2d0a2ce's code.

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-01; #271 | e2e `global-search.spec` (the page): four rail items, Search third with its tooltip, selected; `evidence/ticket-271/global-search-results-{light,dark}.png` | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-02; #271 | e2e (the page): results without Enter, idle on clear and on spaces; unit `question-corpus.test` (case beyond ASCII); the debounce is the page's 200 ms timer | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-03; #271 | e2e (the page): placeholder "30 sessions across 27 projects" for the fixture's counts (the empty project and the unregistered directory not counted); e2e (nothing to search): no number | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-04; #271 | unit `global-search-groups.test` (grouping); e2e (the page): headings with folder icon, counts, path tooltips; screenshots | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-05; #271 | unit (a stale project searched, `stale: true`); e2e: struck-through name with the stale tag | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-06; #271 | e2e (the page): badges, fork and uncertain-strip pills, hit counts, row numbers, every occurrence marked, relative time; screenshots. The untitled fallback is unreachable (gap in the test file headers) | Passed, one stated gap |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-07; #271 | unit `global-search-groups.test` (both orders, both layers, ties, missing times); e2e toggles the segment | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-08; #271 | e2e (the page): the no-hit line, naming the Sessions tab and Full text | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-001/AC-09; #271 | unit (600 hits); e2e (150 rows); mutation capping at 500 red | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-002/AC-01; #271 | e2e (going to a hit): Projects, the target row selected and in view with the list scrolled, the session at the question with the arrival highlight; mutation without the scroll red | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-002/AC-02; #271 | e2e (going to a hit): a card header opens without a located row | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-002/AC-03; #271 | e2e (going to a hit) under a 1.5 s fetch delay: the search page on screen inside the window; a cached session opens within 0.7 s; mutation without the fetch red | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::US-003/AC-05; #271 (rail and restart paths) | e2e (the page): back through settings, keyword, rows and scroll as left; e2e (going to a hit): back through the rail, keyword, sort and scroll as left; after a relaunch, empty. The path from a session page is #272's | Passed for these paths |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-001; #271 | unit `question-corpus.test` (what is searched): stale searched; unregistered, warmup, subagent and replayed prefix not; questions only; cold twin; every side | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-002/AC-01; #271 | e2e (reading): the hint before any typing; query-layer `questionReadingQuery` cases; unit (two loads read once) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-002/AC-02; #271 | e2e (reading) under a 3 s delay: the hint in place of the startup hint, idle for an empty keyword, nothing for a typed one, results after; unit (a search waits); `evidence/ticket-271/global-search-reading.png` | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-002/AC-03; #271 | unit (searches read no file, even a changed one); in-app: a search 3.5–13.9 ms median (`evidence/ticket-271/measurements.md`) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-003/AC-01; #271 | e2e (the page): a 201-character keyword shows the failure line; unit (a failed reading fails the search); presentation unit (the area's failed state) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-003/AC-02; #271 | e2e (the page): a changed keyword searches again after the failure; query-layer unit (a rescan refetches a failed search) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-003/AC-03; #271 | unit (a removed session left out, the others listed); mutation failing the pass red | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-004/AC-01; #271 | e2e (results follow the data): a new hit after a rescan with keyword, sort and scroll unchanged; unit (a search right after the update sees it); query-layer unit | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-004/AC-02; #271 | unit (only the changed and the new session re-read; an answer-only change not) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-005; #271 | e2e (the page): no project column; the box's position unchanged after scrolling 150 rows; `evidence/ticket-271/global-search-scrolled-{light,dark}.png` | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::REQ-006; #271 | e2e (nothing to search) and (results follow the data, D4) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::CON-001; #271 | unit (the cache directory byte for byte unchanged); e2e (empty after a relaunch); in-app: none of 25 sampled question texts gained in any file (`evidence/ticket-271/measurements.md`) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::CON-002; #271 (regression) | the gateway: every existing project-search unit and e2e case green; e2e (going to a hit): the two sorts independent | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::CON-003; #271 | unit `validate.test` (the payload's round trip and refusals); validation at both ends (the main process asserts, the preload validates) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search::CON-004; #271 (the page and the rail) | `pnpm typecheck`, `check:i18n`, `check:ui` green; the counted-noun test's new cases (French and Spanish 0, Russian labels) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search failure modes S1–S16; #271 | per the test review's coverage map: S1, S2, S3, S4, S5, S6, S7 (as amended), S8, S11, S12, S13, S14, S16 each a case; S9, S10 by construction; S15 main side and results area only; S2's first-launch sentence (no saved data, written back on this branch) has no case of its own — the page's state there is REQ-006's, which has one | Passed, S15 end to end and S2's first launch stated gaps |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search failure modes J1, J2, J8, J9; #271 | e2e (going to a hit; a hit whose file is gone). J1's exits are #272's | Passed for #271's part |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search failure modes D1–D4; #271 | unit (D1–D3), e2e (D1, D4) | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | global-search introduced content; #271 | e2e (the page): a question holding HTML shows its characters, no element | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | projects-list C8; #271 | e2e (going to a hit) and J2; mutation without the scroll red | Passed |
| 2026-10-19 · spec bedc384 as amended on `feat/global-search` · impl 2d0a2ce | appearance D1; #271 | e2e (the page): four rail items; the update-slot case with the Search item | Passed |

#272's rows: verified on 09966e1 before the code review, with the build made from that tree, and re-run whole
by the gateway on 7d8ea36 after the owner's refactors (5bd38dd: the open session held as one value; no behaviour
change) and the icon module's note (7d8ea36): `pnpm verify` exit 0, every case these rows cite green.
The e2e cases are the global search spec's three #272 cases (named here by their test review's ids E8, E9, E10)
and #271's E3, whose arrival now asserts the exits; the whole global search spec file ran green (10 cases), and
the seven existing app-spec cases that use the session page's single back control ran green. Mutation testing is
not required here (`mutation-testing` not enabled; declared under the registry's former ID `red-green-mutation`
until the follow-up); the mutations taken anyway are in the test review.
Merged by #282 as f0d7027 on 2026-10-20, its tree identical to the PR head f5ec41f, whose code differs from
7d8ea36's only by the e2e file's header comment.

Follow-up (2026-10-20), after the independent test check: on branch `test/global-search-exits-followup`, whose
application code is f0d7027's. E11 is new, E3, E4, E8 and E9 gain assertions; the global search spec file ran green
(11 cases) and the gateway ran whole twice, the second time after E9's guard was amended (G1)
([first](evidence/ticket-272/verify-followup.log), [second](evidence/ticket-272/verify-followup-2.log)). The rows
below that name the follow-up are rewritten in place.

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-01; #272 | e2e E8 and E3: the two exits' texts in order and their chevrons' path data (left, right); screenshots light and dark, the row's 94 computed values equal to the prototype's ([measurements](evidence/ticket-272/measurements.md)). Follow-up (2026-10-20, spec with S29's wording): E3 asserts them on a session opened from a card's header, E4 on a session that cannot be read, whose first exit returns to the results | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-02; #272 | e2e E8: after oldest first, a scroll and a rescan that added a matching question while the session was on screen, "Back to search results" shows the same keyword, sort and scroll position, and 151 hits | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-03; #272, both forms | e2e E9: the second exit opens target-proj on its Sessions tab; a stale project's exit reads "Go to stale-proj" and opens the stale note page (its tag, no tabs) | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-04; #272, the fork parent and after going into the project | e2e E9: a session opened in the Sessions tab after going into the project, and the fork parent through the banner, each show exactly the single back control; the parent's leads to fork-proj's Sessions tab. Follow-up (2026-10-20): the parent opens with no located or focused question, the child's focused question shown as 01 first | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-04; #272 (regression), a session opened inside a project | the app spec's seven session-page cases that use the single back control (the overview card, the session page and back, the fork banner, a Grok session, opening through the query layer, a compressed session, leaving and coming back) | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::US-003/AC-05; #272, the path from a session page | e2e E3 (the rail's Search from a hit's session) and E10 (the rail's Search from the session, then Projects, and again after another project is selected): the page as left each time. E8 takes "Back to search results", not the rail, and is not counted here (corrected 2026-10-20 — F5) | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search::CON-004; #272 (the exits) | `pnpm typecheck`, `pnpm check:i18n`, `pnpm check:ui` exit 0 on the tree committed as 09966e1; the counted-noun, plural, distinctions, index, zh-script and stale-note copy tests green | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | global-search failure modes J1 (the exits), J3, J4, J5, J6, J7; #272 | e2e: J1 E3 and E8; J3 E8; J4 E9; J5 E9; J6 E10; J7 E10 | Passed |
| 2026-10-19 · spec 5dfbf0d (main) · impl 09966e1 | session-view P10; #272 | by global-search::US-003/AC-01 and AC-04's rows above | Passed |
| 2026-10-20 · spec f0d7027 · impl f0d7027, tests on the follow-up branch | global-search failure modes J11; #272 | e2e E11: a registered project with a 74-character hyphenated name, its hit at the main window's 800 px minimum — both exits, then the single back control on a session opened from that project, each one line box, cut with an ellipsis and inside the header, the exits on one top ([screenshot](evidence/ticket-272/global-search-exits-long.png)); green in both gateway runs. The earlier measurement, taken below the minimum ([output](evidence/ticket-272/narrow-output.txt)), is superseded (F1) | Passed |

#273's rows: verified on 2882abc, with the build made from that tree; the whole global search spec file ran green
(12 cases), the application menu's e2e (6 cases), the menu unit and every unit test importing a changed module (27
files, 399 cases). The native menu is reached as the application menu's e2e reaches it — the installed item by its id
and its own click; the key press ⌘⇧F itself is not reached by the automation here (measured with the existing ⌘,
item: [probe](evidence/ticket-273/probe-accel.spec.ts), [output](evidence/ticket-273/probe-accel-output.txt)).
Mutation testing is not required (`mutation-testing` not enabled).

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-20 · spec 84d5ae0 (main) · impl 2882abc | global-search::US-004/AC-01; #273, from settings, a session page and the search page itself | e2e E12: the installed item's click shows the search page with the keyword as left and its box focused, from settings, from a hit's session page, and on the search page itself after the sort switch took the focus (the sort as left); focus emulation through CDP. The key press itself: stated gap above | Passed, the key press a stated gap |
| 2026-10-20 · spec 84d5ae0 (main) · impl 2882abc | global-search::US-004/AC-02; #273 | menu unit U1: in each language the Edit menu ends with the select-all role, a separator and the item (id `searchSessions`, `CmdOrCtrl+Shift+F`, the language's copy; English and French as literals; the six labels distinct; no other item with the accelerator); U2: the item calls the injected action; e2e E12: the installed Edit menu ends with the separator and "Search Sessions…" bound to ⌘⇧F, after a switch to French it reads "Rechercher dans les sessions…" and opens the page titled "Recherche" | Passed; which language macOS draws is the i18n spec's known gap |
| 2026-10-20 · spec 84d5ae0 (main) · impl 2882abc | global-search::CON-004; #273 (the menu item) | `pnpm typecheck`, `pnpm check:i18n`, `pnpm check:ui` exit 0 on 2882abc's tree; the dictionary tests green | Passed |
| 2026-10-20 · spec 84d5ae0 (main) · impl 2882abc | global-search failure modes J10; #273 | e2e E12, as US-004/AC-01's row | Passed |
| 2026-10-20 · spec 84d5ae0 (main) · impl 2882abc | i18n application menu, the Edit menu entry; #273 | by US-004/AC-02's row | Passed |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source in force above maps to a coverage unit | S01–S29 | Done 2026-10-19; S29 added and mapped 2026-10-20; superseded sources map to nothing |
| Reverse: spec content without a source | global-search Failure modes S4 (as first written) | Removed the invented "the box takes at most 200 characters"; S4 now follows the existing IPC limit and the failure line |
| Reverse: derived boundaries | global-search J6, J7 | Derived from S24/S25 (only the session opened from a hit has two exits; leaving that session drops them) and the existing navigation; no new obligation |
| Reverse: added boundaries | global-search S15, S16 | Reading failing or still running when the page is left — derived from REQ-002/REQ-003; added at review |
| Reverse: option-description sources | global-search::US-004/AC-01 (focus), global-search::REQ-003/AC-02 (retries) | Recorded as such above; not separately asked |
| Code comments that call settings the rail's "third dimension" | SettingsPane header comment; the appearance e2e case's comment | Not documents: to be reworded when the rail gains search during implementation |
| Prototype gate | global-search Further Notes | Every interface point listed with where it is drawn; four exemptions declared with reasons |
| Reverse: a clarification after the merge | global-search::US-003/AC-01 (a card's header) | S29, the owner's answer of 2026-10-20 to the independent test check's F4; it states the shipped behaviour, so nothing outside the spec's wording changes |
| Reverse: a boundary added during implementation | global-search Failure modes J11 | Added on #272's branch from the confirmed session page prototype, which draws the exits and the back control on one line, cut with an ellipsis; before #272 the app's back control wrapped. Kept: put to the owner in #272's review (#282), who authorised the merge as written (2026-10-20) |
| Shared requirements in other specs | session-view P1, P4, P6, P8, D2a, D4; i18n application menu; projects-list C8 | Cited, not restated |
| Ticket draft, forward: every coverage unit in scope has an owning ticket | the Spec → tickets table | Done 2026-10-19 by walking the spec's sections in order; no unit left without an owner |
| Ticket draft, reverse: every ticket criterion maps to a unit or a stated prerequisite | #271–#274 drafts | Technical prerequisites (the corpus, the two channels, the delay knob on the reading channel) support named units; no product criterion without a unit |
| Cut through one screen? | #271 / #272 | Ruled 2026-10-19 (owner): #271 ships the jump, so a hit opens its session with the existing single back control; #272 adds the two exits and the return. No screen is split, and every merged state of main is coherent |
