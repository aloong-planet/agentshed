# Test review — #327 Closeout: full-feature acceptance and documentation regression (Antigravity CLI side)

Ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327) (feature `antigravity-side`) · feature checklist:
[checklist.md](checklist.md) · decisions: [ticket-327-decisions.md](ticket-327-decisions.md)

> Working record, not a source of truth: the current state is in the specs, features, ADRs and CONTEXT.md.

## Design review

Date 2026-10-29 · implementation the design rests on: `dc80aa2` (the landing rehearsal's combined tree: #329, #330,
#323, #325, #324) with this ticket's `db5aecf` (the `~/.gemini` path fold, no test change) · scope: the tests this ticket
writes or changes. Written before any test was written.

This ticket delivers no product behaviour (the issue's "What to build"). Its product acceptance is two cross-ticket
combinations — agents-overview::REQ-003/AC-01 (the side card whole) and project-detail::REQ-002/AC-04 (a project's page
showing the side in every section at once) — each owned in part by several tickets, whose own cases read each part
separately: #322's case reads detection and the project count with zero skills, #323's the figure, #325's the counts
with no usage, #324's the Sessions tab of an Antigravity-only project. No case reads the parts together on one home, and
no case opens a project registered on all four sides with data on each. One e2e case does.

The fold of `db5aecf` changes no behaviour (every root the app or a test builds puts the data root inside `geminiHome`),
so it gets no case of its own: the existing cases that read each folded location stand as its safety net —
`antigravity-components.test.ts` "a name in all three keeps the CLI copy, and one in the second and third keeps the
config copy" (the config and root skills directories), its MCP cases (`config/mcp_config.json`), its plugin and subagent
cases (`config/plugins`, `config/agents`), and `global.test.ts`'s eight AGENTS.md combinations (`config/AGENTS.md`),
all green after the fold (`pnpm test`, 1087 passed, 1 skipped). A state where `geminiHome` and the data root's parent
differ is not reachable through `realRoots()`, so a case pinning which of the two a reader takes would test a state the
product never builds (tdd's reachable-state rule).

### Test design table

| # | Test | Spec units covered | Seam | Input that drives execution into the target branch | Assertion object and source of the expected value | Fixture shape source | Expensive resource and how it is provided |
|---|---|---|---|---|---|---|---|
| C1 | e2e `app.spec.ts`, new case "the Antigravity side whole: its card read in one pass, and a project every side registers, section by section" | agents-overview::REQ-003/AC-01 (the card whole); project-detail::REQ-002/AC-04 (Overview, Sessions, Skills, Subagents, Plugins, Memory); with project-detail::REQ-002/AC-01 (header chips) and AC-03 (MCP) read on the same page | The e2e harness (built app, fixture home through `AGENTSHED_HOME_OVERRIDE`) — the seam agents-overview's and project-detail's Testing Decisions name | One fixture home: agy's data root with trusted folders `all-sides` (also registered by Claude Code, Codex and Grok) and `agy-solo`; one agy conversation in each, with usage (5k in `all-sides`, 7k in `agy-solo`), the first with a real transcript and an agy title; a Claude, a Codex and a Grok session in `all-sides`, each with a question and usage (1k, 2k, 3k), all four sides' calls on one day; agy's three global skills directories (one name in two of them), a built-in skill, five global agy subagents (both forms), one of them (`proj-agent`) named like the project-level one, the `flutter` plugin with a skill, an agent and a server, a global MCP file; in `all-sides` a shared-directory skill, a project-level agy subagent (`proj-agent`), a Claude memory file; a Claude global skill and subagent; a Codex global skill (`codex-helper`, which Skills' Codex group reads) | (1) The card, read in one pass — its chip, "Detected", the figure and the third line — as one tuple in a single DOM read: `['ANTIGRAVITY', 'Detected', '12k', '2 projects · 3 global skills · 5 subagents']`. Expected values hand-computed from the fixture by the spec's rules: figure = 5k + 7k (token-stats::REQ-003, four-field total; no other window chosen); 2 trusted folders; 3 = agy's library names, the name in two directories once, the built-in and the plugin's skill not counted (skills-view::REQ-001/AC-05, B2); 5 = the global definitions, the plugin's agent not counted (subagents-view::REQ-001/AC-06). (2) The project page: header chips `CLAUDE CODE, CODEX, GROK, ANTIGRAVITY` (SIDE_ORDER as agents-overview::CON-004 names them); Overview per-side figures CC 1k, CX 2k, GK 3k, AG 5k (the fixture's own figures), the shared day's bar with the four providers' segments, the Antigravity mode leaving Google's alone, the model rows as the set of the four models, agy's as recorded (token-stats::REQ-003/AC-04; the rows' order is not asserted, no spec stating it); Sessions read first by the rows' question counts `1 question, 4 questions, 1 question, 1 question` (the fixture's questions; the Overview's recent-sessions card draws the same titles and badges but no count), then four rows newest first, one per side with its badge (times set by the fixture); Skills the group headings in the order skills-view::REQ-002/AC-01, AC-04 define, and the plugin row's four side slots 3px apart (`[3, 3, 3]`, the skills-view prototype's `.bdg` gap — the interface baseline, ADR-0033); Subagents the project-level `.agents/agents` group and Antigravity's global group (5), `proj-agent` listed in both, and no shadow pill on any row (subagents-view::REQ-001/AC-05: a same-name pair on the Antigravity side is not shadowed, where Claude's and Codex's would be); Plugins agy's plugin "In effect globally · from …" (plugins-view::REQ-001/AC-05); MCP agy's global and plugin servers (AC-03); Memory the Claude memory row and no AG badge (agents-overview::REQ-003/AC-03, memory-view Out of Scope). Copy is the English dictionary's, read from `en.ts`, not from another case | agy conversations from `agy-fixture.ts`'s encoders, pinned byte for byte to real records (#322, #323), and the real `MEASURED_TRANSCRIPT.main` (#324); agy's component directories and the flutter plugin in the shapes of the research record's samples (#325's home); the Claude, Codex and Grok session lines in the shapes the suite's existing cases use (the Grok closeout's combined case), not re-checked against real files this round | The built app (`out/`, built once by `pnpm e2e`'s `electron-vite build`); one Electron launch for the case — one launch per distinct fixture home, the suite's rule — closed and its userData and home removed by `close()`. Nothing else in the suite shares or clears its resources |

### Dimension 1 — Coverage

- The two product acceptance units each name a combined test; C1 is it for both. Their spec failure modes — the card's
  third line in the unreadable and error states, an agy installed and never used, the MCP group's visibility on a
  project's page, a project registered only on Antigravity (D4) — are each driven by an existing case of the ticket that
  owns them (checklist, current verification); C1 deliberately holds none of them, since the unreadable count would
  replace the counts C1 reads (agents-overview::REQ-003/AC-02).
- The token-stats Pending note (token-stats::REQ-003/AC-08) is evidence, not a test: the read-only re-check of this
  machine's conversations is recorded in [ticket-327-pending-check.log](ticket-327-pending-check.log) and the decisions
  record, and the checklist's closeout row cites it (corrected after the post-implementation check's Finding 4: that row
  was not written yet when this was).
- Fixture independence: the agy shapes come from real records; see the table. The other sides' session shapes are the
  suite's existing ones, a borrowed shape not re-checked here — their parsers are not this ticket's subject.

### Dimension 2 — Case design

C1 acts only through the window (clicks on tabs, rows and the trend's side switch) and reads rendered DOM; it builds no
state the app does not build itself (every file is one agy, Claude, Codex or Grok writes). Each section is read after
an anchor that only that section's own render draws (its group heading or row), so a read cannot pass on the previous
tab's DOM.

### Dimension 3 — False greens (the three checks a design can settle)

- Constant truth: the counts and figures are distinct (2, 3, 5; 1k, 2k, 3k, 5k, 12k), so a count read from the wrong
  slot, or a figure from another side, fails; the card tuple is read in one DOM read, so the four parts are true of one
  render.
- Tautology: every expected value is a literal computed by hand from the fixture; none is computed by product code or
  imported from it.
- Old path: the selectors are the ones the live components render (`.pane-head .stats .stat`, `.tot-sides`,
  `.chart .col`, `.card .se`, `.grp-t`), each read by a passing case of #322–#325 on this tree.

### Dimension 4 — Resource reuse

One launch, one build shared with the whole suite; the fixture home is written once in the case's temporary directory
and is not modified during the case. No resource is cleared by another case. Searched for an existing home to reuse:
`mkAgyComponentsHome` (#325) has the components but no usage, sessions or Grok session; `mkAntigravitySessionsHome`
(#324) has sessions but one side; extending either would change the expectations of their own cases, so C1 builds its
own home from the same helpers.

### Findings

None.

### Increment after the post-implementation check (2026-10-29)

C1's row was amended for the post-implementation check's four findings and for the side-badge slot gap the closeout's
regression fixed (`.bdg` in `theme.css`; final-regression.md, #327 Stage 1); the row above is the amended one. The
test file was edited in the same step as the row, before the case was run. The changed parts, each reviewed:

- Input: a global `proj-agent` beside the project-level one (Finding 1) — the only input that reaches
  subagents-view::REQ-001/AC-05's no-shadowing rule, so the no-shadow read can go red (a shadowed pair draws the pill);
  the card's subagent count and Antigravity's global group move from 4 to 5, the AG rows from 5 to 6, still distinct
  from the other counts. `codex-helper` named (Finding 3). Fixture shape: agy's flat global form, as the other four.
- Assertions: the model rows as a set (Finding 3: the order was the implementation's sort, stated by no spec); the
  Sessions read anchored by the question counts, which only the Sessions section draws (Finding 2) — the Case design
  sentence below is then true as written; the slot gap `[3, 3, 3]` from the skills-view prototype (the closeout's
  `.bdg` fix). Went red against the build without the `.bdg` rule with `[0, 0, 0]`, at that read alone (every read
  before it passed with the amended home): the red is the gap's, not the setup's
  ([ticket-327-gap-red.log](ticket-327-gap-red.log): the command, the build it ran on and the whole output — kept after
  round 2's Finding 5).
- Dimensions over the changed row: coverage — AC-05's no-shadow half now driven end to end (the unit case
  `antigravity-components.test.ts:407` still holds the flags); case design — reads through the window only, each after
  its section's own anchor; false greens — the set read fails on a missing, extra or normalised model, the count read
  fails if the Overview card were read, the gap read fails on touching slots, the pair read fails if either row were
  dropped or a pill drawn; resources — unchanged (one launch, the suite's build).
- Self-check of the fix (post-implementation-check.md items 2–5): item 2, every new or changed assertion against
  Dimension 3's forms — no constant truth (each value is a literal from the fixture or the prototype), no tautology,
  no old path (`.n`, `.bdg .badge`, `.pill.shadow` are rendered by `DetailPane.tsx:433`, `SkillExpandBlock.tsx:121`,
  `SubagentsView.tsx:105-106`), no conditional skip, every assertion awaited; item 3, the fix's product change is the
  one CSS rule — its one branch (the rule applies to every `.bdg`) is driven by the gap read on project detail; its other uses, the
  agents page's Skills and Subagents lists, by the screenshot run after the fix (computed gaps and window screenshots,
  ticket-327-ui-evidence.log); item 4, the new fixture input is a
  file in the form agy's samples have (the flat global definition, #325's research sample); item 5, no shared helper
  changed (the home builder is C1's alone). No finding.

## Post-implementation check

Date 2026-10-29 · ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327) (aloong-planet/agentshed,
feature `antigravity-side`) · implementation: `4e6a3c4`, range `dc80aa2..4e6a3c4` (`db5aecf`, `87ec0b3`, `4e6a3c4`) ·
first round, handed over by `/implement` step 6, done by an independent sub-agent · scope: the tests the range adds or
changes, which is C1 alone (`e2e/app.spec.ts:7012`, its home `mkAntigravityCloseoutHome` at :6904; by
`git log --stat dc80aa2..4e6a3c4`, `db5aecf` changes three product files and no test, `4e6a3c4` only records), and the
test design table. No product code, test or test data was changed, and no test was run for this check: each "when does
it go red" below is answered from the code and the expected value's source.

### Run evidence

[ticket-327-gate-prereview.log](ticket-327-gate-prereview.log), the pre-review run of 09:09:43–09:13:41:

- Version: `git rev-parse HEAD` is `4e6a3c47ad1f`, the end of the handed range (committed 09:09:33, before the run);
  `git status --porcelain --untracked-files=all` listed nothing, so the version list is empty. The worktree is still
  clean at review time; the only file outside `git status` is the log itself (git-ignored, written by the run).
  Matches the range.
- Every command carries its full output and an exit code taken without a pipe: the eleven commands of `pnpm verify`
  (typecheck, lint, test, test:scripts, test:site, check:ui, check:lang, check:i18n, check:nul, build + Playwright,
  smoke), with the e2e narrowed to `e2e/app.spec.ts` by the two commands before it (the only e2e file the range changes,
  and the only one the importer search finds; that search's own code `grep-exit=0` is read after `;`, not a pipe); all
  `exit=0`, `OVERALL exit=0`. The range changes a test file, so no command could be skipped, and none was.
- The reviewed test ran: test 97, `e2e/app.spec.ts:7012`, passed (1.0 s), in a run of 97 passed on one fresh build.

Conclusion: the log carries every item full-verification-gate.md requires, and its version is the range's end. No
finding.

### Per-case consistency with the test design table

| C1 column | Written test | Against the table |
|---|---|---|
| Spec units | the comment above the case (:7007-7011) | Matches |
| Seam | the built app through `launch(undefined, home)` (`AGENTSHED_HOME_OVERRIDE`) | Matches |
| Input | `mkAntigravityCloseoutHome` | Every listed input is there. One is not listed: Codex's global skill `codex-helper` (:6951), which the Skills heading "Global level · Codex(1)" reads — Finding 3 |
| Assertion object, expected value source | :7021-7101 | Matches for the card tuple, the chips, the per-side figures, today's bar and the Antigravity mode, Sessions, Skills, Plugins, MCP and Memory. Written beyond the table: Subagents asserts the whole heading list and five AG rows (spec-sourced: subagents-view's "Project detail's layout"); the model rows are the whole list in one order where the table has "agy's model among the model rows" — Finding 3. The no-shadow read the table cites for subagents-view::REQ-001/AC-05 has no input that reaches that rule — Finding 1 |
| Fixture shape source | :6904-7010 | Matches: agy's records through `agy-fixture.ts`'s encoders and `MEASURED_TRANSCRIPT.main` / `MEASURED_TITLE` (both unchanged in the range); the components in the shapes of #325's home (`mkAgyComponentsHome`, :1141, trimmed of fields nothing here reads); the Claude, Codex and Grok lines in the shapes of the three-sides case (:4479), plus a message id on Claude's assistant line and the Codex `config.toml` registration of :1150 |
| Resource | one `launch` (:7014), one `close` (:7102) | Matches |

Test file header: `e2e/app.spec.ts`'s known-gaps paragraph is unchanged and needs nothing from this case. C1 has no
untestable path, and the fold's unreachable state (`geminiHome` apart from the data root's parent) is not a behaviour
to drive. Its premise re-checked: every `ScanRoots` builder in the repository (`rg -n -uu "antigravityHome\s*[:=]"`
outside `node_modules`, `out` and `docs`: `realRoots()` and 16 test fixtures, plus the interface field) puts the data
root inside `geminiHome`, and `geminiDir` is named only in records. The safety-net cases the design review names exist
(`antigravity-components.test.ts:142`, the `it.each` of eight at `global.test.ts:231`) and passed in the run.

### Coverage

- agents-overview::REQ-003/AC-01: C1 drives detection (data root present), the figure for the default all-history
  window (5k + 7k from conversations two days apart), the project count (two trusted folders), the skill count (three
  names, with the inputs that would inflate it: one name in two directories, a built-in skill, a plugin skill) and the
  subagent count (four, both forms; the plugin's agent as the inflating input). Other windows are #323's case ("the card
  in every window").
- project-detail::REQ-002/AC-04 on one project registered on all four sides: Overview (per-side row, today's bar with
  four providers, the Antigravity mode, model rows), Sessions (Finding 2), Skills (skills-view::REQ-002/AC-01's place
  and badges, AC-04's group, AC-05's AG badge on the plugin row), Subagents (AC-05's heading; AC-06's plugin agent kept
  out, so Antigravity's global group counts 4), Plugins (plugins-view::REQ-001/AC-05), Memory (the Claude file renders).
  With AC-01 (the chips) and AC-03 (MCP: both agy servers and nothing else).
- subagents-view::REQ-001/AC-05's no-shadowing half: not driven by C1, and held elsewhere — Finding 1.
- The failure modes the design review assigns to other tickets' cases, spot-checked on this tree: agy installed and never
  used (`antigravity.test.ts:169`), the unreadable count and the corrupt settings file (e2e cases 12 and 13 of the run),
  the count in the saved snapshot (`display-store.test.ts:303`), the MCP group only with servers (checklist :240, #325),
  the Antigravity-only project's D4 state (e2e case 10). All present.
- token-stats::REQ-003/AC-08 (evidence, not a test): Finding 4.
- Fixture independence: as the design review records; the sources were re-read above.

### Case design

C1 acts through the window only (tab, row and mode clicks), reads rendered DOM, and writes files in the forms the agents
write; no cast, no internal state. It is isolated (its own home and userData, times relative to now). After each tab
switch the read waits on content only the new tab can match — Skills (five headings), Subagents (four exact headings),
Plugins (the `flutter` row's `.ds`), MCP (two exact names), Memory (`.md` holding the note); Overview is the landing tab,
and the chips have no earlier `.det-title`. Sessions is the exception: its rows' `.se`, `.t` and `.badge` are also the
Overview tab's recent-sessions card — Finding 2.

### False greens

Per the project's capability declaration, mutation-testing is not enabled (`enabled = false`), so mutation testing is
skipped. Each read of C1, and when it goes red:

| Read (line) | Goes red when |
|---|---|
| Card tuple (:7021-7031) | the chip is wrong, the side is not detected, the figure is not 12k (one window only; a call counted three times, as token-stats::REQ-003/AC-01 forbids; the solo conversation lost), a count is inflated by the second copy, the built-in, the plugin's skill or agent, or the line is replaced by the unreadable notice. One `expect.poll` over one `evaluate`, so the polled expression is the asserted one (false-greens form 5) |
| Chips (:7036) | ANTIGRAVITY is missing or out of side order |
| Per-side figures (:7043-7046) | a side's figure is off (AG reads 12k if the solo conversation leaks into the project) |
| Today's bar (:7048) | a provider is absent: a segment is emitted only for a value above 0 (`trend.ts:88`), so the count is not an existence check (form 1) |
| Model rows (:7049) | agy's model is missing or normalised, or the rows are not in total-descending order (Finding 3 for that order's source) |
| Antigravity mode (:7050-7052) | another provider's segment stays, or Google's is gone |
| Sessions (:7057-7058) | a side's session is missing, out of order, or agy's title is not used; the same values are on the Overview card (Finding 2) |
| Skills (:7064-7073) | a group is missing, misplaced or miscounted (the built-in listed gives (4)); the plugin row's fourth slot is a text-less `badge miss` when the row lacks AG (`SkillExpandBlock.tsx:121-131`) |
| Subagents headings and AG rows (:7077-7083) | a group is missing or miscounted; the plugin's agent listed gives 5 and 6 |
| No shadow pill (:7084) | never with this home — Finding 1 |
| Plugins (:7088-7090) | the plugin is not in effect globally, or the marketplace is missing |
| MCP (:7094) | a server is missing, misnamed, or one more is listed |
| Memory (:7098-7099) | the file is not shown, or an AG-badged element appears in the tab (the form side-specific rows take, as on the agents page's Memory); a badge-less addition would pass, since the project tab draws no side badge today. The Antigravity-only D4 state is #322's case |
| Errors (:7101) | the main process reports an error |

No conditional skip; the one loop runs over a literal list of four; every assertion is awaited; every selector is live
(each matched in this run; `.pill.shadow` is `SubagentsView.tsx:105-106`).

### Resource reuse

Counted from the run: one `electron-vite build` (log :565-592, its main, preload and renderer bundles) before the
Playwright command, shared by all 97 cases: 1 build, as designed. Electron launches print nothing per launch; from the
code, C1 has one `launch` and one `close`. The quiet Electron copy (the global setup, once per Playwright process) is
neither built nor cleared by C1. No case clears a resource another uses: every deletion in `e2e/`
(`rg -n "rmSync\(|unlinkSync\(|rm -rf" e2e`) targets a case's own fixture files, home or userData, nothing in `e2e/`
names `out/`, and only the global setup names the quiet copy. No finding.

### Findings

1. **C1's no-shadow read cannot go red, so it is no evidence of subagents-view::REQ-001/AC-05's no-shadowing rule**
   (inaccurate record). The rule only matters when one name is defined at two levels; C1's home defines none twice —
   Claude's `claude-reviewer` (:6938), agy's global `flat-one`, `flat-two`, `dir-one`, `dir-two` (:6989-6992), agy's
   project-level `proj-agent` (:7003) — so every row's `shadows` and `shadowed` are false whatever the implementation
   does, and `count()` is 0. The test design table ("no shadow pill on AG rows (subagents-view::REQ-001/AC-05)") and
   the case's comment (:7075) claim it. The rule itself is held: `antigravity-components.test.ts:407` defines `dup` at
   both levels and asserts both rows false/false, and the renderer draws the pill only from those flags
   (`SubagentsView.tsx:105-106`). Required: correct the table so that C1 claims only AC-05's heading half and names the
   unit case for the other (and reword or drop the read's comment); or, if the e2e should hold it, give the home a
   same-name pair (a global `proj-agent`, say) and re-derive the card's and the AG rows' counts.
2. **The Sessions read cannot tell the Sessions section from the Overview card** (inaccurate record). The design
   review's Case design says each section is read after an anchor only that section draws. `.pane-body .card .se` with
   `.t` and `.badge` is also the Overview's recent-sessions card (`DetailPane.tsx:259-260`, `OVERVIEW_SESSIONS = 5` at
   :195), drawn from the same `detail.stats.sessions` (:318) in the same order: four rows with C1's exact titles and
   badges. What keeps the read on the Sessions section is that the click commits the tab switch before the first poll
   (the tab does not suspend: its one query, `useSessionSearchQuery`, is a plain `useQuery`, disabled while the needle
   is empty, `session-search-query.ts:42`) — reasoned from the code, not measured. Required: make the record true,
   preferably by anchoring the read on the Sessions section (its rows' question counts `.n`, which the Overview card
   does not draw), which makes the existing sentence true; otherwise rewrite the sentence to name the Overview card and
   the commit order the read rests on.
3. **The test design table's C1 row understates two written assertions** (inaccurate record). The model rows (:7049)
   are asserted as the whole list in total-descending order, where the row has "agy's model among the model rows";
   that order is the implementation's sort (`src/shared/usage.ts:95`), and a search of token-stats.md and the features
   pages found no statement of it, so the row names no source for it. The Skills read relies on Codex's global group,
   fed by `codex-helper` (:6951), an input the row does not list. Required: amend the row (assertion object, expected
   value source, input) and review the changed row under the design review's incremental rule; or narrow the
   model-row read to what the row states.
4. **The AC-08 re-check is said to be recorded in the checklist; it is not, yet** (inaccurate record). The design
   review's Coverage: "the read-only re-check of this machine's conversations is recorded in the checklist". At
   `4e6a3c4`, checklist.md has no #327 row (its AC-08 rows are #322's at :162 and #323's at :179); the re-check is in
   [ticket-327-pending-check.log](ticket-327-pending-check.log) and the decisions record. The ticket names the
   checklist's current verification as this evidence's home, to be written at T10. Required: point the sentence at the
   log and the decisions record, and mark the checklist row as still to be written.

### Document sync this check creates

Scope (document-sync.md): the handed specs (agents-overview, project-detail, token-stats; the cited skills-view and
subagents-view sections for the units above) and the gate log; every entry of `docs/.workings/antigravity-side/`
(`ls -A`: 63 entries, none hidden; 62 tracked, the gate log git-ignored), reading this ticket's decisions, code review,
doc-sync and pending-check records and the checklist's #322-#327 rows; the issue body of #327 (`gh issue view`); and an
`rg -uu` search of `docs/`, `CONTEXT.md`, `AGENTS.md`, `README.md` and `README.en.md` for statements resting on C1
(`Antigravity side whole`, `mkAntigravityCloseoutHome`, `card read in one pass`, `ticket-327`): hits in this ticket's
records and logs only, and a file list in ticket-322-gate-fix1.log. Excluded beyond that search: other features' working
directories, and specs, features, ADRs, CONTEXT.md and the READMEs, which state behaviour no finding changes.

Statements the findings leave untrue until handled:

- this record: the C1 row (Findings 1 and 3), the design review's Coverage sentence on AC-08 (Finding 4) and its Case
  design sentence on anchors (Finding 2);
- ticket-327-review-code.md, spec final check row 2, "the e2e case reads each section on one project registered on
  every side": for Sessions it holds by the commit order of Finding 2, exactly once the read is anchored;
- checklist.md's #327 current-verification rows (not yet written, T10): they must not cite C1 for AC-05's no-shadow
  half (cite `antigravity-components.test.ts:407`), and the AC-08 row cites the re-check log.

No spec, features, ADR or CONTEXT.md statement changes: no finding concerns behaviour.

### Handling of the findings (main agent, 2026-10-29)

The hand-back's four titles match the four findings above (numbers and subjects). Each handled in the fix after
`274cb00`, together with the closeout's `.bdg` slot gap (the regression's fix, its read added to C1):

1. Handled by giving the home a same-name pair: agy's global `proj-agent` beside the project-level one. The no-shadow
   read now has an input that reaches subagents-view::REQ-001/AC-05 (a shadowed pair draws the pill), and the case
   reads both `proj-agent` rows before it; the card's subagent count and Antigravity's global group became 5, the AG
   rows 6. The table row and the case's comment say what the read now holds.
2. Handled by anchoring: the Sessions read first waits for the rows' question counts (`.n`), which the Overview's
   recent-sessions card does not draw (`DetailPane.tsx:259-264` against `:433`), so the Case design sentence holds as
   written.
3. Handled by narrowing: the model rows are read as a set of the four models (agy's as recorded), the order being stated
   by no spec; the row names `codex-helper`.
4. Handled in the record: the Coverage sentence points at the re-check log and the decisions record; the checklist's
   closeout row, written with the regression, cites the log.

The increment to the design (the amended row and its review) is in the Design review section above. The fix's targeted
run and change scope are in the decisions record's work log; the fix changes a test file, so an incremental check
follows.

## Post-implementation check — incremental, round 2

Date 2026-10-29 · ticket: [#327](https://github.com/aloong-planet/agentshed/issues/327) (aloong-planet/agentshed,
feature `antigravity-side`) · implementation: `9762152`; the fix's range `274cb00..9762152` (one commit, `9762152`) on
the original range `dc80aa2..4e6a3c4` · incremental round, handed over by `/implement` step 6, done by an independent
sub-agent. No product code, test or test data was changed; no test was run and the app was not built for this round:
each "when does it go red" below is answered from the code and the expected value's source.

### Objects of this round

- The range's files (`git diff --name-status 274cb00 9762152`): `e2e/app.spec.ts`, `src/renderer/src/theme.css`, and
  six records under `docs/.workings/antigravity-side/` (decisions, code review and this record changed; the pre-review
  log, the fix's targeted log and the UI evidence log added).
- Tests the range changes: `git diff 274cb00..9762152 -- e2e/app.spec.ts` has hunks only in `mkAntigravityCloseoutHome`
  (:6894-7006) and C1 (:7013-7115). Object: C1.
- Tests depending on test helper code the range changes:
  `git diff --name-only 274cb00 9762152 -- e2e src scripts site test tests playwright.config.ts vitest.config.ts package.json`
  lists `e2e/app.spec.ts` and `src/renderer/src/theme.css` (product code, not a helper). The one helper changed is
  `mkAntigravityCloseoutHome`, local to `app.spec.ts`: `rg -n -uu "mkAntigravityCloseoutHome" --glob '!node_modules'
  --glob '!out' .` finds its definition (:6904), its one call in C1 (:7014) and records. Importers of `app.spec.ts`:
  `rg -n -uu "from ['\"]\.\.?/(e2e/)?app\.spec" --glob '!node_modules' .` finds none (exit 1); the same form for
  `close-app` finds its eight importers (control). No further test.
- Test design table rows the range changes: this record's diff in the range changes the C1 row (with the Design
  review's Dimension 1 and Dimension 3 sentences and the new increment subsection). Object: C1's row.

Everything else carries round 1 (the "Post-implementation check" section above, at `4e6a3c4`): the coverage of the
units and failure modes the fix does not touch, the fixture independence of the unchanged inputs, the safety-net cases
of `db5aecf`, and the reads of C1 the fix leaves as they were (chips, per-side figures, today's bar, the Antigravity
mode, Skills headings, Plugins, MCP, Memory, errors; only their line numbers moved).

The closeout's T10 ran in parallel in the same worktree: during this round it committed `e66b9fa`, `06228a6`,
`7429f83` and `d00cd4e` after the range (records, one audit log and one features sentence on Antigravity CLI forks; no
test or product code, by `git diff --stat 9762152..HEAD`), and `checklist.md` stayed modified and uncommitted. This
round reviews the range only; it reads T10's records only where the document sync check below says so, and changes
none of them.

### Run evidence

[ticket-327-fix-targeted.log](ticket-327-fix-targeted.log), the fix's targeted run of 09:32:35-09:35:43:

- Version: `git rev-parse HEAD` is `274cb00`, with three files modified (:5-9); their `git hash-object` (:10-13,
  `063c3e5…`, `e606c48…`, `82b35cb…`) equal the blobs of `9762152` at the same paths (`git rev-parse 9762152:<path>`).
  The other five paths `9762152` changes are records under `docs/` that neither the build nor C1 reads: the decisions
  and code review records (unmodified at run time, changed after), the targeted log (written by the run), and the
  pre-review and UI evidence logs (git-ignored then, added in the commit). The run's code is the range's end for
  everything C1 and its build read. Matches the range.
- Every command carries its full output and an exit code taken without a pipe: typecheck, lint, the search for tests
  reading `theme.css` (its code `grep-exit=0` read after `;`), `check:ui`, the unit suite, and build + Playwright on
  `e2e/app.spec.ts`; all `exit=0`, `OVERALL exit=0`.
- The reviewed test ran: case 97, `e2e/app.spec.ts:7013`, passed (1.0 s), in 97 passed on one fresh build (:268-397).

Conclusion: the log carries every item full-verification-gate.md requires, and its version is the range's end. No
finding.

### Per-case consistency with the test design table (C1's amended row)

| C1 column | Written test | Against the row |
|---|---|---|
| Spec units | the comment above the case (:7008-7012) | Matches |
| Seam | `launch(undefined, home)` (:7015) | Matches |
| Input | `mkAntigravityCloseoutHome` (:6904-7006) | Matches: five global agy subagents in both forms (:6989-6993), `proj-agent` among them (:6989), the project-level `proj-agent` (:7004), `codex-helper` (:6951); the other inputs as round 1 found them |
| Assertion object, expected value source | :7019-7113 | Matches: the card tuple with `5 subagents` (:7032); the model rows as the set of four (:7050-7051); Sessions read first by the counts `1 question, 4 questions, 1 question, 1 question` (:7060), then titles and badges; the plugin row's gaps `[3, 3, 3]` (:7078-7082); Subagents headings with `Antigravity(5)`, `proj-agent` in two rows (:7095) and no shadow pill (:7096). Written beyond the row, as round 1 found for the five rows then: the six AG rows (:7094), spec-sourced (subagents-view's "Project detail's layout") |
| Fixture shape source | :6989 | Matches: the new global definition is the flat form (`<name>.md` with `name` and `description`) of the four beside it, #325's research sample |
| Resource | one `launch` (:7015), one `close` (:7114) | Matches |

Test file header: the range does not change `e2e/app.spec.ts`'s head, and the fix adds no untestable path. No finding.

### Coverage

- subagents-view::REQ-001/AC-05, its no-shadowing half, is now driven by C1. Both `proj-agent` definitions are keyed
  `proj-agent` (`readAntigravitySide` keys by the front matter's `name`, `subagents.ts:159-161`), so the side's rule
  (`shadowing = side !== 'antigravity'`, `subagents.ts:224`) decides both rows' flags: were agy judged as Claude is,
  the project row would carry `shadows` and the global one `shadowed` (:232, :245), each drawn as `.pill.shadow`
  (`SubagentsView.tsx:105-106`). Round 1's Finding 1 is resolved; `antigravity-components.test.ts:407` still holds
  the flags.
- agents-overview::REQ-003/AC-01, the subagent count: 5 is the five global definition files, the plugin's agent not
  counted (subagents-view::REQ-001/AC-06); a project-level definition does not enter the global count.
- token-stats::REQ-003/AC-04 on the project page: the set read holds agy's id as recorded; the routing-suffix form
  (`gemini-3.8-flash-n`) is held by `antigravity.test.ts:539` and #323's e2e case (`app.spec.ts:1083`), not by C1.
- project-detail::REQ-002/AC-04, Sessions: the question counts are now read. Expected values from the fixture: one
  question in each of the Claude, Codex and Grok lines; four in `MEASURED_TRANSCRIPT.main` (its four `USER_INPUT`
  lines, steps 0, 4, 12 and 19; `agy-transcript-fixture.ts:12` says so). The words are `en.ts:323`'s.
- The slot gap is not a spec unit: no spec, features page or CONTEXT.md sentence states the slots' spacing (search
  below). Its expected value is the skills-view prototype's `.bdg{display:flex;gap:3px;flex:none}`
  (`prototype-skills-preview.html:110`; the agents-page prototype's `:144` has the same gap with a 96px width), the
  interface baseline (ADR-0033). The rule is one selector, so C1's read goes red if it is removed or its gap changed
  for every use; the class's other use on the agents page (`SubagentsView.tsx:43`, and `SkillExpandBlock.tsx:121` on
  that page's Skills rows) is read by no case, its evidence being the UI evidence log. A prototype drawing rather than
  a spec behaviour, it is outside this review's findings.

No finding.

### Case design

- The new input is a file agy reads (`~/.gemini/config/agents/<name>.md`, subagents-view::REQ-001/AC-01), in the form
  of the four beside it; one name at two levels is a state a user makes. No cast, no internal state.
- The Sessions read now waits on `.n` (`DetailPane.tsx:433`), drawn only by the Sessions section's rows (:418-437);
  the Overview's recent-sessions card (:258-267) draws none, so the read cannot pass on the Overview's DOM. Round 1's
  Finding 2 is resolved, and the design review's Case design sentence holds as written.
- The model read waits for four rows (`toHaveCount(4)`), then reads their text once.
- The gap read measures the rendered geometry through the window, after the auto-waiting read of the same row's
  fourth slot (:7077), drawn in the same render. The gap is a CSS length, not a font metric, so it does not move with
  the platform's fonts.

No finding.

### False greens

Per the project's capability declaration, mutation-testing is not enabled (`enabled = false`), so mutation testing is
skipped. Each read the range adds or changes, and when it goes red:

| Read (line) | Goes red when |
|---|---|
| Card tuple (:7023-7032) | as round 1, with the count now 5: the global `proj-agent` dropped or merged with the project's (4), the plugin's agent counted (6), a form not read |
| Model rows (:7050-7051) | a model is missing, added, duplicated or changed from the recorded id (agy's `gemini-3.6-flash`): the count fails on a fifth row, the sorted list on any other difference. The order is not read |
| Sessions counts (:7060) | the Sessions section is not the one drawn (no `.n` on the Overview), a count is wrong (agy's 4 from its transcript), or the rows are not newest first (the 4 moves) |
| Sessions titles and badges (:7061-7062) | as round 1, now on the Sessions section's rows |
| Slot gap (:7078-7082) | the slots touch — without the rule `.bdg` is an inline span whose badge spans have no whitespace between them (`SkillExpandBlock.tsx:121-133`), so 0 — or stand at a distance that rounds to anything but 3, or a slot is missing (fewer than three gaps), or the row is absent (an empty list). `evaluateAll` does not wait; it follows :7077 |
| Subagents headings and AG rows (:7088-7094) | a group is missing or miscounted: the plugin's agent listed gives `Antigravity(6)` and 7 rows, the global `proj-agent` dropped gives 4 and 5 |
| The `proj-agent` pair (:7095) | either row is dropped |
| No shadow pill (:7096) | the agy pair is judged as Claude's or Codex's would be (`subagents.ts:224`): two pills. A one-shot count after the auto-waiting reads of the same render; rows and pills are drawn together (`SubagentsView.tsx:88-108`) |

No constant truth (5 and 6 are distinct from the other counts; touching slots cannot give 3), no tautology (every
expected value is a literal from the fixture, a spec or the prototype; the sorted list is the expected set written in
order, not computed by product code), no old path (`.n`, `.bdg .badge`, `.pill.shadow` and `.models .m .nm2` are the
live components' and matched in the targeted run), no conditional skip, and every assertion is awaited or made on an
awaited value.

The records state that C1's gap read was run red without the rule; that statement's evidence: Finding 5.

### Resource reuse

Counted from the targeted log: one `electron-vite build` (:268-295, its main, preload and renderer bundles) before
the one Playwright command, 97 cases in one worker, C1 case 97: 1 build, as designed. From the code, C1 has one
`launch` (:7015) and one `close` (:7114). The range adds no deletion, launch or close in `e2e/`
(`git diff 274cb00 9762152 -- e2e | rg -n "^[+-].*(rmSync|unlinkSync|rm -rf|launch\(|close\()"`: none, exit 1), so
round 1's finding that no case clears a resource another uses carries. No finding.

### Findings

5. **C1's gap read is recorded as run red without the rule, but that run's output is kept nowhere the records cite**
   (inaccurate record). The design review's increment ("Went red against the build without the `.bdg` rule with
   `[0, 0, 0]`, at that read alone (every read before it passed with the amended home): the red is the gap's, not the
   setup's") and the decisions record (the `.bdg` row, "red `[0, 0, 0]` without it"; T9, "the gap read red against
   the build without the rule (`[0, 0, 0]`, at that read alone)") state a run of C1 and cite no output for it. T9's
   link, [ticket-327-ui-evidence.log](ticket-327-ui-evidence.log), holds the throwaway screenshot spec's gaps on the
   agents page's Skills rows (`[0,0,0]` before, `[3,3,3]` after), not a run of C1; the targeted log is green. The
   output exists only in the session's scratchpad (`c1-red-before-css.log`, 09:31: C1 failing at `app.spec.ts:7082`
   with `[0, 0, 0]` against `[3, 3, 3]`), which is temporary and carries neither its command nor the build it ran on.
   document-sync.md requires original evidence a current conclusion rests on to be kept and cited. The test is not in
   question: the read goes red without the rule by the markup (False greens above). Required: keep that output in the
   ticket's records with its command and the build it ran on, and cite it from both records; or reword both records
   to what their cited evidence shows (the agents page's computed gaps, and the reasoning from the markup).

### Document sync this check creates

Facts the range changes: C1's home gains a global `proj-agent`, so the card reads 5 subagents, Antigravity's global
group 5 and the AG rows 6, and C1 drives AC-05's no-shadow half; the model rows are read as a set; the Sessions read
is anchored on the question counts; the `.bdg` rule and C1's gap read; the targeted run (97 passed).

Scope (document-sync.md): the handed specs' parts these facts touch (subagents-view::REQ-001/AC-01 to AC-06 and its
"Project detail's layout", token-stats::REQ-003/AC-04), and agents-overview, project-detail, skills-view,
subagents-view, `docs/features/` and CONTEXT.md searched for any statement of the slots' spacing (`slot`, `apart`,
`spacing`, `gap`: none about the badge slots); the two handed prototypes' `.bdg` rules; the range's diff; every entry
of `docs/.workings/antigravity-side/` (`ls -A`: 65, none hidden; 65 tracked; `git ls-files --others --ignored
--exclude-standard`: none), reading in full this record, the targeted log, the UI evidence log and the decisions
record, the code review record's addendum, T10's closeout rows of checklist.md (:252-256, uncommitted), its doc sync
row for the gap (ticket-327-doc-sync.md:14) and final-regression.md's #327 headings; the issue body of
#327 (`gh issue view 327 --json body`, searched for the facts' terms: one hit, the AC-01 acceptance line, which states
no count); and an `rg -uu` search of `docs/` (logs and prototypes excluded: the logs are original evidence, the
prototypes were read directly), CONTEXT.md, AGENTS.md, README.md and README.en.md for statements resting on the facts
(`4 subagents`, `Antigravity(4)`, `shadow pill`, `no-shadow`, `.bdg`, `3px apart`, `slot gap`, `touching`,
`fix-targeted`, `ui-evidence`, `AG rows`, among others): 80 lines; outside this feature's records only unrelated
uses of the words, inside them this ticket's records, #325's worklog rows on the gap and the closeout's rows.

- Untrue: Finding 5 (the design review's increment in this record, and the decisions record's `.bdg` row and T9).
- Not true at `9762152`, made true by T10 after it: the increment's "final-regression.md, #327 Stage 1" (the #327
  section from :287, Stage 1 at :319, committed in `e66b9fa`); the design review's Coverage sentence ("the
  checklist's closeout row cites it") and the Handling of Finding 4 hold in the worktree only — the closeout rows
  (:252-256; :254 cites the pending-check log) are not committed yet, and the sentences hold in the repository once
  they are. The checklist's rows :252-253 agree with the amended C1 (five subagents; `proj-agent` in both agy groups
  with no shadow pill; slots 3px apart; four questions; a model row per side).
- The code review record's addendum agrees with the case, and T10's doc sync row for the gap (no features or spec
  sentence states the spacing) agrees with the search above.

No spec, features, ADR or CONTEXT.md statement changes: the facts concern the test, and a prototype drawing that no
document states.

### Handling of round 2's finding (main agent, 2026-10-29)

The hand-back's one title matches Finding 5 above. Handled by keeping the evidence:
[ticket-327-gap-red.log](ticket-327-gap-red.log) holds the run of C1 against the build without the `.bdg` rule — its
command, the build it ran on (the pre-review run's, at `4e6a3c4`, whose `theme.css` holds no `.bdg` rule; a control rule
found), the whole output (C1 failing at the gap read, `[0, 0, 0]` against `[3, 3, 3]`) and its exit code — and the design
review's increment and the decisions record's `.bdg` row and T9 cite it.

The round's document-sync notes on T10 hold once T10's records are committed: the checklist's closeout rows (which the
design review's Coverage sentence and Finding 4's handling point to) are committed with the full gate's figures, and
final-regression.md's #327 section is committed (`e66b9fa`).

No further round: the fix changes records only. Change scope against `9762152` (the fix uncommitted,
`node ~/.claude/skills/implement/change-scope.mjs --base 9762152`):

```
inert   docs/.workings/antigravity-side/checklist.md
inert   docs/.workings/antigravity-side/final-regression.md
inert   docs/.workings/antigravity-side/ticket-325-worklog.md
inert   docs/.workings/antigravity-side/ticket-327-audits.log
inert   docs/.workings/antigravity-side/ticket-327-decisions.md
inert   docs/.workings/antigravity-side/ticket-327-doc-sync.md
inert   docs/.workings/antigravity-side/ticket-327-review-tests.md
inert   docs/features/session-view.md
verdict: skip (8 files differ from the base)
change-scope exit=0
```

(The gap-red log is new and git-ignored until added, so change-scope does not list it; it is a record.) The
post-implementation check ends with round 2's hand-back.
