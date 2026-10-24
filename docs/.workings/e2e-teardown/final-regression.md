# E2e teardown — documentation regression

## Ticket #227 — the startup-skeleton e2e case can time out in a full run under heavy load

- Date: 2026-10-24
- Scope: this ticket's change only, `git diff 1349d76` on branch `fix/skeleton-case-teardown`: the shared helper
  `e2e/close-app.ts` and its cases `e2e/close-app.spec.ts`, the 72 teardown sites in seven e2e files, the `CONTEXT.md`
  invariant, and the records in this folder
- Version: 3be7524 for code and tests (the full gateway ran on it, `evidence/ticket-227/gateway-3be7524.txt`); the
  commit after it changes the test file's header comment and the records only, checked comment-only by a syntax-tree
  comparison (`evidence/ticket-227/comment-only.txt`)

The two questions for the feature catalogue: **what became a lie** — nothing. The change is to the e2e harness: how a
case waits for the app it launched to close. No product code changed (`git diff --stat 1349d76 -- src` is empty), and
the app's quit behaves as before. **What was missing** — nothing: no user-visible behaviour was added or changed. So
`docs/features/` is unchanged. No feature spec covers the e2e harness, so this folder has no coverage checklist; the
rule the change settles is in `CONTEXT.md`.

### Stage 1: changed declarations

| Declaration surface (changed this round) | Checked against | Conclusion |
|---|---|---|
| `CONTEXT.md`, the invariant "An e2e case closes its app through the shared bounded teardown" | `e2e/close-app.ts` at 3be7524 (`CLOSE_BOUND_MS = 10_000`, the group kill `process.kill(-pid, 'SIGKILL')`, the annotation, the warning); the measurements: the app's own quit about 15 ms (`evidence/ticket-227/probes.txt`), closes of up to 69 s after a main-only kill (`after-main-kill.txt`) and none after a group kill (`after-group-kill.txt`); every remaining `.close(` in `e2e/` is inside the helper (`rg -n '\.close\(' e2e`: three lines, all `close-app.ts`) | True |
| `e2e/close-app.ts`, its header comment and doc comments | the code beneath them; the same measurements | True |
| `e2e/close-app.spec.ts`, its header comment (which cases launch nothing, and the gap: Electron's native shutdown under load is not reproduced there) | H1–H7 as written: H1–H3 and H5–H7 use the stand-in, H4 starts two node processes; the loaded runs it points to (`full-run-under-load.txt`) | True after the fourth incremental check's L1, which added H7 to the list |
| The seven e2e files | `git diff -U0 1349d76 -- e2e` with the helper's two files excluded: no comment line added or removed (`rg '^[+-] *(//\|\*\|/\*)'`, exit 1); their headers' mention of closing (`ticket-227-doc-sync.md`, row 2) | Row set empty for comments; the headers stay true |
| ADRs | — | Row set empty: the bound and the shared helper are easy to reverse and carry no product trade-off; the one trade-off (a hung quit passes with a warning) is stated in the `CONTEXT.md` invariant |
| Spec, features, prototype | — | Row set empty: none changed, and none describes the e2e harness |

### Stage 2: related declarations

| Relation | Rows | Conclusion |
|---|---|---|
| File ↔ its index row | — | Row set empty: no file added or renamed in `docs/specs`, `docs/features` or `docs/adr`; `CONTEXT.md` has no index |
| Rule ↔ template and generated documents | — | Row set empty: no rule or template changed |
| One fact ↔ its other statements: how an e2e case closes its app | `rg -n -i 'app\.close\|closeApp\|close-app\|teardown' docs/specs docs/features docs/adr CONTEXT.md AGENTS.md README.md README.en.md`: only the new invariant. Scripts: Han characters only in `docs/specs/i18n.md` and `docs/features/i18n.md` (`rg -c '[\x{4e00}-\x{9fff}]'`: 7 and 1 lines, the control that the escapes match); the Chinese words for close, teardown and quit (`rg -n '\x{5173}\x{95ed}\|\x{6536}\x{5c3e}\|\x{9000}\x{51fa}'` over the same documents): none | No other statement to agree with |
| One fact ↔ its other statements: the per-case time budget (60 s) the bound leaves room in | `playwright.config.ts` (`timeout: 60_000`); the helper's doc comment and the task list's D2 | Agree |
| Rule ↔ the gate that holds it: a case closes through the helper | no gate reads how a case closes | Held by people: the `CONTEXT.md` invariant says so, and its last sentence tells whoever adds a launch site; all 72 current sites go through the helper (the `rg` above) |

### Stage 3: events

| Event | Rows and how they were derived | Conclusion |
|---|---|---|
| A dimension's members changed: the teardown sites (72, every one through the helper) | statements that count them: `rg -uu -n '\b(67\|72) (sites\|teardowns)' docs CONTEXT.md`, evidence excluded: only this folder's task list and test review, which count 72; the invariant says "every case" | True; no count outside the records |
| `Pending:` notes in scope | `rg -n 'Pending:' CONTEXT.md`: none (exit 1); no spec in scope | Row set empty |
| New general rules this round | an e2e case closes its app through the bounded helper, which kills the whole process group past the bound | Canonical home: the `CONTEXT.md` invariant |
| The review findings: the code review (`ticket-227-review-code.md`), the post-implementation check F1–F9 and its incremental checks G1–G7, K1–K2, L1 (`ticket-227-review-tests.md`) | the test design table, the cases, the records, the evidence headers, the document sync checklist | Each handled in place (the record's handling sections); G6 is the owner's decision (the document sync checklist) |
| Work state changed | #227's issue (records and process acceptance declared); the document sync checklist; the task list; other records naming #227 (`rg -uu -l '#227' docs README.md README.en.md CONTEXT.md`: this folder, `CONTEXT.md`, and `../i18n/ticket-223-review-tests.md`, a dated note that #227 was still open) | Updated where they state this ticket's current state; the dated note stays true for its date: kept |
| The throwaway CI branch (draft PR #306, never merged) | the task list's 5f, which cites its run | Closed with its branch once the four flaky-e2e PRs are open; the evidence copy (`ci-repeat-39972027006.txt`) keeps the run |

Pre-delivery scope re-check (2026-10-24): the change's facts — the helper, its cases, the 72 sites, the invariant, the
loaded runs, the CI repeat — against the records that state them: the task list, the test review, the code review, the
document sync checklist and this report. Differences found and handled: L1 (two lists of the stand-in cases left out H7);
the document sync checklist's G6 and G7 rows, added after the third check. No other difference.
