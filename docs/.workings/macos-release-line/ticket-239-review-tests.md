# Test review — ticket #239

Ticket: [#239 Launch v0.1.0-beta: the first pre-release, the live landing page and the README](https://github.com/aloong-planet/agentshed/issues/239)
· feature `macos-release-line` · specs [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md)

## Design review

- Date: 2026-10-19
- Version: implementation starts from bedc384 (`origin/main`), branch `feat/launch-beta`
- Scope: every verification this ticket plans. It writes or changes no test: the change is a version string, the
  READMEs' copy and documents, and the release itself, which only real runs and checks can show

### Test design table

No new or changed test. Each unit's behaviour either has its test already or is shown only by a real run:

| What changes | Why no test is written | What verifies it |
|---|---|---|
| The package version 0.1.0-beta | Consumed by code whose tests already cover a pre-release version: the tag check (`release-tag.test.mjs`: `v0.1.0-beta.2` against `0.1.0-beta.2`, and the mismatches), the packaging, and at run time `app.getVersion()` — the settings page's version row, the accounting stamp, the updater's channel (`update-source.test.ts`: `0.1.0-beta` allows pre-releases) and the run-version record — plus the e2e cases that read the running version. A test of the literal in `package.json` would only restate it. (The first version of this row listed the tag check, the updater and the run-version record only; the post-implementation check found the runtime readers it left out, among them the settings version row that the e2e QR-001/AC-02 measures) | The tag check run by hand (accepts `v0.1.0-beta`, refuses `v0.1.0`: `evidence/ticket-239/tag-check.txt`); the full gateway, whose e2e QR-001/AC-02 is the check that caught this version's effect (red on 5b63b16 in French and Japanese, green on c5f44b9 in Chinese and English); the verification run and the tag's run, whose tag check fails before Apple on a mismatch (Failure A1) |
| The READMEs' instructions | Copy. Its languages are a gate's subject, not a test's | `check:lang` holds `README.en.md`'s language, shown red under a planted Chinese word (`evidence/ticket-239/check-lang-readme-plant.txt`). The Chinese README's rule can never go red (a localisation permits everything it matches), and the instructions themselves in both READMEs are held by the code review's README contract check, not by a gate. (The first version of this row said each README was held in its own language) |
| The landing-page feature entry, the specs' Pending notes, the specs index | Documents | Step 8's cross-regression |
| The first pre-release | Only a release tag exercises Apple, GitHub and the published files end to end (`macos-signing.md` §9) | The verification run on the branch, the tag's run, the independent check of the downloaded artifacts (§7), the live page read in a browser, the first launch from a browser download |

### Coverage

| Unit | Mechanism |
|---|---|
| mac-distribution::US-001/AC-01 | Evidence: a browser download of the published DMG, opened, dragged, launched; a screenshot of the notice's wording (Failure D1) |
| mac-distribution::US-001/AC-02 | Gate: the asset validates the `.app`'s stapled ticket; Evidence: the first launch with the network off |
| mac-distribution::US-001/AC-03 | Gate: the DMG gate (stapler, hdiutil, spctl); Evidence: the independent check of the downloaded DMG |
| mac-distribution::US-002/AC-02 | Test: the static workflow test (existing); Evidence: the `v0.1.0-beta` run and its release (Pre-release, nothing on R2, no pointer) |
| mac-distribution::US-003/AC-01 | Gate: `check:lang` for `README.en.md`'s language; Evidence: the README change in the release change, checked element by element against the README contract in the code review |
| mac-distribution Failures D2, D3 (drag to Applications; Apple Silicon) | Evidence: the code review's element-by-element README check; the landing page states the same (#237). (Added after the post-implementation check) |
| landing-page Failure A1, its live part (no release exists yet: the page stays in the list state) | Evidence, before any tag: the live page read in Chrome after its script ran — the pointer 404, GitHub's release list empty, the hero's download block identical to the served markup, both languages (`evidence/ticket-239/live-page-before-tag.txt`). (Added after the post-implementation check; once the tag exists this state cannot be observed again) |
| mac-distribution::REQ-001/AC-04 | Evidence: the packaged app's `LSMinimumSystemVersion` (12.0); the README and the page say macOS 12 or later |
| mac-distribution::REQ-005 | Evidence: the published note, written only after the gates and the independent check |
| mac-distribution::REQ-006 | Evidence: the tagged commit's package version |
| landing-page::REQ-001/AC-05 | Test: the site's unit tests (no version constant; existing); Evidence: the live page offers `v0.1.0-beta` with no site change |
| landing-page::CON-001 | Evidence: the live URL serving the site's build |
| The spec headers' Pending notes | Evidence: the landing-page entry and the specs index; mac-distribution's resolved by the owner's choice |

Conclusion: every unit has a mechanism; the gaps are the real runs, which come after the merge.

### Case design

No case is written, so there is nothing to judge here.

Conclusion: not applicable.

### False greens (judged from the design)

The instruments are command-line and browser checks, judged by `review-code/false-greens.md`:

- `spctl --assess` succeeds online whether or not a ticket is stapled, and `codesign` ignores tickets: the stapled
  tickets are decided by `stapler validate`, on the DMG and on the `.app` inside it and inside the ZIP (§7).
- The served HTML is in the list state by design (landing-page::REQ-001/AC-04): reading it with `curl` cannot show
  the test state. The live page is read in a browser after its script ran, the hero's text read back from the page.
- A first launch from Terminal (`open`) or of an app without the quarantine attribute shows no notice at all: the
  launch evidence comes from a browser download, opened from Finder.
- The verification run cannot show publishing: the publish job does not run in that tier (C4). Only the tag's run
  shows the release, its Pre-release mark and the untouched R2.
- `check:lang` was shown to read the READMEs: a planted Han word turns it red at that line.

Conclusion: no finding; each instrument has the input that would turn it red named.

### Resource reuse

No expensive resource: no test runs here.

Conclusion: no finding.

## Post-implementation check

- Date: 2026-10-21
- Ticket: [#239](https://github.com/aloong-planet/agentshed/issues/239) · feature `macos-release-line`
- Version: the ticket's own change, `git diff b3cb0f5 3064371` on branch `feat/launch-beta`: commits 5b63b16 and
  5f05fa4, the merge c5f44b9 of main at b3cb0f5 (#295), and 3064371. Between c5f44b9 and 3064371 only three working
  records change (`git diff --stat c5f44b9 3064371`). The full gateway ran on c5f44b9
- Scope: first round (no fix range was handed over): the written tests against the test design table, every
  false-green check, and the runtime count of expensive resources; coverage checked against the units the coverage
  checklist assigns to #239 and against the two specs' Failure modes and boundaries
- Executed by an independent sub-agent that does not inherit the implementation conversation. It ran no test and
  made no temporary change to the repository

### Run evidence

The handed gateway log (the session scratchpad's `verify239.log`, 585 lines, summarised in
[gateway-c5f44b9.txt](evidence/ticket-239/gateway-c5f44b9.txt)) holds every command, since pnpm echoes each script
with its command line, and each command's output through smoke's `SMOKE_OK` line, with no truncation. It lacks three
of the items `/implement`'s full gateway section requires: the output of `git rev-parse HEAD`; the
`git status --porcelain --untracked-files=all` listing with a `git hash-object` for each listed file; and the exit
code (`VERIFY_EXIT=0` is in the summary and in a separate session file, `verify239.exit`, not in the log). What the
log does show agrees with c5f44b9 without proving it: the package is `agentshed@0.1.0-beta`, QR-001/AC-02 ran for
`zh` and `en` only (a tree with #277 merged), and vitest started at 16:56:09, after c5f44b9 was committed at
16:55:16. The full suite was not re-run here. Finding 1.

### Test design table

`git diff --name-only b3cb0f5 3064371` lists 13 files; none is a test, fixture or test helper (`rg` for `.test.`,
`.spec.`, `e2e/`, `/test/` and `fixtures` over the list: no match). Commit by commit
(`git log --first-parent --name-status bedc384..3064371`), 5b63b16, 5f05fa4 and 3064371 touch no test either. The
table's "no new or changed test" holds, and no test file exists whose header could carry a gap note: the gaps are
the real runs, listed in the Design review's Coverage and in tasks 12-16 of [ticket-239-tasks.md](ticket-239-tasks.md).

| Row | Against what happened | Verdict |
|---|---|---|
| The package version 0.1.0-beta | The cited tests hold pre-release cases as stated: `scripts/release-tag.test.mjs` (`v0.1.0-beta.2` against `0.1.0-beta.2`, the mismatches, build metadata), `src/main/update-source.test.ts:24` (`0.1.0-beta` allows pre-releases), `src/main/run-version.test.ts:19-28`, and `scripts/release-workflow.test.mjs:55` (`v0.1.0-beta` is one of the pre-release tags). The row's list of consumers is shorter than the code's: a search of every code file for version reads (`package.json`, `getVersion(`, `APP_VERSION`, `npm_package_version`) finds the running app's `app.getVersion()` feeding the settings version row through the preload (`src/main/index.ts:612`), the archive's accounting stamp (`:674`), the updater (`:721`) and the run-version record (`:747`), and e2e cases that read the version at run time (`e2e/settings-updates.spec.ts`, `e2e/menu-check-updates.spec.ts`, the stamp in `e2e/app.spec.ts:1609` and `e2e/token-span.spec.ts:228`). The check that caught this change's one regression, e2e QR-001/AC-02 (red on 5b63b16 in French and Japanese, [ready-line-measurements.txt](evidence/ticket-239/ready-line-measurements.txt)), is not in the row | Inconsistent: finding 2 |
| The READMEs' instructions | `check:lang` matches `README.en.md` under a rule that admits language names only, and the planted Han word turned it red at `README.en.md:15`. `README.md` is matched by `ownLocalisation`, which passes any content (`scripts/check-lang.mjs:153-166` says so: it can never go red). The gate checks one README's language, not each README's, and neither README's instructions | Inconsistent: finding 3 |
| The landing-page feature entry, the Pending notes, the specs index | Step 8 is pending (task 10). In the gateway, `check:ui`'s ticket-number rule walked `docs/features` and `docs/specs` and passed | Consistent |
| The first pre-release | The verification run 39232263252 on 5b63b16 was green (task 7); the tag's run, the independent check, the live page and the first launch come after the merge (tasks 12-16) | Consistent; pending |

### Coverage

The units the coverage checklist assigns to #239 (`rg '239'` over [checklist.md](checklist.md), each row read):
mac-distribution US-001/AC-01, AC-02, AC-03, US-002/AC-02, US-003/AC-01, REQ-001/AC-04, REQ-005, REQ-006 and Failures
D1-D4; landing-page REQ-001/AC-05, CON-001 and Failures A1-A8 (A1's live part); the spec headers' Pending notes. The
Design review's Coverage table has all but two:

- mac-distribution Failures D1-D4. D1 is covered under US-001/AC-01 and D4 under REQ-001/AC-04. D2 (drag to
  Applications) and D3 (Apple Silicon) have no mechanism in this record. Both READMEs state them (`README.en.md`
  lines 11 and 14, `README.md` the same lines), and the code review's Consistency section checked each README for
  them: that check is the mechanism, unrecorded here.
- landing-page Failures A1-A8, A1's live part: the site, up before any release, shows the list state. No mechanism
  is named, and the one reading so far, `curl` of the served HTML (the task list's facts of 2026-10-19), cannot show
  it: the served HTML is the list state whatever the script decides, as this record's False greens already notes.
  It can be observed only until the tag is pushed. A2 (only `v0.1.0-beta` exists, so the test state) is the same
  observation as landing-page::REQ-001/AC-05's (task 15), unnamed.

The specs' Failure modes walked for this ticket's scope, with their mechanisms: mac-distribution A1 (the tag check's
tests and the hand run; the tag's run), A2 (the workflow test's pre-release tags), A5 (the release process: task 12
tags the merged commit), A6 (the tag check's tests; `0.1.0-beta` carries no build metadata), C4 (#234's workflow
test; this ticket does not observe it), D1-D4 (above); landing-page A1 and A2 (above), A6 (a rate-limited reader sees
the list state: a red, not a green, for task 15), A7 (see False greens). REQ-001/AC-04's evidence: the code review
cites #235's packaged app; the independent check of task 13 reads `LSMinimumSystemVersion` from the downloaded DMG's
app (`docs/ops/mac-signing.md`, "Checking a package by hand"), the released artifact's own.

Conclusion: two findings (2, 4); the remaining gaps are the real runs after the merge, listed with their checks.

### Case design

No case is written or changed (the enumeration above), so seam, driving input, assertion object, expected-value
source and fixture have nothing to be compared with. The existing cases the table relies on were read for the
coupling red flags: none mocks a project module (`rg` for `vi.mock`, `vi.spyOn`, `vi.doMock`, `vi.stubGlobal`,
`jest.` and `t.mock` over the six test files cited, 48894 bytes read: no match), and `release-tag.test.mjs` drives the
real command in a temporary directory.

Conclusion: no finding.

### False greens

Per the project capability declaration, mutation-testing is not enabled; this item is skipped (`capabilities.toml`
read with Python's `tomllib`: `[mutation-testing] enabled = false`, a well-formed entry).

When each check this ticket relies on goes red:

| Check | Goes red when | Assessment |
|---|---|---|
| `scripts/release-tag.test.mjs` | the check accepts a tag that differs from the version, or refuses a matching pre-release | literals, independent of `package.json`: the version change cannot make them restate themselves |
| `src/main/update-source.test.ts:24` | the channel rule stops matching a `-beta` without a number | holds |
| `src/main/run-version.test.ts:19-28` | a pre-release record compares wrongly | holds |
| `scripts/release-workflow.test.mjs:125` | `v0.1.0-beta`'s publish job is not given `PRERELEASE=true`; line 127 first asserts both tag lists non-empty | holds |
| `site/src/download.test.ts:136`, `site/test/apply-download.test.ts:84` | the version comes from anywhere but the state, or the test state's texts and link change | holds |
| e2e QR-001/AC-02 | a label, the line or the button of the version row wraps with the running version | it went red on 5b63b16 (French, Japanese), so it is sensitive to this version string; green on c5f44b9 (zh, en) |
| e2e stamp cases (`e2e/app.spec.ts:1609`, `e2e/token-span.spec.ts:228`) | the stamp's composition changes | the expected stamp comes from `package.json` as the app's does: they cannot catch a wrong version, which is the tag check's job |
| the tag check run by hand | the version and the tag differ | shown red (`v0.1.0` refused), but its output is kept nowhere: finding 5 |
| `check:lang` on the READMEs | a Han word other than a language name appears in `README.en.md` | shown red at line 15, the output kept only in the session scratchpad: finding 5; `README.md` cannot go red: finding 3 |
| the full gateway | any stage fails | the log does not tie the green to a tree: finding 1 |

The checks still to run, judged from their plan by `review-code/false-greens.md`:

- US-001/AC-02, the first launch with the network off (task 16, "online and offline"): finding 6.
- US-002/AC-02's "nothing on R2, no pointer" (task 12), a claim that something did not happen: finding 7.
- landing-page::REQ-001/AC-05 (task 15): the test state's hero text differs from the served list state, so a reading
  taken before the reads land, or under a GitHub rate limit (A6), reads red, not green. Reading back the hero's label,
  its link and the pill also tells the test state from a formal one. No finding.
- The independent check (task 13): `stapler validate` decides the stapled tickets, as this record's False greens
  says. Agreed.

Conclusion: five findings (1, 3, 5, 6, 7).

### Resource reuse

The table lists no expensive resource, since no test is written, so the full run has nothing to be counted against
it. For the record, the run built the app once for e2e (log lines 404-429) and ran its 144 cases on that build; the
build belongs to the existing suite.

Conclusion: no finding.

### Findings

Each is handed back to the implementer to dispose of; this record is their home until then.

1. **The gateway log does not show the tree or the exit code.** Impact: the green of c5f44b9 cannot be tied to a
   tree, so the delivery's "full gateway passed" rests on the summary's word. Also, `check:lang` and `check:nul` read
   every tracked file (`git ls-files --cached --others --exclude-standard`), the working records included, so their
   result does not cover the records 3064371 changed, nor this section. Recommended: before the pull request, run
   `pnpm verify` once on the commit to be delivered, after the records are final, with a log that carries the HEAD,
   the status listing with each file's hash, each command, the exit code taken without a pipe, and the full output;
   keep it in `evidence/ticket-239/`. Reason: the log is the only evidence of the full run, and only a new run can
   supply what it lacks (the last one took under seven minutes).
2. **The version row names fewer consumers than the code has.** Impact: the table understates what the version
   string reaches: the running app's settings version row (whose layout QR-001/AC-02 measures with the running
   version, and which broke in two languages), the accounting stamp, the updater and the run-version record; the next
   version change (#240's pre-release) would be planned from the same short list. Recommended: rewrite the row to name
   these consumers and the check that verified them (e2e QR-001/AC-02 in the gateway: red on 5b63b16, green on
   c5f44b9), and re-review the row under Design review; also correct the task list's fact that nothing reads the
   package version but the tag check and the packaging. Reason: the table must match what actually verified the
   change.
3. **`check:lang` checks only the English README.** Impact: the Chinese README's language, and both READMEs'
   instructions (the substance of US-003/AC-01), are guarded by no gate; they rest on reading. Recommended: amend the
   table row and the Coverage row for US-003/AC-01: `check:lang` covers `README.en.md`'s language; `README.md` and the
   instructions in both are verified by reading (the code review's README contract check). No new gate. Reason: a
   gate named as a mechanism must be able to go red on what it is named for.
4. **Two units #239 owns are missing from the Coverage table.** Impact: D2 and D3 have a mechanism this record does
   not name; A1's live part has none, and becomes unobservable once the tag is pushed. Recommended: add both rows (D2
   and D3 to the code review's README contract check, A2 to task 15) and, before pushing the tag, read the live page
   in a browser after its reads land: the requests the page made (the pointer answering 404, GitHub's releases
   answering an empty list) and the list state in both languages, kept in `evidence/ticket-239/`. If the owner judges
   #238's unit tests enough for A1, record that decision in the coverage checklist instead. Reason: the checklist
   assigns A1's live part to #239, and after the tag that state no longer exists.
5. **Two red runs that show the instruments can fail are not kept.** Impact: the hand-run tag check (`v0.1.0`
   refused) is recorded only as prose in the code review, and the planted-word red of `check:lang` only in the session
   scratchpad (`cl-mut.log`), which does not outlive the session; a check never shown red is no evidence.
   Recommended: keep both outputs in `evidence/ticket-239/` (re-run the two read-only tag-check commands with their
   exit codes; copy the `check:lang` output) and cite them from the table. Reason: the Design review's conclusion that
   each instrument has the input that would turn it red depends on them.
6. **The offline first launch could pass without the stapled ticket.** Impact: an earlier online assessment of the
   same build on the same Mac (the online first launch, or `spctl --assess` in the independent check) may leave
   Gatekeeper's verdict, or the ticket it fetched, behind, so a later launch with the network off would pass whether
   or not the app carries its own ticket (false-greens form three, the online fallback). Whether macOS does this was
   not established here; the plan does not rule it out. Recommended: make the offline launch the first assessment of
   this build on that Mac: a fresh browser download with its quarantine attribute present
   (`xattr -p com.apple.quarantine`), the network off before the first open, before any online launch or `spctl` of
   that build; or use a Mac that has not assessed it. Keep `stapler validate` on the downloaded `.app` (task 13) as the
   discriminating evidence of the stapled ticket. Reason: US-001/AC-02 is about the ticket the app carries, which only
   an assessment with no other source can show.
7. **"Nothing on R2, no pointer" has no named observable.** Impact: a 404 from the pointer's URL is also what a wrong
   URL or host gives, so the absence would be shown by a read that cannot tell. Recommended: evidence it with a
   positive observable, the tag's run reporting the mirror and pointer jobs skipped, plus the pointer read at the
   download host with the response headers showing the host answered. Optionally, for landing-page::REQ-001/AC-05's
   "no redeploy", record the served page's hash, or the Pages deployment, before the tag and at task 15's reading.
   Reason: a claim that something did not happen rests on an observable that would have moved if it had.

### Document sync

From these findings and the change (`implement/document-sync.md`): the coverage checklist's Current verification for
#239's units must carry the actual results when the runs happen, and its US-003/AC-01 row still says "Six READMEs"
where the spec now says both. [ticket-239-doc-sync.md](ticket-239-doc-sync.md) still lists six READMEs, a
mac-distribution feature entry the owner decided against, a Pages guide that exists as the site README's "Deploying"
section, and "not started" for work that is done. Task 17 and the Pre-delivery scope re-check are their home; none was
changed here.

## Disposition (main agent, 2026-10-21)

| # | Disposition |
|---|---|
| 1 | The last gateway before the pull request runs on the delivery commit, with the commit, a clean `git status --porcelain` and the exit code captured directly (not through a pipe) at the head of its evidence file |
| 2 | The design table's version row lists the runtime readers and the e2e QR-001/AC-02; the tasks file's fact line is corrected the same way |
| 3 | The design table's README row and the coverage row say what `check:lang` holds (`README.en.md`'s language) and what review holds |
| 4 | Coverage rows added for D2, D3 and Failure A1's live part; the live page read in Chrome before any tag (`evidence/ticket-239/live-page-before-tag.txt`). Its first attempt read wrong twice — the text of an unrendered document runs words together, and a response wait returned before the GitHub answer was recorded — so the kept reading compares the block's markup and waits for the network to go idle, with every request logged |
| 5 | Both reds kept as evidence: `tag-check.txt` (exit 0 for `v0.1.0-beta`, exit 1 for `v0.1.0`) and `check-lang-readme-plant.txt` (exit 1 at `README.en.md:15`, restored identical, exit 0) |
| 6 | The first-launch plan (tasks 13 and 16) requires the offline launch to be that Mac's first assessment of the build: a fresh browser download, its quarantine attribute confirmed, the network off before the first open; `spctl --assess` in the independent check (task 13) is an assessment too, so on that Mac it waits until after the offline launch; the stapled ticket itself is decided by `stapler validate` on the `.app` |
| 7 | The tag-run plan (task 12) takes the mirror and pointer jobs shown skipped as the positive evidence that nothing reached R2, with the download host's response headers beside the pointer's 404 |
