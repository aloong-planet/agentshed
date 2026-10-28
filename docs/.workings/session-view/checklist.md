# Session view — Coverage and acceptance checklist

Spec: [session-view](../../specs/session-view.md)
Source commit: a443fb3 (the session ID and resume round, 2026-10-28; branch feat/session-resume). The earlier round below
was checked against 562ddc7.
Scope: the session ID and resume round — an increment to a shipped feature. In scope: session-view::US-001 (AC-01 to
AC-10), session-view::CON-001, session-view::CON-002, session-view::CON-003, and the regressions they touch: P1 to P8
(the header arrives with the page, a restored page acts on its saved data), session-view::REQ-001 (saved pages restore,
now with the ID filled in), R1 (the new show-in-Finder channel goes through the same allow-list), R3 (the page contract
gains the ID), and the global-search exits (global-search::US-003; the stale flag now reaches the page on every route).
Not affected this round: A, B, C, D, G (the list, the question index, turn fetching, search and the Grok parsing produce
nothing new — the ID is read from what the scan already holds), session-view::REQ-002 (hit rows), and E (archived).

## Source → spec

The session ID and resume round, 2026-10-28.

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| Owner's request (translated): "add each session's session ID to every session under the Sessions tab" | Confirmed and in force (placement narrowed by the placement ruling below) | session-view::US-001/AC-01 | The ID at the end of the session page's meta line; per-side sources from the enumeration of 2026-10-28 |
| Owner's request (translated): "reach the corresponding directory by the session ID" and "add an entry for opening the session directory" | Confirmed and in force | session-view::US-001/AC-02, session-view::US-001/AC-07 | Read with the ruling "show the session's record file in Finder": Finder opens with the record file selected |
| Owner's request (translated): "add a copy command so I can resume the session from the right tool's terminal"; per side Claude Code / Codex / Grok | Confirmed and in force | session-view::US-001/AC-04, session-view::US-001/AC-05 | One command per side, in that side's own tool; the three commands checked against the installed tools' help (claude 2.1.286, codex 0.164.0-alpha, grok 1.0.60) |
| Owner's question: is a session owned by the tool that started it | Background | the section's opening paragraph | Answered from code: each session belongs to exactly one side (its data directory) |
| Ruling: placement = the session page header (over list row + page, list row only) | Confirmed and in force | session-view::US-001/AC-02; Out of Scope (rows, overview card, search hits) | The rows are unchanged; every route to the page gets the header |
| Ruling: open directory = show the record file in Finder (over the project directory, the session's own directory) | Confirmed and in force | session-view::US-001/AC-07 | Per side: the Claude file, the Codex rollout or its compressed file, Grok's update stream |
| Ruling: the command changes into the project directory first, `cd '<dir>' && <tool> resume` (the option's own text added single-quote escaping of the path) | Confirmed and in force | session-view::US-001/AC-04, session-view::CON-002 | The directory quoting came with the option's description and is kept; the ID quoting rule is derived (row below) |
| Ruling: Codex named by its bare command; the product does not locate the tool | Confirmed and in force | session-view::CON-001 | The fact that codex is not on this machine's path is recorded as a boundary |
| Ruling: a separate copy-ID button | Confirmed and in force | session-view::US-001/AC-02, session-view::US-001/AC-03 | — |
| Ruling: archived Codex sessions — the command unchanged, Codex prompts | Confirmed and in force | Failure modes: pasting the command (archived) | Which of Codex's two prompts appears is marked as not tried |
| Ruling: stale project — copyable, with a note beside it | Confirmed and in force | session-view::US-001/AC-08 | With layout B the note is a line in the resume tooltip (the option's own stated cost) |
| Ruling: layout B, the title-row icon group (over a command strip and text links) | Confirmed and in force | UI decisions: the session page header | — |
| Ruling: icons FolderOpen and SquareTerminal (candidates page) | Confirmed and in force | UI decisions: the session page header | The losing icons left the prototypes' icon table with the candidates page |
| Ruling: keep the no-ID form | Confirmed and in force | session-view::US-001/AC-09 | — |
| Ruling: the prototype finalised (tooltip, copy feedback, stale warning, failure toasts) | Confirmed and in force | session-view::US-001/AC-02, AC-05, AC-06, AC-10 | AC-06's restart of the 1.5 s on a second copy is the confirmed prototype's behaviour |
| Ruling: the upgrade transient reuses the no-ID form, worded neutrally ("Session ID unavailable", "could not be read") | Confirmed and in force; supersedes the prototype's first wording ("not recorded") | session-view::CON-003, session-view::US-001/AC-09 | The prototype's copy was changed the same day |
| Ruling: write "never runs a command, opens no terminal, no resume in an agent's own app or extension" as out of scope | Confirmed and in force | session-view::CON-001; Out of Scope | — |
| Derived, not asked: an ID with characters outside letters, digits, `-`, `_`, `.` is single-quoted in the command | Background (security bound on a confirmed form; no visible change for real IDs, all UUIDs) | session-view::CON-002 | Told to the owner with the out-of-scope question; to be revisited if the owner objects |
| Product invariant: the product never writes to any agent's configuration (stale note, CONTEXT) | Background | session-view::CON-001 | — |
| The 2026-10-21 postmortem: a field added to a saved type is filled in on restore | Background | session-view::CON-003 | Claude Code and Grok filled by the live path rule; Codex none |

## Spec → tickets → verification

The rows below are the #278 round's. The session ID and resume round was implemented directly from the spec, without
tickets: its coverage units' criteria and checks are in [the task list](session-id-tasks.md)'s success criteria, and
their results in its tasks and the review records.

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| session-view A4, B2 (re-titling) on the session page | A stripped fork whose title came from its first question is titled by the first question left, in either tier that strips; a `thread_name` keeps priority | #278: the fix and its user-path acceptance | Test: the engine's session questions for such a fork carry the listed title, for a verified strip and for an orphan whose opening burst is stripped; a fork stripped empty still resolves (unit); the session page's header shows the title on opening and while the banner's jump is pending (e2e) |
| session-view A4, B2 (re-titling) in a project's own session search | The same title on the search's session card | #278 | Test: the project search's card for a stripped fork (unit) |
| session-view A4 (`thread_name` first) | A stripped fork with a `thread_name` keeps it | #278 (regression) | Test: the engine's session questions for such a fork (unit) |
| session-view B2 (re-titling) on the session list | "where that read fails (the file deleted or compressed since the scan), that surface keeps the title the session was parsed with, and nothing else is affected"; #278 rewrote the list's re-title through the shared function | #278 (regression) | Test: a build whose parse runner removes the fork's file once parsed lists the fork with its parsed title (unit) |
| session-view B2 and Further Notes (the three tiers of presenting uncertainty): the parent title on a fork's banner | "the stripped banner carries the parent session's title"; B2: the re-derived title is the session's title wherever it is named, "the parent title on the banner of a fork of it" included; a failed read keeps the title the parent was parsed with on that banner | #278: the fix (the post-implementation check's F1) | Test: the engine's session questions for a fork of a stripped fork carry the parent's listed title, and the parsed title when the parent's file is gone (unit); the banner renders the value it is given (the existing e2e banner case) |

## Current verification

The rows below are the #278 round's.

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-20 · spec 562ddc7 · impl 4dd8a6f | session-view A4, B2; #278, the session page | token-stats.test: the engine's session questions for a stripped fork with no `thread_name` carry "child new question", the listed title (red on the unfixed code with "parent question one", [log](evidence/ticket-278/red-unit.log)); an orphan fork whose two opening questions came 300 ms apart is listed and opened as uncertain with one question, titled "orphan new question"; a fork stripped empty stays on the read allow-list and resolves with no question. app.spec: the fork's page header reads "Child new question" on opening and while the banner's jump is pending (both red on the unfixed code, [log](evidence/ticket-278/red-e2e.log)). Green on 4dd8a6f: [unit](evidence/ticket-278/targeted-4dd8a6f-unit.log), [e2e](evidence/ticket-278/targeted-4dd8a6f-e2e.log); the allow-list assertion added on 1c51f4d, green in its gateway ([log](evidence/ticket-278/verify-1c51f4d.log), [exit](evidence/ticket-278/verify-1c51f4d.exit)) | Passed |
| 2026-10-20 · spec 562ddc7 · impl 4dd8a6f | session-view A4, B2; #278, the project search | search-sessions.test: a question-mode search for "child new" gives one group, the fork's, titled "child new question" (red on the unfixed code with the parent's replayed question); now its own case. Green on 4dd8a6f ([unit](evidence/ticket-278/targeted-4dd8a6f-unit.log)) | Passed |
| 2026-10-20 · spec 562ddc7 · impl 4dd8a6f | session-view A4 (`thread_name` first); #278 (regression) | token-stats.test: the session questions of a stripped fork with a `thread_name` carry it. Green on 4dd8a6f ([unit](evidence/ticket-278/targeted-4dd8a6f-unit.log)) | Passed |
| 2026-10-20 · spec 562ddc7 · impl 4dd8a6f | session-view B2, the fork banner's parent title; #278, the session page | token-stats.test: a fork of a stripped fork names its parent "parent new question", the parent's listed title (red on fcdb6c7 with "grandparent question", [log](evidence/ticket-278/red-f1.log)); with the parent's file gone after the scan, the page still opens and names the parent "grandparent question", its parsed title. app.spec: the stripped fork's banner shows the parent's title it is given. Green on 4dd8a6f: [unit](evidence/ticket-278/targeted-4dd8a6f-unit.log), [e2e](evidence/ticket-278/targeted-4dd8a6f-e2e.log) | Passed |
| 2026-10-20 · spec 562ddc7 · impl 1c51f4d | session-view B2 (re-titling); #278, the session list | token-stats.test: with a parse runner that removes the fork's file once parsed, the build resolves and lists the fork stripped, one question, titled "parent question one" (its parsed title); the same pair without the removal is titled "child new question" (U1). Green in 1c51f4d's gateway ([log](evidence/ticket-278/verify-1c51f4d.log), [exit](evidence/ticket-278/verify-1c51f4d.exit)) | Passed |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| This round, source → spec: every confirmed source has its coverage unit | the rulings and requests of 2026-10-28 in Source → spec | Done 2026-10-28 against a443fb3; the stale note's place (a tooltip line) and the neutral no-ID wording were checked against the rulings that set them |
| This round, spec → source: every normative item in the new section traces to a confirmed source or is marked background or derived | session-view::US-001, session-view::CON-001 to session-view::CON-003, the failure modes, the UI decisions, the Out of Scope entries | Done 2026-10-28; one derived item (the ID quoting in session-view::CON-002) told to the owner; the out-of-scope entries on running commands and agent apps were confirmed by the owner the same day |
| Forward: every unit in scope has a ticket and a verification | A4, B2 on the session page's header and fork banner, in the project search, and on the list's fallback | Done 2026-10-20 |
| Reverse: every planned test traces to A4 or B2 | the test review's design table and its two increments | Done 2026-10-20 against spec 562ddc7; no product behaviour beyond the spec |
| The fork banner's parent title, found missing from the scope by the post-implementation check (F1) | B2; the stripped banner's parent title | Added as the unit for the fork banner's parent title above, owned by #278 |
| A failed read keeping the parsed title, asserted by U7 and U8 but stated nowhere in the spec (the third post-implementation check's F9) | B2's re-title bullet | Written into B2 (562ddc7), with the rule that the re-derived title holds on every surface; the code has kept the parsed title on a failed read since the re-title was added |
