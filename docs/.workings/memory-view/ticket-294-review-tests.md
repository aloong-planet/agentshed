# Test review — #294 (the memory drawer previews Markdown)

Ticket: [#294](https://github.com/aloong-planet/agentshed/issues/294). Spec: [memory-view](../../specs/memory-view.md)
(memory-view::US-001, memory-view::CON-001, sequence E).

## Design review

Date 2026-10-21 · implementation starts from 9b7bb13 (spec update uncommitted) · scope: the tests planned for
memory-view::US-001/AC-01–AC-08, memory-view::CON-001, E1 and E8, and the project-memory main-file path.

### Test design table

| # | Spec item | Seam | Input that drives the branch | Assertion and expected-value source | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|
| U1 | Main file on the readable list (Implementation Decisions); D2 | provider: project detail read over a fixture home | a project with MEMORY.md and a topic; one with topics only; one with no memory | `mainFile` is the main file's entry: name `MEMORY.md`, a path whose file reads back the main body the test wrote, in the topics' directory, and the modification time the fixture set; null with topics only and with no memory. Truth: the content and time the test wrote, not a recomputed path. (Row revised 2026-10-21 when the field became an entry, so the drawer's meta has the main file's time; re-reviewed: same seam, inputs and truths, one more assertion) | existing provider fixture (mkMemory) | none (temp dir per test, existing pattern) |
| U2 | R1: contract validation of the new field | contract validator | a detail with a main-file entry, one with `null`, one with a number, one with a bare path, one with an empty path | both valid shapes pass; the number and the bare path fail naming `memory.mainFile`, the empty path names `memory.mainFile.file`. Truth: the field's declared type | existing validate fixtures | none |
| U3 | ADR-0029's upgrade case for the new field (found in /review-code ①): a project detail saved before `memory.mainFile` existed still restores | display store over a cache file written at the filesystem boundary (the existing corruption tests' seam) | a version-1 cache whose project detail has `memory: { main, topics }` and no `mainFile` — the shape the installed app's own cache holds (checked against ~/Library/Application Support/Agentshed/display-cache.json: detail keys path, skills, subagents, memory, plugins, mcp, configs, stats, artifacts; memory keys main, topics) | the restored reads hold that detail with `mainFile` null and its main text intact; a detail with a malformed `mainFile` is still dropped. Truth: the fixture's text. Must be red first (a bug) | real saved-cache shape | none |
| E-A1 | US-001/AC-01, AC-02, AC-04 | e2e, built app, global Memory section | click the demo project's row, then `pitfalls.md` | title = the project name `demo-proj`; meta = `Claude · pitfalls.md · ` + relative time; bar = `pitfalls.md`; switch present with preview on; card rows include `metadata` · `type: feedback`; `[[other-note]]` text present and not inside a link. Truth: the fixture text and the spec's form | real memory topics: front matter `name`/`description`/nested `metadata.type`, Why/How sections, `[[name]]`, links between files (checked against ~/.claude/projects/*/memory) | the F3 test's existing app launch and fixture home |
| E-A2 | US-001/AC-03 | e2e (same launch) | click raw, then preview | raw body text begins `---\nname: pitfalls`; preview shows the card again. Truth: fixture text | as E-A1 | F3 launch |
| E-A3 | US-001/AC-05 (global) | e2e (same launch) | `second.md` read once first (so the switch lands on text already there) and long enough to scroll; scroll `pitfalls.md` down, click the `Second` link | bar = `second.md`, title still `demo-proj`, preview on, the new body can scroll and its scrollTop is 0, body shows `second.md`'s text. (Row revised in /review-code: with a short or unread `second.md` the top position came from the clamp or the loading placeholder, and removing the reset survived — shown by mutation) | as E-A1 | F3 launch |
| E-A4 | US-001/AC-05 (global, the index) | e2e (same launch) | click the `the index` link in `pitfalls.md` | bar = `MEMORY.md`, body shows the main file's text | as E-A1 | F3 launch |
| E-A5 | US-001/AC-06 | e2e (same launch) | click `Gone` (unlisted); click `Docs` (https) with the main process's browser hand-off replaced by a recorder | toast with the out-of-scope wording; drawer still on `pitfalls.md`; the recorder holds the https URL; window URL unchanged. Truth: the dictionary's en wording, the fixture URL | as E-A1 | F3 launch |
| E-A6 | US-001/AC-07 (failure, empty) | e2e (same launch) | `empty.md` (empty file); `vanish.md` removed after the scan | "Empty file"; "File cannot be read: …"; bar and switch present in both | real shape for empty; removal follows the existing removed-after-scan case | F3 launch |
| E-A7 | US-001/AC-08 | e2e (same launch) | Esc; the close button; the overlay | the drawer is gone after each | — | F3 launch |
| E-A8 | US-001/AC-05 (detail), D6 | e2e (same launch), project detail | click `Pitfalls` in the rendered main file, then `the index` inside the drawer | the drawer opens on `pitfalls.md` with title `demo-proj`; then on `MEMORY.md` | as E-A1 | F3 launch |
| E-A9 | Main file registered for project detail (Implementation Decisions) | e2e (same launch), a second project | `late-proj` registered with only `t.md` (links to MEMORY.md); MEMORY.md written after the first scan; open its detail, topic, link | the drawer shows the late main file's text, not a read failure. Must be shown red with the registration removed (a rescan registering it would make this green on its own — checked by mutation during TDD) | real index-link shape | F3 launch |
| E-A10 | CON-001; E8 | e2e (same launch) | memory drawer and the Subagents drawer at 1400 and 900 wide; the plugin skill drawer in detail | memory drawer width = min(720, 0.8 × pane) and left of it stays inside the pane; Subagents drawer = min(680, 0.8 × pane); memory and skill drawers share the bar's gradient background and title block geometry. Truth: the spec's formulas | — | F3 launch |
| E-B1 | US-001/AC-07 (loading) | e2e, the artifact-reopen case's delayed launch | a topic clicked inside the 600 ms read delay | "Loading…" in the body with the bar present, then the text | as E-A1 (one topic) | the existing delayed launch of "reopening an artifact" |
| E-C1 | E1 | e2e, startup restore | the existing restore flow | the saved memory body shows in the preview body (not a raw block) | existing restore fixture | the existing restore launches |

### Coverage
Every acceptance item of memory-view::US-001 and memory-view::CON-001 has a row; E1 and E8 have rows. Not
tested, with the reason recorded here and in the test file: E2 (two reads in flight — the read is keyed by
file, so the earlier read lands in its own key; no deterministic trigger without a per-file delay seam), E5
(a several-hundred-thousand-character fixture would only re-test the read cap; checked by hand over the
owner's real Codex memory when the #279 screenshot is retaken), E7 (language switch while open — copy
comes from the dictionary the language tests already cover). Truncation in AC-07 rides the existing read
cap; no new fixture. Each row's input reaches its branch: E-A6's vanished file is removed after the scan
listed it, so the read itself fails; E-A9's main file appears only after the scan.
Fixtures: the memory files follow the real shape (nested front matter, `[[name]]`, links to siblings and the
index), not one invented from the spec.

### Case design
No mocks of the project's own modules; every e2e row goes through the built app's public UI. E-A5 replaces
Electron's browser hand-off (a system boundary, not project code) to keep the test from opening a browser;
the assertion is that the hand-off received the URL. No internal state is written; E-A9's late file is a
real file written to the fixture home, reachable as an agent would write it.

### False greens (by design)
- Always-true: none — each assertion names a value the old drawer cannot produce (the old drawer has no bar,
  no switch, no card, no project title).
- Same-algorithm expectations: U1 reads back the content rather than recomputing the encoded path; widths
  come from the spec's formulas.
- Old paths: the old `.drawer .raw` assertions for memory files are replaced, not kept beside the new ones.
- E-A9 is the one at risk (a rescan could register the file first): red-ability is to be shown during TDD.

### Resource reuse
Expensive resource: the built Electron app launch (several seconds each). The plan adds no launch: E-A rows
extend the F3 test's launch, E-B1 extends the delayed launch of the artifact-reopen case, E-C1 is the
existing restore flow. The build itself is produced once per e2e run by the existing script. Unit rows use
the existing temp-directory fixtures.

### Increment after the post-implementation check (2026-10-21)

Rows added or revised in response to findings PC-2 to PC-9, and to the owner's decisions D5 and D6
(memory-view::CON-002). Reviewed before any of these tests is written.

| # | Spec item | Seam | Input that drives the branch | Assertion and expected-value source | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|
| U4 | CON-002; US-001/AC-04 (PC-2) | `renderMarkdown` (the one carrier, jsdom) | `[[pr-merge]](confirm-before-merging)` (a remark with no spaces, as Chinese prose writes one); `[[a]]` alone; `` `[[x]](y)` `` in a code span; `[text](u)`; `[see [[x]]](u)`; `docs/<slug>/x`, `<spec-slug>`, a line holding only `<slug>`; `<b>bold</b>`; `<script>`; `<input>` | the reference and its remark are text, no anchor (red first: a bug); code untouched; real links still links; non-element tags appear escaped as written; `<b>` still bold; `<script>` still stripped; `<input>` still taken as HTML. Truth: CON-002's wording | real memory files: `[[name]](remark)` 10 times in 8 files, `<slug>`/`<id>`/`<spec-slug>` placeholders | none |
| U5 | E4 (PC-5) | `renderMarkdown` | front matter opened with `---` and never closed | no card; the key lines render as body text. Truth: skills-view D1b (a header only counts when closed) | — | none |
| E-A1 (revised) | US-001/AC-01, AC-04 (PC-2, PC-3) | e2e, F3 launch | the topic now also holds `[[pr-merge-needs-confirmation]](remark-without-spaces)` and `docs/.workings/<slug>/` | meta is exactly `Claude · pitfalls.md · today`; both new shapes appear as written and neither is inside a link | real shapes above | F3 launch |
| E-A6 (revised) | US-001/AC-07 (PC-8) | e2e, F3 launch | `vanish.md` | the switch is visible beside the failure, as for the empty file | — | F3 launch |
| E-A10 (revised) | CON-001 (PC-9) | e2e, F3 launch | the memory and skill drawers | the bar's background is exactly a top-to-bottom gradient from the computed page ground (`--bg`) to the computed card (`--card`), resolved through a probe element in the drawer. Truth: the prototype's frame | — | F3 launch |
| E-A11 | US-001/AC-01 for Codex (PC-4) | e2e, F3 launch | a Codex global memory file seeded in F3's home | title `(Codex global memory)`, meta `Codex · consolidated.md · today`, the body rendered | real Codex memory directory shape (top-level `.md`) | F3 launch |
| E-A12 | US-001/AC-07 truncation; E5 (PC-6) | e2e, F3 launch | a 510,000-character memory file | the preview ends with `…(truncated)` and so does the raw text; the drawer keeps its width. Truth: the read cap (500,000) and the dictionary's marker | real Codex memory files run to 430 KB | F3 launch (one extra file write) |

Coverage notes (PC-7): the e2e file header records the gaps that remain — the mode reset when a drawer's file
changes while open has no product path that keeps the drawer open across a file change other than a link, so it
is reached only through AC-05's switch; E2 (two reads in flight) and E7 (language switch while open) stay
untested, with their reasons there.

## Post-implementation check

Date 2026-10-21 · implementation commit 81952cf (range 9b7bb13..81952cf) · ticket #294 · run by an independent
agent that did not inherit the implementation conversation · scope: every test the range writes or changes —
`src/main/providers/memory.test.ts` (two new cases), `src/shared/validate.test.ts` (`okDetail` and the
nullable-field case), `src/main/display-store.test.ts` (one new case), in `e2e/app.spec.ts` the F3 test (:1902), the
Skills view test (:2287), the plugin skill preview test (:2837) and the artifact-reopen test (:4880), and
`e2e/startup-restore.spec.ts` (:8) — checked against every row of the test design table above.

Result: findings PC-1 to PC-9 go back to the main agent. PC-1 comes first: the gate log is tied to no version, and
81952cf as committed fails `pnpm check:lang`. PC-2 is next: a real memory shape breaks AC-04 and no test sees it.

### Run evidence
- Capability declaration, read with a TOML parser (`tomllib`): every registered ID is present and well formed, none
  is unregistered, and `macos-distribution` applies (`client-framework = "electron"`). Per the project capability
  declaration, mutation-testing is not enabled; this item is skipped. "When does it go red" is answered under False
  greens for every test, from the code under test and the expected-value source.
- Full gate: the handed log of `pnpm verify` (typecheck, lint, unit, scripts, site, gates, e2e, smoke — lint and e2e
  run as `capabilities.toml`'s `enforced-by` names them). Every command passes in it, but it lacks items a gate log
  must carry (PC-1). Not re-run here.
- Targeted run of the review objects only, not a substitute for the gate: at HEAD
  `81952cf33052ae15cddf9f61353628bfc359d9de` with `git status --porcelain --untracked-files=all` empty before and
  after — `pnpm -s exec vitest run src/main/providers/memory.test.ts src/main/display-store.test.ts
  src/shared/validate.test.ts`: 3 files, 65 tests passed, exit 0; `pnpm -s build`: exit 0; `pnpm -s exec playwright
  test e2e/app.spec.ts:1902 e2e/app.spec.ts:2287 e2e/app.spec.ts:2837 e2e/app.spec.ts:4880
  e2e/startup-restore.spec.ts:8`: 5 passed (47.0s), exit 0. This build's content-hashed bundle names
  (`index-XxM6wPt_.js`, `index-vYm3GESa.css`, `main-DZ5R1KNi.js`) equal the gate log's, which ties the gate's product
  build to 81952cf's source; it says nothing about the test files the gate ran.

### Coverage

The written tests against the test design table (seam, driving input, assertion, expected-value source, fixture,
resource):

| Row | Written test | Result |
|---|---|---|
| U1 | memory.test.ts: "the main file's path rides beside its content …", "no main file → its path is null …" | Consistent: the path is read back against the fixture's body, the time is the fixture's 1000 ms, null for topics only and for no memory |
| U2 | validate.test.ts: `okDetail` with a main-file entry (admitted at :201), the base state with `null` (:206), the number, bare path and empty path refusals (:276–278) | Consistent; the `name` and `mtimeMs` refusals are not exercised (O-1) |
| U3 | display-store.test.ts: "restores a project detail saved before its memory carried the main file entry" | Consistent: the `mainFile`-less detail restores with null and its text, the malformed one is dropped |
| E-A1 | F3 (3) | Partly: the meta assertion stops at `Claude · pitfalls.md · `; the relative time the row names is not asserted (PC-3) |
| E-A2 | F3 (3) | Consistent |
| E-A3 | F3 (3) | Consistent (also asserts the new meta line) |
| E-A4 | F3 (3) | Consistent |
| E-A5 | F3 (3) `Gone`, (8) `Docs` | Consistent |
| E-A6 | F3 (3) | Partly: the switch is asserted for empty.md only, not for vanish.md (PC-8) |
| E-A7 | F3 (3) | Consistent |
| E-A8 | F3 (6) | Consistent |
| E-A9 | F3 (6e) | Consistent |
| E-A10 | F3 (7) | Consistent in intent: "title block geometry" is compared as the title's computed type and colour and the close box's size and layout, not as measured positions — enough, since both drawers render one FileDrawer |
| E-B1 | artifact-reopen test | Consistent |
| E-C1 | startup-restore test | Consistent: the second launch's 500 ms timeout against its 1000 ms fetch delay can only be met by the restored body |
| (no row) | Skills view, plugin skill preview, the restore test's skill step | Mechanical selector rename `.skill-drawer` → `.file-drawer`; `rg -uu 'skill-drawer\|skill-md\b\|\.skill-md'` hits only `ticket-294-review-code.md` |

The spec's items against the tests:
- Covered: AC-01 for a Claude project, AC-02, AC-03, AC-05 (global and detail), AC-06 for an unlisted and an http(s)
  link (anchor and other protocols by the shared link module, `md-links.test.ts:50` and `:56`, as Testing Decisions
  say), AC-07 loading, failure and empty, AC-08, CON-001, E1's first clause (E-C1; a failed refresh keeping the body
  rides `display-queries.test.ts:7`, and the drawer's mode is not keyed by the text), E3 (vanish.md), E6 (the shared
  carrier, `md.test.ts:14–39`), E8.
- Not covered: AC-01's relative time (PC-3) and its Codex global memory form (PC-4), AC-04 for a real shape (PC-2),
  AC-07's truncation (PC-6), E4 (PC-5); E2, E5 and E7 are named gaps without a note in any test file (PC-7).

Gap notes in test file headers: memory.test.ts's note (1) matches the spec's Testing Decisions; e2e/app.spec.ts's
header carries none of this ticket's gaps (PC-7).

Fixtures against real data, by structure only: all 118 files under `~/.claude/projects/*/memory/` (19 directories,
every file a top-level `.md`) and the 3 top-level `.md` files of `~/.codex/memories/`. Front matter in 106 (all
closed), nested keys in 101, `[[name]]` in 84 (120 occurrences), relative links in 111, 6 links to missing targets,
4 tag-like placeholders outside code (`<slug>`, `<app>` twice, `<skill>`), the largest Codex file 344,228
characters, no http(s) link and no topic link to MEMORY.md. The fixture carries the nested key, `[[name]]`, and the
sibling, index, missing and external links. It lacks one real structure that changes the outcome: `[[name]]`
directly followed by a parenthetical remark, 10 occurrences in 8 files (PC-2).

Conclusion: gaps — PC-2 to PC-8.

### Case design
No module replacement, spy, cast, call-count assertion or skip in the 286 added test lines (`rg` over the added
lines, exit 1 for each pattern). Exemptions reviewed and accepted:
- U1 reads the returned path back with `readFileSync`: the value under test is a path, and reading the file it names
  checks it against the fixture's body without recomputing the encoded directory (a same-algorithm expectation).
- U3 writes the cache file at the filesystem boundary, the seam of the existing corruption tests; the `mainFile`-less
  shape is the installed app's own (design row), `mainFile: 7` is a corrupted entry the store must survive.
- E-A5 replaces Electron's `shell.openExternal` in the main process — a system boundary, not project code; the click
  still goes through the real renderer and main-process path.
- E-A3 sets `scrollTop` programmatically: setup of a state a user reaches by scrolling; the behaviour under test is
  the reset on the switch.
- F3 (7) expands the plugin skill row only when its files are hidden: it follows the state the previous loop
  iteration left, not an environment skip.

Conclusion: no finding.

### False greens
Per the project capability declaration, mutation-testing is not enabled; this item is skipped. When each test goes
red:
- U1: when `mainFile` is null with MEMORY.md present, names another file, points elsewhere (the read-back body
  differs) or carries another time; the second case when it is not null for topics only or for no memory.
- U2: when the validator admits a non-object or bare-string `mainFile` or an empty `file` (`errOf` gives `''` for an
  admitted detail); not when the `name` or `mtimeMs` check is dropped (O-1).
- U3: when the upgrade is missing (`/p` is dropped: the validator refuses an absent `mainFile`), when it fills a
  present malformed field (`/q` kept), or when the main text changes.
- E-A1: for another title, side, file name, bar name or default mode, a missing card row, or `[[other-note]]` turned
  into a link; not for a missing or absolute time (PC-3), nor for the `[[name]](remark)` shape, absent from the
  fixture (PC-2).
- E-A2: when raw does not start with the front matter or preview does not come back.
- E-A3: when the switch, the title, the mode or the scroll reset fails. The reset is the body's `key={fileKey}`;
  second.md comes from the query cache (the library's default gcTime, `query-client.ts`), so the switch does not
  pass through "Loading…", which would put any body at the top by itself.
- E-A4, E-A8: when the main file is missing from the drawer's readable list or the switch fails.
- E-A5: when the unlisted link does not toast the exact en wording, the drawer changes file, the main-process
  navigation guard is gone (the window would leave), or the hand-off does not get the URL. After `Gone` the URL check
  alone would stay green with only the renderer interception removed (the guard cancels the navigation); the toast
  check catches that case.
- E-A6: when "Empty file" or the failure text is missing or the bar goes; not when the switch disappears on a failed
  read (PC-8).
- E-A7: when any one of Esc, the close button or the overlay stops closing.
- E-A9: when the main file's registration is removed — admission is by exact path (`read-registrations.ts`), the
  first scan registered late-proj without MEMORY.md, and no rescan falls inside the test (300 s interval, 60 s focus
  throttle, the test takes about 10 s) — and when the detail lacks `mainFile` (the link then toasts).
- E-A10: for a wrong cap at 1400 (the pane is about 1080 px beside the 320 px Projects chrome, so 0.8 × pane ≈ 864
  exceeds both 720 and 680), a wrong factor at 900, a Subagents drawer taking the file drawer's rule, or the two file
  drawers' frames diverging. The frame comparison is symmetric — both sides render FileDrawer — so it cannot see a
  change to the shared rules themselves, which is not its job (CON-001 is about divergence). The bar is only checked
  to be some gradient (PC-9).
- E-B1: when "Loading…" is not in the body within 300 ms under the 600 ms delay, the bar or switch is absent while
  loading, or the card is missing afterwards.
- E-C1: when the restored body is not in the preview body within 500 ms of the delayed second launch.
- The renamed skill drawer assertions: the `toHaveCount(0)` checks (`.file-drawer .md-preview-seg`, closed drawers)
  use live selectors — `.file-drawer` and `.md-preview-seg` are asserted present elsewhere in the same tests — so none
  is a dead-selector green.
- Interface forms (review-code false-greens list): no un-awaited locator assertion among the added lines (57 awaited,
  0 not); the one-shot reads (`textContent` after the class switch, `scrollTop` after the text) follow a synchronous
  render and force layout; the stderr filter is a narrow predicate (the read-artifact handler and vanish.md), not a
  count.

Conclusion: no always-true, same-algorithm or old-path assertion; partial checks PC-3, PC-8, PC-9; the fixture blind
spot PC-2.

### Resource reuse
Expensive resources: the e2e build and the built app's launches. From the gate log: one `electron-vite build` (three
bundles) per `pnpm e2e`, log lines 403–428; the quiet Electron copy comes from `globalSetup` once per Playwright run.
The log has no per-launch output, so launches are counted from the code: the range adds and removes no `launch(` or
`electron.launch` call (`rg` over the added and over the removed lines, exit 1 both); the E-A rows ride F3's one
launch, E-B1 the artifact-reopen test's one delayed launch, E-C1 the restore test's existing two. The unit rows use
the existing per-test temp directories, not an expensive resource (gate: memory.test.ts 13 tests in 90 ms,
display-store.test.ts 8 in 33 ms, validate.test.ts 44 in 8 ms). This matches the test design table.

Conclusion: no finding, with PC-1's caveat that the gate log is tied to no version.

### Findings
- PC-1 — run evidence (every conclusion drawn from the gate run, Resource reuse's count among them). The gate log has
  no version block — no `git rev-parse HEAD` output, no `git status --porcelain --untracked-files=all` list with each
  file's `git hash-object` — and records no exit code (the hand-off states 0). The run ended 15:59:08 and 81952cf was
  committed at 16:00:02, so it ran on an uncommitted tree that cannot be compared with the commit file by file; the
  bundle hashes above tie only the product build. The gap already bites: `node scripts/check-lang.mjs`, run here at
  81952cf with only this record changed (no CJK in it), exits 1 with 4 problems, all in
  [checklist.md](checklist.md) lines 18–21 (the owner's quotes in Chinese; the file is unchanged since 81952cf). The
  gate scans `git ls-files --cached --others --exclude-standard`; at gate time the working records were untracked
  under the ignored `docs/.workings/`, so the gate never saw them, and once committed they fail `pnpm check:lang` —
  the commit is not green as delivered. Recommendation: translate those quotes or widen a check-lang rule as its
  message asks (the main agent's call), then re-run `pnpm verify` at the delivered commit, after the working records
  are added, with a log carrying the items above. Destination: /implement's full verification gate.
- PC-2 — Coverage: a fixture that follows the spec's picture, and a product defect against memory-view::US-001/AC-04.
  Real memory files write a reference directly followed by a remark in parentheses, `[[name]](remark)`: 10
  occurrences in 8 of the 118 Claude memory files here. With a remark that has no space (the usual case in CJK prose),
  marked 15.0.12 parses it as a link, `<a href="%E5…">[name]</a>`; the href passes `URI_ALLOW` and DOMPurify keeps it,
  so the preview shows a link `[name]` and the remark is gone (checked with the project's marked, DOMPurify and
  `URI_ALLOW` under jsdom; clicking the link gives the out-of-scope toast). E-A1 cannot see it: the fixture's
  `[[other-note]]` (e2e/app.spec.ts:1970) is followed by a space, and `renderMarkdown` (src/renderer/src/md.ts) has
  no `[[` handling. The same rendering reaches the main file card and the skill drawer. Recommendation: add the real
  shape to pitfalls.md (it will go red), then decide with the owner — keep `[[name]]` as text before parsing, or
  narrow AC-04 in the spec. Destination: this ticket (AC-04 is its acceptance item), plus the spec if AC-04 narrows.
- PC-3 — Coverage: design row against test (memory-view::US-001/AC-01, R2). e2e/app.spec.ts:2059 asserts
  `toContainText('Claude · pitfalls.md · ')`, so a meta line that drops the time or shows an absolute date stays
  green. For a file written during the test the en text is `today` (`relativeDays` with `numeric: 'auto'`), so
  `toHaveText('Claude · pitfalls.md · today')` is deterministic. Destination: this ticket.
- PC-4 — Coverage (memory-view::US-001/AC-01 and its Applies to). No test opens a Codex global memory file: the title
  `(Codex global memory)` and the `Codex` side in the meta are not exercised (no Codex memory fixture anywhere in
  e2e/), although the checklist's AC-01 row plans "the Codex row's title". Recommendation: seed
  `~/.codex/memories/<name>.md` in F3's home and open it from the global Memory section (no new launch). Destination:
  this ticket.
- PC-5 — Coverage: coverage claimed but not there (E4). The checklist puts E4 on "the shared front-matter split's
  unit tests", but the only front matter test (md.test.ts:41) uses a closed block, and no test file in the repository
  passes an unclosed one (`rg 'splitFrontmatter|renderMarkdown'` over every test file). A change that turns an
  unclosed block into a card stays green. Recommendation: one md.test.ts case (no card, the text rendered as
  Markdown). Destination: this ticket; the checklist row corrected.
- PC-6 — Coverage: coverage claimed but not there (memory-view::US-001/AC-07's truncation; E5's reason). No test
  covers the artifact read channel's 500,000 cap (src/main/index.ts:421) or the drawer's `…(truncated)` marker in
  preview or raw; the only capped-read test is `readCapped` at 200 KB through subagents (subagents.test.ts:172). The
  design's "rides the existing read cap" and the checklist's "existing read-cap coverage plus the shared marker"
  overstate it, and E5's reason ("would only re-test the read cap") rests on the same premise. Recommendation: one
  topic over 500,000 characters in F3's home (one `writeFileSync`, no new launch) with the marker asserted at the end
  in preview and raw; otherwise a gap note with its reason. Destination: this ticket; the coverage wording here and
  in the checklist corrected.
- PC-7 — Coverage: gap notes. The design review says E2, E5 and E7 are "not tested, with the reason recorded here and
  in the test file", but no test file names them. The e2e header's note (e2e/app.spec.ts:8) names "the skill drawer's
  mode reset", which now lives in the shared FileDrawer and is just as unreachable from the memory drawer (so AC-05's
  "opens in preview" holds only trivially). E7's reason covers the copy, not "keeps the file, the mode and the scroll
  position"; nothing remounts on a language change (`rg 'key=\{(lang|language|dict)'` exit 1), so the risk is low,
  but the note should say so. Recommendation: write the notes, each with its reason and the condition for adding a
  case, in the e2e/app.spec.ts header. Destination: this ticket.
- PC-8 — Coverage: design row against test, minor (memory-view::US-001/AC-07, "the bar and its switch staying in
  place"). The vanish.md step (e2e/app.spec.ts:2115) asserts the bar's name but not the switch the row requires.
  Recommendation: add `toBeVisible()` on `.md-preview-seg`. Destination: this ticket.
- PC-9 — False greens: a partial assertion, minor (memory-view::CON-001, "the preview bar fades from the page ground
  into the card"). e2e/app.spec.ts:2242 only checks that the bar's background contains `linear-gradient`; a reversed
  or wrongly coloured gradient stays green. Recommendation: compare it with the gradient built from the computed
  `--bg` and `--card`, or accept it and say so. Destination: this ticket (optional).

Observations, no change recommended:
- O-1 — U2 leaves the `mainFile.name` and `mtimeMs` refusals unexercised, as the existing tests do for the topics'
  fields. Impact: dropping either check would let a malformed entry reach the drawer's meta, where a non-number time
  renders as a dash. Recommendation: no change; recorded here only.
- O-2 — Tag-like placeholders in real memory prose (`<slug>`, `<app>`, `<skill>`, 4 occurrences outside code) are
  removed by the sanitiser: the preview reads `docs/.workings//` where the file says `docs/.workings/<slug>/`. This
  is E6's rule (the drawer behaves as the main file card), not a test defect. Impact: every carrier surface silently
  drops words from real memories. Recommendation: raise with the owner. Destination: no persistent home yet — the
  owner decides between a ticket and dropping it.

### Document sync obligations
For the main agent, per implement/document-sync.md (not edited here):
- [checklist](checklist.md): the AC-01 row (PC-4), the AC-07 row (PC-6), the "memory-view E2, E4–E7" row (PC-5, PC-7),
  and "Current verification" (still "Not run yet").
- This record's Design review, "Coverage" paragraph: the test-file notes and the truncation wording (PC-6, PC-7), when
  the findings are handled.
- [memory-view spec](../../specs/memory-view.md): Testing Decisions' list of real shapes, and AC-04 if PC-2 is
  resolved by narrowing it.
- A fix that changes test code goes to an independent incremental check (/implement step 6).
