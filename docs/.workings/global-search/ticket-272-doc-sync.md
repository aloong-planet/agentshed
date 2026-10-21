# Document sync checklist — #272

Ticket: [#272 Global search: back to the results from a hit's session, or on into its project](https://github.com/aloong-planet/agentshed/issues/272) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Add the two exits and the return to the results to the global search feature entry | [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the exits line added and the hit line no longer ends on the back control ([regression, stage 1](final-regression.md#ticket-272--global-search-back-to-the-results-from-a-hits-session-or-on-into-its-project)) |
| State that a session opened from a global search hit has the two exits, and that a fork parent reached from it does not | [features/session-view.md](../../features/session-view.md), [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the session page line names the two ways out and the one-line back button; the fork parent's single control is in the global search entry's exits line |
| Bring the spec's status and Pending note up to what shipped | [spec](../../specs/global-search.md) | Done 2026-10-19: the exits shipped; the note narrowed to US-004 |
| Write back the implementation's clarifications to the spec: J11 (long names and narrow windows, from the prototype) and the origin's wording in Implementation Decisions (it travels with the open session, the owner's R-b) | [spec](../../specs/global-search.md), [checklist](checklist.md) two-way audit | Done 2026-10-20: kept as written. The owner was asked, in the PR and in the delivery report, to keep or revert both before the merge, and answered by authorising the merge ("merge", translated from the owner's Chinese) without a revert |
| Declare the capability the test skills asked about | [capabilities.toml](../../../capabilities.toml) | Done 2026-10-20: `[mutation-testing] enabled = false`, on the owner's answer to the independent test check's C1, replacing `red-green-mutation`, an ID the registry had renamed before 53e3ab3 declared it (C2); the follow-up's first commit. The follow-up's independent check found the file's nine IDs registered and well formed |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done 2026-10-20: #272's block (verified on 09966e1, re-run whole by the gateway on 7d8ea36), with the follow-up's rows rewritten in place: J11 passed on E11 at 800 px (F1), AC-05 credited to E3 and E10 (F5), AC-01 on a card's header and on a session that cannot be read, the fork parent opened with no located question, and S29 mapped |
| Record the merge: the merge commit in the coverage checklist's rows, and #272's acceptance items ticked on the issue | [checklist](checklist.md), [#272](https://github.com/aloong-planet/agentshed/issues/272) | Done 2026-10-20: #282 squash-merged on the owner's authorisation as f0d7027, whose tree equals the PR head f5ec41f's; the merge closed #272; its 11 acceptance items ticked with [a comment](https://github.com/aloong-planet/agentshed/issues/272#issuecomment-6282369780) naming the evidence. Reopened the same day for the independent check's findings, its two process items unticked ([the reason](https://github.com/aloong-planet/agentshed/issues/272#issuecomment-6284302228)); the follow-up row closes it again |
| Dispose of the independent post-implementation check's findings, in a follow-up PR before #273: the cases for J11 (F1), the fork parent's locating (F2), the error page's exits (F3) and a card header's exits (F4); the dark screenshot's wait (F7); the test design table's E3 and E8 rows and its launch time (F5, F6, F8); the spec's US-003/AC-01 and the two feature entries for a card header's session (the owner's answer to F4); the follow-up's own reviews and regression | `e2e/global-search.spec.ts`, [spec](../../specs/global-search.md), [features/global-search.md](../../features/global-search.md), [features/session-view.md](../../features/session-view.md), [test review](ticket-272-review-tests.md), [code review](ticket-272-review-code.md), [checklist](checklist.md), [regression](final-regression.md) | Done 2026-10-20 on the follow-up branch: each finding's case or correction is in place; the follow-up's design review, code review and its own independent post-implementation check (G1 done, G2 not run, with the reason) are in the records; the regression report's follow-up section has its three stages; the gateway ran green twice |
| Re-tick #272's Test review and Document sync items and close it, once the follow-up PR merges | [#272](https://github.com/aloong-planet/agentshed/issues/272), [checklist](checklist.md) | Done 2026-10-20: the follow-up, #284, squash-merged on the owner's authorisation as 84d5ae0, whose tree equals the PR head 473dff0's; the merge closed #272 again; its Test review and Document sync items ticked again with [a comment](https://github.com/aloong-planet/agentshed/issues/272#issuecomment-6285046037) naming the evidence; the merge commit is in the coverage checklist |
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
#272 itself. Three items were then Pending, each on the follow-up PR; they are done since (below).

Follow-up re-check (2026-10-20): from the follow-up's change (the capability's ID, five e2e cases, the spec's
US-003/AC-01, two feature lines), its runs (the global search file, two gateways) and the follow-up's independent
check, against the documents the follow-up touches — both specs, both feature entries and their index rows, the
test review, the code review, the coverage checklist, the regression report, the task list and #272. Found during
the check and added: the regression report's follow-up section (its rows for J11 and the feature line), the J11
screenshot kept under the evidence, the second gateway's log, and the re-tick of #272 as a Waiting row. No item was
Pending at the follow-up's delivery; its Waiting item is done since #284's merge, and #272 has no open item.
