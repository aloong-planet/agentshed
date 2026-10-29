# Project detail — test review: CONTEXT.md read from docs/ (project-detail::REQ-003)

No ticket: spec-driven work inside aloong-planet/agentshed#337. Scope: project-detail::REQ-003/AC-01 and AC-02 and
REQ-003's failure modes, plus the existing tests whose fixtures place CONTEXT.md at a project root.

## Design review

Date: 2026-10-29. Implementation version: cdf19b3 (the spec edit for REQ-003 uncommitted on top).

### Test design table

| Test | Spec item | Seam | Input that drives the branch | Assertion and source of the expected value | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|
| U1 new: both a root and a `docs/` CONTEXT.md | REQ-003/AC-01, failure mode "both files" | `readArtifacts(projectPath)` (providers, ADR-0002's fixture seam) | `docs/CONTEXT.md` titled "Docs glossary" and a root `CONTEXT.md` titled "Root glossary" | exactly one `context` entry, titled "Docs glossary", its path under `docs/`; literals from the fixture, per the AC's text | agentshed's own layout after the move (`docs/CONTEXT.md` beside `docs/adr/`, `docs/specs/`) | none (a temp directory, milliseconds) |
| U2 new: a root CONTEXT.md only | REQ-003/AC-01 second clause, failure modes "root only" and "no `docs/`" (B7) | same | a root `CONTEXT.md` and no `docs/` directory | `[]`; from B7 and the failure mode's text | the shape every project had before the move (the six other repositories today) | none |
| U3 modified: the six types | REQ-003/AC-01 and AC-02, B1, B3, B5, B6 | same | the existing fixture with CONTEXT.md moved to `docs/CONTEXT.md` | unchanged: type order by time, the context title "Glossary", README excluded | agentshed's layout | none |
| E1 modified: the demo project's CONTEXT.md and the config-card link probe (app.spec.ts) | REQ-003/AC-01 at the user path; R3 | e2e, existing case | the demo's CONTEXT.md under `docs/`; the CLAUDE.md link `./docs/CONTEXT.md` | unchanged: the reader opens with "Ladder h2"; "missing doc" still raises the notice | agentshed's layout | the case's existing Electron launch, unchanged |
| E2 modified: an artifact removed after the scan; an artifact reopened from cache (app.spec.ts) | B9 | e2e, existing cases | the fixture's CONTEXT.md under `docs/` | unchanged | agentshed's layout | existing launches, unchanged |
| E3 modified: startup restore (startup-restore.spec.ts) | REQ-001/AC-05; R1 | e2e, existing case | the fixture's CONTEXT.md under `docs/`, the symlink swap on the same path | unchanged | agentshed's layout | existing launch, unchanged |

### Dimension 1: Coverage

REQ-003's boundaries against the table: root only → U2; both files → U1; no `docs/` → U2 (B7, root file
included); a link to a root CONTEXT.md gets R3's notice → covered by composition: U2 shows a root file is not
listed, and E1's existing "missing doc" probe shows an unlisted relative link raises the notice without
navigating (the allow-list has no per-type branch); a page saved before the change lists a root entry until
revalidation → REQ-001/AC-03's existing restore case covers a restored page replaced by current data, and the
artifact list is replaced whole, with no artifact-specific branch. AC-02 → U3 and the existing prototype, README
and fallback-title cases. Result: no gap.

### Dimension 2: Case design

Each case runs through the public `readArtifacts` or the app's own UI, builds its state with real files in a
fresh temp directory, and asserts the returned entries or the visible reader. No bypass of the interface, no
state unreachable through the public path. Result: no finding.

### Dimension 3: False greens

Mutation testing: per the project capability declaration, mutation-testing is not enabled, so it is skipped.
When each goes red: U1 when the root file is read (two context entries, or the root title); U2 when the root
file is read (one entry instead of none); U3 when `docs/CONTEXT.md` is not read (no context entry, title
assertion fails). Expected values are fixture literals, not recomputed; `readArtifacts` is the live path the
detail provider calls. Result: no finding.

### Dimension 4: Resource reuse

The unit cases use one temp directory per case, built and removed in milliseconds: not an expensive resource.
The e2e cases keep their existing launches; no case and no launch is added. Result: no finding.

### Findings

No findings.

### Increment after the post-implementation check (2026-10-29)

From findings F1–F3 of the post-implementation check below. Rows changed or added:

| Test | Spec item | Seam | Input that drives the branch | Assertion and source of the expected value | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|
| U2 (source corrected) | REQ-003/AC-01, failure mode "no `docs/`" (B7, a root CONTEXT.md included) | `readArtifacts(projectPath)` | a root `CONTEXT.md` and no `docs/` directory | `[]`; from B7 and the failure mode's text | a project with no `docs/` at all (B7's own case), not the layout of the repositories still to move | none |
| U4 new | REQ-003/AC-01, failure mode "root only": no CONTEXT.md artifact, the other artifacts as before | same | a root `CONTEXT.md`, `docs/adr/0001-first.md`, `docs/specs/shot.md` and `docs/ops/runbook.md`, no `docs/CONTEXT.md` | types and titles of adr and specs only, no `context`; fixture literals per the failure mode's text | beadmaster today: a root CONTEXT.md, `docs/` holding adr, features, ops, prototypes and specs, no `docs/CONTEXT.md` | none |
| E3 (step removed) | — | — | the step "a current detail listing retires the old exact artifact registration" deletes the file before asserting the refusal, so it cannot go red (F2); E4 replaces it | — | — | — |
| E4 new: startup-restore.spec.ts | REQ-003 failure mode "a page saved before this change lists a root CONTEXT.md until its background revalidation replaces the list", on the allow-list side; R1; REQ-001 (a restore authorizes no new read) | e2e over IPC (`readArtifact`, `getProjectDetail`, `getStartup`) | run 1 opens the project, then returns to the Agents page, so the app writes its display cache listing and registering `docs/CONTEXT.md`; between runs the cache's path is rewritten to the root `CONTEXT.md` and the file moved there, keeping `docs/adr/0001-first.md`; run 2 waits for the first scan to finish and stays on the Agents page | the cache holds the docs path before the rewrite; after the first scan and before any detail read `readArtifact(root)` returns the body (the registration restored from the saved page survives the scan); after `getProjectDetail` its artifacts do not include the root path and `readArtifact(root)` rejects with `artifact-not-whitelisted` while the file is still on disk; literals (the body text, the error code as a string) | the cache is the one this build writes, with the one path the build before REQ-003 wrote in its place (`artifacts.ts` at cdf19b3 listed `<project>/CONTEXT.md`); the project layout is beadmaster's | two Electron launches in the case, the restart being the behaviour under test, as in E3 |

Dimension 1 (Coverage), the changed lines: "root only" → U4; "no `docs/`" → U2; "a page saved before this change lists a
root CONTEXT.md until revalidation" → E4 on the allow-list side, and REQ-001/AC-03's restore case on the display side;
"a link to a root CONTEXT.md gets R3's notice" → covered by the renderer's admission of listed files only (md-links.ts
and its unit test), U1 and U4 (a root file is not listed, with and without `docs/CONTEXT.md`), and E1's "missing doc"
probe (the notice on the user path). No gap.

Dimension 2 (Case design), the new rows: U4 runs through `readArtifacts`; E4 runs through the app's own cache writer, its
IPC channels and a real restart; the only state built by hand is the rewritten path, which is the exact value the
previous build wrote. No finding.

Dimension 3 (False greens), judged on the design: U4 goes red when a root CONTEXT.md is read while `docs/` exists without
one (a `context` entry appears) or when the other types stop being read; E4 goes red when the restored registration is
not honoured (the first read fails), when the current listing does not retire it (the second read returns the body),
or when the current rules list the root file again (it is registered again and readable). The guard on the cache's
content makes a rewrite that matched nothing fail instead of passing silently. No finding.

Dimension 4 (Resource reuse): U4 uses its temp directory; E4 adds one case with two launches, each with its own home and
user data, as E3 does; nothing shared across the process is cleared. No finding.

Findings of the increment: none.

Revision of E4 after its first run (gate-fix-1.log, the case red at its last assertion, "the first scan is still held"): the
row assumed the current detail could be read while the first scan is held, but the detail channel waits for the first
live scan (src/main/index.ts:297), so the current listing always comes after it. The row now waits for the first scan
itself and reads the root file once after it and before the detail: that read shows the saved registration survives
the scan (the scan drops a saved project scope only for a project no longer live, index.ts:245), so the refusal after
the detail is the detail listing's. Dimension 3 for the revised row: it goes red when the saved registration is not
honoured or is dropped by the scan (the first read is refused), when the current detail lists the root file, or when
its listing does not retire the admission (the second read returns the body); the poll on the startup status is the
asserted expression itself. Dimensions 1, 2 and 4 unchanged; the second launch no longer delays its scan. No finding.

Hand-over self-check of the fix (items 2–5): item 2 — every new assertion has its red case stated in Dimension 3 above
(U4 when a root file is listed or the other types are not read; E4 when the restored admission is not honoured, when
the current detail lists the root file, or when it does not retire the admission, and the cache guard when the rewrite
matches nothing); none compares a value with itself, none can go unexecuted. Item 3 — no product function changed; the
case-local helpers `read` (both its return and its throw are driven) and `inJson` (one path). Item 4 — U4 follows
beadmaster's layout; E4 uses the cache the app wrote, with one path set to the value the previous build wrote. Item 5 —
no shared test helper changed. No finding.

## Post-implementation check

Date: 2026-10-29. Implementation version: d7c364d (range cdf19b3..d7c364d, one commit). First round, not an
incremental check. Scope: the tests the range adds or changes — U1, U2, U3 (`src/main/providers/artifacts.test.ts`),
E1, E2 (`e2e/app.spec.ts`), E3 (`e2e/startup-restore.spec.ts`) — against project-detail::REQ-003 and its failure modes.
No ticket, as in the design review. Project capabilities were read from `capabilities.toml` with Python's `tomllib`:
`mutation-testing` is declared `enabled = false`; `lint` and `e2e-suite` are enabled.

### Run evidence

Source: `docs/.workings/project-detail/gate-pre-review.log`, the handed pre-review run (2026-10-29T13:34:34Z), read in
full; nothing was rerun.

- Version: `git rev-parse HEAD` is cdf19b3, and the version list names 10 paths with their `git hash-object` values.
  Each value equals `git rev-parse d7c364d:<path>` (AGENTS.md, README.en.md, README.md,
  docs/.workings/context-glossary-only/tasks.md, docs/CONTEXT.md, docs/specs/project-detail.md, e2e/app.spec.ts,
  e2e/startup-restore.spec.ts, src/main/providers/artifacts.test.ts, src/main/providers/artifacts.ts). The commit's
  other four paths are under `docs/.workings/project-detail/`, which `.gitignore:4` ignores
  (`git check-ignore --no-index -v`), so `git status --porcelain --untracked-files=all` cannot list them. One of them is
  the log itself, and no reviewed test reads any of them. The log therefore tests d7c364d.
- Commands: 12 sections (typecheck, lint, test, test:scripts, test:site, check:ui, check:lang, check:i18n, check:nul,
  `electron-vite build`, `playwright test e2e/app.spec.ts e2e/startup-restore.spec.ts`, smoke), each with its full
  output and `exit code: 0`, then `overall: 0`. Every part of `pnpm verify` is present. Nothing is skipped, because the
  change edits test files.
- The reviewed tests in that run: `artifacts.test.ts (8 tests) 38ms`, which holds U1 to U3; Playwright #44
  app.spec.ts:2926 (E1), #89 app.spec.ts:6205 and #91 app.spec.ts:6252 (E2), and #98 startup-restore.spec.ts:10 (E3).
  All passed.

Result: the log has every item that full-verification-gate.md requires, and its version matches the handed range.

### Test design table against the written tests

| Row | Written test | What was compared (seam, input, assertion, expected-value source, fixture, resources) | Matches the table |
|---|---|---|---|
| U1 | artifacts.test.ts:43 | `readArtifacts(proj)`; `docs/CONTEXT.md` "# Docs glossary" (mtime 200) beside a root "# Root glossary" (mtime 300); the context titles are `['Docs glossary']` and the entry's `file` is `<proj>/docs/CONTEXT.md`; fixture literals; a temp directory per case | yes |
| U2 | artifacts.test.ts:87 | the same seam; a root `CONTEXT.md` and no `docs/`; `toEqual([])`; a temp directory | the case does; its fixture-shape source does not (F1) |
| U3 | artifacts.test.ts:51 | the same seam; the six-type fixture with `docs/CONTEXT.md`; the type order, title "Glossary" and README exclusion are unchanged | yes |
| E1 | app.spec.ts:2926 (fixture 2969–2979, assertions 3316–3333) | the demo's `docs/CONTEXT.md`; the CLAUDE.md probe links `./docs/CONTEXT.md`; the reader shows "Ladder h2" from the row and from the link; "missing doc" raises the toast; one launch (app.spec.ts:3035) | yes |
| E2 | app.spec.ts:6205, app.spec.ts:6252 | `docs/CONTEXT.md` fixtures; assertions unchanged; one launch each | yes |
| E3 | startup-restore.spec.ts:10 (fixture 30–31, allow-list steps 118–128 and 215–218) | `docs/CONTEXT.md` fixture and symlink swap on that path; assertions unchanged; two launches, where the restart is the behaviour under test | yes; the step at 215–218 is F2 |

Test file headers: the range changes only the artifacts.test.ts header, to name REQ-003. No gap note was added, and
none is needed: every path this round leaves undriven (F1, F2) can be driven at a seam the suite already has.

### Dimension 1: Coverage

REQ-003's failure modes, checked one by one against the written tests:

- A root CONTEXT.md only ("lists no CONTEXT.md artifact and its other artifacts as before"): not driven. See F1.
- Both files: U1.
- No `docs/` (B7), even with a root CONTEXT.md: U2.
- A link to a root CONTEXT.md gets R3's notice: covered through other tests. The renderer admits a relative link only
  when `readable.includes(abs)` (md-links.ts:45), and `readable` is the detail's artifact files (DetailPane.tsx:760,
  DetailPane.tsx:832). md-links.test.ts:39 drives the refusal of an unlisted target. U1 shows that a root file is not
  listed when `docs/` exists. E1's "missing doc" probe (app.spec.ts:3331–3332) shows the notice on the user's path. The
  checklist cites another test for this failure mode. See F3.
- A page saved before the change lists a root CONTEXT.md until revalidation replaces it. On the display side this is
  covered through other tests: a restored project detail and a restored session page both go through `displayQuery`
  and `hydrateDisplayQueries` (project-detail-query.ts:32, display-queries.ts), and neither has an artifact-specific or
  kind-specific branch on success. startup-restore.spec.ts:10 drives a restored page, the session page, that current
  data replaces. On the allow-list side (R1: after revalidation the root file must not be readable), the only guard is
  startup-restore.spec.ts:215–218, and it cannot fail. See F2.
- AC-02: U3, plus the existing prototype, README and fallback-title cases.

Fixture shapes against real data: seven local repositories have a root CONTEXT.md — beadmaster, media-creator,
Transfer, Transfer-rs, vlm-snapper, codex-weixin and fuse-bead-pattern-generator. Every one of them has a `docs/`
directory with other artifact directories (adr, specs, features, prototypes, or some of these), and none has a
`docs/CONTEXT.md`. No reviewed fixture has that shape. See F1.

Result: F1, F2 and F3.

### Dimension 2: Case design

All six run through `readArtifacts` or the app's own UI and IPC. They build state from real files in fresh temp homes
and user-data directories, and they assert the returned entries or the visible reader and toast. None goes around the
interface, and none builds a state the public path cannot reach. Result: no finding.

### Dimension 3: False greens

Mutation testing: per the project capability declaration, mutation-testing is not enabled, so it is skipped. Below, each
test's red cases are answered from artifacts.ts:12–13 and the fixture literals:

- U1 goes red when the root file is listed (two context titles, or "Root glossary"), when `docs/CONTEXT.md` is not
  read (no titles), or when the entry's path is not under `docs/`. It stays green when the root file is read only as a
  fallback for a missing `docs/CONTEXT.md` (F1).
- U2 goes red when a root CONTEXT.md is read in a project with no `docs/`. It stays green when that read is gated on
  `docs/` existing (F1).
- U3 goes red when `docs/CONTEXT.md` is not read (`context` disappears from the type list, and the title assertion
  fails).
- E1 goes red when `docs/CONTEXT.md` is not listed (the "Context ladder" row is missing, so the click times out), when
  the `./docs/CONTEXT.md` link is not admitted (no reader shows "Ladder h2"), or when the "missing doc" link raises no
  toast.
- E2 goes red when `docs/CONTEXT.md` is not listed (the "Doomed" and "Cached artifact" rows are missing), when a read
  failure opens the overlay or shows no toast, or when a reopen is not served from cache.
- E3 goes red when the restored row "Saved artifact" or its body is missing, when the arbitrary path is admitted
  (line 123), or when a restored admission follows the symlink swap (line 127; the scan is still held, so the
  admission is the restored one). Line 218 cannot go red on what its comment states (F2).

The other forms: there is no tautology, because the expected values are literals. `readArtifacts` is a live path, called
from project-detail.ts:81. No case skips itself on a condition. No assertion can go unexecuted: `contexts[0]` follows
the titles assertion, and `find(...)?.title` fails on `undefined`. For the browser assertions, checked against
review-code's false-greens list: the reader text and the toast are effects, not mere presence, and the auto-retrying
expects read the final state. The one "X does not happen" assertion (startup-restore.spec.ts:218) never lets X
happen. Result: F2.

### Dimension 4: Resource reuse

These counts come from the log unless a line says otherwise:

- Unit cases: each case gets a temp directory (artifacts.test.ts:22–29), and the whole file ran 8 tests in 38 ms. That
  is not an expensive resource.
- Build output: one `electron-vite build` per run (log lines 565–589; three bundles, 891 ms + 43 ms + 530 ms), done
  before Playwright and shared by every case.
- The quiet Electron copy: e2e/global-setup.ts makes it once per Playwright run, and the script is idempotent.
  It writes nothing to the log.
- Neither of these two is removed by any test. A search of `e2e/` and `src/` for `out/`, `electron-quiet` and
  `ELECTRON_OVERRIDE_DIST_PATH` finds only global-setup.ts setting the path.
- Electron launches are counted from the code, because the log has no output per launch: E1 has 1, each E2 case has 1,
  and E3 has 2, where the restart is the behaviour under test. Each launch gets its own home and user-data directory.
  Case #89 took 757 ms including its launch, so a launch costs under the 1-second threshold. The range adds only
  `mkdirSync` lines to these cases.
- No case clears a resource shared across the process, so no count depends on execution order, and no collection was
  needed.

The table's resource column ("none"; "existing launches, unchanged") agrees with these counts. The build and the
Electron copy, which the table does not name, are made once per run and do not grow with the number of cases. Result:
no finding.

### Document sync

Range checked, with hidden and ignored files listed: `docs/.workings/project-detail/` (`ls -la`; checklist.md,
gate-pre-review.log, review-code.md and review-tests.md, all read in full) and
`docs/.workings/context-glossary-only/tasks.md`, read in full. Also checked: `docs/specs/project-detail.md`, read in
full; the headers of the three test files; and `docs/features/project-detail.md` and `docs/features/README.md`, which
were searched for CONTEXT.md.

Excluded:

- `docs/features/`: it states product behaviour, and these findings change none.
- `docs/adr/` and `docs/CONTEXT.md`: they make no statement about test coverage.
- README.md, README.en.md and AGENTS.md: the range changes them only for the new path, and they carry no test
  statement.

The statements each finding affects are listed under that finding. The checklist's "Current verification" rows still
read "Not run yet"; filling them in belongs to the main agent's closeout and is not part of this check.

### Findings

**F1. No test drives a root CONTEXT.md beside a populated `docs/`; U2's fixture claims a real shape it does not
have.** Category: a regression the tests would miss, and an untrue record.

- REQ-003's failure mode says that a project whose CONTEXT.md is still at its root "lists no CONTEXT.md artifact and
  its other artifacts as before".
- No test puts that input in front of the code:
  - U2 has no `docs/`.
  - U1 also has `docs/CONTEXT.md`.
  - U3 and E1 to E3 have `docs/CONTEXT.md`.
  - No other test writes a root CONTEXT.md: a search of the whole repository finds only artifacts.test.ts:45 and
    artifacts.test.ts:88.
- So a reader that falls back to the root file whenever `docs/` exists without `docs/CONTEXT.md` passes all six
  reviewed cases and the rest of the suite. One example is `if (!existsSync(docs)) return []` together with
  `existsSync(docsCtx) ? docsCtx : rootCtx`. Yet it lists a root CONTEXT.md for every project not yet migrated.
- That is the real shape: each of the seven local repositories with a root CONTEXT.md has a populated `docs/` and no
  `docs/CONTEXT.md` (Dimension 1).
- The design review attributes U2's fixture to "the shape every project had before the move (the six other
  repositories today)". U2's fixture, which has no `docs/`, does not have that shape.

Fix:

- Add a case with a root CONTEXT.md beside a `docs/` that holds other artifacts and no `docs/CONTEXT.md`. Assert that
  no `context` entry is listed and that the other artifacts are listed as before.
- Enter it in the Test design table, with those repositories' layout as its fixture source, and review the row before
  writing the case.
- Correct the design review's U2 fixture-shape source, its Dimension 1 line "root only → U2" and its "Result: no gap".

Documents to sync:

- The REQ-003/AC-01 row of checklist.md's "Spec → tickets → verification", so that it names the case with `docs/`
  present.
- tasks.md Round 3, "two new unit cases (… root only → nothing)", if the set of cases changes.

**F2. E3's step "A current detail listing retires the old exact artifact registration" cannot go red.** Category: a
false green in a changed test, and a regression the tests would miss.

- startup-restore.spec.ts:216 deletes `docs/CONTEXT.md`, line 217 fetches the detail, and line 218 asserts
  `denied(artifact)`.
- `denied` returns true on any throw (lines 120–122). With the file gone, `readArtifact` throws whatever state the
  registration is in:
  - a retired path fails admission (index.ts:430);
  - a path still registered from the restore fails `regularTarget` (index.ts:433);
  - a path registered live fails `readFileSync` with ENOENT (index.ts:434).
- So the step never checks that the current listing replaced the restored scope, which is `readRegistry.replace` for
  owner `project:<path>` at index.ts:306.
- No other test reaches artifact admission over IPC. A search of the whole repository for `readArtifact` finds no
  other test that calls the channel. read-registrations.test.ts tests the registry class, but not the handler's owner
  key.
- REQ-003 makes this case common. A page saved before the update lists and registers the root CONTEXT.md, and the file
  stays on disk after revalidation drops it from the list.
- If the retirement regressed, that file would stay readable, contrary to R1 and to REQ-001's rule that a restore
  authorizes no new reads, and no test would go red. Two ways it could regress: the live scope is added instead of
  replacing the restored one, or the live owner key differs from the persisted one.

Fix:

- Assert the refusal on a path that is still on disk after the current listing drops it. For example, seed a saved
  display cache, as startup-restore.spec.ts:253 does, whose project detail lists and registers a root CONTEXT.md with
  the file present. Then, after the current listing, assert that `readArtifact` on that file is refused with
  `artifact-not-whitelisted`. This also drives REQ-003's saved-page failure mode on the allow-list side.
- Take the seeded cache's shape from a cache that the build before REQ-003 actually wrote.
- Enter the case in the Test design table (the E3 row, or a new row) and review it before writing it.

Document to sync: the saved-page line in the design review's Dimension 1, which should name the new case for the
allow-list side.

**F3. The checklist cites a test that cannot support the failure mode "a link to a root CONTEXT.md".** Category: an
untrue record.

- checklist.md:29 maps "REQ-003 failure modes: link to a root CONTEXT.md → R3 notice" to "the e2e configuration link
  probe now targets `./docs/CONTEXT.md` and opens the reader".
- That probe (app.spec.ts:3326–3327) follows a link to the listed `docs/CONTEXT.md` and asserts that the reader opens:
  the opposite outcome, on another path. It cannot show that a root link gets the notice.
- The support is the set of tests listed in Dimension 1: md-links.ts:45, DetailPane.tsx:760 and :832,
  md-links.test.ts:39, U1, and the "missing doc" probe at app.spec.ts:3331–3332.

Fix: rewrite that row's planned verification to cite this evidence. No new test is needed, because together these tests
cover the failure mode.

Document to sync: checklist.md only.
