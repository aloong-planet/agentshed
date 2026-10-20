# Document sync checklist — #272

Ticket: [#272 Global search: back to the results from a hit's session, or on into its project](https://github.com/aloong-planet/agentshed/issues/272) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Add the two exits and the return to the results to the global search feature entry | [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the exits line added and the hit line no longer ends on the back control ([regression, stage 1](final-regression.md#ticket-272--global-search-back-to-the-results-from-a-hits-session-or-on-into-its-project)) |
| State that a session opened from a global search hit has the two exits, and that a fork parent reached from it does not | [features/session-view.md](../../features/session-view.md), [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the session page line names the two ways out and the one-line back button; the fork parent's single control is in the global search entry's exits line |
| Bring the spec's status and Pending note up to what shipped | [spec](../../specs/global-search.md) | Done 2026-10-19: the exits shipped; the note narrowed to US-004 |
| Write back the implementation's clarifications to the spec: J11 (long names and narrow windows, from the prototype) and the origin's wording in Implementation Decisions (it travels with the open session, the owner's R-b) | [spec](../../specs/global-search.md), [checklist](checklist.md) two-way audit | Done 2026-10-20: kept as written. The owner was asked, in the PR and in the delivery report, to keep or revert both before the merge, and answered by authorising the merge ("merge", translated from the owner's Chinese) without a revert |
| Declare the capability the test skills asked about | [capabilities.toml](../../../capabilities.toml) | Pending: 53e3ab3 declared `red-green-mutation`, which the capability registry had renamed to `mutation-testing` two minutes earlier, so the switch is unconfirmed (the independent test check, C1 and C2). The owner answered on 2026-10-20: not enabled. The declaration is replaced in the follow-up PR |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Pending: #272's block was recorded (verified on 09966e1, re-run whole by the gateway on 7d8ea36), but the independent test check reopened J11's row, whose measurement was taken below the window's 800 px minimum (F1), and found the AC-05 row crediting E8, which does not reach it (F5); both follow the follow-up PR |
| Record the merge: the merge commit in the coverage checklist's rows, and #272's acceptance items ticked on the issue | [checklist](checklist.md), [#272](https://github.com/aloong-planet/agentshed/issues/272) | Done 2026-10-20: #282 squash-merged on the owner's authorisation as f0d7027, whose tree equals the PR head f5ec41f's; the merge closed #272; its 11 acceptance items ticked with [a comment](https://github.com/aloong-planet/agentshed/issues/272#issuecomment-6282369780) naming the evidence. Reopened the same day for the independent check's findings, its two process items unticked ([the reason](https://github.com/aloong-planet/agentshed/issues/272#issuecomment-6284302228)); the follow-up row closes it again |
| Dispose of the independent post-implementation check's findings, in a follow-up PR before #273: the cases for J11 (F1), the fork parent's locating (F2), the error page's exits (F3) and a card header's exits (F4); the dark screenshot's wait (F7); the test design table's E3 and E8 rows and its launch time (F5, F6, F8); the spec's US-003/AC-01 for a card header's session (the owner's answer to F4); and #272's two process items, reopened until then | `e2e/global-search.spec.ts`, [spec](../../specs/global-search.md), [test review](ticket-272-review-tests.md), [checklist](checklist.md), [#272](https://github.com/aloong-planet/agentshed/issues/272) | Pending: the owner's dispositions are recorded in the test review; the follow-up PR does the work |
Pre-delivery scope re-check (2026-10-19): from the ticket (its product and process acceptance), the change
(53e3ab3, 09966e1, 5bd38dd, 7d8ea36 and this step's documents), the runs (the gateway on 7d8ea36, the
measurements, the mutations) and the current documents — the global-search and session-view specs, both
feature entries and the indexes, CONTEXT, ADR-0018, `capabilities.toml`, the coverage checklist, the
regression report, and the ignored working-record directory listed with its ignored files shown. Found and
added during the check: the spec's status and Pending note (a row of its own, done), J11 and the origin's
wording (then waiting for the owner), and the capability declaration (done). No item was Pending at delivery;
the two items then Waiting are done since the merge (below). The ignored `startup-restore` screenshots in the
working directory are written by an existing e2e case and are not part of this ticket.

Post-merge re-check (2026-10-20): from the merge (f0d7027, its tree equal to the PR head), the issue's state
(closed by the merge, its items ticked) and every statement that named either Waiting item, found with
`rg -n --no-ignore -i "waiting|awaiting|await|pending|before merge|the merge\b"` over #272's records, the
regression report, the coverage checklist, the global-search spec and both feature entries (20 lines; the
spec's one line is its US-004 Pending note, which stays). The task list, the coverage checklist's #272 block, J11's
row and its two-way audit row, and the regression report's J11 row are rewritten in place. Found during the
check and added: the `/implement` text reloaded at the merge asks for the post-implementation test check to be
run independently, and this ticket's was not; the test review now says so. No item was Pending or Waiting after
the merge.

Independent check (2026-10-20): the owner then asked for an independent post-implementation check; it reopened the
capability row and the coverage checklist's row, and added the follow-up row. The documents its findings touch were
read for it: this checklist, the task list, the test review, the coverage checklist's #272 mapping, Current
verification and two-way audit rows, the regression report's #272 section, the spec's US-003/AC-01 and J11, and
#272 itself. Three items are Pending, each on the follow-up PR.
