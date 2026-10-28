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
findings 1 and 3–6). E4, E5, U32, U33 and U34 were run red against the unfixed code first; U30 and U31 pin provider
behaviour that was already right (the faults they accompany were the renderer's keys) and passed when written. The rows
were written after their tests, within the same review step — the order the "Increment" rule asks for (table first) was
not kept for them; they were reviewed as rows afterwards. E4 and E5 launch on their own small fixture homes: the
components fixture has no Claude plugin and no project holding a Claude skill, and adding either would change E1–E3's
counts.

Increment for the post-implementation check's findings (round 1, 2026-10-29; rows written and reviewed before the tests):

| # | Test (planned name) | Spec coverage | Seam | Input that drives the target branch | Assertion object · expected value source | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| U3 (changed) | the preview opens the copy agy uses, and the install source is that copy too | skills-view::REQ-001/AC-01, skill-install::REQ-001/AC-05 | P (`resolveSkillRoot`, `listSkillPackageFiles`, `installSkillToProject`) | as before, plus an Antigravity-only install of `y` | as before, plus the installed package's distinguishing file = the CLI copy's (finding 6b: CLI over config was driven by no install case) | S-skl | none |
| U30 (changed) | … two entries, one per side, never merged; Claude's plugin server names its plugin | plugins-view G4, AC-06; agents-overview REQ-003 boundary (one row form, Claude's plugin servers carry the note) | P (`scan`) | the Claude plugin's `plugin.json` gains `mcpServers` | the MCP entry `{ name, side: 'claude', source: 'plugin', plugin: 'flutter' }` — the bare name, not `flutter@official` · the boundary's wording (finding 3) | the existing Claude plugin manifest shape (`mcpServers` in `.claude-plugin/plugin.json`) | none |
| U35 | a plugin is its directory: a manifest naming another name changes neither its row, its record, nor its namespaces | plugins-view settled: identity by directory name | P (`scan`, `readAntigravityPlugins`) | directory `flutter` whose `plugin.json` says `name: "dart-tools"`; its record under `flutter` with `enabled: false`; a skill and a server | `name` = `flutter`, `enabled` false (the record found by directory), no `flutter:`/`dart-tools:` skill joined while disabled; then enabled: `flutter:<skill>` and `flutter_<server>` (finding 1) | S-plg, S-cfg | none |
| U36 | an enabled value other than true or false reads as no key: enabled | plugins-view settled; AC-02 | P (`readAntigravityPlugins`) | records with `enabled: "false"`, `0`, `null` | each `enabled` true · the settled bullet (finding 1) | S-cfg shape, values invented | none |
| U37 | a bundled agent without a front matter name is named by its file | plugins-view::REQ-001/AC-03, subagents-view::REQ-001/AC-02 (agy's naming) | P (`readAntigravityPlugins`) | `agents/no-name.md` without front matter | `contents.agents` includes `no-name` (finding 1) | S-plg | none |
| U38 | two definitions in one directory giving one name: the first in name order is listed | subagents-view::REQ-001 failure modes | P (`readGlobalSubagents`) | `config/agents/a.md` and `config/agents/b.md`, both `name: dup`, different descriptions | one `dup` with `a.md`'s description (finding 4a) | S-agt | none |
| U39 | a higher directory holding the name without a SKILL.md: the list, the preview and the install all take the next copy | skills-view::REQ-001/AC-01 ("the row's preview opens that copy"); skill-install::REQ-001/AC-05 | P (`scan`, `resolveSkillRoot`, `installSkillToProject`) | `antigravity-cli/skills/x/` holding only `notes.md`; `config/skills/x/SKILL.md` | listed description = config's; resolved preview lists `SKILL.md`; the installed copy = config's (finding 5) | S-skl | none |
| E1 (changed) | … plus the Antigravity drawer's rows | subagents-view::REQ-001 failure modes (the drawer's rows, "—" when absent) | E | `code-reviewer`'s Antigravity side: tools, no subagent, mainAgent or model | the drawer's key-value cells, exactly: tools · `view_file, grep_search`, then subagent, mainAgent, model each "—" (finding 4b) | as E1 | E1's launch |
| E2 (changed) | … plus the all-sides project's subagent groups | subagents-view Implementation Decisions (each side's project group headed by its directory) | E | `transfer` gains a Claude (`.claude/agents/proj-claude.md`) and a Codex (`.codex/agents/proj-codex.toml`) project-level definition | the Subagents headings on `transfer`, exactly, in order (finding 4c) | the existing Claude and Codex definition shapes of the e2e suite | E2's launch |
| E4 (changed) | … plus the no-marketplace forms and Claude's plugin server note | plugins-view settled (no "From" note; "In effect globally" alone); agents-overview REQ-003 boundary | E | E4's agy plugin has no record; its Claude plugin gains a server; a Claude-registered project | agents page: agy's row `.ds` empty, the Claude server row's note "From the flutter plugin"; the project page: agy's row "In effect globally" (finding 2, 3) | as E4 | E4's launch |
| E5 (changed) | … plus no Antigravity groups when agy is not detected | plugins-view settled (group visibility); agents-overview REQ-003 boundary | E | E5's home has no `.gemini` | Plugins and MCP tabs: the Claude group's heading read first, then no AG badge in the pane (finding 2) | as E5 | E5's launch |
| R2 (changed) | #322's "an Antigravity-registered project…" case: the empty Antigravity groups | plugins-view settled ("No plugins installed"); agents-overview REQ-003 boundary (the empty sentence); project-detail REQ-002 boundary (no group without servers) | E | its home: agy detected, no plugin, no MCP file | agents page: the AG plugin group's "No plugins installed", the AG MCP group's sentence; the AG-only project's MCP tab: its own heading read first, then no AG badge (finding 2); its comment "skills and subagents are not read on this side yet" corrected (made false by this ticket) | `mkAntigravityHome` | its launch |

The increment adds no launch: every e2e change rides an existing case's launch and home, except E2's two definitions
and E4's project, which change none of those cases' other reads (E2's card and Skills headings count global entries and
skills only; E4 asserts no project count).

Self-check of the round-1 fixes (implement post-implementation check, items 2–5; 2026-10-29, before the targeted run):

- Item 2, each new or changed assertion against False greens: no threshold reads; expected values are the fixtures'
  own names and the specs' wording, written as literals. Red conditions, each confirmed by a reversible mutation where
  the fault sits in the providers ([ticket-325-r1-mutations.log](ticket-325-r1-mutations.log): six mutations, each
  turning exactly its case red, every file restored byte for byte): U35 reads the record by the manifest's name (M2);
  U36 treats only absent or true as enabled (M1); U37 drops the file-name fallback (M3); U38 lets the later file win
  (M4); U39 takes the first existing entry whether or not it holds a SKILL.md (M5); U30's MCP read names the full plugin
  id (M6). U3's install read is red when the install source is any copy but the CLI directory's (its file list names
  `cli-only.md`). The renderer reads, answered against the code: E1's key-value read is exact, so Claude's
  "— (inherited)" in agy's model slot, a missing row or a swapped order is red; E2's headings are exact and ordered;
  E4's `.ds` read requires the element and an empty text ("From null" or any note is red), the Claude row's note is
  red when the entry's plugin is null (no `.ds` element) or the full id; the empty sentences are read through the
  adjacent-sibling selector of the Antigravity heading, so a hidden group (no heading) or another sentence is red; E5's
  and #322's one-shot absence reads follow a positive read from the same render (the Claude group's heading, the
  project's MCP heading), and a drawn Antigravity group would put its badge in that render. No async callback holds an
  assertion; no loop runs over a possibly empty collection.
- Item 3, functions the fix changes: none — the round changes tests and records only.
- Item 4, the data the new tests use: U35, U37 and U39 keep the samples' structures (the sample plugin's manifest with
  another `name`, the sample agent file without its front matter, a skills directory holding a non-skill entry); U36's
  non-boolean values were never observed — they exist to tell the settled rule ("anything but an explicit false") from
  its alternatives; U30's server is the Claude manifest's `mcpServers` shape the existing global suite uses; `transfer`'s
  Claude and Codex definitions copy the e2e suite's existing shapes. None is shaped from the spec alone.
- Item 5, shared test helpers the fix changes: `mkAgyComponentsHome` (e2e). Its users, by `rg -n "mkAgyComponentsHome"
  e2e src`: E1 and E2 + E3 — both in the targeted run. No other helper changed.

No finding from the self-check.

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

## Post-implementation check

Date 2026-10-29 · implementation version `79dcd57` (branch `feat/antigravity-components`, range `a474875..79dcd57`:
f68f91e, e783065, 79dcd57) · first round, no fix range · independent sub-agent. Scope: every test the range adds or
changes — `src/main/providers/antigravity-components.test.ts` (new, 33 cases), `src/shared/skill-landing.test.ts` (new,
5), `src/main/display-store.test.ts` (two new cases; `savedBeforeTheSide` now also strips `antigravityPlugins`),
`src/shared/validate.test.ts` (one case widened), `e2e/app.spec.ts` (four new cases and `mkAgyComponentsHome`; one comment
in the Grok install case) — the gate data change in `scripts/check-shared-ui.mjs` (the `noneGlobal` exemption removed),
and the test design table above. Specs: the six named, read at `79dcd57`. During the check the worktree gained
uncommitted edits from the parallel step 7–8 work (seen 06:10: four specs, the features index, checklist,
final-regression, the doc sync checklist, the worklog); the spec edits are side-count wording ("both sides" to "every
side") and change no requirement judged here.

Project capability declaration (`capabilities.toml`, parsed with Python's `tomllib`): every registry ID is present;
`mutation-testing` is `enabled = false`; `e2e-suite` and `lint` are enabled.

### Run evidence

All run results come from the handed-over [ticket-325-gate-prereview.log](ticket-325-gate-prereview.log); this check ran no
test. The log carries every required item: `git rev-parse HEAD` = `79dcd5773053…` (the range's end); `git status
--porcelain --untracked-files=all` empty, so the version list is empty (a clean tree); each command with its exit code and
full output; the e2e command builds first (`electron-vite build && playwright test …`, exit 0 for the chain). Every
reviewed test ran and passed in it: `antigravity-components.test.ts` 33 of 33 (none skipped, so U17's root skip did not
fire), `skill-landing.test.ts` 5, `display-store.test.ts` 13, `validate.test.ts` 46; e2e #23 (E1), #24 (E4), #25 (E5),
#26 (E2 + E3) and the R1 regressions #53, #55, #66. The log itself is untracked (`docs/.workings/` is in `.gitignore`;
#322's logs were added with `-f`), so keeping it as this record's evidence needs `git add -f`.

### Written tests against the test design table

| Row | Written test | Agreement |
|---|---|---|
| U1, U2, U5, U6, U7 | `antigravity-components.test.ts` :126, :137, :175, :183, :189 | Seam, input, assertion object and expected-value source as designed |
| U3 | :150 | As designed (the listed file names tell the copies apart; the root path itself is not asserted, the names suffice). Its name adds "and the install source is that copy too", which the case does not drive (finding 6) |
| U4 | :164 | As designed for the two directories this change adds, plus the built-in directory (refused); the CLI directory was already a known root at `a474875` |
| U8, U9, U11 | :489, :434, :476 | As designed; U11 adds a garbled manifest |
| U10 | :457 and :469 | The table's five states split over two cases, plus a plugin with no record; the unparsable text is a truncated record that would read as disabled if partly parsed, stronger than `{` |
| U12, U13, U14 | :392, :407, :420 | As designed; U12 enables one sample server so the flag has two values (stated in the fixture) |
| U15, U16, U33, U17, U18, U19 | :305, :326, :335, :345 + :352, :364, :375 | As designed; U15 adds a renamed file and a body line reading `name:`; U17's second case is an explicit `it.skipIf(root)` |
| U20, U21, U22 | :211, :229, :566 | As designed; U22 adds a workspace plugin directory (not read) |
| U23–U26 | :245, :259, :269, :279 | As designed |
| U27 | `skill-landing.test.ts`, four `skillLandings` cases + one `skillsDirLoaders` case | As designed; expected landings written out |
| U28 | `display-store.test.ts` :198, :213 | As designed |
| U29 | `validate.test.ts` :40 | As designed |
| U30, U31, U32, U34 | :505, :550, :555, :528 | As designed |
| E1 | `e2e/app.spec.ts` :912 | As designed: own launch, rescan 500 ms, the disable step proven by the row turning "Not enabled" |
| E2 + E3 | :1131 | One case and one launch, the picker first and project detail after — the table's "shares E2's launch" |
| E4, E5 | :1039, :1089 | As designed, each on its own small home (reason in the table's note) |
| R1 | #53, #55, #66 | Passed; the only edit to them is a comment in the Grok install case |

Test file headers (Coverage): the design review's coverage conclusion says two gaps are "to be written in the test file
headers"; neither is in any of the four files (finding 6).

### Dimension conclusions

- **Coverage** — every failure-mode and boundary statement of this ticket's sections in the six specs at `79dcd57`,
  including those written back in `79dcd57` after the design review, matched to the input that drives it:

  | Statement | Driven by | Verdict |
  |---|---|---|
  | skills-view::REQ-001/AC-01…AC-06, REQ-002/AC-01…AC-06 | U1–U8, U20, U21, E1, E2 | Driven |
  | skills-view: a name in two of agy's directories is one row, previewing the copy agy uses | U1–U3, E1 | Driven while every copy holds a SKILL.md; with an entry lacking one in a higher directory, finding 5 |
  | skills-view: shared name hides both owners' globals; an uninstall brings the hidden global back | U20, E2 | Driven |
  | skills-view: the filter narrows the shared group like any other | — | By construction: DetailPane's `section()` runs `filterByName` on every group, the shared one included (read in code); recorded at design time |
  | skills-view: a symlinked skill in agy's directories (A6, C9) | U4; the existing symlink cases | By construction: `readSkillDir` and `isUnderKnownSkillRoots` serve every side; the row pill reads every side's flag |
  | skills-view: a built-in sharing a user's name | U5 | Driven: any inclusion of the built-in directory lists `agy-customizations` |
  | skills-view: shared rows and the drawer name both loaders whatever the registration; two sides' plugin rows | E2 (Antigravity-only project); U30, E4 | Driven |
  | skill-install A2, A9, REQ-001/AC-01…AC-05, REQ-002/AC-01, REQ-003/AC-01, AC-02 | U23–U27, E2, E3, E5 | Driven |
  | skill-install: Codex's copy when both qualify; the copy agy uses when Antigravity alone does | U23, U25 | Driven |
  | skill-install: a shared landing's failure names the directory; a tagged project installs nothing in any landing; tags per opening | E3, E5 | Driven (the install-time failure uses the same `where()`) |
  | skill-install: a target gone stale, or holding the name, after the picker was drawn | `installSkill`'s existing stale and conflict cases; U23's second call | Not re-driven through the picker (as designed); the promised header note is missing (finding 6) |
  | subagents-view::REQ-001/AC-01…AC-06; A4, A8, directory without agent.md, project flat file | U15–U19, E1, E2 | Driven (AC-05's no-badge rule by U19; see False greens for E2's pill read) |
  | subagents-view: over 200 KB truncated; a missing agents directory | the existing A6 case (`readCapped`, the same call); every scan in the file runs without `config/agents` | By construction / driven implicitly |
  | subagents-view: two definitions in one directory giving one name — the first in name order | — | Undriven (finding 4) |
  | subagents-view: block scalars | U33 | Driven |
  | subagents-view: the drawer's Antigravity rows, each "—" when absent | E1 reads tools and mainAgent | An absent model's "—" undriven (finding 4) |
  | subagents-view: project detail grouped, each side's project group headed by its directory | E2 (`.agents/agents`, Claude's and Antigravity's global groups) | Claude's and Codex's project headings undriven (finding 4) |
  | plugins-view::REQ-001/AC-01…AC-06; no readable plugin.json; disabling; a server that cannot start | U8–U12, U22, U30–U32, E1, E2, E4 | Driven |
  | plugins-view E11 (manifest path outside the package) | — | Not applicable to agy's reader: it reads no manifest path, only `version` from the top-level plugin.json |
  | plugins-view settled: identity by directory name; an enabled value other than an explicit false; a bundled agent named by its file without a front matter name | — | Undriven (finding 1) |
  | plugins-view settled: no marketplace → no "From" note, "In effect globally" alone; the group when detected, "No plugins installed" when empty | U10 (provider `marketplace: null`) | Renderer forms undriven (finding 2) |
  | plugins-view settled: two agents of one name, a link, `agents.json`, block scalars, two sides' plugins of one name | U31, U32, U34, U30, E4; `agents.json` — only `*.md` is read | Driven / by construction |
  | agents-overview B2 (the skill count, every side) | E1 | Driven through the one expression every card uses (`origin === 'disk'`) |
  | agents-overview::REQ-003/AC-01 (#325's part), AC-03, AC-04; an unparsable global MCP file; no command or URL on a row | E1, U12–U14 (U12 pins the entry's exact shape) | Driven |
  | agents-overview: the Antigravity MCP group when detected, its empty sentence | — | Undriven (finding 2) |
  | agents-overview: one row form, so Claude's plugin servers carry the plugin note | E1 (Antigravity's rows only) | Claude's undriven (finding 3) |
  | project-detail::REQ-002/AC-03, AC-04 (#325's part) | U13, E2 | Driven |
  | project-detail: the Antigravity MCP group only when it has servers | E2 (with servers) | The empty branch undriven (finding 2) |

  Fixture shapes were checked against the research samples (read only,
  `~/research/antigravity-cli-internals/spike/samples/`): `config.json` and `config.disabled-sample.json` (records with
  `installedFrom`, `enabled` true / false), the global and plugin `mcp_config.json` (stdio and `serverUrl` servers,
  `disabled`, `env`), the top-level `plugin.json`, `a11y_agent.md` (quoted description, block-list `tools`), skills with a
  nested `metadata:` block and a `|-` description, the project's demo skill and agent, `sample-reviewer`
  (`mainAgent: false`). Each fixture keeps those structures; none is invented apart from the samples.

- **Case design** — every providers case goes through an exported reader over its own temporary tree; the display-store
  cases write the shape an older version saved and read it back through `DisplayStore.get()`; the e2e cases read rendered
  text and badges, and real files on disk for install and uninstall. No case builds a state the public path cannot reach:
  E1's rewritten `config.json` drops `installedFrom`, a record shape agy does not write, but no assertion after it depends
  on the marketplace. Isolation: per-case temporary homes, every e2e case its own home and user-data directory. No finding.

- **False greens** — per the project capability declaration, `mutation-testing` is not enabled, so mutation testing is
  skipped. Each test's red condition, answered against the code and the expected-value sources:

  | Test | Goes red when |
  |---|---|
  | U1, U2 | agy's precedence changes, a name lists twice, or the package stats come from another copy |
  | U3 | the preview resolves a directory other than the listed copy |
  | U4, U5, U6 | the added roots are dropped, a sibling or the built-in directory is admitted or read, or `~/.agents/skills` is attributed to agy |
  | U7, U18, U30 | names stop merging across sides, or two sides' slots, roots or descriptions cross; U30 also when the two plugin entries merge |
  | U8, U22 | a disabled plugin's skills join, or the namespace, side, level, root or bare name is wrong; U22 also when a workspace plugin is read |
  | U9, U31, U32 | version, marketplace, root, the three categories, the `<plugin>_<server>` names, or rules/hooks change; a duplicate name is dropped; a link to a definition is skipped or a link to a directory listed |
  | U10 (two cases) | no key, no record, a missing or an unparsable file stops reading as enabled, or true / false is misread |
  | U11 | a plugin without a readable manifest disappears or affects the others |
  | U12, U13, U14 | the disabled flag, the plugin attribution, the entry shape or the disabled plugin's servers change; a project's own MCP file is read; an empty or half-written file throws, lists servers or suppresses the others |
  | U15, U16, U17 (two), U19, U33 | the naming fallbacks, description, content as written, a body line taken for a field, a filtered `mainAgent: false`, a directory without agent.md listed, an unreadable file dropped, a project flat file read, shadow flags on agy's rows, a block-scalar marker shown |
  | U20, U21 | the shared directory lists per side, the globals stay unhidden, the group order or the recorded side changes, registration gates the group, or an empty directory yields entries |
  | U23–U27 | two landings for one directory, another source copy, more than one conflict, wrong order or loaders, holdings by another test than A4's, a traversal name probed |
  | U28, U29 | a saved snapshot or page from before the change is dropped or filled wrongly, a present malformed field is kept, or the live contract accepts a snapshot without `antigravityPlugins` |
  | U34 | a block scalar shows its marker, literal lines are joined or folded ones kept apart, or Claude's skills are not read the same way |
  | E1 | the card counts a built-in or plugin entry; a badge slot, the previewed copy, the drawer switch, the plugin row, tabs, chips, MCP rows, pill or note is wrong; after disabling, the plugin's skill or server stays |
  | E4 | the two rows share a key (a stale third row after filtering), the open row closes, or the other package previews |
  | E5 | a reopened picker draws the previous opening's tag (the in-page observer; also the install would be refused and the success notice never come); positive control: the tag is drawn while the copy is held |
  | E2 + E3 | the marks, the stale row (an enabled one closes the picker on the forced click, so the next click fails), a tagged project writing a landing, the A8 notice, the detail headings, order and counts, the shared badges and drawer subtitle, the uninstall path, sentence, deletion and reappearance, the subagent headings, the plugin label or the MCP list change |

  Two reads cannot turn red with their fixtures and carry no conclusion on their own: E2's `.pill.shadow` count (no
  same-name pair in the fixture; U19 drives the rule, and the renderer draws the pills only from the provider's flags), and
  E3's `existsSync(stale)` (no path creates that directory; the forced click is guarded by the next click and the single
  notice). Browser forms (`false-greens.md`): presence-only reads are badge or label checks the spec requires; the
  disable step polls the plugin row before one-shot absence reads of rows rendered from the same snapshot; one-shot
  absences elsewhere follow a positive read of the same list; no synthetic events. The gate change only removes one
  exemption, so the dictionary rule now checks `noneGlobal` as well (`check-shared-ui.mjs` loops over every key not
  allow-listed); it cannot hide a red. The vacuous-coverage forms of findings 1–5 are the undriven inputs, not false
  greens of the written assertions.

- **Resource reuse** — expensive resources: the e2e build and the Electron launches. The build ran once (the log's single
  `electron-vite build`: main, preload and renderer bundles once each). Launches have no output of their own in the log
  (`launch()` prints nothing); counted from the code, one per reviewed e2e case — E1 (rescan 500 ms), E2 + E3, E4, E5 —
  four in all, as the table says (#23 1.6 s, #24 0.7 s, #25 0.7 s, #26 11.2 s). They cannot be shared: E1 needs its own
  rescan interval and rewrites `config.json`, E2 + E3 install and uninstall, E4 and E5 need homes whose additions would
  change E1–E3's counts. Providers cases build millisecond trees per case (`beforeEach`, the existing suites' pattern; 33
  cases in 294 ms). No reviewed case clears a process-shared resource, so collection order has nothing to decide. Shared
  setup reused: `settingsJson` (`src/main/testing/agy-fixture.ts`) in both seams; `mkAgyComponentsHome` serves E1 and
  E2 + E3. No finding.

### Findings

1. **plugins-view's settled reading rules are undriven** (missed regression). The spec (plugins-view, "Settled during
   implementation") identifies a plugin by its directory name, reads any enabled value other than an explicit false as
   enabled, and names a bundled agent by its file when its front matter has no `name`. No test can tell any of these from
   an alternative: every fixture's `plugin.json` names its own directory (`mkAgPlugin` writes `{ ...FLUTTER_MANIFEST,
   name }`; the e2e homes write `flutter` / `gdocs` under those directories); the only enabled values written are absent,
   `true` and `false`; every bundled agent fixture has a `name` (`A11Y_AGENT`, `SAMPLE_REVIEWER`). Taking the row name, the
   `config.json` key and the namespaces from `plugin.json` (`plugins.ts` `name: d.name`, `records[d.name]`), reading only
   `enabled === true` or absent as enabled (`rec['enabled'] !== false`), or changing the fallback at `plugins.ts`
   `agyDefinitionName(…, basename(d.name, '.md'))` keeps every test green. Recommended now, at the providers seam in
   `antigravity-components.test.ts`: a plugin directory whose `plugin.json` names another name (row, record lookup,
   `<dir>:<skill>`, `<dir>_<server>`), records with non-boolean `enabled` values, a bundled agent without front matter.
   Document sync: final-regression.md's (uncommitted) row "plugins-view spec ↔ implementation" states "identity … agents'
   names" true by U8–U11, U30–U34; correct it to the new cases once written.
2. **The Antigravity Plugins and MCP groups' visibility, empty states and no-marketplace forms are undriven** (missed
   regression). Spec: plugins-view settled bullets 2–3; agents-overview's boundary "The MCP section's Antigravity group
   shows whenever the side is detected or lists a server; empty, it says …"; project-detail's "appears on a project's page
   only when it has servers". The branches (`PluginsView.tsx` `AntigravityGroup`: hidden when not detected and empty,
   `noPlugins` when empty, no "From" note and `inEffectGlobally(null)` without a marketplace; `McpServers.tsx`
   `AntigravityMcpGroup`: hidden when empty on a project page or when not detected, `noAgMcp` on the agents page) are
   reached by no test: no test file holds "No plugins installed", the `noAgMcp` sentence or a bare "In effect globally"
   (searched in `e2e/` and `src/` tests, the Chinese values too); E4's home has a plugin without a marketplace and no MCP
   file but never opens those tabs. Inverting any of these conditions keeps every test green. Recommended now, reusing
   launches: E4's home already gives the no-marketplace row and the empty MCP sentence on the agents page; E5's home has no
   `.gemini`, so both groups' absence can be read there; a Claude-registered project added to E4's home (it changes none
   of E4's assertions) gives the project page's bare "In effect globally" and the absent MCP group. Document sync:
   final-regression.md's rows for plugins-view ("no marketplace, group visibility"), agents-overview ("the MCP
   boundaries"), project-detail ("the MCP group's visibility") and "Dictionaries ↔ the behaviour they state" ("each is
   read on screen by E1–E3": `noAgMcp` and `inEffectGlobally`'s null branch are not).
3. **Claude's plugin servers carrying the plugin note is undriven** (missed regression). agents-overview's boundary
   (settled 2026-10-29): one row form for every group, "so Claude's plugin servers carry the note too". `global.ts` sets
   `plugin: plugin.name.split('@')[0]` on Claude's plugin servers, but the only Claude plugin MCP case
   (`global.test.ts:143`, unchanged) maps `${side}:${source}:${name}` and never reads `plugin`, and no e2e home gives a
   Claude plugin a server. Setting it back to `null` (the behaviour before this change) or to the full `name@marketplace`
   stays green. Recommended now: give U30's Claude plugin an `mcpServers` entry and assert its MCP entry (`plugin:
   'flutter'`), and read the note on E4's MCP tab, which already has that Claude plugin. Document sync: final-regression.md's
   row "agents-overview spec ↔ implementation" cites E1 and U12–U14 for "the MCP boundaries", which are Antigravity's
   rows only.
4. **Three settled subagents-view statements are undriven** (missed regression). (a) "Two definitions in one directory
   giving one name: the first in name order is listed" — `subagents.ts` `readAntigravitySide`'s `if (out.has(name))
   continue`; no fixture puts two such definitions in one directory (U15's names differ; U19's `dup` pair spans two
   levels), and the Codex case (`subagents.test.ts:117`) runs separate code; deleting the guard lets the later file win,
   all green. (b) "The drawer's Antigravity rows … each '—' when absent … the drawer claims nothing" about an absent model —
   E1 reads tools and `mainAgent` only; rendering Claude's "— (inherited)" there stays green. (c) The project detail layout
   "each side's project-level group headed by the directory that side reads (`.claude/agents`, `.codex/agents`, …)" — a
   change this ticket made for Claude and Codex too; no test holds "Project level · .claude/agents" or ".codex/agents" (E2's
   fixture has project-level definitions on Antigravity only), so a wrong entry in `SubagentsView.tsx`'s
   `PROJECT_AGENTS_DIR` stays green. Recommended now: (a) as a providers case; (b) one more read in E1's drawer (the
   `model` row of `code-reviewer`'s Antigravity side shows "—"); (c) project-level Claude and Codex definitions in an
   existing home read in project detail — E2's `transfer` project, registered on every side, is the cheapest place.
   Document sync: final-regression.md's row "subagents-view spec ↔ implementation" claims "first in name order … the
   drawer's rows … the project detail layout" true by U15–U19, U33, E1, E2; the "Dictionaries" row's `projectGroup` is
   read for `.agents/agents` only.
5. **The list, the preview and the install can disagree when a higher-priority directory holds the name without a
   SKILL.md, and no test drives it** (missed regression). skills-view::REQ-001/AC-01: "The row's preview opens that copy".
   The list skips an entry without SKILL.md (`global.ts` `readSkillDir`), so it shows the next directory's copy;
   `globalSkillEntry` (`skill-package.ts`) therefore prefers the first entry holding a SKILL.md — decision "The copy a
   preview or install opens". Every fixture copy holds a SKILL.md (`mkSkill`, the e2e `skill()` helper), so reducing
   `globalSkillEntry` to the first existing entry keeps every test green while the preview would open the broken copy the
   list does not show and the install would refuse a listed skill. Recommended now: a providers case with
   `antigravity-cli/skills/x/` holding no SKILL.md and `config/skills/x/SKILL.md`, asserting the listed description, the
   resolved preview files and the installed copy.
6. **Test-file records do not match the design review and the cases** (records). (a) The design review's coverage
   conclusion says two gaps are "to be written in the test file headers" — A5's backstop (a target turning stale after the
   picker was drawn, left to `installSkill`'s existing case) and the multi-folder Antigravity cases being #323's; neither
   appears in any of the four test files (`rg "#323|skillStaleTarget|multi-folder"` over them: no hits). (b) U3's name
   claims "and the install source is that copy too", but the case calls only `resolveSkillRoot` and
   `listSkillPackageFiles`; the install source is driven by U25 (config over root), and the CLI-over-config install by no
   case. Recommended: write the two gap lines into `antigravity-components.test.ts`'s header (or record why they are not
   gaps), and rename U3 or add the install assertion to it.

### Document sync

Checked for this check's facts (the coverage findings above; no product behaviour changed): this record; the test files'
headers; `docs/.workings/antigravity-side/` enumerated whole with `find` (19 files, none hidden; the directory is
gitignored and 18 files are tracked, the pre-review log is not) — `checklist.md`'s #325 rows (54 matches, all read),
`ticket-325-doc-sync.md`, `final-regression.md`'s #325 section, `ticket-325-worklog.md` and `ticket-325-decisions.md` as
working records; the six specs' Testing Decisions and Antigravity sections. Excluded: `docs/features/`, CONTEXT.md, ADRs
and the READMEs — they state behaviour, which these findings do not change; the GitHub ticket — its acceptance boxes are
ticked by the orchestrator at delivery. Differences found: final-regression.md's (uncommitted, in progress at 06:10)
Stage 1 rows for plugins-view, subagents-view, agents-overview and project-detail and its "Dictionaries" row cite tests
for statements no test drives (findings 1–4 name each row); the checklist's #325 current-verification rows cite unit
evidence that holds, and its subagents row's "no shadow pill" rests on U19 rather than E2 (no conclusion changes). Each
finding's sync item is to be resolved with the finding, in this ticket's PR.

### Disposition of round 1 (main agent, 2026-10-29)

The hand-back's six titles match this section's six findings (numbers and subjects). Each was fixed in this ticket, rows
first in the design review's increment table, then the cases:

1. U35, U36, U37 (providers).
2. E4 (no "From" note; "In effect globally" alone; the MCP group's empty sentence), E5 (no groups without agy),
   #322's case R2 ("No plugins installed" and the empty sentence with agy; no group on a project's page without
   servers).
3. U30's MCP read and E4's Claude server row.
4. (a) U38; (b) E1's exact key-value read; (c) E2's `transfer` Subagents headings.
5. U39.
6. (a) the two gap lines in `antigravity-components.test.ts`'s header; (b) U3 now drives the install source (CLI over
   config).

The document sync items each finding named (final-regression.md's Stage 1 rows and its "Dictionaries" row, the
checklist's #325 rows) were corrected in the same change.

