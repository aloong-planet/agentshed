# Code review — #324 Antigravity sessions and turns

Ticket: [#324](https://github.com/aloong-planet/agentshed/issues/324) (feature `antigravity-side`) · feature checklist:
[checklist.md](checklist.md)

Date 2026-10-29 · scope: every product-code change of the ticket, `c9f69aa..a91857a` (`src/main/index.ts`,
`src/main/providers/{antigravity,token-stats,question-index,turn-content,search-sessions,question-corpus,session-title}.ts`,
`src/shared/{session-resume,i18n/zh,i18n/en}.ts`, `src/renderer/src/{SessionPane,DetailPane}.tsx`), read as one diff
(1143 lines), with the test fixtures and cases read alongside · fixes in the commit that follows this record.

## Underlying premises

Findings: F1, F2 (fixed). The facts the code rests on were measured again, over every transcript on the machine
(read-only copies; script `verify.mjs` in the session scratch directory):

- step indices only fall at the measured rewind (three lines of `8c07e920`, nowhere else) — the premise of
  `agyKeptLines` and of the turn trimming;
- every one of the 24 calls is one call per response, followed (after any system messages) by a result line — the
  premise of pairing in order;
- all 11 system messages match the sender and body patterns; both creation echoes yield their conversation id;
- the transcript path `<root>/brain/<id>/.system_generated/logs/transcript_full.jsonl` with `<id>` the database's name
  (15 of 15 transcripts; the 4 empty conversations have none).

- **F1** — the `CACHE_VERSION` v19 comment said a v18 entry "would leave every conversation unlisted until it
  changed". Not so: the shape guard now requires the new fields, so a v18 Antigravity entry is turned away and read
  again one by one. The comment now states the bump as the shape rule's and says what the guard would do.
- **F2** — `readAgySummaryTitles`'s doc said an untitled conversation "is not in" the summaries; it is, with an empty
  title (measured for the fork and both subagents). Reworded to what the reader does: leaves it out.

The new comments that state a cause were checked against the code: the read source taken before the index (the
handlers' identity order), a failed rebuild failing the page only (the cache is not written on a null parse), titles
read per scan (no per-file cache of them).

## Runnability

No finding. Paths walked, each with its escape surface:

| Path | Behaviour | Escape surface |
|---|---|---|
| Transcript missing or not openable in the parse | No question; not listed; tokens count | Self |
| A transcript line that will not parse; a half-written last line | Skipped; the turn ends at the last parseable line | Self |
| Summaries missing, another shape, not a database | Every title falls back to the first question | By design of the one source (REQ-003/AC-03), not an escape |
| Summaries read failing while agy writes | The titles last read are kept | Self |
| Database read failing while agy writes (page rebuild) | `sessionParseFailed` for that page; cache untouched; next fetch reads again | Self |
| Transcript changed after the scan | Signature mismatch → that conversation re-read for the page; the next scan agrees | Self |
| Transcript deleted after the scan | `sourceIdentity` refuses → the page's error state (P6) | Self |
| A parent deleted since the last scan | Out of the cache at the next scan → the banner's gone form | Self |
| A parent unreadable in the supported format | Left out of the scan's readable set → the fork's banner says "no longer on this machine" | Same-layer, wording only — see the refactor list R2 (kept, written into the spec's failure modes) |
| Before any build in the process (search during startup) | Titles read once lazily; cached entries serve the index | Self |

The parse runs on the workers in production: the targeted e2e run under the built app's parse pool reported no
`[parse-pool]` line (the launcher counts it as an error).

## Security

No finding. The renderer can name only an admitted database path; the transcript path is derived on the main process
from that path's directory-listed name, and the page's and turn's handlers lstat the derived transcript (a replaced
symlink is refused, as for every side's session file). Finder is handed only allow-listed paths, now databases alone.
Agent text — prose with `file://` links, titles, system messages — reaches the renderer as data and renders as text
(e2e: no anchor inside the prose). The regular expressions over agent text are anchored by literals and lazy; the
transcript lines they run on are single JSON values.

## Consistency

No finding requiring a change; two items to the refactor list. Invariants re-checked against the change: the read
allow-list stays an exact set of what the renderer may name (R1); the page's identity check is taken on the file whose
bytes are read, as before; the question text is normalised by the one function every side uses (REQ-002); a cache shape
change carries its version bump and the archive stamps in the e2e cases moved with it (`+c19`); `listedOf` is now the
flag every kind carries.

Smell baseline over the changed code: Duplicated Code — the Antigravity banner repeats the Codex banner's linked-title
fragment (R1 below); Repeated Switches — `side === 'antigravity'` branches in `questionTextAt`, `turnBlocksFromText`,
`sessionIdFromPath`, the banner and the pill tooltip, each the existing per-side branching of its function (answered:
the per-side rules differ in kind, as for the other sides); the rest of the baseline does not apply.

## Refactor list (not executed)

| # | Content | Reason | Impact | Recommendation |
|---|---|---|---|---|
| R1 | Share the linked parent-title fragment between the Codex and Antigravity banners | Duplicated Code (about twelve lines) | Self; display only | Do not do now: the change is narrow and the Codex banner is outside this ticket's scope; worth doing if a third banner variant arrives |
| R2 | Tell an unreadable parent from a deleted one in the fork's banner | The gone wording is inexact when the parent still exists but cannot be read | Same-layer, wording only, and only when the parent was rewritten in a new format while the fork was not | Do not do: a new banner variant would need a prototype; the case is written into session-view's failure modes |

## Findings

| # | Layer | Finding | Disposition |
|---|---|---|---|
| F1 | Underlying premises | The v19 comment's claim about v18 entries did not hold | Fixed (comment) |
| F2 | Underlying premises | The summaries reader's doc misdescribed untitled rows | Fixed (comment) |

Instance or class: both are instances (named comments). The class question "a comment states a measured fact" was
answered by re-measuring every fact the new comments state (the premises list above).

## Self-check before hand-over — fixes of the post-implementation check (2026-10-29)

Item 1 (product code the fix changes, against the spec text it implements), over 05faa8a's working tree:

| Change | Spec text | Result |
|---|---|---|
| `TokenEngine` takes an optional directory for the summaries copy, passed to both title reads (the build's and a page's first) | session-view::REQ-003/AC-03 "The summaries are read under token-stats::CON-002"; token-stats::CON-002 "a log: copied together with its log … and the copy is removed" | Agrees: production passes nothing, so the read keeps its default (the system's temporary directory), as before; the argument only chooses where the copy goes, which CON-002 does not fix |
| The subagent block's unattributed note reworded in both dictionaries: "not shown here: either the record has no stable reference chain that would place them under it, or they sit in the subagent's own record, which is not read" | C3 "the sub block on every side is unified as the dispatch arguments + the return + an unattributed warning"; session-view::REQ-004/AC-05 "The subagent's own steps stay unattributed: its transcript is not read"; CONTEXT's rule that copy never enumerates the sides | Agrees, and corrects the old wording, which gave as its reason a missing reference chain "(measured on both sides)": untrue of an Antigravity dispatch, whose result names the subagent's conversation, and a side count |
| `check-shared-ui.mjs` loses the note's allowance | The same CONTEXT rule: copy that must enumerate is allowed by key with its reason | Agrees: the note no longer names a side count, so the allowance had no object (an orphan of this change) |

No finding.

## Spec final check (before step 7; code read only)

2026-10-29, against the specs as this branch leaves them (cbe22ca with the write-backs of 5a117de), the product code at
the post-implementation fix (this ticket's paths), unit by unit; evidence per unit in the checklist's current
verification:

| Unit (spec text) | Implementation | Conclusion |
|---|---|---|
| session-view::REQ-003/AC-01 "A session is one conversation database, identified by its path, in the project token-stats::REQ-003/AC-08 credits it to. A subagent conversation … gets no row of its own" | `parseAntigravityFile`: a subagent's transcript is not read and it is never `listed`; `combine` adds a row for a listed conversation under its `projectKey`; the build admits a registered project's listed conversations | Met |
| REQ-003/AC-02 "A conversation with no question … is not listed and its tokens count" | `listed` requires a question; the calls enter the rows regardless | Met |
| REQ-003/AC-03 "agy's own title … falling back to the first indexed question when agy has none or its summaries cannot be read … read under token-stats::CON-002" | `readAgySummaryTitles` through `readConversationDb`; non-empty titles only; `combine` and the page take the title, else the clipped first question; a failed read keeps the last titles | Met |
| REQ-003/AC-04 "the largest step timestamp in the conversation's database" | `conversationCalls`' `lastStepAt` over every step's creation and completion time | Met |
| REQ-003/AC-05 "the conversation's own usage … a fork's copied calls excluded" | The per-file tokens after the copied calls are dropped (#323's rule) | Met |
| REQ-003/AC-06 "the Antigravity side badge … a fork's row carries the fork marker" | `SIDE_BADGE.antigravity`; `forkState: 'stripped'` for a fork; the pill's copied-history tooltip | Met |
| REQ-004/AC-01 "the body of the line's user-request block … without a request block is listed whole … empty request is not a question … A system-message line … is never a question" | `antigravityQuestion` | Met |
| REQ-004/AC-02 "from its question's line to the next question's line … byte range … never the whole transcript" | `makeAntigravityQuestionIndexer`'s records; the handlers read the ranges from the transcript | Met |
| REQ-004/AC-03 "A line whose step index is not greater than an earlier line's starts a redo …" | `agyKeptLines` (the reading written back to Implementation Decisions); the indexer and the assembler both apply it | Met (as written back) |
| REQ-004/AC-04 "prose … thinking block … Each tool call … pairs with the result line that follows it … a failed or still-running call's included" | `antigravityAssemble` | Met |
| REQ-004/AC-05 "`invoke_subagent` is a subagent block … its return is the … system-message line whose sender is the conversation id the dispatch's result names … never the dispatch's own result … steps stay unattributed … cancelled … shows no return" | `antigravityAssemble`: the creation echo maps the id; a sender's messages join in order; `unlinked`; the reworded note | Met |
| REQ-004/AC-06 "A failed model call's error line renders as prose … Every other system-message line … not rendered … outside [the five types] leaves the unknown trace" | `antigravityAssemble` | Met |
| REQ-004/AC-07 "tool calls other than `invoke_subagent`, and subagent dispatches as `invoke_subagent` calls" | `agyCounts` over kept lines | Met |
| REQ-004/AC-08 "transcript is missing … no question. A line that will not parse is skipped" | The parse catches a missing transcript; `eachJsonlLine` skips a bad line | Met |
| REQ-004/AC-09 "enters the read allow-list … by its database's path … transcript is read only through that entry … derives the transcript's path from the admitted database path" | `sessionFiles` holds listed databases; `sessionReadSource` on the main process | Met (as written back) |
| REQ-005/AC-01 to AC-05 (the banner; the parent as the source of the last copied step; only the fork's own questions; the gone form; the fork state everywhere, never uncertain) | `forkOf` from the last copied step; `agyParent` over readable entries; `Banners`' Antigravity branch; `forkState: 'stripped'` | Met |
| US-001/AC-01, AC-04, AC-07 (the Antigravity clauses) | `sessionIdFromPath`; the resume builder's agy form (#322); Finder given the allow-listed database | Met |
| token-stats::REQ-003/AC-07 (no row), project-detail::REQ-002/AC-04 (Sessions), global-search::REQ-001 (regression) | As REQ-003/AC-01; the Sessions tab lists the rows; the corpus takes listed sessions | Met for this ticket's paths |

Failure modes the ticket settles, each traced to a case or a named gap (the test review's coverage, increment
included): the compaction rewrite's refusal is a named gap (`antigravity.test.ts` header). Scope beyond these units,
traced: the summaries copy-directory argument (a test seam, CON-002 unchanged); the reworded note (C3, REQ-004/AC-05).
No code contradicts a spec statement.

## Wrap-up (step 7, 2026-10-29)

- ADR: none. The decisions of this ticket ([ticket-324-decisions.md](ticket-324-decisions.md)) are this side's rules
  inside ADR-0037's decision (a session is a conversation database; turns from the transcript by byte range); what the
  allow-list holds is written into session-view::REQ-004/AC-09 and R1. No ADR is in the proposed state.
- CONTEXT.md: "Session" and "Turn" amended for the transcript read through the database (5a117de).
- Postmortem: none. No defect escaped a check: the code review's two comment findings, the test review's coverage
  findings and the lint error were each caught by the step that exists to catch them.
- The interface's out-of-scope character icons: the icon-bearing structures of the components this ticket touches —
  the session page's banner icon slots (four, each `GitFork` from `icons.tsx`) and the Sessions row (the side badge's
  text chip, the fork pill's `GitFork`) — hold no emoji, Unicode or single-letter icon; the side badge's letters are the
  confirmed chip design, not an icon. None to report.
- Spec write-backs: session-view::REQ-004/AC-09, six failure modes and the Implementation Decisions entry (5a117de); R1
  (this round); token-stats C16 and the cache key.
