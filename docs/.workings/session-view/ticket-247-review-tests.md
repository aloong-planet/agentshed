# Test review — #247

Ticket: [#247](https://github.com/aloong-planet/agentshed/issues/247) (the Codex-compressed session case collects a
stderr chunk without the expected error code). Task list: [ticket-247-tasks.md](ticket-247-tasks.md).

## Design review (2026-10-23, implementation starts from 1349d76)

Scope: the first change, before the cause is known — the case's stderr assertion names the chunk that breaks it. Rows
for the fix are added by an incremental review once the cause is known. Spec: [session-view](../../specs/session-view.md).
Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped; the case's
"when does it go red" is answered below. The issue asks for one planted line (a non-matching chunk shown in the
failure message); that is acceptance evidence, run once.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| E1 | e2e, changed: "a session whose file Codex compresses while cached (query layer)…", its stderr check | session-view P6, P7 | the app through its real IPC and renderer; the main process's stderr as the launcher collects it (unchanged) | as before: the plain rollout compressed and removed while its page is open, rescans every 250 ms | each collected chunk carries `sessionFileUnreadable` or `sessionNotWhitelisted`, as before; a chunk that does not fails with the chunk itself as the message. Values: the error codes (`ERR`, the contract's own names) | as before: a Codex rollout of the real format's shape (taken in the case's ticket) | one launch, unchanged |

### Coverage

- Unchanged spec units: P6 (the page's error state) and P7 (the compressed identity).
- Gaps: none new.

### Case design

- No mock or internal write; the stderr is the process's own output, collected by the launcher as for every case.

### False greens (design-level)

- Constant-true: the loop runs over a list the case first asserts is not empty (`l.errors.length > 0`).
- Tautology: the codes come from `ERR`, the contract's names — the same constant the app throws, imported. This is the
  existing assertion's source, and a code renamed in both places would still be the code the app throws; the
  assertion's subject is which error was raised, not the name's spelling.
- When it goes red: if a collected chunk carries neither code, with that chunk in the message. To be shown by a planted
  chunk that matches the launcher's filter and carries neither code.

### Resource reuse

- Unchanged: one launch; the change adds none.

## Post-implementation check (2026-10-24, implementation 78a05d0, range 1349d76..d6e80fd)

Ticket #247, feature `session-view`. Run by an independent sub-agent that did not inherit the implementation
conversation; first round, not incremental. Inputs: the issue body, [session-view](../../specs/session-view.md) P6 and
P7, the design review above, the commit range, and the full gateway log
[gateway-78a05d0.txt](evidence/ticket-247/gateway-78a05d0.txt). Tests under check: `git diff --name-only 1349d76..HEAD`
lists one test file, `e2e/app.spec.ts` (one changed line, the stderr check, row E1); the rest of the range is working
records under `docs/.workings/`. This check ran no test: the planted run answers when E1 goes red (below), and the
range after 78a05d0 does not touch the test.
Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped; "when does
it go red" is answered below against the code and the source of the expected values.

### Run evidence

- The gateway log has each item the gateway asks for: `git rev-parse HEAD` (78a05d0), `git status --porcelain
  --untracked-files=all` with each listed file's `git hash-object`, each command, each exit code, each command's output,
  and `VERIFY_EXIT=0`. Full-run results taken from it: typecheck, lint, 867 unit (1 skipped), 135 script, 109 site, the
  five gates, 148 e2e and smoke, every exit code 0; E1 is e2e #90, passed in 1.2 s.
- The log's version against the range: F2.

### Test design table against the written test

| Row | Aspect | Design | Written (`e2e/app.spec.ts` at HEAD) | Agrees |
|---|---|---|---|---|
| E1 | Seam | real IPC and renderer; stderr as the launcher collects it, unchanged | `launch()` (:77, filter at :112) unchanged in the range; the case reads `l.errors` | yes |
| E1 | Input | plain rollout compressed and removed while its page is open, rescans every 250 ms | :5188 `AGENTSHED_RESCAN_MS: '250'`; :5197 writes the `.zst`, :5198 removes the plain file | yes |
| E1 | Assertion | each collected chunk carries one code; a failing chunk is the message | :5204 non-empty, :5205–:5208 the loop; message "a collected stderr chunk carries neither code:" then the chunk | yes |
| E1 | Expected values | `ERR`, the contract's names | `ERR.sessionFileUnreadable`, `ERR.sessionNotWhitelisted` from `src/shared/errors.ts` (:25, :45) | yes |
| E1 | Fixture | as before | :5171–:5187, untouched by the range | yes |
| E1 | Resource | one launch | one `launch()` call in the case (:5188) | yes |

Test file header: it lists the file's known gaps; none concerns this case, and the design review recorded no new gap.
Agrees.

### Coverage

- Spec units: P6 and P7, unchanged; the change narrows nothing and adds no path.
- Ticket items: item 1 (a failure names the text) is covered by the message and shown red by the planted run. Item 2
  (the cause found and fixed) has no test because no cause was found (D1, the owner's decision); not a gap of this
  change. Item 3 (repeated on CI): 40 of 40 green in run 39972027006; what that proves is limited, see F1.
- Driven input against the claimed state: "compressed while cached" is reached by writing the `.zst` and removing the
  plain file while the page is open (:5197, :5198), then a rescan. Holds.
- Fixture source: unchanged this round; its shape source is the design review's, not re-examined here.

### Case design

- No mock of project modules, no internal write, no call-count assertion; the stderr is the process's own output at its
  boundary, collected for every case by the shared launcher. Agrees with the design review.

### False greens

- When E1's check goes red: when a chunk the launcher collected before the page first shows "Cannot open this session"
  carries neither `session-file-unreadable` nor `session-not-whitelisted`; the first such chunk is the message. Shown,
  not assumed: the planted run ([plant-line.txt](evidence/ticket-247/plant-line.txt)) confirmed the plant in the build
  independently (`grep -o` count 1 in `out/main/index.js`), failed at :5207 with the planted text as the message, and
  restored the file byte for byte.
- Constant-true: the loop is guarded by :5204; the predicate is a disjunction of two distinct, non-empty codes.
- Tautology: the codes are imported from `ERR`, the constants the app throws. Agreed with the design review: the check
  asks which error was raised, and a renamed code is still the code the app throws.
- Stale path: both codes are thrown on live paths (`src/main/index.ts:311` to `:381`, `src/main/source-identity.ts:9`
  and `:12`, `src/main/providers/token-stats.ts:619`).
- Silent skip, unexecuted assertion: none; the assertion is synchronous inside the guarded loop.
- Read too early or too late: the case polls the page text (:5203) and then reads the collected stderr once. Chunks
  collected after that read are never checked. F1.
- Acceptance runs the change introduced. The planted run: sound (above). The CI repetition
  ([ci-repeat-39972027006.txt](evidence/ticket-247/ci-repeat-39972027006.txt)): `--repeat-each=40` on ubuntu under
  xvfb, all 40 lines for the case are passes. Its tree (cd64cbb) differs from 78a05d0 in `e2e/app.spec.ts` only by the
  teardown helper (`closeApp` in `close()`) and other cases, and under `src/` only in `src/main/update-source.ts`; the
  case body and the launcher's filter are identical, so the result applies to this change. The local loops
  ([loop-attempts.txt](evidence/ticket-247/loop-attempts.txt),
  [loop-under-load.txt](evidence/ticket-247/loop-under-load.txt)): F1 limits what they prove; F3 for one annotation.

### Resource reuse

- Expensive resources: the e2e build, and one Electron launch per case. Counted in the gateway's full run: the build ran
  once (`electron-vite build`, one bundle each for main, preload and renderer, log lines 457 to 479). The launch prints
  nothing in the run; by the code E1 launches once (:5188), as in the table. The change adds no resource.

### Findings

- **F1 (medium) — the stderr check covers only the chunks collected before the page's error state.** Location:
  `e2e/app.spec.ts:5203`–`:5208`, and the rest of the case to `close(l)` at :5219. The case polls the page text, then
  reads `l.errors` once; the launcher keeps collecting through the back click, the reopen under the compressed identity,
  the turn fetch and every 250 ms rescan, and nothing checks those chunks. Effects: (i) a non-matching chunk after the
  read leaves the case green and unnamed; the planted-line record shows the timing (a line written once 1 s after
  startup reached the launcher but was not in the case's check, plant-line.txt lines 3 and 116 to 128). (ii) D1's
  premise, "a later failure of the case prints the line", holds only for a line that lands before the read; the 40
  local, 40 loaded and 40 CI repetitions likewise show only that no such chunk arrived before it, and 0 failures in 40
  runs still allows a per-run failure rate up to about 7.5 % (rule of three, 95 %), so they do not show the flake gone.
  (iii) The reverse order, the expected handler error reaching the launcher after the page text, would fail :5204 with
  no product fault; no run on record shows it, but nothing in the case orders the two channels (the process's stderr
  pipe and the page's DOM). Suggested handling, for the owner to choose: (A, recommended) poll the asserted
  quantity, `await expect.poll(() => l.errors.length).toBeGreaterThan(0)` in place of :5204, and check every collected
  chunk again just before `close(l)`; `expect(l.errors.filter((e) => !(...)), '...').toEqual([])`, the form :2491
  already uses, names every offender at once. Cost: a few lines. Risk: if the stray line usually lands after the
  current read, the case goes red on CI more often, which is the reproduction #247 lacked, with the line named. This
  changes the test: row E1 is updated and re-reviewed first, then the targeted run and an incremental check. (B) Keep
  the case and D1 as they are, and state the limit and the bound where #247's outcome is recorded: D1 in the task list
  and #247's closing comment. Destination: the owner's decision; either way a row in
  [ticket-247-doc-sync.md](ticket-247-doc-sync.md), added by whoever applies it.
- **F2 (low) — the gateway's two repository-wide gates did not see the last commit's files.** Location: the gateway
  log, lines 3 to 6, against the range's end d6e80fd. The log's version is 78a05d0 with `ticket-247-tasks.md` modified
  (blob 6a966434); d6e80fd adds `ci-repeat-39972027006.txt`, `gateway-78a05d0.txt` and `ticket-247-review-code.md` and
  changes `ticket-247-tasks.md` (blob now 50e26117). None is code, configuration or data a unit or e2e test reads (no
  test or script reads `docs/.workings` except as a screenshot output path or copy text), so the test results carry
  over. But `check:lang` and `check:nul` read every file `git ls-files --cached --others --exclude-standard` lists, and
  the three added files were untracked and ignored (`.gitignore:4`, `docs/.workings/`) when the gateway ran, and the
  repository has only a `commit-msg` hook, so neither gate has read them. This check ran `pnpm check:lang` on HEAD with
  this section staged (see below); `check:nul` has not run over them. Suggested handling: run `pnpm check:nul` at the
  delivery HEAD and record it in the task list; no full rerun is needed for the tests.
- **F3 (low) — one annotation claims more than its file shows.** Location: `evidence/ticket-247/loop-under-load.txt:63`.
  It says "no chunk without a code was collected" for the 24-process attempt, but 4 of its 10 runs hit the 60 s
  timeout and the file holds no failure detail for them, so whether they reached the check is not shown (and, per F1,
  for the 6 passes the check covers only chunks before the read). Suggested handling: narrow the annotation to what the
  file shows, or add the output that supports it; the line is the implementer's header, not command output.

### Document sync

- Scope: `docs/.workings/session-view/` listed in full (it is git-ignored; `ls -la`, and `rg -uu` from the repository
  root for "#247", "ticket-247" and the case's title, which finds only this ticket's records, earlier runs' logs, and
  two mentions of #247 as an example of a flaky-case ticket, in `docs/.workings/memory-view/ticket-294-review-tests.md`
  and `docs/.workings/macos-release-line/ticket-234-review-code.md`, neither stating anything this change alters);
  [checklist.md](checklist.md); the spec's P6, P7 and Testing Decisions; the test file's header. `docs/features/` is out
  of scope: the change is a test's failure message and changes no user-visible behaviour.
- Result: the spec and the test file header need no change from this check. For the main agent: row 1 of
  [ticket-247-doc-sync.md](ticket-247-doc-sync.md) waits on "the cause", which D1 closes without, so it needs re-judging
  rather than marking done; and its target, "the checklist's current verification for P6 and P7", does not exist:
  checklist.md has no P6 or P7 row. F1 adds a sync item whichever way it is handled.
- `pnpm check:lang` on HEAD with this section staged: exit 0.

## Handling of the post-implementation check's findings (implementing session, 2026-10-24)

| # | Handling |
|---|---|
| F1 | The owner chose option B on 2026-10-24 ("leave it, state the limit", in Chinese): the case stays as it is; D1 in the task list now states the limit (only chunks collected before the page's error state are checked) and what 40 clean runs can show (up to about 7.5% per run still possible), and #247's closing comment repeats it. The test is unchanged, so no further check follows |
| F2 | `pnpm check:lang` and `pnpm check:nul` run at the delivered commit's tree with every record in place (`evidence/ticket-247/gates-at-delivery.txt`); the tests' results carry over, since no test reads these records |
| F3 | The note at `evidence/ticket-247/loop-under-load.txt` narrowed: the 6 passes checked the chunks collected before the check, and whether the 4 timeouts reached it is not shown |

