# Document sync checklist — #271

Ticket: [#271 Global search: search every project's questions and open a hit's session](https://github.com/aloong-planet/agentshed/issues/271) · feature `global-search` ·
coverage checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Write the global search feature entry (the page, its states, a hit opening its session) and its row in the catalogue, once the page ships | [features/global-search.md](../../features/global-search.md) (new), [features/README.md](../../features/README.md) | Done 2026-10-19: what #271 ships only; checked line by line in [final-regression.md](final-regression.md) stage 1 |
| State that a project selected from a global search hit is scrolled into view in the project list | [features/projects-list.md](../../features/projects-list.md) | Done 2026-10-19: one capability line, with the stale caveat |
| Check the session view entry's search lines against a hit opened from global search | [features/session-view.md](../../features/session-view.md) | Done 2026-10-19: no line turns false — they describe a project's own search (final-regression stage 2); no change |
| Settle ADR-0034 on the in-app measurements of the first load and of a search, taken alongside a scan: accepted with them, or rewritten if they contradict it; keep the index row in step | [ADR-0034](../../adr/0034-global-search-question-corpus-in-memory.md), [ADR index](../../adr/README.md) | Done 2026-10-19: accepted, its decision's identity wording made exact, the evidence appended; [measurements](evidence/ticket-271/measurements.md) (reading 3.06 s, 4.75 s with rescans alongside; a search 3.5–13.9 ms) |
| Confirm the glossary's rail lines (four labels; Agents / Projects / Search / Settings) hold once the rail ships | [CONTEXT.md](../../../CONTEXT.md) | Done 2026-10-19: true as written; no change |
| Record the actual verification of this ticket's units in the coverage checklist's Current verification, once they have run | [checklist](checklist.md) | Done 2026-10-19: every #271 unit and path on a025015, with its evidence |
| Write back the implementation's clarifications to the spec: the status and a Pending note for #272/#273's parts, S2's first launch, S7's line breaks, the corpus identity and update order, the renderer's kept answer, reading and focus | [spec](../../specs/global-search.md) | Waiting: the owner's confirmation in the PR review — S7 corrects a statement the implementation could not meet (a keyword cannot carry a line break, and the parse reads one as a space), and S2's first launch fills an unspecified state. Followed up by this ticket's implementer: reverted or kept as the owner decides, before merge |
| Record the merge: the merge commit in the coverage checklist's rows, and #271's acceptance items ticked on the issue | [checklist](checklist.md), [#271](https://github.com/aloong-planet/agentshed/issues/271) | Waiting: the merge. Followed up by this ticket's implementer right after it |

Pre-delivery scope re-check (2026-10-19): from the ticket, the change (dff584f, 16daf97, a025015 and this
step's documents), the runs (the gateway, the mutations, the in-app measurements) and the current documents —
the spec, the amended specs (projects-list, session-view, appearance, i18n), `docs/features/`, ADR-0034,
CONTEXT, the six READMEs and the landing page's copy. Added: the spec write-back row and the merge row; nothing
done was reopened. #274's ADR item is updated to say #271 settled it.
