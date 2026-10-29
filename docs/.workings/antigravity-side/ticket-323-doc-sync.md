# Document sync checklist — #323 Antigravity usage in the statistics

Ticket: [#323](https://github.com/aloong-planet/agentshed/issues/323) · feature checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Token statistics' capabilities state the Antigravity CLI accounting (each call once, forks, the four-field total above agy's own, failed attempts, subagents, models as recorded), unreadable conversations, and its known under-counts (the /btw side question, the Auto mode's reviewer) — in this ticket's PR | [token-stats](../../features/token-stats.md) | Done — on this ticket's branch (`feat/antigravity-usage`), merged with its PR. The overview now speaks of every agent side; boundaries add the per-model exactness, the under-counts and the roots not read |
| The agents page describes the unreadable-conversations line on the Antigravity CLI card, its precedence after a registry error, and the card's usage figure — same trigger | [agents-overview](../../features/agents-overview.md) | Done — on this ticket's branch, merged with its PR. The side's boundary no longer says its usage is not read |
| A project's Overview counts Antigravity CLI usage — same trigger (found by the pre-delivery scope re-check: the page's boundary said its usage was not in the Overview) | [project-detail](../../features/project-detail.md) | Done — on this ticket's branch, merged with its PR |
| A conversation in an unsupported format gives no activity — same trigger (found by the same re-check: the walk now applies the format check) | [projects-list](../../features/projects-list.md), [projects-list spec](../../specs/projects-list.md) the Antigravity boundary paragraph | Done — on this ticket's branch, merged with its PR |
| CONTEXT.md's invariant that treated cache writes as a Claude-only figure (the TokenTotals input entry) is amended — when the usage lands | [CONTEXT.md](../../../CONTEXT.md) | Done — on this ticket's branch, merged with its PR: Antigravity CLI's input leaves the reads out; cache writes are reported by Claude Code and Antigravity CLI; the three buckets on every side |
| ADR-0037's "higher by exactly the cache reads" — found while testing AC-03 | [ADR-0037](../../adr/0037-antigravity-cli-as-fourth-agent-side.md) | Done — on this ticket's branch, merged with its PR: a dated note appended (the ADR is accepted, append-only) |
| Deviations written back — wrap-up | [token-stats spec](../../specs/token-stats.md) token-stats::CON-001, token-stats::REQ-003/AC-03, token-stats::REQ-003/AC-06, the side's failure modes (including the deletion windows, made exact after the post-implementation check), Implementation Decisions "Antigravity usage", C16; [agents-overview spec](../../specs/agents-overview.md) the side's failure modes | Done — on this ticket's branch, merged with its PR (listed in [ticket-323-decisions.md](ticket-323-decisions.md); the four wording changes are marked "(spec)" there for the owner's review) |
| A postmortem for the cache-entry guard read after the value it guards (the code review's Runnability 1) — step 7 archive | [the postmortem](../../postmortems/2026-10-29-a-guard-read-after-the-value-it-guards.md), [the postmortems index](../../postmortems/README.md) | Done — on this ticket's branch, merged with its PR; its account of the cases corrected after the incremental test check's F8 (K1–K3 red against the unfixed order, K4 pinning the variant's checks) and re-checked |
| Cross regression for this ticket's range — step 8 | the documents above, the dictionaries, the agents-page and project-detail prototypes | Done — [final-regression.md](final-regression.md) "#323" section, rows re-checked after the post-implementation check's fixes |

Pre-delivery scope re-check (2026-10-29, after the fix commit 0e8f5b9): the change's facts — the commits
`fc5d0b1` and `0e8f5b9`, the pre-review run, the fix's targeted run and its mutation runs — against the documents the
feature checklist names for #323's units, the four feature pages that mention the side, the four specs (token-stats,
agents-overview, projects-list, project-detail), CONTEXT.md, ADR-0037, the READMEs and this ticket's working records,
searched with `rg --no-ignore --hidden` for the statements the fix's facts touch (deletion windows, calls without
identity, the error's precedence, wire types, checkpoints, the shape guard: 9 lines). Differences found and handled:
the token-stats deletion bullet said a deleted conversation leaves the figures "at the next scan", while one deleted
before its read starts leaves them in that scan — made exact; the cross regression and the code review record stated
the deletion as an untested gap and the error's precedence as evidenced by the implementation alone — rewritten to
the cases; the project-detail and projects-list rows above were missing in the first draft and are added. Nothing
marked done rests on a basis that no longer holds.
