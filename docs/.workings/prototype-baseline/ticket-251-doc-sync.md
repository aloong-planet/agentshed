# Document sync checklist — #251

Ticket: [#251 Bring the prototypes in line with the updated prototype skill](https://github.com/aloong-planet/agentshed/issues/251) ·
work directory `prototype-baseline` · coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| ADR-0018 decides that the prototypes derive their icons from the app and that `check:ui --cross` guards it; item 5 and item 10 reverse that half. Write the superseding ADR and update ADR-0018's status and the index when the generators go | [ADR-0018](../../adr/0018-icons-are-inline-svg-from-one-source.md), [ADR index](../../adr/README.md), [ADR-0033](../../adr/0033-prototypes-are-the-baseline.md) | Done: ADR-0033 written; ADR-0018's status line and index row say its prototype half is superseded |
| Every document that names `check:ui --cross` or a generator, once the tier and the generators are gone | repository-wide search result | Done: `rg -n --hidden -e '--cross' -e 'check:ui --cross'` over the repository (work records excluded) finds only ADR-0018's history; the generator names find nothing under docs/prototypes or scripts |
| Record the actual verification of #251's units in the coverage checklist once they have run | [checklist](checklist.md) | Done for every unit, the landing page included |
| Declare this ticket's artifact paths on #251 when the PR opens | [#251](https://github.com/aloong-planet/agentshed/issues/251) | Waiting: the PR |
| Correct #251 when the PR opens: `app-identity.js` already matched its master (the issue lists it among the files to re-copy); add item 15 (the two candidates settled on the 2026-10-18 decision) and the unified copy | [#251](https://github.com/aloong-planet/agentshed/issues/251) | Waiting: the PR |
| Publish the dock's row cap in the prototype skill before the PR opens, so the project copy matches a published master (`demo-harness.js` and the skill's file table) | prototype skill: `demo-harness.js`, `SKILL.md` | Done: published 2026-10-19 as the skill repository's 755edbc (owner's approval); the project copy (7b52c8b) is byte-equal to the published master |
| Give the end-padding finding of the follow-up review a home (owner's choice: #250) | [#250](https://github.com/aloong-planet/agentshed/issues/250) item 9 | Done: added to #250's body on 2026-10-19, read back |
| Mark #250 item 4 fixed when the PR opens (the refactor list carried it into this PR) | [#250](https://github.com/aloong-planet/agentshed/issues/250) | Waiting: the PR |
| Convert the landing page (items 2, 12, 13) after the landing-page PR merges, then rerun its checks and update this checklist | [landing page prototype](../../prototypes/landing-page/prototype-landing.html), [checklist](checklist.md) | Done 2026-10-19: rebased onto 1b58a84 with no conflict (range-diff: contents unchanged), dependencies installed (root and `site/`); the landing page converted and checked (checklist rows 251::2, 12, 13 and done) |

Pre-delivery scope re-check for the refactor-list follow-up (2026-10-18): `docs/specs`, `docs/features`,
`docs/adr` and `CONTEXT.md` searched for toast positions, the dock's width rule and the drawer mask and shadow
values; the hits are unrelated (a renderer list naming "the toasts", three uses of "mask" as a verb), so no
document changes with this follow-up.

Pre-delivery scope re-check for the landing page (2026-10-19): `docs/specs`, `docs/features`, `docs/adr`,
`CONTEXT.md` and `site/README.md` searched for the landing prototype's bar, its light/dark switch and its
warning tokens; the hits concern other harnesses (session noise, test harnesses) and the landing spec names the
prototype only as the confirmed design, so no document changes. The landing site has no warning tokens and no
test-version state yet, so the prototype's dark warning colours create no mismatch with it.
