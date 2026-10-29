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
| Values in the combined home | Distinct numbers everywhere (2 projects, 3 skills, 4 subagents; 1k, 2k, 3k, 5k, 7k, 12k), each hand-computed from the fixture | Reusing #325's counts | A count read from the wrong slot, or a figure from another side, fails rather than matching by coincidence |
| token-stats::REQ-003/AC-08's Pending note | Kept: 19 of 19 conversations on this machine list one folder, re-checked read-only on 2026-10-29 ([ticket-327-pending-check.log](ticket-327-pending-check.log)) | Remove the note (the rule is implemented); confirm by making a multi-folder conversation with agy | The note's condition is a product fact not yet observed; running agy is outside this closeout's permissions (only `--help`/`--version`) and would write to agy's data. The re-check copies the databases and reads the copies with the product's own decoder; the source listing is unchanged |

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
- [ ] T8 Pre-review run of the full gate
- [ ] T9 `/review-tests` post-implementation check (independent sub-agent)
- [ ] T10 Step 7 archive; step 8 full-feature closeout (features-catalog): checklist current verification, the
  regression's three stages, the doc sync checklist, CONTEXT, ADR-0037's status
- [ ] T11 Full gate `pnpm verify`
