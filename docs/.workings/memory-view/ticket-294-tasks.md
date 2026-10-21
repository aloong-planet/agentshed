# #294 — the memory drawer previews Markdown

Working record (not an authority: the spec, features, ADRs and CONTEXT.md say what holds).

## Facts (checked against 9b7bb13)

| # | Fact | Evidence |
|---|---|---|
| F1 | The memory drawer shows the file as raw text: a title, a meta line, and the body in a `raw` block. The Agents page's Memory section and a project's topic files both open it. | `src/renderer/src/MemoryView.tsx` (MemoryFileDrawer; GlobalMemoryTab and ProjectMemoryTab open it) |
| F2 | The skill file drawer previews Markdown by default with a raw switch; its preview goes through the one sanitising renderer and the shared link interception; a link to a listed file of its package switches the drawer to that file, which opens in its default mode. | `src/renderer/src/SkillFileDrawer.tsx`, `MarkdownBody.tsx`, `md-links.ts` |
| F3 | A plugin's skill files open in the same skill file drawer. | `src/renderer/src/PluginSkillList.tsx` imports SkillFileDrawer |
| F4 | A project's main memory file is already rendered, and its links to listed topics open the topic drawer; an unlisted target or an unsupported protocol gets an error toast; an external link goes to the system browser. | `MemoryView.tsx` ProjectMemoryTab; `md-links.ts` |
| F5 | Only top-level `.md` files of a memory directory are listed, so every file the drawer opens is Markdown. | `src/main/providers/memory.ts` listMdFiles |
| F6 | Front matter is split into key-value rows; a nested key (`metadata:` then `  type: feedback`) folds into its parent's value. | `src/renderer/src/md.ts` parseYamlFields |
| F7 | Real files: Claude memory topics carry `name` / `description` / `metadata.type` front matter, `[[name]]` references and links between files of the directory; Codex's memory files run to 430 KB (under the 500,000-unit read cap) and mention subdirectory paths as plain text. | `~/.claude/projects/*/memory/*.md` (118 files, all `.md`); `~/.codex/memories/` |
| F8 | spec memory-view D2 says topics open in "the shared artifact drawer"; the code has a separate memory drawer. | `docs/specs/memory-view.md` D2 |

## Decisions (owner, 2026-10-21; also on the issue)

| # | Decision |
|---|---|
| D1 | The memory drawer previews Markdown, and this comes before #279's memory screenshot. |
| D2 | The drawer takes the skill file drawer's form: preview by default, front matter as a card, a switch to the raw text. |
| D3 | A link to another file of the same memory directory switches the drawer to that file; external → system browser; anything else → the explicit notice. |
| D4 | `[[name]]` references stay plain text. |
| D5 | (2026-10-21, after the independent test check found `[[name]](remark)` rendering as a link) `[[…]]` is literal text on every rendered-markdown surface, and a remark written straight after it stays text too. |
| D6 | (2026-10-21, same check: `<slug>`-style placeholders vanish in every preview; folded into this ticket) a tag-like `<name>` whose name is not an HTML element shows as written on every rendered-markdown surface; real HTML keeps rendering, so a placeholder named like an element (`<input>`, `<p>`) is still taken as HTML. |

## Prototype proposals — confirmed by the owner on 2026-10-21 ("confirm, continue")

| # | Proposal |
|---|---|
| P1 | Title = the memory's owner (the project, or the Codex global memory); meta = side · file · modified time; the bar shows the file — the skill drawer's package / file split. |
| P2 | The drawer frame becomes one shared prototype piece used by the skill, plugin and memory drawers; the skill and plugin prototypes move onto it (width follows the content-area formula; the plugin drawer gains the skill drawer's bar fade). The skill drawer prototype's deep-accent bold was a content-styling difference against CONTEXT.md's one-rule-set invariant and appearance E7c; the owner chose (2026-10-21) to keep bold in the body colour on every surface, so the shared frame styles no content. |
| P3 | The read states (loading, could not read, empty) show inside the frame's body, as the skill drawer's do. |
| P4 | Switching to another file opens it in preview, scrolled to the top. |
| P5 | In project detail, a topic's link to the main file opens the main file in the drawer; the main file's own unlisted links show the error toast, as the app does, replacing the prototype's earlier explanatory drawers. |

## Tasks (each with its checkpoint)

| # | Task | Checkpoint |
|---|---|---|
| T1 | Test design review (/review-tests design review) | Recorded in ticket-294-review-tests.md before the first test is written |
| T2 | Project memory carries the main file's path; the project's read allow-list includes it; contract validation extended | providers + validate unit tests green; typecheck |
| T3 | One drawer component for skill and memory files (frame, preview frame, mode reset per file, scroll to top on switch); the skill drawer moves onto it unchanged in behaviour | skills-view e2e green |
| T4 | The memory drawer on the global page and project detail: title, meta, links within the directory, read states | memory e2e green |
| T5 | Styles: the bar fade (prototype), the memory drawer on the skill drawer's frame | e2e computed-style checks; screenshots against the prototype |
| T6 | Targeted verification (typecheck, lint, the tests found by import / file search) | all green, exit codes gate step 5 |
| T7 | Step 5: /review-code | ticket-294-review-code.md |
| T8 | Full gate (pnpm verify) | exit 0 |
| T9 | Step 6: /review-tests post-implementation check by an independent agent | ticket-294-review-tests.md |
| T10 | Spec check, step 7 archive, step 8 features + final regression | final-regression.md; doc-sync list has no Pending |
| T11 | PR | opened; stop for merge authorisation |

## Targeted verification (2026-10-21, uncommitted on 9b7bb13)

- typecheck: exit 0. lint: exit 0 (after installing the site's own dependencies in this worktree and making the
  e2e browser-hand-off stub return a promise instead of an async function without await).
- Unit tests found by import search (`rg -l "from ['\"](\./|\.\./|@shared/)(.*/)?(validate|memory|domain|MemoryView|SkillFileDrawer|FileDrawer|DetailPane|side-badge|i18n(/[a-z]+)?|md-links|md|MarkdownBody)['\"]" src scripts --glob '*.test.*'`)
  plus the provider test and src/shared/i18n/*.test.ts: 32 files passed, 1 skipped (the opt-in ccusage
  reconciliation, `describe.skipIf`), 413 tests passed.
- check:ui, check:lang, check:i18n: exit 0.
- e2e tests found by searching test bodies for the drawer and memory (F3 Memory section, Skills view, plugin
  skill preview, artifact reopen with delay) plus startup restore: 5 passed on a fresh build.
- E-A9 mutation (project registration of the main file removed): the F3 test fails at the late main file with
  "File cannot be read: This artifact path is not in the allowed list"; restored byte for byte and rebuilt.
- The app's drawer rendered from this build (zh and en, a stand-in home) matches the confirmed prototype.

## Full gate (2026-10-21, after step 5)

`pnpm verify > t294-verify.log 2>&1; echo "verify exit=$?"` → `verify exit=0`: unit 872 passed (1 opt-in skip), script and
site tests 102 passed, check:ui / check:lang / check:i18n / check:nul passed, e2e 148 passed on a fresh build, smoke
SMOKE_OK. Log kept at the scratch path of this session (not committed).

## Full gate at f064a81 (2026-10-21)

The log starts with `HEAD f064a813c0636af04edb4356401946ceb5cefaf8` and an empty porcelain status (clean tree);
`verify exit=0`: unit 878 passed (1 opt-in skip), script and site tests 102 passed, check:ui / check:lang /
check:i18n / check:nul passed, e2e 148 passed, smoke SMOKE_OK. The earlier run before 81952cf tested an
uncommitted tree and, missing the force-added records, a language check that 81952cf then failed (PC-1).

## After the incremental check (IC-1 to IC-6)

E5 measured on the built app and reworded in the spec; tests revised per Increment 2 of the test review record;
the sideways-scroll check proven by mutation (`overflow: hidden` on the body → "hidden true" against
"auto true"; restored byte for byte, rebuilt).

## Spec check before step 7 (2026-10-21, read-only over the code at f064a81 plus the uncommitted test revisions)

Each item against the code: memory-view::US-001/AC-01 (owner title: GlobalMemoryTab `projectName ?? placeholder`,
ProjectMemoryTab `projectName`; meta from the side's short name, file name and `fmtAgo`; bar and switch in
FileDrawer) — met. AC-02 (shared carrier, front matter card, nested folding) — met. AC-03 — met (raw shows the
text read, with the truncation marker AC-07 names). AC-04 and CON-002 (wikiRef extension; non-element tags escaped
in the html renderer) — met. AC-05 (in-directory switch; readable list = the row's files / main file and topics;
body keyed by file) — met. AC-06 (shared interception: external through the guard, anchors scroll, unlisted and
other protocols toast) — met. AC-07 (loading, failure, empty, truncation inside the frame) — met. AC-08 — met.
CON-001 (one component, one stylesheet, the width formula, the fade) — met. C7, C8, D2, D6 — met. E1–E8 — met;
E2 and E7 by code reading (gaps recorded in the e2e header). Implementation Decisions (main-file entry, allow-list,
saved-data fill-in) — met. Unrecorded scope: the skill drawer's switched file now also starts at the top and its
close button centres its icon — both part of the one form CON-001 states; no other expansion. Nothing to
reconcile with the owner.

## Full gate at 8aa70e8, run twice (2026-10-21)

Both logs start with `HEAD 8aa70e8212c94add669f5298080814628e61bdef` and an empty porcelain status.
- First run: `verify exit=1`. Everything passed except one e2e step: `e2e/startup-restore.spec.ts:8` at line 72,
  the "today" card expected `0` within 1,000 ms after the test moves the clock forward and read `2k` (2.7 s run).
  This branch does not touch that step (the assertion dates from 3a6dca56; DisplayClock and the totals card are
  unchanged here).
- The same test alone, five times in a row on that build: 5 passed.
- Second run, next on the same commit: `verify exit=0` — unit 878 passed (1 opt-in skip), script and site tests
  102, check:ui / check:lang / check:i18n / check:nul passed, e2e 148 passed, smoke SMOKE_OK.
- Handling: treated as a flaky step outside this ticket, raised with the owner for a ticket of its own (the
  independent check's reading, inferred and not run: the app's display clock ticks on a real once-a-second timer
  started before the test installs its fake clock, so the update races a 1,000 ms timeout).

## After the third independent check (IC-7 to IC-12)

IC-8 and IC-9's assertions revised and each shown able to fail by mutation (a 320,000 cap; a fixed-layout table capped
at the body's width), restored byte for byte and rebuilt; IC-10's fixture comment corrected; IC-11 and IC-12 handled in
the checklist and the test review record; the postmortem index row moved into date order; IC-7 recorded above.

## Final full gate at 67a31bc (2026-10-21)

The log starts with `HEAD 67a31bce3ad79c940979e6ba84733a29c065eebc` and an empty porcelain status; `verify exit=0`:
unit 878 passed (1 opt-in skip), script and site tests 102, check:ui / check:lang / check:i18n / check:nul passed,
e2e 148 passed, smoke SMOKE_OK. The changes after it are records only (the checklist's current verification, this
log, the final regression's closing line); check:lang re-run on them before the commit.

## Rebased onto main 4d21538 (2026-10-21)

main gained #295 (the interface in Chinese and English only: the fr/es/ja/ru dictionaries deleted) and #225 (the
language check for the prototype skill's copies). Conflicts: the four deleted dictionaries (this branch had removed
`topicMeta` from them — main's deletion kept) and the postmortem index (both added a 2026-10-21 row — both kept, in
order). Commit ids before → after: 81952cf → 6f950e9, f064a81 → 7d9d833, 8aa70e8 → 9d0936a, 67a31bc → 6d796a7,
c8b4922 → 12e51ae. Evidence quoted above for the old ids (gate runs, mutations, the independent checks) was produced on
the pre-rebase trees; the full gate re-run on the rebased tree is recorded below. After the rebase: typecheck exit 0,
check:lang exit 0, no `topicMeta` left.
