# Session view — documentation regression

## Ticket #278 — a stripped Codex fork's title on every surface that names it

- Date: 2026-10-20
- Scope: #278's change only, per ticket (not a closeout): `git diff a1b04b5 HEAD` on branch `fix/stripped-fork-title`
- Version: spec 562ddc7; implementation 1c51f4d, with fa8024a after it changing a test comment only
- Languages in the searched files, counted by writing system (`rg -c '[\p{Han}]'`, `'[\p{Cyrillic}]'`,
  `'[A-Za-z]'` per file, the Han pattern checked against a renderer file that holds Han): the session-view spec and
  feature entry, the global search entry, `CONTEXT.md`, the spec and postmortem indexes and the new postmortem are
  Latin only (0 Han, 0 Cyrillic), so the searches below are English. The dictionaries, six languages, were read key
  by key rather than searched

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| Spec B2's re-title bullet: the re-derived title "is the session's title wherever the session is named" (the list and global search, the session page, a project's session search, the parent title on a fork's banner), and a failed read keeps the parsed title on that surface alone | the implementation (the spec final check in `ticket-278-tasks.md`); its failure modes: every surface by U1, U3, U4, E1, E2 and global search's existing cases, the failed read by U7 and U8, the session's own call by the gap note in `token-stats.test.ts` | True; every boundary has a case or a noted gap |
| The same bullet | the feature entry: a fork's title "comes from the first real question after stripping", the banner's "parent title" | True; the failed-read rule changes nothing a user sees beyond the title shown, so the entry needs no sentence for it |
| The same bullet | `CONTEXT.md`: the words fork, stripped, replayed, banner; no term for the re-derivation | True; no new term, no synonym |
| The same bullet | ADRs | No ADR this round; the change applies B2 and is not an architectural decision |
| The same bullet | the prototypes | No interface change: the header and the banners keep their elements and copy, only the title they are given changes |
| The engine's comments: the shared method (`codexShown`), the banner's parent title, the shared read (`strippedForkTitle`) and its callers | the code | True |
| The test comments: the gap note on the session's own re-title read (fa8024a), the uncertain-tier case's, the list-fallback case's "deleted, or compressed by Codex" | the code (the signature is mtime and size); `CONTEXT.md`'s cold rollout ("compressed … deleting" the plain file) | True |
| The e2e comments (the fork page's own title; the banner case's pending sample) | the cases | True |
| The new postmortem, `docs/postmortems/2026-10-20-a-title-re-derived-where-it-was-listed.md` | #278's report; the design review; the test checks' F1, F4, F6, F8; the code | True, claim by claim; its carry-forward points to the standing rule on negative conclusions, not a new one |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/postmortems/README.md` | the new postmortem | Its index row added in the same change |
| `docs/specs/README.md`: the session-view row (a link pair, no summary) | spec B2 | True, unchanged |
| `docs/features/README.md`: the session view row | nothing in the entry changed | True, unchanged |
| `docs/features/session-view.md`: a fork is "marked 'forked from «some session»…', with the parent title clickable" | the banner's parent title is now the parent's displayed title | True on every chain now; for a parent that was itself a stripped fork it named the replayed question before |
| `docs/features/session-view.md`: a fork's "title comes from the first real question after stripping (a session name Codex gave itself still takes priority)" | the session page, the project search and the banner now use the re-derived title | True on every surface now; false on the session page and the project search before |
| `docs/features/session-view.md`: project search's group header "(side badge, title, fork status)" | the same | True |
| `docs/features/global-search.md`: a session card shows "the title" | global search's cards take the scan's listed title | True, unchanged |
| Spec, Further Notes: "the stripped banner carries the parent session's title" | B2's new sentence | Consistent: the parent's title is the one B2 gives it |
| Spec C4: the display-side stripping "shares its source with the list (the same `stripReplayPrefix` and parent lookup)" | the stripping moved into one engine method | True: the method calls the same function with the same parent lookup |
| The six dictionaries' banner copy (`forkedFrom`, `parentTitle`, `forkedFromTail`, `stripUncertainMismatch`, `anotherSession`; `en`, `zh`, `ja`, `fr`, `es`, `ru`) | the parent title they are given | True: each quotes the title it is given and says nothing of how it is derived |
| The every-surface rule ↔ what guards it | the cases assert the listed and the page's titles together (U1, U2, U4, U5) and the search card (U3); no gate | Held by tests, not a gate; the list of surfaces in B2 is prose that no gate reads (the enumeration-wording gate, `check:ui`, reads interface copy), so a new surface is caught only by a reader of B2 |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension changed | `git diff --stat a1b04b5 HEAD -- src/renderer src/shared src/preload src/main/index.ts` is empty: no surface that names a session, no side, no language added | None |
| Pending notes in scope | `rg -n "Pending:" docs/specs/session-view.md docs/features/session-view.md` — none (exit 1) | None |
| A rule written this round | one title per session wherever it is named, and what a failed read keeps: a session-view rule, its authoritative copy in spec B2; the postmortem's lessons are instances of the standing rule on negative conclusions in the global instructions | No new general rule needing a home |
| A defect fixed | #278; root cause, why no test caught it and the defence are all known | Postmortem written and indexed |
| Work state | #278's coverage checklist rows (spec 562ddc7); its document sync checklist; its task list; the tracker's product acceptance names the session page and the search card only, not the banner's parent title or the list's fallback; #278 closes with the merge | Checklist and task list updated; the tracker item added before the PR opens; the merge recorded in the PR, per the document sync checklist |

### Convergence

Every row above was processed. Text changed by the regression: this report's language line (the earlier one said
Han or Cyrillic appeared in quotations; the count shows none), and the tracker's product acceptance (an item for the
banner's parent title and the list's fallback). Both changes were re-queued against the rows they touch (Stage 3's
work state) and changed nothing further.

Pre-delivery scope re-check: the current statements of the spec, the feature entries, the coverage checklist and
the task list were compared with what #278 changed and what its runs produced (the gateways on 4dd8a6f and 1c51f4d,
the targeted runs, the red runs); no missing item, and no done item resting on evidence that no longer holds.
