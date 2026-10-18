# Document sync checklist — #251

Ticket: [#251 Bring the prototypes in line with the updated prototype skill](https://github.com/aloong-planet/agentshed/issues/251) ·
work directory `prototype-baseline` · coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| ADR-0018 decides that the prototypes derive their icons from the app and that `check:ui --cross` guards it; item 5 and item 10 reverse that half. Write the superseding ADR and update ADR-0018's status and the index when the generators go | [ADR-0018](../../adr/0018-icons-are-inline-svg-from-one-source.md), [ADR index](../../adr/README.md), [ADR-0033](../../adr/0033-prototypes-are-the-baseline.md) | Done: ADR-0033 written; ADR-0018's status line and index row say its prototype half is superseded |
| Every document that names `check:ui --cross` or a generator, once the tier and the generators are gone | repository-wide search result | Done: `rg -n --hidden -e '--cross' -e 'check:ui --cross'` over the repository (work records excluded) finds only ADR-0018's history; the generator names find nothing under docs/prototypes or scripts |
| Record the actual verification of #251's units in the coverage checklist once they have run | [checklist](checklist.md) | Done for every unit but the landing page's share of items 2, 12 and 13 |
| Declare this ticket's artifact paths on #251 when the PR opens | [#251](https://github.com/aloong-planet/agentshed/issues/251) | Waiting: the PR |
| Correct #251 when the PR opens: `app-identity.js` already matched its master (the issue lists it among the files to re-copy); add item 15 (the two candidates settled on the 2026-10-18 decision) and the unified copy | [#251](https://github.com/aloong-planet/agentshed/issues/251) | Waiting: the PR |
| Convert the landing page (items 2, 12, 13) after the landing-page PR merges, then rerun its checks and update this checklist | [landing page prototype](../../prototypes/landing-page/prototype-landing.html), [checklist](checklist.md) | Waiting: the landing-page PR (#255) |
