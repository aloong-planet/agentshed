# Test review — #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) (feature slug `antigravity-side`) · feature checklist:
[checklist.md](checklist.md)

## Design review

Date 2026-10-29. Implementation version: a474875 (#322's head, the base this branch starts from; no code of this ticket
written yet). Scope: every test this ticket plans to write or change, listed in the test design table below.

### Test design table

Seams: **P** = the providers seam (Vitest over temporary fixture directories, through each reader's exported function,
as ADR-0002); **C** = the contract seam (validate / display restore, pure functions); **S** = the shared pure module
seam; **E** = e2e (Playwright driving the built Electron app over a fixture home through `AGENTSHED_HOME_OVERRIDE`).

Fixture shape sources: **S-plg** = the official `flutter` plugin as agy installed it
(`~/research/antigravity-cli-internals/spike/samples/global/.gemini/config/plugins/flutter/`: top-level `plugin.json`,
`skills/<name>/SKILL.md` with a nested `metadata:` block, `agents/a11y_agent.md` whose front matter has a quoted
description and a block-list `tools:`, `mcp_config.json`, `rules/*.md` and `.mdc`); **S-cfg** = `config.json` and
`config.disabled-sample.json` from the same samples, plus the fresh-install shape measured in research §10.9 (an entry
with `installedFrom` and no `enabled` key); **S-mcp** = the global `mcp_config.json` sample (a stdio server and a
`serverUrl` server, both `disabled: true`) and this machine's real `~/.gemini/config/mcp_config.json`, a 0-byte file
(observed 2026-10-29, names only); **S-agt** = `config/agents/sample-flat.md`, `config/agents/sample-reviewer/agent.md`
(`mainAgent: false`) and the project's `.agents/agents/demo-agent/agent.md`; **S-skl** = the project's
`.agents/skills/demo-skill/SKILL.md` and agy's measured precedence of the three global directories (research §10.9,
runs s20–s23); **S-bin** = `~/.gemini/antigravity-cli/builtin/skills/agy-customizations` (real directory name, observed).
Field values are invented freely; the structures follow the samples.

| # | Test (planned name) | Spec coverage | Seam | Input that drives the target branch | Assertion object · expected value source | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| U1 | a name in two of agy's global directories is one row, the copy from the first | skills-view::REQ-001/AC-01 | P (`scan` → `snapshot.global.skills`) | `x` in `antigravity-cli/skills` and `config/skills` with different descriptions and file counts | the row's `sides`, `description`, `pkg.antigravity.files` · spec AC-01 order (first over second) | S-skl | none |
| U2 | a name in all three, and in the second and third, keeps the measured order | skills-view::REQ-001/AC-01 | P | `y` in all three dirs; `z` in `config/skills` and `~/.gemini/skills` only | description of `y` = the CLI copy's, of `z` = the config copy's · spec AC-01 / research s20–s23 | S-skl | none |
| U3 | the preview opens the copy agy uses | skills-view::REQ-001/AC-01 (preview), C9 | P (`resolveSkillRoot` + `listSkillPackageFiles`) | `y` from U2, each copy with a distinguishing extra file | the resolved root's real path and the listed file names · spec AC-01 "preview opens that copy" | S-skl | none |
| U4 | entries under `config/skills` and `~/.gemini/skills` are inside the known roots; a sibling directory is not | skills-view Implementation Decisions (Antigravity's roots), C9 | P (`isUnderKnownSkillRoots`) | entry points in each AG dir, and one in `~/.gemini/elsewhere/` | true / false · spec C9 (fail-closed) | S-skl | none |
| U5 | built-in skills are not listed | skills-view::REQ-001/AC-02 | P | `builtin/skills/agy-customizations` with SKILL.md | no row named `agy-customizations` · spec AC-02 | S-bin | none |
| U6 | Codex's `~/.agents/skills` is not Antigravity's | skills-view::REQ-001/AC-06 | P | a skill only in `~/.agents/skills` | its `sides` = `['codex']` · spec AC-06 | — (path only) | none |
| U7 | a name Claude also holds is one row with both sides | skills-view::REQ-001/AC-03 | P | `w` in `~/.claude/skills` and `~/.gemini/skills` | `sides` = `['claude','antigravity']`, both `pkg` slots set · spec AC-03 | S-skl | none |
| U8 | an enabled plugin's skills join as `<plugin>:<skill>`; a disabled one's do not | skills-view::REQ-001/AC-04, plugins-view::REQ-001/AC-04 (G1–G3) | P (`scan`) | `flutter` with no `enabled` key, `gdocs` with `enabled: false` | names, `sides`, `origin`, `pluginRoot`, `pluginSkillName`; absence of `gdocs:*` · spec AC-04 | S-plg, S-cfg | none |
| U9 | plugins: version from plugin.json, marketplace from config.json, contents | plugins-view::REQ-001/AC-01, AC-03 | P (`readAntigravityPlugins`) | the flutter-shaped plugin | `version` 1.0.6, `marketplace`, `contents.skills` names with `pkg`, `contents.agents` = the front matter name `flutter_a11y_agent`, `contents.mcp` = `flutter_dart-mcp-server`, `contents.hooks` empty although the plugin has `rules/` · spec AC-01, AC-03 | S-plg | none |
| U10 | enablement: no key, false, true, missing configuration, unparsable configuration | plugins-view::REQ-001/AC-02 | P | five config.json states (absent file, `{`, fresh entry, false, true) | `enabled` per plugin · spec AC-02 | S-cfg | none |
| U11 | a plugin directory without a readable plugin.json keeps its directory name, the others unaffected | plugins-view::REQ-001 failure modes | P | `broken/` with no plugin.json beside `flutter/` | `name` = dir name, `version` null; flutter intact · spec failure modes (E5) | S-plg | none |
| U12 | global MCP: the file's servers with the disabled flag; enabled plugins' servers as `<plugin>_<server>` from that plugin | agents-overview::REQ-003/AC-04 | P (`scan` → `global.mcp`) | S-mcp sample + flutter enabled + gdocs disabled with its own server | entries `{name, side, source, disabled, plugin}`; `gdocs_*` absent · spec AC-04 | S-mcp, S-plg | none |
| U13 | a project's `.agents/mcp_config.json` is read nowhere | agents-overview::REQ-003/AC-04, project-detail::REQ-002/AC-03 | P (`scan`, `readProjectDetail`) | a trusted project with `.agents/mcp_config.json` naming `demo-stdio` | `demo-stdio` in neither `global.mcp` nor `detail.mcp` · spec | S-mcp (project sample) | none |
| U14 | an unparsable or empty global MCP file lists no servers from it; plugin servers still list | agents-overview failure modes | P | `mcp_config.json` = `{` and = 0 bytes | no `mcp_config.json` entries, the plugin's present, Claude's unaffected · spec failure modes | S-mcp (0-byte real shape) | none |
| U15 | subagents: both global forms, name from front matter else file/dir name, description, content as written | subagents-view::REQ-001/AC-01, AC-02 | P (`readGlobalSubagents`) | `sample-flat.md`, `sample-reviewer/agent.md`, a front-matter-less `bare.md`, a `noname/agent.md` without `name` | names, `description`, `content.text` equal to the file · spec AC-01, AC-02 | S-agt | none |
| U16 | a definition marked `mainAgent: false` is listed like any other | subagents-view::REQ-001/AC-03 | P | `sample-reviewer` | present, `mainAgent` = `'false'` · spec AC-03 | S-agt | none |
| U17 | a directory without agent.md holds no definition; an unreadable file keeps the unreadable label — two cases, the second `it.skipIf` root (an explicit skip, not a silent return; incremental change during TDD) | subagents-view::REQ-001 failure modes (A8) | P | `empty-dir/` beside a readable definition; a `chmod 000` file | the list is exactly the readable one; present with `error.code` = `ERR.subagentUnreadable` and no content · spec A8 | S-agt | none |
| U18 | same name with Claude merges onto one entry with both details | subagents-view::REQ-001/AC-04 | P | `code-reviewer.md` in `~/.claude/agents` and `config/agents` | `sides`, `claude`, `antigravity` non-null · spec AC-04 | S-agt | none |
| U19 | project detail: `.agents/agents/<name>/agent.md` read, a flat project file not; Antigravity rows never shadow | subagents-view::REQ-001/AC-01, AC-05 | P (`readEffectiveSubagents`) | `demo-agent/agent.md` + `flat.md` at project level; a project and a global definition named `dup` | entries and `shadows`/`shadowed` = false on both `dup` rows · spec AC-05 | S-agt | none |
| U20 | detail skills: the shared directory is one project-level entry; a name in it hides Codex's and Antigravity's global entries | skills-view::REQ-002/AC-01, AC-03, AC-04 | P (`readProjectDetail`) | `.agents/skills/commit-style` + `commit-style` in `~/.agents/skills` and in `config/skills`; `only-ag` in AG's library | one `commit-style` row (level project); `only-ag` level global side antigravity · spec AC-03, AC-04 | S-skl | none |
| U21 | the shared group shows whatever the registration; empty or absent → no entries | skills-view::REQ-002/AC-06 | P | a Claude-only-registered project with `.agents/skills/x`; another with an empty `.agents/skills` | the entry present; nothing for the empty one · spec AC-06 | S-skl | none |
| U22 | detail plugin rows carry the Antigravity side | skills-view::REQ-002/AC-05, plugins-view::REQ-001/AC-04 | P | flutter enabled | entries level plugin, side antigravity · spec | S-plg, S-cfg | none |
| U23 | installing for Codex and Antigravity together lands once, with one result; the second attempt hits the one same-name block | skill-install::REQ-001/AC-01, AC-03, AC-04 (the result's shape) | P (`installSkillToProject`, real filesystem) | a skill in `~/.agents/skills` and AG's library; sides `['codex','antigravity']` | the returned array (one landing `.agents/skills` with loaders codex+antigravity), the copy on disk; the second call's one conflict · spec AC-01, AC-03 | S-skl | none |
| U24 | Claude, Codex and Antigravity together: two landings, the shared one once | skill-install A9, REQ-001/AC-01 | P | sides `['claude','codex','antigravity']` | two results in order `.claude/skills`, `.agents/skills` · spec A9 | S-skl | none |
| U25 | an Antigravity-only skill installs the copy agy uses | skill-install::REQ-001/AC-05 | P | `r` in `config/skills` and `~/.gemini/skills` with different bodies; sides `['antigravity']` | the installed SKILL.md's text = the config copy · spec AC-05 | S-skl | none |
| U26 | holdings: which landing directories of which projects already hold a name | skill-install::REQ-003/AC-02 | P (`skillHoldings`) | `n` in project A's `.agents/skills`, in project B's `.claude/skills`; a traversal name | `{A: ['.agents/skills'], B: ['.claude/skills']}`; `{}` for `../x` · spec AC-02, A7 | — | none |
| U27 | landings: one per directory, the shared one with every loader, in side order | skill-install::REQ-001/AC-01 (whatever the registration) | S (`skillLandings`) | `['antigravity']`, `['codex']`, `['claude','grok','antigravity','codex']`, `[]` | dirs, `sides`, `loaders` · spec AC-01 (loaders = both sides always) | — | none |
| U28 | a snapshot saved before this change restores with the new fields filled in | agents-overview::REQ-001 (restore), CONTEXT page-switch invariant | C (`parseDisplayData`) | a saved snapshot without `antigravityPlugins`, subagents without `antigravity`/`subagent`/`mainAgent`, MCP entries without `disabled`/`plugin`; a saved detail whose subagent details lack the two fields | the snapshot and the read kept, with `[]` / null / false filled; a present malformed field still dropped · CONTEXT invariant | the #322 restore test's saved shapes | none |
| U29 | the live contract refuses a snapshot without `antigravityPlugins` | agents-overview Implementation Decisions (contract) | C (`validateSnapshot`) | the field removed | `ok: false` with the path · R1 | — | none |
| E1 | the agents page with Antigravity's components: card counts, Skills, Subagents, Plugins, MCP, and a disabled plugin leaving | skills-view::REQ-001/AC-01…AC-05; subagents-view::REQ-001/AC-01…AC-04, AC-06; plugins-view::REQ-001/AC-01…AC-04, AC-06; agents-overview::REQ-003/AC-01 (this ticket's part), AC-03, AC-04 | E | fixture home `mkAgyComponentsHome` (below); at the end `config.json` rewritten with `enabled: false` and a scan proven to land (the plugin row turns "Not enabled") | the card's third line; row badges; drawer text of the CLI copy; tabs and chips; MCP rows and pills; `flutter:*` and `flutter_dart-mcp-server` gone · literal strings from the specs and the fixture's own names | all shapes above | one Electron launch (rescan 500 ms) |
| E2 | project detail on an Antigravity-only and an all-sides project: shared group, order, preview, uninstall, plugins, subagents, MCP | skills-view::REQ-002/AC-01…AC-05; skill-install::REQ-002/AC-01; subagents-view::REQ-001/AC-05; plugins-view::REQ-001/AC-05; project-detail::REQ-002/AC-03, AC-04 | E | the same fixture; uninstall `commit-style` from the shared group | heading texts and order; the confirmation's path and sentence; the directory gone on disk and `commit-style` back under the Antigravity global group; detail plugin label; MCP group rows | as E1 | one Electron launch (default rescan) |
| E3 | the install picker: one shared mark whatever the registration, stale rows disabled, same-name rows tagged (one landing held, and two landings with only the shared one held), the shared toast, the empty-intersection notice | skill-install::REQ-001/AC-01, AC-02, AC-04; skill-install::REQ-003/AC-01, AC-02 | E | the same fixture: the AG-only project, the all-sides project holding `tdd` in `.agents/skills` (incremental change during TDD: makes "installs nothing" distinguishable from the install-time refusal, since Claude's directory would accept the copy), a stale project, the Codex-only `decision-form` on the AG-only project; clicks on each | marks (one outlined group with CX and AG); the stale row's label and disabled state — a forced click on it is followed by a real install whose notice is the only one on screen (an install would have closed the picker and raised its own notice first); the tag and the exact blocked notice; `.claude/skills/tdd` absent after the tagged click; the success toast and the copy on disk once; no mark and the A8 notice for `decision-form` | as E1 | shares E2's launch |
| R1 | existing e2e cases touched by the change keep passing: the filtering case's headings, the Grok install case's popover badge, the F3 case's subagent drawer | regression (skills-view F1–F3, skill-install A2, subagents A5) | E | unchanged | unchanged | unchanged | unchanged |
| U30 | a Claude plugin and an Antigravity plugin bundling one skill name give two entries, one per side, never merged | plugins-view G4, plugins-view::REQ-001/AC-06 (no merging by name) | P (`scan`) | `flutter@official` (Claude, enabled at the user layer) and agy's `flutter`, both bundling `dart-add-unit-test` | two entries: `[sides, pluginName, pluginRoot, description]` per side · spec G4 / AC-06 | S-plg + the Claude plugin shape of the existing plugin suites | none |
| U31 | two of a plugin's definitions giving one name are both listed | plugins-view::REQ-001/AC-03 (agents named as agy names them) | P (`readAntigravityPlugins`) | `agents/a.md` and `agents/b.md` with one front matter name | `contents.agents` = the name twice · the directory's contents | S-plg | none |
| U32 | a bundled definition reached through a symbolic link is listed; a link to a directory is not | plugins-view::REQ-001/AC-03, the global readers' link rule | P | a link to a definition file elsewhere; a link to a directory named `folder.md` | `contents.agents` = the linked definition's name only · the global agents reader's rule | S-agt | none |
| U33 | a subagent description written as a YAML block scalar shows its text | subagents-view::REQ-001/AC-02 (description as written) | P (`readGlobalSubagents`) | `description: >-` over two lines, with a block-list `tools:` after | `description` folded with a space; `tools` still read · the file's text | S-agt (the form from S-plg's skills) | none |
| U34 | a skill description written as a YAML block scalar shows its text, on agy's plugin skills and on Claude's global skills | skills-view::REQ-001/AC-04, plugins-view H1 ("the frontmatter description") | P (`scan`) | the two shapes the official plugin's skills take (`\|-` and `>-`, with a `metadata:` block after) and a Claude global skill with `>` | descriptions: literal lines kept, folded lines joined · the files' text | S-plg (five of its skills are written so) | none |
| E4 | two sides' plugins bundling one skill name: two rows, and filtering keeps the open one open | plugins-view G4, AC-06; skills-view E7 | E | the U30 pair plus a global skill above them; open agy's row, then filter the row above away | two rows by badge; after filtering exactly two rows, agy's still open, Claude's closed, agy's file previews its own body · spec G4, E7 | as U30 | one Electron launch |
| E5 | the install picker's same-name tag is this opening's: reopened after the copy is gone, it is not drawn | skill-install::REQ-003/AC-02 | E | a project holding `tidy` in `.claude/skills`; open the picker (tag), close, delete the copy, reopen, install | an in-page MutationObserver's record that no tag was drawn after reopening (a retried assertion cannot see a one-round-trip tag); the success notice and the copy on disk · spec AC-02. Positive controls: the tag drawn before the copy goes; the observer's record turned true on the unfixed build | own fixture home | one Electron launch |

Rows U30–U34, E4 and E5 were added at the code review (2026-10-29, [ticket-325-review-code.md](ticket-325-review-code.md)
findings 1 and 3–6), each run red against the unfixed code first. E4 and E5 launch on their own small fixture homes:
the components fixture has no Claude plugin and no project holding a Claude skill, and adding either would change E1–E3's
counts.

E2 and E3 run in one launch (the same fixture, default rescan interval); E1 needs a short rescan interval for its last
step, so it launches separately. Both launches use one fixture builder.

### Dimension conclusions

- **Coverage**: walked the failure-mode sections of the six specs for this ticket's units. Covered above, each by a
  named input: precedence (U1–U3), built-ins (U5), Codex's library (U6), the shared directory hiding both owners'
  globals and reappearing after an uninstall (U20, E2), the empty shared directory (U21), the filter over the shared
  group (regression: the filtering e2e case's rule is per group, so the shared group follows by construction — not
  re-driven, recorded as such), symlinks in agy's directories (U3's resolution follows the existing symlink rule; a
  dedicated symlink case is not added: C9 and A6 are exercised by the existing symlink cases through the same
  `isUnderKnownSkillRoots`, and U4 drives the new roots), a built-in name matching a user's (U5 covers listing; agy's run
  time preference is not claimed by the spec), plugin without plugin.json (U11), disabling a plugin (E1), a plugin MCP
  server that cannot start (lists from the file — U12 uses a missing `dart` command as the sample does), unparsable and
  empty MCP file (U14), subagent shapes (U15–U19), install landing once and its block (U23–U25), the picker's
  stale and same-name rows (E3). Gaps to be written in the test file headers: a stale project's picker row drawn
  disabled is asserted, but "a project that turns stale after the picker was drawn" (A5's backstop) is the existing
  `skillStaleTarget` path with its existing unit test, not re-driven; the multi-folder Antigravity cases are #323's.
- **Case design**: every providers case goes through the module's exported reader over a real temporary tree, never
  through internal helpers; e2e reads rendered text, computed geometry only where the picker's marks are asserted, and
  real files on disk for install and uninstall. No case builds a state the public path cannot reach: the saved display
  data in U28 is the shape an older version wrote (taken from #322's restore test pattern), not a hand-made impossible
  shape.
- **False greens** (design-time items): no threshold assertions are planned; expected values come from the fixture's
  own names and the specs' literal wording, never from the implementation's helpers (the e2e copy strings are written
  as literals, not imported from the dictionaries); every assertion targets the live path (the snapshot and detail
  payloads the renderer consumes, not a superseded reader). Mutation testing: per the project capability declaration,
  `mutation-testing` is not enabled, so that item is skipped; each test's "when does it go red" is answered at the
  post-implementation check.
- **Resource reuse**: expensive resources are the e2e build (made once by `pnpm e2e` before Playwright runs) and each
  Electron launch (seconds). Two launches over one fixture builder, as stated above; providers tests build small
  temporary trees per case (milliseconds; the existing suites' `beforeEach` pattern, reused). No resource is cleared by
  one case and used by another. Existing shared setup searched: `src/main/testing/agy-fixture.ts` (`settingsJson` for the
  trust ledger) is reused for the trusted folders; no component fixture helper exists to reuse.

### Findings

No findings.
