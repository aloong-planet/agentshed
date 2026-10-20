# Session view — Coverage and acceptance checklist

Spec: [session-view](../../specs/session-view.md)
Source commit: a1b04b5 (main)
Scope: #278 only — an increment to a shipped feature. In scope: A4 (the title) and B2's re-titling of a stripped fork,
on every surface that shows a session's title. The spec's other items are not affected by #278: it changes which title
the engine hands to the session page and the project search, and nothing else; this checklist was started for #278
and covers nothing beyond it.

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| session-view A4, B2 (re-titling) on the session page | A stripped fork whose title came from its first question is titled by the first question left; a `thread_name` keeps priority | #278: the fix and its user-path acceptance | Test: the engine's session questions for such a fork carry the listed title (unit); the session page's header shows it on opening and while the banner's jump is pending (e2e) |
| session-view A4, B2 (re-titling) in a project's own session search | The same title on the search's session card | #278 | Test: the project search's card for a stripped fork (unit) |
| session-view A4 (`thread_name` first) | A stripped fork with a `thread_name` keeps it | #278 (regression) | Test: the engine's session questions for such a fork (unit) |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-20 · spec a1b04b5 · impl fcdb6c7 | session-view A4, B2; #278, the session page | token-stats.test: the engine's session questions for a stripped fork with no `thread_name` carry "child new question", the listed title (red on the unfixed code with "parent question one"); app.spec: the fork's page header reads "Child new question" on opening and while the banner's jump is pending (both red on the unfixed code) | Passed |
| 2026-10-20 · spec a1b04b5 · impl fcdb6c7 | session-view A4, B2; #278, the project search | search-sessions.test: a question-mode search for "child new" gives one group, the fork's, titled "child new question" (red on the unfixed code with the parent's replayed question) | Passed |
| 2026-10-20 · spec a1b04b5 · impl fcdb6c7 | session-view A4 (`thread_name` first); #278 (regression) | token-stats.test: the session questions of a stripped fork with a `thread_name` carry it | Passed |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every unit in scope has a ticket and a verification | A4, B2 on the two surfaces | Done 2026-10-20 |
| Reverse: every planned test traces to A4 or B2 | the test review's design table | Done 2026-10-20; no product behaviour beyond the spec |
