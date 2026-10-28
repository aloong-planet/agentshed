# Document sync checklist — #324 Antigravity sessions and turns

Ticket: [#324](https://github.com/aloong-planet/agentshed/issues/324) · feature checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The session view's capabilities cover Antigravity sessions: titles, questions, turn blocks (plain-text thinking, subagent returns, failed calls), rewound turns left out, the fork banner, and the header's conversation ID, `agy --conversation` resume command and database shown in Finder — in this ticket's PR | [session-view](../../features/session-view.md), [project-detail](../../features/project-detail.md) | Waiting — this ticket's implementation. Since #322 both pages name the sides whose sessions are listed (Claude Code, Codex and Grok), and project-detail's boundary says an Antigravity CLI conversation is not listed in Sessions: rewrite those sentences |
| Global search's statement of what is searched stays true with Antigravity sessions in it — same trigger | [global-search](../../features/global-search.md) | Waiting — this ticket's implementation |
| Deviations written back — wrap-up | [session-view spec](../../specs/session-view.md) session-view::REQ-003, session-view::REQ-004, session-view::REQ-005, and the Antigravity clauses of session-view::US-001/AC-01, session-view::US-001/AC-04 and session-view::US-001/AC-07 | Waiting — this ticket's wrap-up |
| Cross regression for this ticket's range — step 8 | the documents above and the session-page prototype | Waiting — this ticket's step 8 |
| The feature checklist's #324 rows re-evidenced after the post-implementation check's fixes (F1, F3, F4) — before delivery | [checklist.md](checklist.md) current verification | Pending — rows rewritten with the fix's cases and targeted run; the fix commit's id to be named, and the incremental check to agree |
| The subagent block's unattributed note, reworded in both dictionaries, stays true where the features page states it — in this ticket's PR | [session-view](../../features/session-view.md) ("Subagent dispatches are visible in place") | Pending — the page's sentence rewritten to the same two reasons; checked again at step 8 |
