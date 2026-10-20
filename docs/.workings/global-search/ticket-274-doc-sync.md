# Document sync checklist — #274

Ticket: [#274 Closeout: full-feature acceptance and documentation regression (global search)](https://github.com/aloong-planet/agentshed/issues/274) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the full-feature regression report, citing the per-unit records, once #271, #272 and #273 are merged | [final-regression.md](final-regression.md) | Done 2026-10-20: its "Closeout (#274)" section — the three stages over the whole feature's 31 changed declaration surfaces, its events, and the closeout conclusion citing the coverage checklist's closeout block |
| Complete the coverage checklist's Current verification for every unit on main | [checklist](checklist.md) | Done 2026-10-20: the "Closeout (#274)" block, 42 rows on the integrated version f4197bb, the gateway run on 290558d (same code) and the integrated build's screenshots; reused hand evidence checked against the code it rests on |
| Confirm ADR-0034's status matches the measurements #271 recorded | [ADR-0034](../../adr/0034-global-search-question-corpus-in-memory.md) | Done 2026-10-20: Accepted stands — its evidence was measured on 28c3c11's corpus code, unchanged since (`git diff 28c3c11 f4197bb -- src/main` touches the menu only); no edit needed |
| Correct CONTEXT's retired-terms note, which called global search a future feature (found in the regression) | [CONTEXT.md](../../../CONTEXT.md) | Done 2026-10-20: rewritten in place |
| Record the merge: the merge commit in the coverage checklist, and #274's items ticked on the issue | [checklist](checklist.md), [#274](https://github.com/aloong-planet/agentshed/issues/274) | Waiting: the merge. Followed up by this ticket's implementer right after it |

Pre-delivery scope re-check (2026-10-20): from the ticket (its process acceptance), the feature's change from bedc384
to f4197bb, the runs (the closeout gateway, the integrated screenshots) and the current documents — the global-search
spec and the specs it amended, `docs/features/` and its index, ADR-0034 and the ADR index, `CONTEXT.md`, the
prototypes, the six READMEs and the landing page, the four tickets' document sync checklists, the coverage checklist
and the regression report, with the ignored working-record directory listed with its ignored files shown. Found and
added during the check: CONTEXT's retired-terms note (done) and the merge record (waiting). No item is Pending; the
Waiting item names its event and who follows it up.
