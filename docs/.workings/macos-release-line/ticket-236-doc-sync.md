# Document sync checklist — #236

Ticket: [#236 Mirror formal releases to R2 behind the download host](https://github.com/aloong-planet/agentshed/issues/236) · feature `macos-release-line` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the R2 runbook: bucket, token, CORS, layout, pointer, re-running the mirror | docs/ops/r2-setup.md (new) | Pending: not started |
| After the owner's certificate check: ADR-0031's status, the spec's download-host Pending note and the landing spec's host note | [ADR-0031](../../adr/0031-macos-release-line.md), [mac-distribution spec](../../specs/mac-distribution.md), [landing-page spec](../../specs/landing-page.md) | Pending: not started |
| Record the real-run evidence of the mirror and the pointer | [checklist](checklist.md) | Waiting: the first formal release; whoever makes it records the run's reachability output |
| If the implementation departs from the spec, rewrite the spec in the same change; when the ticket is delivered, remove this row with a note if nothing departed | [mac-distribution spec](../../specs/mac-distribution.md) | Pending: not started |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Pending: not started |
