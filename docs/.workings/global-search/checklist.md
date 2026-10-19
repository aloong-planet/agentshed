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
| global-search::US-003/AC-01 | Two exits in one row: back to results (left chevron), then go to project · Sessions (right chevron) | #272: implementation and user-path acceptance | Test: e2e asserts order and targets; Evidence: screenshot |
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
| global-search Failure modes J10 | ⌘⇧F anywhere | #273 | Test: e2e |
| global-search Failure modes D1–D4 | Data changing underneath | #271 | Test: e2e (D1, D4); providers unit (D2, D3) |
| global-search Failure modes, introduced content | Plain-text rendering, no navigation | #271 | Test: e2e with a question containing HTML |
| session-view P10 | Session from a hit has the two exits; fork parent single | #272 | Covered by global-search::US-003/AC-01, AC-04 |
| projects-list C8 | Selected from outside: scrolled into view; filters unchanged | #271 | Covered by global-search::US-002/AC-01 and J2 |
| appearance D1 | Dim includes search | #271 | Covered by global-search::US-001/AC-01 |
| i18n application menu | Edit menu entry | #273 | Covered by global-search::US-004/AC-02 |
| Full-feature acceptance and documentation regression | All of the above together | #274: closeout | Evidence: final-regression.md |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every source in force above maps to a coverage unit | S01–S28 | Done 2026-10-19; superseded sources map to nothing |
| Reverse: spec content without a source | global-search Failure modes S4 (as first written) | Removed the invented "the box takes at most 200 characters"; S4 now follows the existing IPC limit and the failure line |
| Reverse: derived boundaries | global-search J6, J7 | Derived from S24/S25 (only the session opened from a hit has two exits; leaving that session drops them) and the existing navigation; no new obligation |
| Reverse: added boundaries | global-search S15, S16 | Reading failing or still running when the page is left — derived from REQ-002/REQ-003; added at review |
| Reverse: option-description sources | global-search::US-004/AC-01 (focus), global-search::REQ-003/AC-02 (retries) | Recorded as such above; not separately asked |
| Code comments that call settings the rail's "third dimension" | SettingsPane header comment; the appearance e2e case's comment | Not documents: to be reworded when the rail gains search during implementation |
| Prototype gate | global-search Further Notes | Every interface point listed with where it is drawn; four exemptions declared with reasons |
| Shared requirements in other specs | session-view P1, P4, P6, P8, D2a, D4; i18n application menu; projects-list C8 | Cited, not restated |
| Ticket draft, forward: every coverage unit in scope has an owning ticket | the Spec → tickets table | Done 2026-10-19 by walking the spec's sections in order; no unit left without an owner |
| Ticket draft, reverse: every ticket criterion maps to a unit or a stated prerequisite | #271–#274 drafts | Technical prerequisites (the corpus, the two channels, the delay knob on the reading channel) support named units; no product criterion without a unit |
| Cut through one screen? | #271 / #272 | Ruled 2026-10-19 (owner): #271 ships the jump, so a hit opens its session with the existing single back control; #272 adds the two exits and the return. No screen is split, and every merged state of main is coherent |
