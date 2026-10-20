# Document sync checklist — #278

Ticket: [#278 A stripped Codex fork's session page and project search show its parent's first question as its title](https://github.com/aloong-planet/agentshed/issues/278) · feature `session-view` ·
coverage checklist: [checklist.md](checklist.md)

Checked 2026-10-20 on branch `fix/stripped-fork-title` (spec 562ddc7, implementation 1c51f4d; fa8024a changes a test
comment only).

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Record the actual verification of #278's units, once they have run | [checklist](checklist.md) | Done: the current verification rows against spec 562ddc7, with the red runs, the targeted runs and the gateways on 4dd8a6f and 1c51f4d |
| Confirm the feature entries' title statements hold on every surface after the fix | [features/session-view.md](../../features/session-view.md), [features/global-search.md](../../features/global-search.md) | Done: [final-regression.md](final-regression.md), #278's Stage 2 — true on every surface now, no edit needed |
| Write back into spec B2 what the checks found unstated: the re-derived title holds wherever the session is named, and a failed read keeps the parsed title on that surface (the post-implementation checks' F1 and F9) | [specs/session-view.md](../../specs/session-view.md) | Done: 562ddc7; the spec final check in [the task list](ticket-278-tasks.md) |
| Postmortem for the defect, with its index row (step 7) | [postmortems](../../postmortems/README.md) | Done: `2026-10-20-a-title-re-derived-where-it-was-listed.md` |
| #278's product acceptance on the tracker: items for the banner's parent title and the list's fallback, which the checks added to its scope | [#278](https://github.com/aloong-planet/agentshed/issues/278) | Done: two items added to the issue's product acceptance, 2026-10-20 |
| The merge: #278's fix and these records reach `main`, and #278 closes | this checklist, [checklist](checklist.md), [the task list](ticket-278-tasks.md) | Done — completed with the merge of this PR (#PR_NUMBER). After the merge, the tracker only: tick #278's items, and comment with the merge commit and whether the merged tree equals the PR head |
