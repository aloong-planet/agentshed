# Test review — #326 Configuration shows CLAUDE.md and AGENTS.md

Ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) (aloong-planet/agentshed) · feature checklist:
[checklist.md](checklist.md) · specs: [agents-overview](../../specs/agents-overview.md) agents-overview::REQ-004,
[project-detail](../../specs/project-detail.md) project-detail::REQ-002/AC-02

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

## Design review

Date: 2026-10-29 · implementation base: cbe22ca (main; no implementation commit yet) · scope: every test this
ticket plans to write or change, before the first one is written.

Seams (agents-overview Testing Decisions; ADR-0002): the providers layer over a fixture home (`ScanRoots`), the IPC
contract validators, the display store's filesystem seam (the 2026-10-21 postmortem's restore tests), and e2e over a
fixture home (`AGENTSHED_HOME_OVERRIDE`). No renderer unit seam exists (no renderer test mounts a page), so the
rendered Configuration section is asserted at e2e.

### Test design table

| # | Test (file) | Spec units covered | Seam | Input that drives the target branch | Assertion object and source of the expected value | Fixture shape source | Expensive resources and how provided |
|---|---|---|---|---|---|---|---|
| T1a | global layer: CLAUDE.md and every global AGENTS.md, in order, each with its path (`global.test.ts`) | agents-overview::REQ-004/AC-02, AC-03; AC-05 (control half) | providers (`scan()` over a fixture home) | `~/.claude/CLAUDE.md`; the three AGENTS.md written in reverse of the expected order (config, root, Codex), so neither creation order nor directory order can produce the expected order; GEMINI.md ×2, both rules directories and `~/.grok/AGENTS.md`, each with its own marker | `snap.global.claudeMd` and `snap.global.agentsMd` — file paths as literal `join(dir, …)` paths in the spec's order (Codex, `~/.gemini/AGENTS.md`, `~/.gemini/config/AGENTS.md`), contents as the literal text written; `JSON.stringify(snap.global)` contains each AGENTS.md marker and none of the GEMINI.md, rules or Grok markers | Locations from the research record's measured table (§10.9: the four global instruction files, `~/.gemini/config/rules/*.md`, `~/.gemini/antigravity-cli/rules/*.md`) and the sample manifest (`global/.gemini/config/AGENTS.md`, `global/.gemini/antigravity-cli/rules/sample-cli-rule.md`); body shape from the project sample (`# … instructions` + a sentence) | none (tmp dir, ms) |
| T1b | every combination of the three global AGENTS.md (`global.test.ts`, `it.each`) | agents-overview::REQ-004/AC-03 | providers | each of the 8 subsets of {Codex, agy root, agy config} written | `agentsMd.map(f => f.file)` against a literal expected list per row (8 hand-written rows, not computed by filtering) | as T1a | none |
| T1c | GEMINI.md and rules but no AGENTS.md → no entry (`global.test.ts`) | agents-overview::REQ-004/AC-05; failure mode "`~/.gemini/GEMINI.md` exists and no AGENTS.md does" | providers | GEMINI.md ×2, both rules dirs, `~/.grok/AGENTS.md`; no AGENTS.md | `agentsMd` equals `[]` (literal) | as T1a | none |
| T1d | one of the three cannot be read (`global.test.ts`) | failure mode "One of the three global AGENTS.md files cannot be read: its slot shows the read error under its path and the others render" | providers | `~/.gemini/AGENTS.md` is a directory (the read throws EISDIR — the catch branch; deterministic as any user, unlike a permission bit under root); the other two readable | the root entry is `{ file: <literal path>, content: null }`; the other two carry their literal text | path layout as T1a; a non-file at the path is a real filesystem state | none |
| T1e | an oversized global AGENTS.md is truncated (`global.test.ts`) | agents-overview B5 (regression) | providers | `~/.codex/AGENTS.md` of 200,001+ characters | `content.truncated === true` and `content.text.length === 200000` (literal, not the imported constant) | — | none |
| T1f | nothing present → no CLAUDE.md, no AGENTS.md, no throw (`global.test.ts`, existing case rewritten) | agents-overview::REQ-004/AC-02, AC-03 ("None"); B5 | providers | empty home | `claudeMd === null`, `agentsMd` equals `[]` | — | none |
| T1g | no settings summary in the contract (`global.test.ts`, inside T1a) | agents-overview::REQ-004/AC-04 | providers | `~/.codex/config.toml` with a model, a project and an MCP section (the input that used to produce the summary) | `snap.global` has no `codexConfigSummary`, `codexAgentsMd` or `claudeGlobalMd` property | — | none |
| T2a | project CLAUDE.md and AGENTS.md, each with its path; no settings summary (`project-detail.test.ts`, existing case rewritten) | project-detail::REQ-002/AC-02 | providers (`readProjectDetail()`) | project CLAUDE.md and AGENTS.md; the project key in `.claude.json` carries `allowedTools` and `enabledMcpjsonServers` (the input that used to produce the summary) | `configs.claudeMd/agentsMd` equal literal `{ file: join(proj, …), content: { text, truncated: false } }`; `configs` has no `settingsSummary` property | project AGENTS.md body from the research sample (`project/AGENTS.md`) | none |
| T2b | both absent → null (`project-detail.test.ts`, existing) | project-detail A4; REQ-002/AC-02 ("None") | providers | no files | both `null` | — | none |
| T2c | a project's GEMINI.md and `.agents/rules` are shown nowhere (`project-detail.test.ts`) | agents-overview::REQ-004/AC-05 (project level) | providers | project `GEMINI.md`, `.agents/rules/r.md` with markers, plus a project AGENTS.md (control) | `JSON.stringify(d)` contains the AGENTS.md marker and neither excluded marker | project rules location from §10.9 (`.agents/rules/*.md`) | none |
| T2d | an unreadable project file shows under its path, the other entry unaffected (`project-detail.test.ts`) | project-detail::REQ-002 failure modes | providers | project `AGENTS.md` is a directory; CLAUDE.md readable | `agentsMd` equals `{ file, content: null }`; `claudeMd` carries its literal text | — | none |
| T3a | the snapshot contract admits the new configuration shape and refuses malformed entries with a path (`validate.test.ts`) | contract for agents-overview::REQ-004 (ADR-0001) | IPC contract (`validateSnapshot`) | `global.claudeMd` a ConfigFile; `agentsMd` a list including `content: null`; then `agentsMd` = `{}`, an entry with `file: ''`, an entry whose content is `{}` | `ok` true for the valid one; for each malformed one `ok` false and the failure path names the field (literal substrings) | — | none |
| T3b | the detail contract admits ConfigFile / null and refuses malformed ones (`validate.test.ts`, existing rows rewritten) | contract for project-detail::REQ-002/AC-02 | IPC contract (`validateProjectDetail`) | `configs.claudeMd` a ConfigFile; `agentsMd` = 42; `claudeMd.file` = ''; the pre-change shape `{ text, truncated }` | admitted / refused with the literal path | — | none |
| T4a | a project detail saved before configuration entries carried their paths restores with them filled in (`display-store.test.ts`) | CONTEXT invariant "A page switch is atomic and a revisit is instant" (restoring runs the live contract; a changed field is filled in) for project-detail::REQ-002/AC-02 | display store (cache file written at the filesystem boundary, then `new DisplayStore(root)`) | the real cache's three present-file combinations, one saved detail each: both files `{ text, truncated }` with distinct texts (`/w/p`; 3 of the 27 real saved details), AGENTS.md only (`/w/r`; 3 of 27), CLAUDE.md only (`/w/s`; 3 of 27); a fourth whose old `claudeMd` is malformed (`7`). "Neither file" (18 of 27) is the memory restore case's input (revised 2026-10-29 for Post-implementation check Findings 1 and 2, reviewed under the incremental rule: a saved AGENTS.md that is a file reaches the conversion, a saved absent one must stay absent, and distinct texts and paths make a swapped, unconverted or invented file visible) | restored `configs` equal the literals `{ claudeMd: { file: '/w/p/CLAUDE.md', … }, agentsMd: { file: '/w/p/AGENTS.md', … } }`, `{ claudeMd: null, agentsMd: { file: '/w/r/AGENTS.md', … } }` and `{ claudeMd: { file: '/w/s/CLAUDE.md', … }, agentsMd: null }`, contents the saved texts, with no `settingsSummary`; the malformed one is dropped | the real display cache on this machine (2026-10-29: 27 saved details, every `configs` holding exactly `claudeMd`, `agentsMd` as `{ text, truncated }`/null and `settingsSummary` as string/null) | none |
| T4b | a snapshot saved before the change restores with its configuration converted (`display-store.test.ts`) | same invariant, for agents-overview::REQ-004 | display store with the main process's global configuration paths injected | a saved snapshot whose `global` holds `claudeGlobalMd` (text), `codexAgentsMd` (text) and `codexConfigSummary`; a second with `codexAgentsMd: null`; the first again parsed without paths | with paths: `claudeMd`/`agentsMd` equal literal ConfigFiles at the injected paths and no old key survives; `codexAgentsMd: null` gives `agentsMd: []`; without paths the snapshot is dropped (fail-closed) | the real cache's `global` key set (2026-10-29: `skills … mcp, claudeGlobalMd, codexAgentsMd, codexConfigSummary`, the three as `{ text, truncated }` / `{ model, projectCount, mcpCount }`); the parts this change does not touch come from `emptySnapshot`, so another ticket's side-set change cannot turn this case red for a reason that is not this one | none |
| T5 | the Configuration section on both pages (`e2e/app.spec.ts`, new case) | agents-overview::REQ-004/AC-01…AC-05; project-detail::REQ-002/AC-02; agents-overview B5, project-detail A4 (regression); the failure modes above; the agents page's link interception (CONTEXT "A link inside rendered content must never navigate the whole window", regression) | e2e (built app over a fixture home, `AGENTSHED_RESCAN_MS=250` so file changes arrive by automatic rescan) | home: global CLAUDE.md (oversized, for the truncation marker), the three AGENTS.md (the Codex one with a relative link), GEMINI.md ×2, rules, `~/.codex/config.toml`; project A with CLAUDE.md and AGENTS.md as a directory and a project-key `allowedTools`; project B with nothing. Then remove `~/.gemini/AGENTS.md`, turn `~/.gemini/config/AGENTS.md` into a directory, and remove all | switch labels exactly `['CLAUDE.md', 'AGENTS.md']` (literal, read once the body is in place); `.cfg-path` texts equal the literal paths in the spec's order after each change; each body's marker; the unreadable sentence under its path; "None" when none, inside the card with no frame of its own (computed `border-top-width` 0px against the card's 1px — the prototype's form; incremental change of 2026-10-29, reviewed: the expected values come from the prototype's drawing, not from the app's CSS); the truncated marker; the card bounded at the prototype's height — with the oversized CLAUDE.md its rect height is at most 52% of the window (+1 px) while its content overflows it (`scrollHeight > clientHeight`), so without the rule the case is red (incremental change of 2026-10-29, reviewed: the 52% comes from the prototype, and the oversized file guarantees the unbounded card would far exceed it); no GEMINI/rules marker in the pane text; computed style of the path line (monospace, 11px, `--text-2`) and its separator (first 0, later 1px top border) from the prototype; a relative link raises the notice toast and the URL is unchanged | locations as T1a | the e2e build (one `electron-vite build` per `pnpm e2e` run, shared by every case); one app launch for the whole case — every state is reached by rescan rather than a relaunch |
| T8 | a display cache from before the change restores the agents page's configuration before the first scan (`e2e/startup-restore.spec.ts`, new case; added 2026-10-29 during step 5 to close the design-time gap on the main process's wiring) | CONTEXT "A page switch is atomic and a revisit is instant" for agents-overview::REQ-004; agents-overview::REQ-001/AC-01 (restore before the first scan) | e2e (built app, a `display-cache.json` written into the user-data directory before launch, the first scan held by `AGENTSHED_SCAN_DELAY_MS=20000`) | the saved snapshot's `global` in the previous version's shape (`claudeGlobalMd`, `codexAgentsMd` as contents, `codexConfigSummary`); a live `~/.claude/CLAUDE.md` with different text | the Config tab's path headings equal the literal `join(home, '.claude', 'CLAUDE.md')` / `join(home, '.codex', 'AGENTS.md')` and the bodies are the saved texts, not the live one; the startup status is not `ready` (the scan is still held) | the real cache's `global` key set, as T4b; the rest from `emptySnapshot` | one launch; the build shared as T5 |
| T6 | `ScanRoots` literals gain `geminiHome` (14 test files) | — (mechanical: typecheck requires the field) | — | — | no assertion changes | — | none |
| T7 | existing e2e (6d) "Config-card links (project detail)" | project-detail R3 (regression) | e2e | unchanged | unchanged (`.pane-body .md` stays the card) | — | shares that case's single launch |

### Dimension conclusions

**Coverage**. agents-overview failure modes for this ticket, one by one: B5 (missing → "None": T1f, T5; oversized →
truncated: T1e, T5); "one of the three cannot be read": T1d, T5; "all three absent → None": T1f, T5; "GEMINI.md
exists and no AGENTS.md": T1c, T5; "copy never enumerates the sides … entries named by file": T5 (exact switch
labels; `pnpm check:ui` covers the dictionaries). project-detail: A4 (T2b, T5), R3 (T7), REQ-002 failure modes
(unreadable file under its path, other entry unaffected: T2d, T5 on project A). The restore-across-update obligation
(CONTEXT's display-copy invariant and the 2026-10-21 postmortem) has T4a/T4b. Every row names the input that drives
its branch. No untestable wiring identified at design time; the `DisplayStore` paths' wiring in the main process
(`index.ts` passing the real roots) has no behavioural seam below e2e — closed by T8 (added during step 5, reviewed
under the incremental rule: its expected values are literal paths and the saved texts, and the held scan makes the
saved copy the only possible source of what shows).

**Case design**. Every row goes through a public interface (`scan`, `readProjectDetail`, the validators,
`DisplayStore`, the built app). No row casts or writes internal state: the unreadable file is a real filesystem
state, the old caches are written at the filesystem boundary as the previous version wrote them. No finding.

**False greens** (the three design-judgeable items). Always-true assertions: none planned — no threshold assertion;
T1e asserts an exact length on a file longer than the cap. Tautology: every expected value is a literal path, text or
list written in the test; none imports the implementation's list, constant or algorithm (T1b's eight rows are written
out, not filtered from a list). Guarding a dead path: the assertion objects are the new fields the renderer reads;
T1g and T3b assert the removed fields are absent / refused rather than asserting them. Negative assertions (T1a's
excluded markers, T5's pane text) each run against a payload that demonstrably carries file contents (the AGENTS.md
markers in the same payload). Mutation testing belongs to the Post-implementation check (and is governed by the
`mutation-testing` capability).

**Resource reuse**. Expensive resources: the e2e build output (built once per `pnpm e2e` by `electron-vite build`,
shared by all cases) and an Electron launch (a few seconds). T5 launches once and reaches every state by automatic
rescan; T7 is the existing case's single launch. Unit tests use per-test tmp dirs (milliseconds) — no expensive
resource. Existing shared setups reused: `launch`/`close` in `e2e/app.spec.ts`; each unit file's `roots()` helper.
No resource is cleared by one case and used by another.

### Findings

None.

### Incremental revision for Post-implementation check Finding 1 (2026-10-29)

Row T4a revised before the test was changed (see the row): the saved details now carry the project's AGENTS.md as a
file, with distinct texts and paths. Reviewed under the incremental rule — Coverage: the row's input now reaches the
AGENTS.md half of the conversion, the shape 6 of the 27 real saved details have; Case design: still the filesystem
boundary and `DisplayStore`, nothing internal written; False greens: the expected values are literal paths and texts,
none computed by the conversion's own rule, and the case goes red if the saved AGENTS.md is left unconverted (the
detail is then dropped by validation), pointed at CLAUDE.md's path, or deleted; Resource reuse: unchanged (a tmp
directory). No finding.

Self-check before handing over (post-implementation-check.md items 2–5):

2. The changed assertions (`display-store.test.ts`, the restore of a project detail saved before the paths): the
   restored paths list and the two `configs` literals. Against the false-green forms: no threshold, no expected value
   computed by the implementation's rule or aliased to the input, no imported constant, a live path. No hit.
3. No product function changed by the fix; the test function's only branch (`r.kind === 'projectDetail'`) is
   exercised by both restored details. Not applicable beyond that.
4. The fix's data: a saved AGENTS.md as `{ text, truncated }` — the real cache's shape (6 of 27). No finding.
5. No shared test helper changed (the `saved` builder is local to the case). Not applicable.

### Incremental revision for the incremental check's Finding 2 (2026-10-29)

Row T4a revised again before the test was changed: a CLAUDE.md-only saved detail (`/w/s`) is added, asserted with
`agentsMd: null`, and the row's counts now follow the incremental check's recount of this machine's cache (both 3,
AGENTS.md only 3, CLAUDE.md only 3, neither 18). Reviewed under the incremental rule — Coverage: every present-file
combination the real cache holds is driven, and an absent saved AGENTS.md is asserted absent; Case design: unchanged;
False greens: the case now also goes red if a saved absent AGENTS.md comes back as a file with no contents (the shape
validation admits as "unreadable") — the expected `null` is a literal; Resource reuse: unchanged. No finding.

Self-check before handing over (items 2–5): 2 — the added assertion is a literal object compared with `toEqual`
(a `null` property is compared, not skipped); no threshold, alias or imported constant. 3 — no product function
changed. 4 — the added detail is the real cache's CLAUDE.md-only shape. 5 — no shared helper changed. No finding.

## Post-implementation check

Date: 2026-10-29 · ticket: [#326](https://github.com/aloong-planet/agentshed/issues/326) (aloong-planet/agentshed) ·
implementation: a9c382f, range cbe22ca..a9c382f (d0c68d7, 8e0a464, a9c382f) · first round, handed over by `/implement`
step 6 · scope: every test the range adds or changes (T1a-T8 above) and the test design table.

### Run evidence

[ticket-326-gate-prereview.log](ticket-326-gate-prereview.log), the pre-review run started 00:56:05:

- Version: `git rev-parse HEAD` is a9c382f53523, the end of the handed range (a9c382f was committed at 00:55:57, before
  the run); `git status --porcelain --untracked-files=all` listed nothing, so the version list is empty. The files now
  modified or new in the worktree (`docs/features/agents-overview.md` and `project-detail.md` at 01:01:17,
  `ticket-326-decisions.md` at 01:02:00) were written after the run ended (the log at 01:00:33). Matches the range.
- Every command is recorded with its full output and its exit code (`## exit: 0` for all twelve: typecheck, lint, test,
  test:scripts, test:site, check:ui, check:lang, check:i18n, check:nul, the build, the two e2e files, smoke). The range
  changes test files, so no command could be skipped, and none was.
- The reviewed tests ran: `vitest run` over the whole unit suite (global 20, project-detail 10, display-store 11,
  validate 48 tests, all passed); `e2e/app.spec.ts` (T5 is test 4 at :480, T7 sits in test 36 at :2141) and
  `e2e/startup-restore.spec.ts` (T8 is test 89 at :235): 90 passed.

Conclusion: the log carries every item full-verification-gate.md requires, and its version is the handed range's end.
No finding. No test was run for this check: each "when does it go red" below is answered from the code and the
expected value's source.

### Per-case consistency with the test design table

| # | Written test | Against the table |
|---|---|---|
| T1a, T1g | `global.test.ts:200` | Matches: reverse write order, five excluded markers, the `config.toml` input; literal ConfigFiles; the payload holds the three AGENTS.md markers and none of the five; the three old keys absent |
| T1b | `global.test.ts:230-243` | Matches: eight hand-written rows, the last written in reverse; each expected list is the row's literal list joined to the fixture home |
| T1c | `global.test.ts:245` | Matches |
| T1d | `global.test.ts:251` | Matches (a directory at `~/.gemini/AGENTS.md`; the whole list literal) |
| T1e | `global.test.ts:264` | Matches (200,123 characters; `200000` literal, not the constant) |
| T1f | `global.test.ts:272` | Matches |
| T2a | `project-detail.test.ts:117` | Matches: the body is the text of `spike/samples/project/AGENTS.md` (re-read for this check, identical); the project key carries `allowedTools` and `enabledMcpjsonServers`; `toEqual` on the literal `configs` plus `not.toHaveProperty('settingsSummary')` |
| T2b | `project-detail.test.ts:139` | Matches (unchanged) |
| T2c | `project-detail.test.ts:145` | Matches |
| T2d | `project-detail.test.ts:156` | Matches |
| T3a | `validate.test.ts:86`, `:97` | Matches; written stricter than designed: exact failure paths (`toBe`), plus a string `claudeMd` and the pre-change `{ text, truncated }` (refused at `global.claudeMd.file`) |
| T3b | `validate.test.ts:246`, `:306` | Matches; adds `content: 'text'` (refused at `detail.configs.claudeMd.content`) |
| T4a | `display-store.test.ts:117` | Matches the row as designed (the literal path is `/w/p/CLAUDE.md` rather than the row's illustrative `/p/CLAUDE.md`). The row's input leaves the project's AGENTS.md null although its own fixture-source column records the real cache holding it as `{ text, truncated }`: Finding 1 |
| T4b | `display-store.test.ts:144` | Matches |
| T5 | `e2e/app.spec.ts:480` (fixture `mkConfigHome`, :448) | Matches every listed input and assertion; written with more than listed: Grok's AGENTS.md and the project's GEMINI.md markers, no `.badge` in the section, and the selected entry (`button.on`) checked on the bare project before each "None" |
| T8 | `e2e/startup-restore.spec.ts:235` | Matches |
| T6 | 14 files | Matches: the `geminiHome` line only (activity, ccusage-parity, global, install, memory, plugins, project-detail, question-corpus, registry, scan, search-sessions, skill-package, subagents, token-stats) |
| T7 | `e2e/app.spec.ts:2535` (in the case at :2141) | Matches, unchanged: `.pane-body .md` is now the `.md.cfg-files` card, and still one element (`MarkdownBody` emits `md-body`, not `md`) |

Test file headers: none of the six files notes a gap, and none is needed: the design review found no untestable
wiring, and T8 closed the one it named (`index.ts` passing the roots to the display store). The range makes none of
the headers' existing statements false.

### Coverage

The specs' failure modes for this ticket, against the written tests:

- agents-overview B5: missing gives "None" (T1f and T1b's empty row; T5's AGENTS.md once all three are gone). The
  agents page's CLAUDE.md "None" is not drawn in e2e: its null-to-empty mapping in `AgentsPane.tsx` is held by the
  strict typecheck (`ConfigFile[]` refuses `[null]`), and an empty entry renders through the shared `ConfigSection`
  that T5 drives on the bare project. Oversized is truncated: T1e; T5's global CLAUDE.md with the marker.
- agents-overview::REQ-004/AC-01 to AC-05: T1a-T1c, T1g, T2c, T5, as tabled. "Two files, three and none" (the spec's
  Testing Decisions): T5 goes three, two, two with one unreadable, none.
- "One of the three global AGENTS.md files cannot be read": T1d (the root one; the other two read) and T5 (the config
  one, under its own path by `previousElementSibling`; Codex's still renders).
- "`~/.gemini/GEMINI.md` exists and no AGENTS.md does": T1c; T5's last state keeps GEMINI.md and both rules on disk.
- "Entries named by file, not by side": T5's exact labels on both pages; `pnpm check:ui` passed (log line 448).
- project-detail::REQ-002/AC-02 and its failure modes: T2a, T2b, T2d, T5 (project A: CLAUDE.md under its path, the
  unreadable AGENTS.md under its path, shown once); R3's link destinations by T7 (passed).
- project-detail A4: missing gives "None" (T2b; T5's bare project). No case writes an oversized project file: the
  project read is `readConfigFile` with its default cap, whose truncation T1e drives, and the project call site has no
  cap of its own, so this half is covered through the shared reader rather than by a project-level case (a precision
  on the design review's "A4 (T2b, T5)", not a finding).
- The restore across the update (CONTEXT, "A page switch is atomic and a revisit is instant"): the snapshot shape by
  T4b and T8; the project detail by T4a, whose saved AGENTS.md is never a file: Finding 1.

Fixture shapes, re-read for this check. The agy samples (`~/research/antigravity-cli-internals/spike/samples/`:
`project/AGENTS.md`, `global/.gemini/config/AGENTS.md`, the two rules) are plain Markdown, and the fixtures copy that
structure; the excluded files' contents do not matter, as nothing reads them. This machine's display cache
(`~/Library/Application Support/agentshed/display-cache.json`; shapes counted by a script, no content printed): the
snapshot's `global` holds `claudeGlobalMd` and `codexAgentsMd` as `{ text, truncated }` and `codexConfigSummary`, as
T4b and T8 build it; 27 saved project details, every one with `configs` keys `agentsMd, claudeMd, settingsSummary` and
with `memory.mainFile`; `claudeMd` is `{ text, truncated }` in 6 and null in 21, and `agentsMd` is `{ text, truncated }`
in 6 and null in 21. T4a carries only the `claudeMd` half: Finding 1.

### Case design

Every case goes through a public interface (`scan`, `readProjectDetail`, the two validators, `DisplayStore` over a
cache file written at the filesystem boundary, the built app). No case casts into or writes internal state: the casts
in T3a and T4b build input JSON, and T5's probe span is appended for one computed-colour read and removed. Unreadable
files are real filesystem states. No finding.

### False greens

Per the project's capability declaration, mutation-testing is not enabled (`enabled = false`), so mutation testing is
skipped. Each case's "when does it go red", answered against the code and the expected value's source:

| # | Goes red when |
|---|---|
| T1a, T1g | a path or the order in `globalAgentsMdPaths` changes; a file's text is altered or wrongly capped; GEMINI.md, either rules directory or Grok's AGENTS.md reaches `global`; an old key stays on the layer |
| T1b | an absent file is shown, a present one is missed, or the order differs (the four rows with two or three files) |
| T1c | anything but the three AGENTS.md paths enters `agentsMd` |
| T1d | an unreadable file is dropped (the old `readCapped` behaviour), becomes null, or disturbs the others |
| T1e | the cap is removed or changed (exactly 200000 of 200,123 characters, `truncated` true) |
| T1f | an absent file is sent, or the scan throws |
| T2a | a path or text differs, or `settingsSummary` returns (by `toEqual` and by the property check) |
| T2b | an absent file is not null |
| T2c | the project's GEMINI.md or `.agents/rules` reaches the detail (the AGENTS.md marker in the same payload is the positive control) |
| T2d | the unreadable AGENTS.md is null or dropped, or CLAUDE.md is affected |
| T3a, T3b | a valid ConfigFile (`content: null` included) is refused, or an empty `file`, a non-CappedText `content`, a non-array `agentsMd`, a string or the pre-change shape is admitted or reported at another path |
| T4a | the saved CLAUDE.md is not given `<project>/CLAUDE.md`, the summary survives, or the malformed detail is kept; not when the saved AGENTS.md's conversion is wrong (Finding 1) |
| T4b | the injected paths are not used, an old key survives, `codexAgentsMd: null` does not give `[]`, or the old shape is admitted without paths (`restored` and `none` are read through `?.` but compared by `toEqual`/`toBeNull`, so a dropped snapshot gives `undefined` and fails) |
| T5 | a label other than the two file names; a side badge; a path missing or out of order; a body under the wrong path; the unreadable line missing or under another path; "None" with a frame (`.none` has a 1px dashed border by default, theme.css:1161); the card unbounded (the CLAUDE.md capped at 200,000 characters is far taller than 52% of the window, and `overflows` rules out a short card); the path line's font, size, colour or rule changed; a GEMINI.md, rules or Grok marker in the pane; the relative link navigating or raising no notice; a main-process error |
| T8 | the main process passes no paths or wrong ones (the old snapshot is then dropped, the 20 s scan hold leaves no section, and the 5 s heading wait fails), the saved text is not what shows, or the scan has finished |

The e2e assertions against review-code's false-greens.md: every read taken after a poll comes from the render the poll
reached (a file's path and body are one `Fragment`, and `MarkdownBody` renders synchronously from `useMemo`); each
negative assertion runs beside a positive control in the same payload or pane; the geometry assertion is not vacuous
(forms 1, 5 and 8). No conditional skip; every loop runs over a literal list; no assertion is left unawaited. No false
green beyond the half of T4a that Finding 1 describes.

### Resource reuse

Counted from the run: the e2e build is one `electron-vite build` (log lines 543-567) before the Playwright command,
whose output holds no build (the global setup only resolves Electron and runs `quiet-electron.sh`): 1 build, shared by
all 90 cases, as designed. Electron launches print nothing per launch in the log; from the code: T5 one `launch` for
the whole case (every state reached by the 250 ms rescan), T8 one `electron.launch`, T7 inside its case's single
launch, as designed. The unit cases use per-test temporary directories (milliseconds). No case clears a resource
another uses. No finding.

### Findings

1. **A saved project detail's AGENTS.md is never converted under test** (a regression that would be missed).
   `upgradeSavedRead` gives each saved file its path through `pathed(path, saved)`, which returns null for a null file
   whatever the path (`src/shared/display-data.ts:75`, `:91-97`). T4a (`display-store.test.ts:117`) saves
   `agentsMd: null` in both of its details, so writing that line as `agentsMd: data.configs.agentsMd` (left
   unconverted) or pointing it at `CLAUDE.md` keeps every test green; only deleting it is caught. No other test
   restores a saved project detail of the previous shape (T8 restores a snapshot; the restart e2e saves and restores the
   current shape). The shape is real: this machine's display cache holds 6 of 27 saved details with the project's
   AGENTS.md as `{ text, truncated }`, as T4a's own fixture-source column records. Impact if it regressed: each such
   page is dropped on restore (validation refuses it at `detail.configs.agentsMd.file`), so that project's cached
   visit becomes a first visit (project-detail::REQ-001/AC-01), or its AGENTS.md shows under CLAUDE.md's path until the
   live read. Required: give T4a a saved detail whose `agentsMd` is `{ text, truncated }` and assert
   `{ file: '<project>/AGENTS.md', content: <the saved contents> }`; change T4a's row in the test design table first
   and review it under the design review's incremental rule.

Disposition (main agent, 2026-10-29): Finding 1 fixed — T4a's row revised first (design review, "Incremental
revision"), then the case: a saved detail with both files as `{ text, truncated }` and one with only AGENTS.md, each
asserted as literal ConfigFiles at `<project>/CLAUDE.md` and `<project>/AGENTS.md`. Targeted verification in
[ticket-326-fix1-verification.log](ticket-326-fix1-verification.log); handed back for an incremental check.

### Document sync this check creates

Scope (document-sync.md): the handed specs (agents-overview, project-detail) and gate log; every file in
`docs/.workings/antigravity-side/` (git-ignored, listed with `ls -la`, no hidden entries: checklist.md, the six ticket
doc-sync files, ticket-326-decisions.md, ticket-326-review-code.md, this record, the gate log); the worktree's
uncommitted edits to `docs/features/agents-overview.md` and `project-detail.md` (diff read); and an `rg -uu` search of
`docs/`, `CONTEXT.md`, `AGENTS.md`, `README.md` and `README.en.md` for statements resting on the restore evidence
(`carried their paths`, `display-store`, `saved shapes`). Excluded beyond that search: other features' working
directories (their hits are other tickets' logs and records), and ADRs, CONTEXT.md, features and READMEs, which state
behaviour that Finding 1 does not change.

Statements Finding 1 leaves overstated until it is fixed:

- this record's T4a row (its input), and the design review's Coverage sentence "The restore-across-update obligation
  … has T4a/T4b";
- checklist.md:154, "`display-store.test.ts` (both saved shapes restore) — passed | Verified", for the regression row
  at :117: the saved project detail's AGENTS.md rests on no case. It may stay "Verified" only once the added case
  passes.

No spec, feature, ADR or CONTEXT statement changes: the behaviour is implemented, and only its evidence is missing.

Differences seen in the same scope, outside this check's findings (both belong to step 7's write-back, which
ticket-326-doc-sync.md row 2, "Deviations written back", holds as Waiting):

- project-detail's Testing Decisions (spec :320-322) still say REQ-002 is asserted with a project registered on
  Antigravity only; T5 uses projects registered on Claude Code, by ticket-326-decisions.md row 27, which says the spec
  was "rewritten to say so". It is unchanged at a9c382f and in the worktree (checked 01:11).
- checklist.md:161 and ticket-326-decisions.md row 17 say the unreadable state's prototype exemption is written into
  both specs; neither spec carries it at a9c382f or in the worktree.

Impact: until the write-back, the specs misstate how AC-02 is tested and leave out a declared exemption, while two
records say otherwise. Handling: step 7's write-back, as row 2 tracks; failing that, correct the two records. Home:
ticket-326-doc-sync.md row 2.

### Incremental check (a9c382f..8493010)

Date: 2026-10-29 · ticket: #326 (aloong-planet/agentshed) · fix range: a9c382f..8493010 (one commit, 8493010, for
Finding 1) · handed over by `/implement` step 6 · run evidence:
[ticket-326-fix1-verification.log](ticket-326-fix1-verification.log). Everything outside the scope below carries
over from the first round (Post-implementation check above, 2026-10-29, at a9c382f).

#### Scope and the searches that set it

- Files the range changes outside `docs/`: `git diff --name-only a9c382f..8493010 -- . ':!docs'` gives
  `src/main/display-store.test.ts` only (exit 0). Its diff touches one case, `:117` (T4a), and that case's comment.
- Shared test code the range changes: none; the `saved` builder is local to the case, and `dir()` is unchanged.
- Tests depending on the changed file: `grep -rna --exclude-dir=node_modules --exclude-dir=out --exclude-dir=.git -e
  'display-store\.test' src e2e scripts build site vitest.config.* electron.vite.config.* playwright.config.ts
  package.json` (exit 0) finds one line, a comment in `e2e/app.spec.ts:5682`, not an import; the file exports nothing
  (`grep -nE '^\s*export\b'`, exit 1). No dependant.
- Test design table rows the range changes: the table sections of the two commits' records, diffed, differ in row T4a
  only.

Objects of this check: the T4a case and the T4a row.

#### Run evidence

- Version: `git rev-parse HEAD` a9c382f plus five modified files, each with its `git hash-object`. The three that
  8493010 commits match its blobs (`display-store.test.ts` bdd768c, `ticket-326-review-code.md` 5256494, this record
  65aa15b); the two features pages are uncommitted Markdown (inert, `change-scope.mjs` says the same in
  ticket-326-fix1-change-scope.log). 8493010 also adds two logs the version list does not name: the gate log, ignored
  before the run and so not listed by `git status`, and this run's own log; both inert. Every file a test reads is as
  in 8493010. Matches the range.
- Commands: typecheck (exit 0), lint (exit 0), `pnpm vitest run src/main/display-store.test.ts` (exit 0; 11 tests
  passed), each with its full output.
- The log's dependants search did not run: `rg: command not found` (exit 127; the log's shell is bash, where `rg` is
  not a command), and its `## overall: PASS` passes over that line. The search above stands in for it and finds no
  dependant, so the run covers every object of this check. No finding.

#### Per-case consistency with the test design table

| # | Written test | Against the revised row |
|---|---|---|
| T4a | `display-store.test.ts:117` | Matches: `/w/p` with both files as `{ text, truncated }` (distinct texts and distinct `truncated`), `/w/r` with only AGENTS.md, `/w/q` malformed; the restored paths `['/w/p', '/w/r']` and both `configs` as literals; the summary absent. The row's input column says the two-file detail is "as in 6 of the 27 real saved details": in this machine's cache 3 have both files (and 6 have AGENTS.md as a file). See Finding 2 |

The file header ("The filesystem store seam … Full-process restoration is e2e") needs no gap note; the case's comment
("each a file in 6 of them") matches the cache.

#### Coverage

The real saved project details' configuration combinations, counted again in this machine's display cache (written
01:16:38; shapes only, by a script): both files `{ text, truncated }` 3, AGENTS.md only 3, CLAUDE.md only 3, neither
18 (27). The revised case drives the first two; CLAUDE.md-only is gone from it (it was the pre-fix `/w/p`), and
"neither" is restored by the memory case at `:89`, whose `configs` are not asserted. So no case now asserts that a
saved absent AGENTS.md restores as absent: Finding 2.

#### Case design

Carried over: the case still writes the cache at the filesystem boundary and reads back through `DisplayStore`. No
finding.

#### False greens

Mutation testing is skipped (the `mutation-testing` capability is not enabled). The revised T4a goes red when the
saved AGENTS.md is left unconverted (validation then drops `/w/p` and `/w/r`), pointed at CLAUDE.md's path, swapped
with CLAUDE.md (distinct texts and flags), or its line deleted; when the summary survives (a string on `/w/p`, `null`
on `/w/r`: `toEqual` does not skip a `null` property); when CLAUDE.md's null is not kept; when the malformed detail is
kept. It does not go red when a saved absent AGENTS.md comes back as `{ file: '<project>/AGENTS.md', content: null }`:
validation admits that shape (`content: null` is the unreadable state), and no restored detail with an absent
AGENTS.md is asserted. The pre-fix case asserted `agentsMd: null` on `/w/p`. Finding 2.

#### Resource reuse

Counted from the targeted log: `display-store.test.ts`, 11 tests in 17 ms; no build and no launch. T4a uses a
temporary directory. No expensive resource; as designed. No finding.

#### Findings

Finding 1: resolved for its file half. A saved AGENTS.md that is a file is now converted under test, by literal path
and contents, in both real combinations that hold one; the targeted run passed.

2. **The revised T4a dropped the only check that a saved absent AGENTS.md restores as absent** (a regression that
   would be missed). The revision replaced the pre-fix `/w/p` (CLAUDE.md a file, AGENTS.md null, asserted
   `agentsMd: null`) with a detail holding both files, so no case asserts an absent AGENTS.md any more. If the
   AGENTS.md line in `upgradeSavedRead` (`src/shared/display-data.ts:95`) built `{ file, content: saved }` without
   `pathed`'s null check, every test would stay green while each saved detail without an AGENTS.md (21 of 27 in this
   machine's cache) restores with "The file cannot be read" under `<project>/AGENTS.md` until its live read: the
   validator admits `content: null`. The CLAUDE.md side is covered (`/w/r` asserts `claudeMd: null`). Required: give
   T4a a saved detail with CLAUDE.md a file and AGENTS.md null (the real CLAUDE.md-only combination, 3 of 27) and
   assert `agentsMd: null`. Revise the row first, and correct its "as in 6 of the 27 real saved details" to the
   counts above. Then review it under the incremental rule.

Disposition (main agent, 2026-10-29): Finding 2 fixed — T4a's row revised first (design review, "Incremental revision
for the incremental check's Finding 2", with the recounted combinations), then the case: a CLAUDE.md-only saved
detail (`/w/s`) asserted with `agentsMd: null`. The fix-1 log's dependants search did not run (`rg` is a zsh function,
absent under bash — exit 127, as this round found); the fix-2 log searches with `grep`. Targeted verification in
[ticket-326-fix2-verification.log](ticket-326-fix2-verification.log); handed back for an incremental check.

#### Document sync this check creates

Scope as in the first round (document-sync.md), re-listed at 01:21: `docs/.workings/antigravity-side/` now also holds
final-regression.md, ticket-326-fix1-verification.log and ticket-326-fix1-change-scope.log (all read); the worktree
also carries uncommitted edits to both specs, CONTEXT.md and ticket-326-doc-sync.md (diff read).

Facts this range changes: T4a now drives a saved AGENTS.md that is a file, and no longer asserts an absent one. The
targeted run passed. Statements affected:

- this record's T4a row: its "as in 6 of the 27" count, and an input that no longer holds an absent AGENTS.md
  (Finding 2). The "Incremental revision" paragraph's Coverage line ("the row's input now reaches the AGENTS.md
  half") is true, but it does not note the null half that the revision lost.
- checklist.md:154 ("both saved shapes restore — passed | Verified") and final-regression.md:27 (the working records
  "true at this round's commits"): the saved project detail's absent AGENTS.md rests on no assertion until Finding 2
  is fixed.

No spec, feature, ADR or CONTEXT statement changes: the uncommitted spec texts ("restores with each file at its place
in the project"; "the restore … at the display store's filesystem seam") describe what the code does, and Finding 2
concerns its evidence only.

Carried over from the first round's "Differences seen": both are written back in the worktree's uncommitted spec
edits. project-detail's Testing Decisions now say the configuration entries are asserted over any project, and both
specs declare the unreadable slot's prototype exemption. ticket-326-doc-sync.md row 2 marks them done. They are not
yet in a commit, so at 8493010 the two records still run ahead of the specs.
