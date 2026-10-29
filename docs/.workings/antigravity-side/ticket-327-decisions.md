# Decisions — #327 Closeout: full-feature acceptance and documentation regression (Antigravity CLI side)

Ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327) · feature checklist: [checklist.md](checklist.md)

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

Decisions taken during the closeout under the owner's standing instruction (decide reasonably, research when unsure,
record every decision), 2026-10-29.

| Decision | Chosen | Alternatives considered | Why |
|---|---|---|---|
| Base of the branch | `feat/antigravity-closeout` from the landing rehearsal's head `dc80aa2` (local only, no upstream, nothing pushed); rebased onto main by the orchestrator once #329, #330, #323, #325 and #324 land (`git rebase --onto origin/main dc80aa2…`) | Branch from main (implement step 1's rule) | The orchestrator's instruction: the five tickets are built but not merged, and the closeout's acceptance is of their combination; main holds none of the side's code. `git log dc80aa2..HEAD` lists only this ticket's commits |
| How the `~/.gemini` path gets one source | `ScanRoots.geminiHome` is the source: `geminiDir()` removed; `antigravityConfigDir()` = `geminiHome/config`; agy's third global skills library = `geminiHome/skills`; the config `AGENTS.md` through `antigravityConfigDir()`; `realRoots()` builds the data root inside the same path. `antigravityHome` stays a field | Remove `antigravityHome` and derive the data root from `geminiHome` (17 builders and every reader change; the side would be the only one whose data root is not a field); remove `geminiHome` and keep deriving from `dirname(antigravityHome)` (the hidden parent-of-a-child coupling #326 rejected); keep both derivations (the issue asks for one source) | One source for the path with the smallest change that leaves the seam's shape alone: every side's data root stays a field of `ScanRoots` (ADR-0002), and every location under `~/.gemini` outside the data root now comes from one field. No behaviour change: all 17 builders already nested the data root in `geminiHome` |
| A test for the fold | None of its own; the existing cases that read each folded location are its safety net (named in the test review) | A case giving `geminiHome` and the data root's parent different values | That state is not reachable through `realRoots()`: a case pinning it tests a world the product never builds (tdd's reachable-state rule) |
| The combined acceptance's test shape | One e2e case, one launch, a home of its own (`mkAntigravityCloseoutHome`); the card's four parts read as one tuple in a single DOM read; the project registered on all four sides walked section by section, MCP and the header chips included | Two cases (one launch each) over one home; extending #324's or #325's homes | The suite's rule is one launch per distinct fixture home; extending another ticket's home would change that ticket's expectations. One DOM read makes "the card whole" true of one render, not of four retried reads |
| Values in the combined home | Distinct numbers everywhere (2 projects, 3 skills, 4 subagents — 5 since the post-implementation check; 1k, 2k, 3k, 5k, 7k, 12k), each hand-computed from the fixture | Reusing #325's counts | A count read from the wrong slot, or a figure from another side, fails rather than matching by coincidence |
| token-stats::REQ-003/AC-08's Pending note | Kept: 19 of 19 conversations on this machine list one folder, re-checked read-only on 2026-10-29 ([ticket-327-pending-check.log](ticket-327-pending-check.log)) | Remove the note (the rule is implemented); confirm by making a multi-folder conversation with agy | The note's condition is a product fact not yet observed; running agy is outside this closeout's permissions (only `--help`/`--version`) and would write to agy's data. The re-check copies the databases and reads the copies with the product's own decoder; the source listing is unchanged |
| The rows' side-badge slots touching, against the prototypes' 3px gap | Fixed in this round: `.bdg { display: flex; gap: 3px; flex: none }` in `theme.css`, read by C1 (`[3, 3, 3]`, red `[0, 0, 0]` without it) | Report it for the owner (as #325's worklog did); also fix the width (the agents-page prototype's 96px) | It is an app-versus-prototype difference in this feature's range — #328 changed the agents-page prototype's `.bdg` for the fourth slot — and features-catalog has such a difference fixed in the implementation within the round (ADR-0033 puts it at the closing cross-check); the confirmed prototypes already draw the form, so no prototype change. The width is left out: the skills-view prototype, the specific one for both skills lists, draws no width, and every row's slots are equal in width |
| The memory card's 52vh bound (#326's open finding) | Not changed; listed for the owner (O4) | Fix it here like the gap | Neither end is in this feature's range: the prototype's bound and the app's card predate the feature, and no interface point of the feature is that card — the regression's range ends there (features-catalog: no repository-wide audit) |
| The post-implementation check's Finding 1 (C1's no-shadow read could not go red) | Give the home a same-name pair (agy's global `proj-agent` beside the project's), so the read reaches subagents-view::REQ-001/AC-05 | Drop the read and cite the unit case alone | One more file makes the e2e hold the rule end to end — the unit case holds the flags, the renderer draws the pill from them — and the counts stay distinct (2, 3, 5) |
| Finding 3 (the model rows' order was the implementation's sort) | Read the rows as a set | Name the sort as the source | No spec states the order; an expected value taken from the implementation is a tautology (review-tests, Dimension 3) |
| Two names for the side in documents | CONTEXT.md "Agent side" says when documents call the tool `agy` (the tool acting) and when "Antigravity CLI" (the side); the seven bare "Antigravity" of the component features pages rewritten; the specs' bare "Antigravity" (about 90) listed for the owner (O12) | Rewrite every spec occurrence now; leave the features pages too | The features pages are the user-facing narrative the earlier tickets already held to the rule; the specs' wording is #328's owner-reviewed text, often naming interface labels, and a rewrite of 90 sentences — or scoping the rule — is a decision, not a fix |
| ADR-0037's "to be confirmed during implementation" with implementation over | A dated closeout note appended (the ADR is accepted, append-only, as #323's note was); status Accepted kept | Leave it; supersede it | The sentence had no answer once implementation ended; nothing in the decision changed |
| What the activity walk does with an unreadable conversation | The token-stats failure mode rewritten to the code: the walk keeps only successful reads and opens an unreadable conversation at every scan; making the walk cache the verdict is listed (O13) | Change the walk to cache it | The spec said it is not read again, true of the usage reads only; a code change for a cost that arises only after an agy format change is not the closeout's to make |

## Work log (tasklist)

- [x] T1 Worktree from `dc80aa2`, dependencies installed (`pnpm install --frozen-lockfile`, `pnpm --dir site install
  --frozen-lockfile`, both exit 0); no `electron-vite` dev server running (`pgrep -fl electron-vite` exit 1)
- [x] T2 Skills loaded: implement, to-tickets, to-spec, features-catalog, review-tests, tdd, review-code, ui-design,
  github-ops, repo-scaffold (registry only), with the reference files each requires
- [x] T3 The fold (`db5aecf`): typecheck, lint of the three files, unit suite green
- [x] T4 Test design review → [ticket-327-review-tests.md](ticket-327-review-tests.md) (Design review)
- [x] T5 The combined e2e case (`87ec0b3`); targeted verification
  [ticket-327-targeted.log](ticket-327-targeted.log) at `87ec0b3`, clean tree: typecheck, lint, the importer searches,
  the unit suite (1087 passed, 1 skipped), `app.spec.ts` whole on a fresh build (97 passed), `OVERALL exit=0`
- [x] T6 The Pending note re-judged ([ticket-327-pending-check.log](ticket-327-pending-check.log))
- [x] T7 `/review-code` → [ticket-327-review-code.md](ticket-327-review-code.md)
- [x] T8 Pre-review run of the full gate: [ticket-327-gate-prereview.log](ticket-327-gate-prereview.log) at `4e6a3c4`,
  clean tree — every `pnpm verify` command, the e2e narrowed to `app.spec.ts` (the one e2e file the change touches, and
  the only one the importer search finds): unit 1087 passed / 1 skipped, e2e 97 passed, smoke OK, `OVERALL exit=0`; no
  command skipped (the change alters a test file)
- [x] T9 `/review-tests` post-implementation check, round 1 (independent sub-agent, range `dc80aa2..4e6a3c4`, the
  pre-review log): four findings, all records (the record's "Findings" and "Handling of the findings"). The fix, with
  the regression's `.bdg` rule, after `274cb00`:
  - targeted run [ticket-327-fix-targeted.log](ticket-327-fix-targeted.log) (the fix uncommitted, its three files'
    `git hash-object` in the manifest): typecheck, lint, the search for tests reading `theme.css`
    (`scripts/check-shared-ui.test.mjs`, run by `pnpm check:ui`), `pnpm check:ui`, the unit suite, `app.spec.ts`
    whole on a fresh build (97 passed), `OVERALL exit=0`;
  - the gap read red against the build without the rule (`[0, 0, 0]`, at that read alone), green with it; screenshots
    and computed gaps before and after: [ticket-327-ui-evidence.log](ticket-327-ui-evidence.log);
  - self-check items 6 and 7: the evidence files are named for what they hold and kept whole (the targeted log, the UI
    evidence log with its throwaway spec's path); the records the fix touches — C1's design row and its increment, the
    record's Coverage sentence, the code review's addendum — agree with the amended case; the checklist's closeout rows
    are written with the regression (T10) and cite C1 for AC-05's no-shadow half only now that it drives it. No finding;
  - change scope against `274cb00` (`node ~/.claude/skills/implement/change-scope.mjs --base 274cb00`, the fix
    uncommitted):

    ```
    inert   docs/.workings/antigravity-side/ticket-327-review-code.md
    inert   docs/.workings/antigravity-side/ticket-327-review-tests.md
    changed e2e/app.spec.ts  (code changed)
    changed src/renderer/src/theme.css  (no syntax tree comparison for this type)
    verdict: run (4 files differ from the base)
    change-scope exit=1
    ```

    The test file changed, so the fix is committed and handed to an independent sub-agent for an incremental check
- [ ] T10 Step 7 archive; step 8 full-feature closeout (features-catalog): checklist current verification, the
  regression's three stages, the doc sync checklist, CONTEXT, ADR-0037's status
- [ ] T11 Full gate `pnpm verify`
