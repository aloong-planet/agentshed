# Review — code (step 5), ticket aloong-planet/agentshed#223

- Date: 2026-10-21
- Version: branch `fix/gallery-shell-language` at b164921, plus the review fix below (the `SKILL_TOOLING`
  comment), committed together with this record. The branch carries main up to 9b7bb13 through the merge
  commit 2cf3dea.
- Scope: `scripts/check-lang.mjs` (`SKILL_TOOLING` and `mockupOnly`) and the merge. The pull request no
  longer changes `docs/prototypes/index.html`: #249 and #264 had already copied the prototype skill's
  current English template there, so the merge takes main's file, which is byte-identical to skillshed
  `origin/master:prototype/gallery-template.html`.
- Review path: tracker ticket without a feature checklist; artifacts under `docs/.workings/i18n/` with the
  `ticket-223-` prefix (code review, test review, document sync checklist). The slug follows
  `docs/specs/i18n.md`, whose Further Notes hold the working-language gate's exemption rules.
- Earlier round: 2026-10-12, on c149802, which copied the template over the shell and named the shell
  alone. Its conclusions about the shell copy no longer apply, since the pull request no longer makes that
  copy. Its raw evidence stays at the top level of `ticket-223-evidence/` and describes c149802 only; this
  round's evidence is in `ticket-223-evidence/rerun-2026-10-21/`.

## ① Underlying premises — one finding, fixed

- "The prototype skill copies tooling files into `docs/prototypes/` unchanged." Checked against the skill's
  asset list (`repo-scaffold/artifact-names.md`, seven `prototype/` assets) by hashing each asset at
  skillshed `origin/master` and looking the hash up among every tracked file (`git ls-files -s`):
  - byte-identical copies: `index.html` (from `gallery-template.html`), `app-identity.js`,
    `demo-dimensions.js`, `demo-harness.js` and `sync-mmd.mjs`;
  - no identical copy: `logic-page-template.html` and `logic-template.js`. The three logic pages are
    filled-in copies of the first, which is #226.
- "The gate exempted the three new copies by extension, as it had the shell." Holds: with the narrowing
  removed, a Chinese line in `app-identity.js` passes (N2).
- "`dimensions.js` addresses the reviewer." Its labels render in the gallery's settings panel
  (`index.html:119`), and its fallback note renders on the pages (`demo-dimensions.js:76`). It is this
  project's registry, not a skill asset, so it stays exempt with `manifest.js`.
- **Finding (new comment overclaimed):** the first wording called the list "the prototype skill's
  tooling, copied in unchanged", which `sync-mmd.mjs` (a fifth copy, not in the list) contradicts. The
  comment now says the list holds the copies the file type would exempt, and that `sync-mmd.mjs` needs no
  entry because `.mjs` is not an exempt type. That cause was confirmed by measurement: a Chinese line in
  `sync-mmd.mjs` is red with the narrowing (T5) and without it (N3). Self-harm only (a misleading
  comment); fixed.

## ② Runnability — no finding

- The predicate compares the repository-relative paths `git ls-files` prints, like the file's other
  exact-path rules; nothing else changed in how files are read or reported.
- Mutations, run by `rerun-2026-10-21/mutate.mjs` on the merged tree. Each edit was confirmed in the file
  before the run. The exit code was taken from `spawnSync`, and every touched file was restored byte for
  byte from memory (no `git checkout`). The table is `rerun-2026-10-21/summary.md`:

  | Mutation | Expected | Result |
  |---|---|---|
  | baseline | green | exit 0, 2554 permitted lines |
  | T1–T4: a Chinese comment line in `index.html`, `app-identity.js`, `demo-dimensions.js`, `demo-harness.js` | red | exit 1, one problem each, at the appended line |
  | T5: the same in `sync-mmd.mjs` | red | exit 1, one problem, at the appended line |
  | G1–G5: the same in a mockup page, the logic page `project-list/visibility/index.html` (same basename as the shell), `manifest.js`, `dimensions.js`, `_shared/app-rail.js` | green | exit 0, 2555 permitted lines each |
  | N1, N2: T1 and T2 with the narrowing removed | green | exit 0, 2555 |
  | N3: T5 with the narrowing removed | red | exit 1, at the appended line |
  | final | green | exit 0, 2554 |

  2555 against 2554 shows that each green run read the mutated line and permitted it, rather than skipping
  the file. N1 and N2 show that the narrowing is what turns T1 and T2 red.

## ③ Security — no finding

No new input or output path; the gate reads the repository's own files, as before.

## ④ Consistency — one class-level result; one item for the refactor list

- Exact-path matching follows the file's existing rules (`README.md`, `scripts/check-shared-ui.mjs`). A red
  on a named copy prints the prototype rule's reason, "the tooling beside it gets no exemption", which is
  the reason that applies.
- `docs/specs/i18n.md` Further Notes describe this exemption as "mockup content but not the tooling beside
  it"; the change makes the gate match that sentence for every verbatim copy, so no spec text becomes
  false. The logic pages remain the known exception (#226).
- Smell baseline: no hit.
- **Class-level check** ("an exemption keyed on file type also exempts tooling of that type"). All 52 files
  under `docs/prototypes/` with an exempt extension were enumerated from
  `git ls-files --cached --others --exclude-standard` and read, with Chinese line counts and byte counts
  recorded (`rerun-2026-10-21/exempt-by-extension.tsv`):
  - 4 are verbatim skill copies, now named;
  - 2 are this project's registries addressing the reviewer (`manifest.js`, `dimensions.js`), exempt;
  - 2 are third-party tooling (`vendor/marked.umd.js`, `vendor/mermaid.min.js`) with no Chinese;
  - 41 are prototype content: 13 mockup pages, 17 shared mockup components in `_shared/`, the skills
    fixture, and the logic prototypes' 3 `logic.js`, 4 `.mmd` and 3 derived `model.mmd.js` files;
  - 3 are the logic pages, which hold the template's chrome and the prototype content in one file, so no
    file-level predicate separates them. Unchanged since the earlier round; tracked in #226.
- **Refactor item (not done; for the owner's decision):** `SKILL_TOOLING` is a list, so a template the
  skill adds later is exempt again until someone names it here. The comment asks for that, but nothing
  enforces it, and the failure is silent: the gate stays green. Impact: self-harm only. It can hide
  Chinese in one new tooling file, nothing else is affected, and today there is no such file (the hash
  check above). A predicate could replace the list: the four listed copies carry the header "copied from
  the prototype skill's template", and no other file under `docs/prototypes/` does (`sync-mmd.mjs`
  words its header differently). But the skill does not require that header, so keying the gate on it
  needs the skill to make it a rule first. Recommendation: a separate issue, deciding in skillshed whether
  the header becomes a rule, and then switching the gate to it. **Decision (owner, 2026-10-21): a separate
  issue, [#296](https://github.com/aloong-planet/agentshed/issues/296).** It also carries the step-6
  check's observation O3: an entry that matches no file is never reported.

## Second pass — the regression test (2026-10-21)

- Version: 39f9763 plus the uncommitted `scripts/check-lang.test.mjs` and the `check:lang` script in
  `package.json`, committed together with this section.
- Scope: the new test file and the script change. The step-6 check's finding F1 led to them, and the owner
  chose to add the test in this pull request. The gate itself is unchanged since the first pass.
- **① Underlying premises — no finding.** Each statement in the new comments was checked against the gate's
  code, and each held:
  - The gate lists files with `git ls-files` in its working directory and reads them relative to it, so a
    temporary repository controls the file set. Its imports resolve relative to the gate's own location:
    the test runs it from a temporary directory and it loads `typescript`.
  - A rule that matches no file is reported as dead. That is why every case needs the seeds.
  - The permitted count counts only lines read from matched files. So 8 → 9 shows the file was read.
- **② Runnability — no finding.**
  - Each case removes its temporary repository in a `finally` block.
  - The gate is spawned with `process.execPath`, and the exit code comes from `spawnSync`.
  - The problem check `<file>:2 ` ends in a space, matching the gate's `<file>:<n>  <line>` format. So it
    cannot match `:20`.
  - `git add -A` needs no Git identity, since nothing is committed.
  - Ten cases took 2.4 s.
  - The test file holds no Chinese of its own: the gate's pattern finds 0 lines. In the repository's own run
    the gate therefore skips it, and it does not need an exemption.
- **③ Security — no finding.** The test writes only inside directories it creates under the system's
  temporary directory, and it removes them.
- **④ Consistency — one smell answered.** The structure follows `scripts/check-raw-nul.test.mjs`, and the
  script follows `check:nul`, which runs its test before the gate.
  - Smell baseline: duplicated code. Both gate tests carry a temporary-repository helper. Exempt: the
    helpers differ in what they stage and what they seed. A shared helper for two small files is
    speculative generality. The existing test keeps its helper inline, and this one does the same.
  - The seeds tie the test to the gate's rule set. A changed rule fails the seeds-only case loudly, naming
    the rule, so it cannot pass silently. The file's header and the design review record this.

## Outside this ticket (reported 2026-10-12; both still open on 2026-10-21)

| Finding | Impact | Recommendation | Decision |
|---|---|---|---|
| Logic pages carry the logic template's chrome in Chinese (3 files) | Only the prototype reviewer sees it, when opening those three logic prototypes. `check:lang` cannot see it, so nothing will ever report it | A separate issue: rewrite the chrome strings to the template's current English wording and keep the prototype content as it is, with a render check of each page | Separate issue: [#226](https://github.com/aloong-planet/agentshed/issues/226) |
| The gallery shell's fold controls use character icons (`⟨⟨`, `☰`); the logic template does too (`⌂`, `↺`) | Prototype tooling only, never the product. Both come from the skill templates, so a change belongs to skillshed, not to agentshed's copies | Do not change | Fix in the templates: [zhoulf1006/skillshed#16](https://github.com/zhoulf1006/skillshed/issues/16) |
