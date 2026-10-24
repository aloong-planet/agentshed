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

## Ticket #247 — the Codex-compressed session case collects a stderr chunk without the expected error code

- Date: 2026-10-24
- Scope: #247's change only, per ticket (not a closeout): `git diff 1349d76` on branch `fix/codex-compressed-stderr`:
  one assertion in `e2e/app.spec.ts` that now carries the collected chunk as its message, and the records
- Version: 78a05d0 for code and tests (the full gateway ran on it, `evidence/ticket-247/gateway-78a05d0.txt`); the
  commits after it change records only, and the two repository-wide gates were run again at the delivered commit
  (`evidence/ticket-247/gates-at-delivery.txt`)
- Languages in the searched files: the session-view spec and feature entry and `CONTEXT.md` hold no Han characters; of
  the feature entries only `docs/features/i18n.md` does (4, copy under test), and it is not in this ticket's scope, so
  the searches below are English

The two questions for the feature catalogue: **what became a lie** — nothing. The change is a test's failure message;
no product code changed (`git diff --stat 1349d76 -- src` is empty). **What was missing** — nothing: no user-visible
behaviour was added or changed. So `docs/features/` is unchanged. The cause was not found, so nothing in the spec, the
coverage checklist or `CONTEXT.md` changes (D1 in `ticket-247-tasks.md`).

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `e2e/app.spec.ts`, the new comment "The chunk itself is the message: a failure says which line broke it" | the assertion beneath it (its message is the chunk); the planted run (`evidence/ticket-247/plant-line.txt`: the planted line is the failure's message) | True for every chunk the loop checks; which chunks it checks is D1's limit |
| Spec, features, `CONTEXT.md`, ADRs, prototype | — | Row set empty: none changed; no cause was found to write down |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| Spec P6 (a failure on a first open shows the page's error state) and P7 (a file Codex compressed while its page was cached: P6 from the next snapshot, then the session reappears under its compressed identity) | the case's stderr assertion, now with a message | True, unchanged: the case's steps and what it asserts about the page are the same |
| `docs/features/session-view.md`, lines 119–121 (a page left open while Codex compresses its file shows an error, and the session reappears under its compressed form) | the same | True, unchanged |
| `checklist.md` | the same | It has no P6 or P7 row, and the assertion's meaning did not change, so no current-verification row is owed by this change |
| The issue's acceptance items | the change and the runs | Item 1 met (`plant-line.txt`); item 3 met (CI, 40 of 40, `ci-repeat-39972027006.txt`); item 2 not met, by the owner's decision D1: the issue is closed as not planned after the merge, with the reason |
| What the stderr check covers ↔ what guards it | no gate reads e2e assertions | Held by the case; its limit is written in D1 and the issue's closing comment |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension changed | `git diff --stat 1349d76 -- src` is empty; the e2e change adds no case | None |
| Pending notes in scope | `rg -n 'Pending:' docs/specs/session-view.md CONTEXT.md`: none (exit 1) | None |
| A rule written this round | none: the change is a message on one assertion | No new general rule needing a home |
| A defect left unfixed | #247: the cause not found after the loops (`loop-attempts.txt`, `loop-under-load.txt`) and the CI repeat; the owner's decision to close it as not reproducible | Recorded in D1; #247 closes as not planned after the merge with a comment carrying D1's limit |
| The review findings (the code review, none; the post-implementation check F1–F3) | the task list, the evidence notes, the document sync checklist | Each handled in place (the review record's handling section) |
| Work state | #247's issue (records and process acceptance declared); the document sync checklist; the task list; other records naming #247 (`rg -uu -l '#247' docs README.md README.en.md CONTEXT.md`: this folder's records and evidence, and two mentions of #247 as an example of a flaky-case ticket in `../memory-view/ticket-294-review-tests.md` and `../macos-release-line/ticket-234-review-code.md`, dated) | Updated where they state this ticket's current state; the dated mentions stay true: kept |

### Convergence

Every row above was processed. Text changed by the regression: none beyond the records this ticket already changes.

Pre-delivery scope re-check (2026-10-24): the change's facts — the assertion's message, the loops, the CI repeat, the
owner's decisions — against the task list, the reviews, the document sync checklist and this report. Differences found
and handled: the document sync checklist's first row, which waited on the cause ("whatever the cause turns out to be",
targeting the checklist's verification for P6 and P7), no longer applies — the cause was not found and the issue is
closed as not reproducible (D1), and `checklist.md` has no P6 or P7 row to update — so it is removed from the current
items, not marked done; D1's sentence on what a later failure prints, narrowed to the chunks the check reads (F1).

