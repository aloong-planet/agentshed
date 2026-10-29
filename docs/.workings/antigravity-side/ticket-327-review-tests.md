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
| C1 | e2e `app.spec.ts`, new case "the Antigravity side whole: its card read in one pass, and a project every side registers, section by section" | agents-overview::REQ-003/AC-01 (the card whole); project-detail::REQ-002/AC-04 (Overview, Sessions, Skills, Subagents, Plugins, Memory); with project-detail::REQ-002/AC-01 (header chips) and AC-03 (MCP) read on the same page | The e2e harness (built app, fixture home through `AGENTSHED_HOME_OVERRIDE`) — the seam agents-overview's and project-detail's Testing Decisions name | One fixture home: agy's data root with trusted folders `all-sides` (also registered by Claude Code, Codex and Grok) and `agy-solo`; one agy conversation in each, with usage (5k in `all-sides`, 7k in `agy-solo`), the first with a real transcript and an agy title; a Claude, a Codex and a Grok session in `all-sides`, each with a question and usage (1k, 2k, 3k), all four sides' calls on one day; agy's three global skills directories (one name in two of them), a built-in skill, four global agy subagents (both forms), the `flutter` plugin with a skill, an agent and a server, a global MCP file; in `all-sides` a shared-directory skill, a project-level agy subagent, a Claude memory file; a Claude global skill and subagent | (1) The card, read in one pass — its chip, "Detected", the figure and the third line — as one tuple in a single DOM read: `['ANTIGRAVITY', 'Detected', '12k', '2 projects · 3 global skills · 4 subagents']`. Expected values hand-computed from the fixture by the spec's rules: figure = 5k + 7k (token-stats::REQ-003, four-field total; no other window chosen); 2 trusted folders; 3 = agy's library names, the name in two directories once, the built-in and the plugin's skill not counted (skills-view::REQ-001/AC-05, B2); 4 = the global definitions, the plugin's agent not counted (subagents-view::REQ-001/AC-06). (2) The project page: header chips `CLAUDE CODE, CODEX, GROK, ANTIGRAVITY` (SIDE_ORDER as agents-overview::CON-004 names them); Overview per-side figures CC 1k, CX 2k, GK 3k, AG 5k (the fixture's own figures), the shared day's bar with the four providers' segments, the Antigravity mode leaving Google's alone, agy's model among the model rows; Sessions four rows newest first, one per side with its badge (times set by the fixture); Skills the group headings in the order skills-view::REQ-002/AC-01, AC-04 define; Subagents the project-level `.agents/agents` group and Antigravity's global group, no shadow pill on AG rows (subagents-view::REQ-001/AC-05); Plugins agy's plugin "In effect globally · from …" (plugins-view::REQ-001/AC-05); MCP agy's global and plugin servers (AC-03); Memory the Claude memory row and no AG badge (agents-overview::REQ-003/AC-03, memory-view Out of Scope). Copy is the English dictionary's, read from `en.ts`, not from another case | agy conversations from `agy-fixture.ts`'s encoders, pinned byte for byte to real records (#322, #323), and the real `MEASURED_TRANSCRIPT.main` (#324); agy's component directories and the flutter plugin in the shapes of the research record's samples (#325's home); the Claude, Codex and Grok session lines in the shapes the suite's existing cases use (the Grok closeout's combined case), not re-checked against real files this round | The built app (`out/`, built once by `pnpm e2e`'s `electron-vite build`); one Electron launch for the case — one launch per distinct fixture home, the suite's rule — closed and its userData and home removed by `close()`. Nothing else in the suite shares or clears its resources |

### Dimension 1 — Coverage

- The two product acceptance units each name a combined test; C1 is it for both. Their spec failure modes — the card's
  third line in the unreadable and error states, an agy installed and never used, the MCP group's visibility on a
  project's page, a project registered only on Antigravity (D4) — are each driven by an existing case of the ticket that
  owns them (checklist, current verification); C1 deliberately holds none of them, since the unreadable count would
  replace the counts C1 reads (agents-overview::REQ-003/AC-02).
- The token-stats Pending note (token-stats::REQ-003/AC-08) is evidence, not a test: the read-only re-check of this
  machine's conversations is recorded in the checklist.
- Fixture independence: the agy shapes come from real records; see the table. The other sides' session shapes are the
  suite's existing ones, a borrowed shape not re-checked here — their parsers are not this ticket's subject.

### Dimension 2 — Case design

C1 acts only through the window (clicks on tabs, rows and the trend's side switch) and reads rendered DOM; it builds no
state the app does not build itself (every file is one agy, Claude, Codex or Grok writes). Each section is read after
an anchor that only that section's own render draws (its group heading or row), so a read cannot pass on the previous
tab's DOM.

### Dimension 3 — False greens (the three checks a design can settle)

- Constant truth: the counts and figures are distinct (2, 3, 4; 1k, 2k, 3k, 5k, 12k), so a count read from the wrong
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
