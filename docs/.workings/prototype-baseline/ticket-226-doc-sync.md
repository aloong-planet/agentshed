# Document sync checklist — #226

Ticket: [#226 Logic prototype pages still carry the logic template's chrome in Chinese](https://github.com/aloong-planet/agentshed/issues/226) ·
work directory `prototype-baseline` (the ticket came out of the i18n feature's review of #223, but the fix is to
the prototypes) · coverage checklist: [checklist.md](checklist.md) · delivered with #250 in one PR
([ticket-250-doc-sync.md](ticket-250-doc-sync.md))

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Record the actual verification of #226's units in the coverage checklist once they have run | [checklist](checklist.md) | Done 2026-10-23: rows 226::1–3 and R1, against 21a8958 |
| Rows 226::2 and 226::R1 after the post-implementation check: every entry button driven (T226-3); the regex mutation rerun with the committed probe on the implementation's pages (T226-1); the unknown-event reason checked by the diff only, since no button reaches it (T226-2) | [checklist](checklist.md) | Done 2026-10-23: rows 226::2 and 226::R1 rewritten on `evidence/round-2/directed-0565012.log` |
| After the incremental check of 0565012: the entry-button checks start each entry from the empty state and again after an event (T226-4), the directed run's trees and mutations are stated in its log and its script is kept beside it (T226-5), and the probe's header names the unknown-event gap (T226-6); rows 226::2 and 226::R1 rest on the new run | [checklist](checklist.md), `evidence/round-2/` | Done 2026-10-23: `directed-4c5f473.log` and `directed.sh`; rows 226::2 and 226::R1 and the run row rewritten on it |
| After the second incremental check: the probe's header also names the empty-diagram notice as checked by the diff only (T226-7); row 226::2 cites the run that clicks every entry button for its script-error result (T226-8) | `evidence/round-2/verify-pages.cjs`, [checklist](checklist.md) | Done 2026-10-23: a comment-only change, its syntax tree unchanged (task 8 of the task list) |
| File the logic template's unguarded `highlight(state.status)` (observation O2 of the post-implementation check) in the prototype skill's repository, aloong-planet/skillshed: the owner chose an issue there on 2026-10-23; the draft goes to the owner before it is posted | aloong-planet/skillshed issues | Waiting: the owner's review of the draft, asked when the pull request opens |
| Declare this ticket's artifact paths on #226 when the PR opens, and note there that the owner added the logic modules' template chrome (226::R1) | [#226](https://github.com/aloong-planet/agentshed/issues/226) | Waiting: the pull request's opening, when the owner is asked to approve the issue edit |
| Close #226 with the merge; the PR body says "Closes #226" | [#226](https://github.com/aloong-planet/agentshed/issues/226) | Done, completes with this PR's merge. After the merge only the tracker is written back: a comment naming the merge commit and whether main's tree equals the PR head |

Pre-delivery scope re-check (2026-10-23): besides the documents searched for #250 (same search, same result),
the i18n feature's records were read where they name #226 (`ticket-223-review-code.md`, `ticket-223-doc-sync.md`,
`ticket-223-review-tests.md`). They describe the logic pages as the known exception tracked in #226 and keep a
raw diff while #226 relies on it; both statements are dated records of that review and stay true as written, so
they are not changed. `scripts/check-lang.mjs` keeps exempting `.html`, `.mmd`, `.css` and `.js` under
`docs/prototypes/` as mockups; #226 explains why no file-level predicate can separate the chrome, and this round
does not change that.
