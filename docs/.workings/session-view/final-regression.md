# Session view — documentation regression

## The session ID and resume — owner-requested increment (2026-10-28)

- Date: 2026-10-28
- Scope: the increment only, `git diff 7ff103f d6026e5`: the restart case in `e2e/startup-restore.spec.ts`, the
  settings prototype's update tooltip, and the records. The owner asked for the two findings the previous section
  left for a decision to be fixed in this change
- Version: d6026e5; the targeted run (`evidence/session-id/identity-targeted.log`) and the independent incremental
  check (review-tests.md, "Post-implementation check — increment 7ff103f..d6026e5", no findings)
- Languages: the same files as the previous section's census, plus the settings prototype (Han in its head comment).
  Searches were run in English, and, over the prototype, in Chinese for its tooltip (the Chinese words for tooltip,
  shadow and hover, with `uptip` as written)

The two questions for the feature catalogue: **what became a lie**: nothing; **what was missing**: nothing. No
user-visible behaviour changed: the increment changes one test and a prototype's drawing, and `git diff --stat 7ff103f
d6026e5 -- src docs/specs docs/features docs/adr CONTEXT.md` is empty.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `e2e/startup-restore.spec.ts`: the comment over the inode swap, R-text's comment, R-range's comment | the code they describe; `identity-mutations.json` (each argument dropped at both call sites turns the case red at the asserted line) | True; confirmed by the independent check's Coverage and False greens |
| `docs/prototypes/appearance/prototype-settings.html`: the tooltip's shadow and the dated ruling in the head comment | the app's update tooltip (the floating surface's shadow under TIP_LOOK; `--float-shadow` in both appearances); `settings-tip.json` | True: 0 6px 22px at 0.18 light and 0.5 dark, as the app |
| The records: review-tests.md (the design increment and the check), review-code.md (the increment's layers), session-id-tasks.md (T14-T16) | the code, the runs and the evidence | True |
| Spec, features, CONTEXT, ADRs | — | Row set empty: none changed (the empty diff above) |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| Spec, REQ-001's testing line: "Test via the cross-process Electron scenario … including index version invalidation and source rewrite" | the restart case's rewrite | True, and now it pins the identity's text; the range is pinned in the same scenario |
| Spec, "Failure modes and boundaries: opening restored content", first item: "invalidate saved turn identities if the underlying question mapping changed" | R-range | True; it now has a test |
| ADR-0029 (38, 65), the restart scenario and its source rewrite | the same | True |
| The session prototype's head comment: the tooltip's shadow "as the rail's update button tooltip has it" | the settings prototype | True of the app before; now the settings prototype draws the same |
| CONTEXT's floating-layer invariant (a hover tooltip takes the surface's one form) ↔ what guards it in the prototypes | the settings prototype's tooltip | Both prototypes now draw the one form. No gate reads a prototype's shadow (`check:ui` passed and does not compare it), so it is held by reading, as recorded in the previous section |
| This report's previous section: the settings prototype row (Stage 2) and "Found outside this change, needing a decision" (Stage 3) | T14, T15 | True of 7ba1806; both decided by the owner (fix here, 2026-10-28) and fixed at d6026e5. This section closes them |
| session-id-tasks.md, the regression row "P, REQ-001 … full verification" | the owner's instruction for this increment (no full e2e) | At d6026e5 the restart case ran in the targeted run; every other case last ran in the full run on a43e77e, and nothing outside `docs/` but the restart case changed since (`git diff --name-only a43e77e d6026e5 -- . ':!docs'`). T16 records it; CI runs the full e2e on the push |
| session-id-tasks.md (F7 bullet) and review-tests.md (the second self-check, the second incremental check): "left to the owner" | T14 | Records of d71833f, true as dated; T14 records the decision and the fix |
| `docs/features/session-view.md` | — | True, unchanged (no user-visible change) |
| PR #321's description, "Needs a decision" | T14, T15 | Rewritten as "Also fixed here" before the push |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension changed | none: no side, language, theme or surface added | None |
| Pending notes in scope | `rg -n 'Pending:' docs/specs/session-view.md docs/features/session-view.md CONTEXT.md` — none (exit 1) | None |
| A rule written this round | none new: the prototype ruling applies CONTEXT's tooltip-form invariant, whose canonical copy exists | None |
| Review findings and work state | the increment's code review (no finding), its design review (no finding), the independent incremental check (no findings); the two items reported to the owner, now decided and fixed; T14-T16 | Recorded in each record; T16 closes with this report, the PR update and the push |
| Verification state | the owner's instruction: after the fix, only the relevant tests | The targeted run covers the changed case and every repository check; the last full gate is a43e77e's, stated in the PR |

### Convergence

Every row above was processed. Text changed by the regression: the PR description (rewritten before the push) and
T16 in session-id-tasks.md. Both were re-queued against the rows they touch (the PR row, the regression row) and
changed nothing further.

Pre-delivery scope re-check: the increment's facts — the owner's two decisions, the test, the prototype, the runs,
the mutations and the independent check — against the task list, the reviews and this report; no missing item, and
no done item resting on evidence that no longer holds.

## The session ID and resume — no ticket (2026-10-28)

- Date: 2026-10-28
- Scope: this round's change only (not a closeout; no tickets): `git diff 03ff1a2` on branch `feat/session-resume`
- Version: spec db953fd as rewritten in this step; implementation 7ba1806 plus this step's `resumeCommand` change
  (keyed by every side), verified by the full gate before delivery
- Languages in the searched files, counted by writing system (Han and Latin letters per file): CONTEXT.md, the
  session-view and global-search specs, the specs and features indexes, the session-view, global-search and
  project-detail feature entries and `en.ts` hold no Han; `README.md`, `zh.ts` and the session prototype hold
  both; `README.en.md` 4 Han (the language switcher's name). So each search below ran in English and, over the Han
  files, in Chinese (the Chinese words for session page, restore, session ID, record file and copy, with "resume" and
  "Finder" as written)

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| Spec, the section "Session ID and resume" (US-001, CON-001 to CON-003, failure modes, UI and implementation decisions, testing decisions) | the implementation (the spec final check in `session-id-tasks.md`); each failure mode against a test or the gap notes in E1's header | True after this step's write-back; every boundary has a test (U1-U10, E1, E2) or a noted gap |
| Spec, Problem Statement, Solution, Out of Scope | the same | True |
| `docs/features/session-view.md`, the six new capability lines and two boundary lines | the spec's user-visible layer (US-001's criteria, CON-001, the failure modes on archived and segmented Codex sessions, the page-only placement) | True; no behaviour the spec lacks, and no user-visible criterion left out |
| `docs/features/README.md`, the session view row | the entry | True |
| CONTEXT.md: Session ID, Resume command, the static count, the record file name, the tooltip form in the floating-layer invariant | the spec and the code (one term each; "record file" now named as the interface's word for the source file) | True; no synonym left unnamed |
| ADRs | none written this round | Row set empty: no decision this round met the threshold |
| The session prototype | the implementation, point by point (the ID's run and size, the three 22 px buttons, their hover, check and disabled states, the tooltip's placement, size, wrapping, warning colour) | Two differences found: the meta line (11 px drawn, 12 px in the app, from before this round) and the tooltip's shadow. The owner kept the app's look for both; the prototype now draws it, its header records the rulings |
| `zh.ts` and `en.ts`, the ten new entries | the prototype's copy, side by side, both languages | True; the unavailable wording is the owner's neutral one in both |
| `README.md` and `README.en.md`, the new Sessions line | the feature entry | True in both languages |
| The code comments written this round (SessionActions, FloatingBox's TIP_LOOK, security's judge, the handler, display-data's upgrade, session-resume) | the code | True; the review-time corrections (F10) included |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `docs/specs/README.md`, the session-view row | the spec | True, unchanged (a link, no summary) |
| `docs/features/project-detail.md`: Sessions "opening to the full conversation" | the session page gained a header | True |
| `docs/features/global-search.md` (a hit opens its session; the page's exits) and `docs/specs/global-search.md` US-003 | the stale flag now reaches the page on every route; the header's buttons | True: the exits are unchanged, and nothing there describes the header |
| The landing page's "Sessions, revisited" card (both languages) | the new capability | True: a summary beside a screenshot; extending it is a landing-page change with its own prototype, not made |
| `docs/prototypes/appearance/prototype-settings.html`, the update button's tooltip shadow (0 6px 18px, 0.28) | the app's update tooltip, now on the shared TIP_LOOK with the floating surface's shadow | Not true, and not new: the app's update tooltip had the floating surface's shadow before this round. The owner's ruling covered the session header; this one is reported for a decision (below) |
| The rule "agent data enters the command only quoted" ↔ what guards it | CON-002 | Held by the builder's unit tests; no gate reads the command |
| The rule "copy never enumerates the sides" ↔ `check:ui` | the ten new entries | `check:ui` passed; no new entry names the sides |
| The rule "a hover tooltip takes the surface's one form" ↔ what guards it | FloatingBox's TIP_LOOK | Held by both tooltips importing it; no gate. Its canonical copy now in CONTEXT's floating-layer invariant |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension changed | sides, languages and themes: none added (`git diff 03ff1a2 -- src/shared/domain.ts` adds a page field only). New per-side structures this round: `resumeCommand`'s commands, now a record keyed by every side (a side added later fails the typecheck); `sessionIdFromPath`, whose fallback for a side it does not know is null — the unavailable form, visible, never another side's ID; the feature entry's line naming the three commands | No member count changed; the code structure is enforced by the type system; the feature line has to be extended when a side is added, as every per-side sentence does — no gate, recorded |
| Pending notes in scope | `rg -n 'Pending:' docs/specs/session-view.md docs/features/session-view.md CONTEXT.md` — none (exit 1) | None |
| A rule written this round | a hover tooltip takes the surface's one form (written into CONTEXT's floating-layer invariant); the command's quoting (spec CON-002); the owner's prototype rulings (the prototype's header) | Each has its canonical copy |
| Review findings and work state | code review F1, F2 (fixed), the refactor list (one done, two not by the owner); test checks F1-F10 (handled); this step's `resumeCommand` finding (fixed); `session-id-tasks.md`, `review-code.md`, `review-tests.md`, `checklist.md`'s Source → spec | Each recorded where it was handled; the checklist has no tickets to map |
| Found outside this change, needing a decision | the page handler's byte ranges and text in the question identity, pinned by no test (session-view::REQ-001/AC-04; shown by the F7 mutation); the settings prototype's update tooltip shadow (Stage 2) | Reported to the owner with the delivery; neither has a lasting home in the repository until the owner decides |

### Convergence

Every row above was processed. Text changed by the regression: the feature entry and its index row, both READMEs,
CONTEXT (the record file name, the tooltip form), the session prototype (the two rulings), and `resumeCommand` (code,
verified before delivery). Each was re-queued against the rows it touches — the feature entry against the spec, the
READMEs against the entry, CONTEXT against the spec and the code, the prototype against the app — and changed nothing
further.

Pre-delivery scope re-check: the spec, the feature entry, CONTEXT, the prototype, the READMEs and the working records
were compared with what the change does and what its runs produced; no missing item, and no done item resting on
evidence that no longer holds.

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

