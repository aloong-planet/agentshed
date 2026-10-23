# Document sync checklist — #250

Ticket: [#250 Prototype pages: small differences from the app](https://github.com/aloong-planet/agentshed/issues/250) ·
work directory `prototype-baseline` · coverage checklist: [checklist.md](checklist.md) · delivered with #226 in
one PR ([ticket-226-doc-sync.md](ticket-226-doc-sync.md))

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Record the actual verification of #250's units in the coverage checklist once they have run | [checklist](checklist.md) | Done 2026-10-23: rows 250::1–3, 5–9, R1 and done, against 21a8958 |
| Correct row 250::done's page count (T250-1 of the post-implementation check): 8 UI pages, not 9 | [checklist](checklist.md) | Done 2026-10-23 |
| Declare this ticket's artifact paths on #250 when the PR opens | [#250](https://github.com/aloong-planet/agentshed/issues/250) | Done 2026-10-23, with the owner's approval after #305 opened: #250's body gained a "Work records" section listing the code review, test review, this checklist and the coverage checklist; read back equal to the approved draft |
| Close #250 with the merge: every item is fixed (#250's "Done when"); the PR body says "Closes #250" | [#250](https://github.com/aloong-planet/agentshed/issues/250) | Done, completes with this PR's merge. After the merge only the tracker is written back: a comment naming the merge commit and whether main's tree equals the PR head |

Pre-delivery scope re-check (2026-10-23): `docs/specs`, `docs/features`, `docs/adr`, `CONTEXT.md`, both READMEs
and `docs/agents` searched for the facts this ticket changes — the picker shadow, the stale tag, the drawer
mask, the session page's failed turn and fetch states, the demo notes, the list areas' padding, and the
references #250 and #226. Two hits, neither affected: the project-detail spec lists the stale tag as part of
the stale note page's shell (no style values), and ADR-0022 notes what the visibility logic prototype models
(not its chrome). No user-visible behaviour of the app changes, so no sentence in `docs/features/` becomes untrue
and none is missing; step 8 is not run, as the delivery notes say. Item 9's and 226::R1's decisions are the
owner's, recorded in the coverage checklist and the commits; they set prototype values and wording and need no
ADR or glossary entry.
