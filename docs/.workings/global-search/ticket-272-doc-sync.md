# Document sync checklist — #272

Ticket: [#272 Global search: back to the results from a hit's session, or on into its project](https://github.com/aloong-planet/agentshed/issues/272) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Add the two exits and the return to the results to the global search feature entry | [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the exits line added and the hit line no longer ends on the back control ([regression, stage 1](final-regression.md#ticket-272--global-search-back-to-the-results-from-a-hits-session-or-on-into-its-project)) |
| State that a session opened from a global search hit has the two exits, and that a fork parent reached from it does not | [features/session-view.md](../../features/session-view.md), [features/global-search.md](../../features/global-search.md) | Done 2026-10-19: the session page line names the two ways out and the one-line back button; the fork parent's single control is in the global search entry's exits line |
| Bring the spec's status and Pending note up to what shipped | [spec](../../specs/global-search.md) | Done 2026-10-19: the exits shipped; the note narrowed to US-004 |
| Write back the implementation's clarifications to the spec: J11 (long names and narrow windows, from the prototype) and the origin's wording in Implementation Decisions (it travels with the open session, the owner's R-b) | [spec](../../specs/global-search.md), [checklist](checklist.md) two-way audit | Waiting: the owner's confirmation in the PR review. Followed up by this ticket's implementer: kept or reverted as the owner decides, before merge |
| Declare the capability the test skills asked about | [capabilities.toml](../../../capabilities.toml) | Done 2026-10-19: `red-green-mutation` not enabled, on the owner's answer (53e3ab3) |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done 2026-10-19: #272's block, verified on 09966e1 and re-run whole by the gateway on 7d8ea36; J11's row added |
| Record the merge: the merge commit in the coverage checklist's rows, and #272's acceptance items ticked on the issue | [checklist](checklist.md), [#272](https://github.com/aloong-planet/agentshed/issues/272) | Waiting: the merge. Followed up by this ticket's implementer right after it |
Pre-delivery scope re-check (2026-10-19): from the ticket (its product and process acceptance), the change
(53e3ab3, 09966e1, 5bd38dd, 7d8ea36 and this step's documents), the runs (the gateway on 7d8ea36, the
measurements, the mutations) and the current documents — the global-search and session-view specs, both
feature entries and the indexes, CONTEXT, ADR-0018, `capabilities.toml`, the coverage checklist, the
regression report, and the ignored working-record directory listed with its ignored files shown. Found and
added during the check: the spec's status and Pending note (a row of its own, done), J11 and the origin's
wording (waiting for the owner), and the capability declaration (done). No item is Pending; the two Waiting
items name their event and who follows them up. The ignored `startup-restore` screenshots in the working
directory are written by an existing e2e case and are not part of this ticket.
