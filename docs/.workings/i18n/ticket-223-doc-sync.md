# Document sync checklist — ticket aloong-planet/agentshed#223

Artifacts: [code review](ticket-223-review-code.md) · [test review](ticket-223-review-tests.md) · this checklist ·
raw evidence in [`ticket-223-evidence/`](ticket-223-evidence/) (this round's in
[`rerun-2026-10-21/`](ticket-223-evidence/rerun-2026-10-21/)).
Scope checked on 2026-10-21, on the branch after merging main at 9b7bb13: `README*`, `AGENTS.md`,
`CONTEXT.md`, `capabilities.toml`, `docs/` (features, specs, ADR, prototypes, agents), `docs/.workings/`
(hidden and ignored files included), `scripts/`, `src/`, `.github/`. Search terms: `SKILL_TOOLING`,
`GALLERY_SHELL`, `mockupOnly`, `gallery shell`, `tooling beside`, `prototypes/index.html`, `check-lang`,
`check:lang`, `check-raw-nul.test`, `test:scripts`. Searched with `rg -uu`, which reads hidden and ignored files and does not skip binary files
silently. Excluded: `node_modules/` and `.git/`.

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Declare this ticket's artifact paths; before the PR opens | [#223](https://github.com/aloong-planet/agentshed/issues/223) | Done — [comment](https://github.com/aloong-planet/agentshed/issues/223#issuecomment-6119569122) |
| Report the merge on the ticket (merge commit, and whether the merged tree equals the PR head), and close it; after #225 merges | [#223](https://github.com/aloong-planet/agentshed/issues/223) | Done — completes with #225's merge: `Closes #223` closes it, and the comment is the tracker write-back that follows the merge |

Pre-delivery scope re-check (2026-10-21):

- The merge took main's `docs/prototypes/index.html`, so this pull request no longer changes it. The
  2026-10-12 statements about copying the template, and the evidence for them at the top level of
  `ticket-223-evidence/` (`green-after-copy.log`, `exempt-by-extension.tsv`, the `mutation-*.log` files,
  `render-gallery.cjs`, `render.log` and the three screenshots), describe c149802 only. They stay as raw
  evidence; no current conclusion rests on them. The code and test review records were rewritten for this
  round.
- `docs/specs/i18n.md` Further Notes call this exemption "mockup content but not the tooling beside it".
  The gate now matches that sentence for every verbatim copy of the prototype skill's templates; the logic
  pages remain the known exception (#226). No spec text becomes false and none is missing.
- `docs/specs/project-detail.md` B4 and `src/main/providers/artifacts.ts` exclude the gallery shell from the
  app's prototype list. That is the app's behaviour, not this gate's. No change.
- ADR-0017 and ADR-0030 describe the gate and its predicate form, not this exemption's file test. No change.
- `docs/features/` has no statement about the prototype gallery or the language gate. No sentence becomes
  false and none is missing, so step 8 is skipped for this ticket.
- `scripts/check-lang.test.mjs`, run by `pnpm check:lang`: the spec's statement that the gate's predicates
  are "verified to hold in both directions" stays true, and this test now keeps the prototype predicate
  verified both ways. The spec's Testing Decisions cover the i18n feature's own seams and say nothing about
  this gate's tests, so no sentence is missing. CI runs `pnpm check:lang`, so the test runs there with no
  workflow change.
- The list's blind spots, a template the skill adds or renames, are a follow-up and not a sync item:
  [#296](https://github.com/aloong-planet/agentshed/issues/296).
- `CONTEXT.md`: no term or invariant involved.
- The working records of other tickets that quote the prototype rule's file count describe their own runs
  and stay as written.
- Raw evidence that quotes Chinese stays untracked, because a tracked file there would itself fail the
  working-language gate: `red-before-copy.log`, `mutation-M1-shell-title.log`, `mutate.sh` and
  `logic-pages-vs-template.diff`, in `docs/.workings/i18n/ticket-223-evidence/` of the main checkout, where
  `logic-pages-vs-template.diff` stays while #226 relies on it. This round's logs escape Chinese as `\u{XXXX}` instead, so they are committed.
