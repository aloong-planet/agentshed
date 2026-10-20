# Session view — Coverage and acceptance checklist

Spec: [session-view](../../specs/session-view.md)
Source commit: a1b04b5 (main)
Scope: #278 only — an increment to a shipped feature. In scope: A4 (the title) and B2's re-titling of a stripped fork,
on every surface that shows a session's title, the fork banner's parent title included. The spec's other items are
not affected by #278: it changes which titles the engine hands to the session page (its header and its fork banner)
and the project search, and nothing else; this checklist was started for #278 and covers nothing beyond it.

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| session-view A4, B2 (re-titling) on the session page | A stripped fork whose title came from its first question is titled by the first question left, in either tier that strips; a `thread_name` keeps priority | #278: the fix and its user-path acceptance | Test: the engine's session questions for such a fork carry the listed title, for a verified strip and for an orphan whose opening burst is stripped; a fork stripped empty still resolves (unit); the session page's header shows the title on opening and while the banner's jump is pending (e2e) |
| session-view A4, B2 (re-titling) in a project's own session search | The same title on the search's session card | #278 | Test: the project search's card for a stripped fork (unit) |
| session-view A4 (`thread_name` first) | A stripped fork with a `thread_name` keeps it | #278 (regression) | Test: the engine's session questions for such a fork (unit) |
| session-view B2 and Further Notes (the three tiers of presenting uncertainty): the parent title on a fork's banner | "the stripped banner carries the parent session's title" — the parent's title as A4 and B2 give it, which the list shows; a failed read keeps the title the parent was parsed with | #278: the fix (the post-implementation check's F1) | Test: the engine's session questions for a fork of a stripped fork carry the parent's listed title, and the parsed title when the parent's file is gone (unit); the banner renders the value it is given (the existing e2e banner case) |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-20 · spec a1b04b5 · impl 4dd8a6f | session-view A4, B2; #278, the session page | token-stats.test: the engine's session questions for a stripped fork with no `thread_name` carry "child new question", the listed title (red on the unfixed code with "parent question one", [log](evidence/ticket-278/red-unit.log)); an orphan fork whose two opening questions came 300 ms apart is listed and opened as uncertain with one question, titled "orphan new question"; a fork stripped empty resolves with no question. app.spec: the fork's page header reads "Child new question" on opening and while the banner's jump is pending (both red on the unfixed code, [log](evidence/ticket-278/red-e2e.log)). Green on 4dd8a6f: [unit](evidence/ticket-278/targeted-4dd8a6f-unit.log), [e2e](evidence/ticket-278/targeted-4dd8a6f-e2e.log) | Passed |
| 2026-10-20 · spec a1b04b5 · impl 4dd8a6f | session-view A4, B2; #278, the project search | search-sessions.test: a question-mode search for "child new" gives one group, the fork's, titled "child new question" (red on the unfixed code with the parent's replayed question); now its own case. Green on 4dd8a6f ([unit](evidence/ticket-278/targeted-4dd8a6f-unit.log)) | Passed |
| 2026-10-20 · spec a1b04b5 · impl 4dd8a6f | session-view A4 (`thread_name` first); #278 (regression) | token-stats.test: the session questions of a stripped fork with a `thread_name` carry it. Green on 4dd8a6f ([unit](evidence/ticket-278/targeted-4dd8a6f-unit.log)) | Passed |
| 2026-10-20 · spec a1b04b5 · impl 4dd8a6f | session-view B2, the fork banner's parent title; #278, the session page | token-stats.test: a fork of a stripped fork names its parent "parent new question", the parent's listed title (red on fcdb6c7 with "grandparent question", [log](evidence/ticket-278/red-f1.log)); with the parent's file gone after the scan, the page still opens and names the parent "grandparent question", its parsed title. app.spec: the stripped fork's banner shows the parent's title it is given. Green on 4dd8a6f: [unit](evidence/ticket-278/targeted-4dd8a6f-unit.log), [e2e](evidence/ticket-278/targeted-4dd8a6f-e2e.log) | Passed |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Forward: every unit in scope has a ticket and a verification | A4, B2 on the three surfaces (the session page's header and fork banner, the project search) | Done 2026-10-20 |
| Reverse: every planned test traces to A4 or B2 | the test review's design table and its increment | Done 2026-10-20; no product behaviour beyond the spec |
| The fork banner's parent title, found missing from the scope by the post-implementation check (F1) | B2; the stripped banner's parent title | Added as the fourth unit above, owned by #278 |
