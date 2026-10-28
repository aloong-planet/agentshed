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
| T4a | a project detail saved before configuration entries carried their paths restores with them filled in (`display-store.test.ts`) | CONTEXT invariant "A page switch is atomic and a revisit is instant" (restoring runs the live contract; a changed field is filled in) for project-detail::REQ-002/AC-02 | display store (cache file written at the filesystem boundary, then `new DisplayStore(root)`) | a saved detail whose `configs` is `{ claudeMd: CappedText, agentsMd: null, settingsSummary: string }`; a second whose old `claudeMd` is malformed (`7`) | restored `configs` equal the literal `{ claudeMd: { file: '/p/CLAUDE.md', content: <saved text> }, agentsMd: null }` with no `settingsSummary`; the malformed one is dropped | the real display cache on this machine (2026-10-29: 27 saved details, every `configs` holding exactly `claudeMd`, `agentsMd` as `{ text, truncated }`/null and `settingsSummary` as string/null) | none |
| T4b | a snapshot saved before the change restores with its configuration converted (`display-store.test.ts`) | same invariant, for agents-overview::REQ-004 | display store with the main process's global configuration paths injected | a saved snapshot whose `global` holds `claudeGlobalMd` (text), `codexAgentsMd` (text) and `codexConfigSummary`; a second with `codexAgentsMd: null`; the first again parsed without paths | with paths: `claudeMd`/`agentsMd` equal literal ConfigFiles at the injected paths and no old key survives; `codexAgentsMd: null` gives `agentsMd: []`; without paths the snapshot is dropped (fail-closed) | the real cache's `global` key set (2026-10-29: `skills … mcp, claudeGlobalMd, codexAgentsMd, codexConfigSummary`, the three as `{ text, truncated }` / `{ model, projectCount, mcpCount }`); the parts this change does not touch come from `emptySnapshot`, so another ticket's side-set change cannot turn this case red for a reason that is not this one | none |
| T5 | the Configuration section on both pages (`e2e/app.spec.ts`, new case) | agents-overview::REQ-004/AC-01…AC-05; project-detail::REQ-002/AC-02; agents-overview B5, project-detail A4 (regression); the failure modes above; the agents page's link interception (CONTEXT "A link inside rendered content must never navigate the whole window", regression) | e2e (built app over a fixture home, `AGENTSHED_RESCAN_MS=250` so file changes arrive by automatic rescan) | home: global CLAUDE.md (oversized, for the truncation marker), the three AGENTS.md (the Codex one with a relative link), GEMINI.md ×2, rules, `~/.codex/config.toml`; project A with CLAUDE.md and AGENTS.md as a directory and a project-key `allowedTools`; project B with nothing. Then remove `~/.gemini/AGENTS.md`, turn `~/.gemini/config/AGENTS.md` into a directory, and remove all | switch labels exactly `['CLAUDE.md', 'AGENTS.md']` (literal, read once the body is in place); `.cfg-path` texts equal the literal paths in the spec's order after each change; each body's marker; the unreadable sentence under its path; "None" when none, inside the card with no frame of its own (computed `border-top-width` 0px against the card's 1px — the prototype's form; incremental change of 2026-10-29, reviewed: the expected values come from the prototype's drawing, not from the app's CSS); the truncated marker; no GEMINI/rules marker in the pane text; computed style of the path line (monospace, 11px, `--text-2`) and its separator (first 0, later 1px top border) from the prototype; a relative link raises the notice toast and the URL is unchanged | locations as T1a | the e2e build (one `electron-vite build` per `pnpm e2e` run, shared by every case); one app launch for the whole case — every state is reached by rescan rather than a relaunch |
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
(`index.ts` passing the real roots) has no behavioural seam below e2e — recorded as a gap to state in the test file
header if no e2e restore case reaches it.

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
