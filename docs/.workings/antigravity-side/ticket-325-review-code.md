# Code review — #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) · feature checklist: [checklist.md](checklist.md) ·
decisions: [ticket-325-decisions.md](ticket-325-decisions.md)

Date 2026-10-29 · implementation reviewed: `f68f91e` (branch `feat/antigravity-components`, stacked on #322's head
`a474875`), the fixes below on top of it · scope: every file the ticket's change touches — the readers
(`global.ts`, `plugins.ts`, `subagents.ts`, `project-detail.ts`, `read-utils.ts`, `skill-package.ts`, `install.ts`,
`types.ts`), the IPC surface (`index.ts`, `preload/index.ts`, `ipc.ts`), the shared model (`domain.ts`,
`skill-landing.ts`, `validate.ts`, `display-shape.ts`, `display-data.ts`), the renderer (`AgentsPane.tsx`,
`DetailPane.tsx`, `McpServers.tsx`, `PluginsView.tsx`, `PluginSkillList.tsx`, `SkillExpandBlock.tsx`,
`SubagentsView.tsx`, `theme.css`), the dictionaries, `scripts/check-shared-ui.mjs`, and the tests.

## UI gate (step 4, item 0)

Every interface point and the confirmed prototype drawing it: [the worklog's UI gate table](ticket-325-worklog.md). The
review fixes add no interface point: two are row identity (React keys), one removes a stale tag the prototype never
drew, one makes a description read as the text its file holds. `/ui-design` was loaded again before the renderer was
touched after the context compaction. Rendered evidence for the fixes: the e2e cases below read the rendered rows, the
open state and (through an in-page observer) every tag drawn; two window screenshots show a plugin's block-scalar
descriptions as text (session scratch `t325/shots/review-01…`, `review-02…`, fresh build).

## Underlying premises

Re-checked against the research notes (`~/research/antigravity-cli-internals/local-data-and-usage.md`, §10.9's table
of what agy loaded) and holding: the three global skill directories and their precedence (runs s20–s23), the project
`.agents/skills` as agy's workspace directory, plugin enablement (no key = enabled; an explicit false after `agy plugin
disable`), `<plugin>:<skill>` and `<plugin>_<server>`, both global agent forms with only the directory form sampled at
project level, `disabled: true` keeping a global MCP server from starting, and the project `.agents/mcp_config.json`
not loaded in the sample. A plugin's `agents.json` (named in the docs, not sampled) is the recorded decision not to read it.

Findings:

1. **"A description is a one-line value"** — the premise under `fmField` ("single-line values … matching skills' existing
   rule") and under this change's `fmValue`. Measured false for agy's own data: five of the official flutter plugin's
   skills write `description:` as a YAML block scalar (`>-`, `|-`, `>`; `rg -l '^description: *[>|]'` over the
   sample, 5 files), so their rows showed `>-` as the description. The same form occurs on this machine in seven Claude
   files (`rg -Rl` over `~/.agents/skills`, `~/.claude/plugins`, `~/.codex/skills`), among them three of Claude's
   `plugin-dev` agents. Fixed in the one place both readers share (`read-utils.ts`, `blockScalar`): the indented lines
   under the key, folded with spaces or kept as lines. Class check: every front matter reader goes through `fmField` or
   `fmValue` — `rg -n "'description'" src/main` lists five front matter call sites, all of them through the two
   helpers; the other two hits are Codex's TOML (parsed) and the session's tool input (not front matter).
2. Two comments this review's own fixes first wrote claimed that keying the rows by name "hands one row's state to the
   other". What was observed (the e2e red below) is a stale third row left after filtering; both comments now say only that.

After the fixes Security and Consistency were scanned again.

## Runnability

States with an entry and an exit, listed and walked:

- **The install picker's tags** (`held`): set when an opening's holdings arrive; a picker closes from many places
  (outside click, scroll, Esc, the filter, an install). Finding 3 below: nothing reset them, so a reopened picker
  first drew the previous opening's tags.
- **The global Skills rows' expansion** (`SkillExpandBlock`'s own state, keyed by the row): finding 4.
- The subagent drawer's side (`useState(defined[0])`): the drawer unmounts between entries (the mask covers the list),
  so each opening starts fresh. No finding.
- The Plugins groups' `expanded` sets: keyed by plugin name, unique within a group (directory names / `name@market`).
  No finding.

Findings (each red first, then fixed):

3. **Stale "Same name installed" tags on reopening** (`AgentsPane.tsx`). Reproduced by the new e2e case "the install
   picker's same-name tag is this opening's": an observer installed in the page saw the tag drawn after the copy was
   gone (red: `tagDrawn` true). Escape surface: self only — a wrongly tagged target is refused in the renderer for one
   round trip, an untagged one is still refused at install time (A4). Fixed anyway, because the fix is the state's
   missing reset: the one handler that opens a picker clears the previous opening's tags (clearing them in the effect
   instead was refused by the lint rule `react-hooks/set-state-in-effect`). Green on a fresh build.
4. **Duplicate React keys across sides** (`AgentsPane.tsx`, global Skills rows keyed `s.name`). A Claude plugin and
   agy's plugin bundling one skill name give two `flutter:<skill>` rows (plugins-view G4) with one key. Reproduced by
   the new e2e case "two sides' plugins bundling one skill name…": after filtering away a row above them, three rows
   stayed on screen for a list of two (red). Escape surface: same-layer — one row's fault corrupts the rendering of
   another. Fixed: the row key is the entry's origin, side, plugin and name. Green on a fresh build. Class check below
   (Consistency).
5. **A symbolically linked plugin agent was skipped** (`plugins.ts`, `d.isFile()` on the directory entry), while this
   change's global agents reader follows links (`statSync`). Red in the new unit case "a bundled definition reached
   through a symbolic link is listed…"; fixed with `statSync`. Escape surface: self only. Class check — every
   directory reader this change adds or extends: `readAntigravitySide` (statSync), `pluginSkillSummaries` (directory or
   link), `readAntigravityPlugins` (statSync), `readSkillDir` via `readSkillLibrary` (`existsSync` of SKILL.md),
   `skillHoldings` and `globalSkillEntry` (`existsSync`): five of six follow links; the one hit is fixed.
6. **Two of a plugin's agents giving one name** (front matter `name`, which agy uses) produced duplicate chip keys in
   the plugin's Subagents tab (`PluginsView.tsx`). Both are listed (what agy does with the pair is unmeasured); the chip
   key now carries the index. Unit case "two of a plugin's definitions giving one name are both listed". Escape
   surface: same-layer within the chip list. No rendering case: the chips have no state, and the same mechanism is
   driven by finding 4's case.

Error and degraded paths, by escape surface (unchanged by the fixes): an unreadable plugin.json → that plugin's
version only (self); an unreadable or unparsable `config.json` → every plugin reads as having no key, i.e. enabled (the
documented fall-through, spec AC-02); an unparsable `mcp_config.json` → that file's servers only (self); an unreadable
agent file → that definition with the unreadable label (self); a holdings request that fails → no tags, install still
refused at install time (self). None escapes sideways or upward.

## Security

- New IPC channel `skillHoldings(name)`: the renderer names a skill, never a path; the main process probes only the
  current snapshot's live project paths, read-only (`existsSync`); a name that is not a single path segment returns
  nothing (`badName`). `installSkill` now takes `sides` checked against `AGENT_SIDES` and non-empty; the landings are
  computed in the main process from `PROJECT_SKILLS_DIR`.
- `targetProjectPath` for install and uninstall still comes from the renderer — the existing trust model of these
  channels, not widened by this change (the same check as before applies per landing).
- The skill-file reader's known roots now include agy's `config/skills` and `~/.gemini/skills` (read-only, the side's
  own libraries per skills-view::REQ-001/AC-01); a sibling directory is refused (unit case).
- Nothing under `~/.gemini` is written: the readers only list and read; tests use temporary fixture homes.

Re-scanned after findings 1, 3–6: the block-scalar reader reads lines already in memory and only for display; no
finding.

## Consistency

- **Class check for finding 4** (a list keyed by a field not unique across its entries): every `key=` in the seven
  renderer components this change touches, enumerated with `rg -c "key="` (42 sites). Two hit and are fixed (the global
  Skills rows; the plugin chips, finding 6). One more hits only in a case this change does not create: project detail's
  skill rows key `side-level-name`, which two enabled Claude plugins with one bare name from different marketplaces
  would share — a Claude-only case on an unchanged line (refactoring list). The other 39 are unique by construction
  (paths, directory names, side names, indices).
- **Changed invariant**: finding 1's fix changes what Claude's and Codex's descriptions show when written as a block
  scalar (the marker before, the text now) — the specs already say "the frontmatter description"
  (plugins-view H1, skills-view's intro), so no document becomes untrue; recorded as a decision.
- Smell baseline over the new code: `PROJECT_AGENTS_DIR` in `SubagentsView.tsx` restates the project agents
  directories the reader builds in `subagents.ts` (Duplicated Code; refactoring list). `blockScalar` and `fmValue`
  interpret a subset of YAML by hand — no YAML parser is a dependency of the app (`package.json`); adopting one for a
  display-only field is out of proportion (Primitive Obsession answered). No other hit.
- Conventions: error handling follows the readers' "degrade this entry" style; new copy is in both dictionaries; no
  sides enumerated as a full set in copy (`pnpm check:ui`).

## Refactoring list (not executed)

| Item | Reason | Escape surface | Suggested handling |
|---|---|---|---|
| The picker's tags are fetched once per opening and not refreshed by a rescan while the picker stays open | A stale tag either blocks a valid install for that opening or misses one the main process then refuses (A4) | Self only | Do not do: the picker is short-lived; reopening refreshes |
| Project detail's skill row key `side-level-name` collides for two enabled Claude plugins sharing a bare name from different marketplaces | Same class as finding 4 | Same-layer, Claude-only, needs two such plugins | Do not do here: an unchanged line and a Claude-only case; fold into any later change of that list |
| `PROJECT_AGENTS_DIR` (renderer headings) restates the reader's directories (`subagents.ts`) | Duplicated knowledge between main and renderer, unlike `PROJECT_SKILLS_DIR` (shared) | Self only (a heading's text) | Another task, low value: move to `src/shared/domain.ts` beside `PROJECT_SKILLS_DIR` when a side's directory next changes |
| Front matter is read by a hand subset of YAML (`fmField`, `fmValue`, `blockScalar`) | Other YAML forms (flow lists, anchors) show as written | Self only (display) | Do not do: shown, never acted on; revisit only if a sample shows another form |

## Conclusion

Two real bugs (finding 4 same-layer; finding 6 same-layer within a chip list), two self-only faults fixed because the
fix was the missing exit or the sibling readers' rule (findings 3, 5), and one premise measured false against agy's own
sample (finding 1). Verification after the fixes: `pnpm typecheck` exit 0; `pnpm lint` exit 0; the unit suite 81
files, 973 passed, 1 skipped; on a fresh build the two new e2e cases, the shared-directory case and the Grok install
and detail cases, 7 passed. The full gate follows (worklog T6).

## Spec final check (before step 7; code read only)

Against the specs at `cbe22ca` plus this branch's write-backs (listed under the table), unit by unit for this ticket's
paths; evidence per unit is in the checklist's current verification.

| Unit (spec text) | Implementation | Conclusion |
|---|---|---|
| skills-view::REQ-001/AC-01 "three global directories … listed once, as the copy agy uses: the first … over the second over the third … The row's preview opens that copy" | `globalSkillsRoots`, `readSkillLibrary` (first wins), `globalSkillEntry` for preview and install | Met |
| skills-view::REQ-001/AC-02 "agy's built-in skills are not listed" | `builtin/skills` is in no root list | Met |
| skills-view::REQ-001/AC-03 "AG badge … one row with every such side's badge, and the drawer's side switcher includes Antigravity" | Sides merged by name over every side's library; drawer switch over `sides` | Met |
| skills-view::REQ-001/AC-04 "bundled skills of … effectively enabled plugins join … `<plugin>:<skill>` … with the AG badge and the plugin badge" | `addPluginSkill('antigravity', …)` for enabled plugins | Met |
| skills-view::REQ-001/AC-05 "counts AC-01's names, without built-in or plugin entries" | Card count `origin === 'disk'` | Met (for every side; written back to agents-overview B2) |
| skills-view::REQ-001/AC-06 "Codex's global library (`~/.agents/skills`) is not Antigravity's" | Not in agy's root list | Met |
| skills-view::REQ-002/AC-01 "one group … headed "Shared · .agents/skills" with the CX and AG badges … between the Codex groups and the Antigravity groups … whatever the project is registered on" | `skillsDirLoaders`, the detail assembly's order, DetailPane's section heading | Met |
| skills-view::REQ-002/AC-02 "entries are project-level: each is previewable (B5) and uninstallable" | Level `project`; preview and uninstall through the first loader's side | Met |
| skills-view::REQ-002/AC-03 "a name in the shared directory hides the same name in Codex's global group and in Antigravity's global group" | Each owner's global set minus the shared names | Met |
| skills-view::REQ-002/AC-04 "Antigravity's global group follows the shared group" | Assembly order | Met |
| skills-view::REQ-002/AC-05 "The plugin-bundled group's rows carry their side's badge" | Plugin rows' badge from their own side | Met |
| skills-view::REQ-002/AC-06 "A project registered on neither … still shows the group when the directory holds skills … an empty or absent directory shows no group" | The shared directory is read for every project; empty groups are dropped | Met |
| skill-install::REQ-001/AC-01 "one target: one outlined mark naming both sides that load it (CX AG), whatever the project is registered on" | `skillLandings` loaders; the picker's `.pop-shared` mark | Met |
| skill-install::REQ-001/AC-02 "Whether a project offers it follows A8" | Landings from the skill's sides ∩ the project's | Met |
| skill-install::REQ-001/AC-03 "The same-name check (A4) against the directory is made once" | One `installSkill` per landing | Met |
| skill-install::REQ-001/AC-04 "The result is reported once for the directory … a failure is one failure notice" | One result per landing; `installedShared` | Met |
| skill-install::REQ-001/AC-05 "Antigravity's global library is an install source … the copy installed is the one agy uses" | Source via `globalSkillEntry` | Met |
| skill-install::REQ-002/AC-01 "deletes it from `.agents/skills` (B1). The confirmation shows the full path (B4) and states that the directory is loaded by Codex and Antigravity" | `confirmShared` under the path | Met |
| skill-install::REQ-003/AC-01 "A stale project is listed in the picker, disabled and labelled as stale" | `disabled={p.stale}`, `pickStale` | Met |
| skill-install::REQ-003/AC-02 "carries a "Same name installed" tag; choosing it shows the existing blocked notice (A4) and installs nothing" | `skillHoldings`, the tag, the blocked notice per held landing, no IPC install | Met (tags now reset per opening, review finding 3) |
| subagents-view::REQ-001/AC-01 "Global … `<name>.md` and `<name>/agent.md`. Project-level … `.agents/agents/<name>/agent.md`" | `readAntigravitySide(dir, withFlat)` | Met |
| subagents-view::REQ-001/AC-02 "its name is the front matter's `name`, else the file's name … description is the front matter's; the drawer shows the definition as written" | `frontMatter` + `fmValue`; content as read | Met (block scalars read as text, review finding 1) |
| subagents-view::REQ-001/AC-03 "A definition marked as not usable as a main agent is listed like any other" | No filter on `mainAgent` | Met |
| subagents-view::REQ-001/AC-04 "one row with both badges, the drawer switching sides" | `mergeSides` with `antigravity` | Met |
| subagents-view::REQ-001/AC-05 "project-level group is headed "Project level · .agents/agents" and the global entries follow; Antigravity rows carry no shadowing badge" | Grouped layout; `shadowing = side !== 'antigravity'` | Met (the grouped layout for every side written back) |
| subagents-view::REQ-001/AC-06 "Subagents bundled with an Antigravity plugin show inside that plugin's expansion … not in this section" | Plugin agents only in `contents.agents` | Met |
| plugins-view::REQ-001/AC-01 "lists the plugins installed under `~/.gemini/config/plugins/<name>/`, each read from its `plugin.json`, with its version and the marketplace" | `readAntigravityPlugins` | Met |
| plugins-view::REQ-001/AC-02 "no enabled key is enabled … an explicit false is disabled … missing or does not parse is skipped" | `enabled: rec['enabled'] !== false`; `readJson` null → `{}` | Met |
| plugins-view::REQ-001/AC-03 "Skills …, Subagents (its `agents/` definitions) and MCP (… `<plugin>_<server>`). Rules … not shown … hooks are not shown" | `readAntigravityPluginContents` | Met |
| plugins-view::REQ-001/AC-04 "The skills of an effectively enabled Antigravity plugin join the Skills section" | As skills-view::REQ-001/AC-04 | Met |
| plugins-view::REQ-001/AC-05 "Project detail lists the same plugins, labelled as taking effect globally and naming their marketplace … workspace plugins … are not read" | `AntigravityGroup onProjectPage`, `inEffectGlobally` | Met |
| plugins-view::REQ-001/AC-06 "No merging by name with another side's group (E9); a disabled plugin remains readable (H4)" | Separate groups and per-side join entries; preview independent of enablement | Met |
| agents-overview::REQ-003/AC-01 (#325's part) "global skill count and subagent count (B2)" | `sideStats` | Met |
| agents-overview::REQ-003/AC-03 (#325's part) "The Skills, Subagents and Plugins sections gain the side" | As above | Met |
| agents-overview::REQ-003/AC-04 "global MCP file …, a server marked disabled carrying the disabled pill, and the servers bundled with its effectively enabled plugins … `<plugin>_<server>` … marked as coming from that plugin … `.agents/mcp_config.json` is shown nowhere" | `readGlobalMcp`, `McpServerRow`, `AntigravityMcpGroup` | Met |
| project-detail::REQ-002/AC-03 "lists agy's global servers and its effectively enabled plugins' servers …; the project's own `.agents/mcp_config.json` is not shown" | `AntigravityMcpGroup onProjectPage` | Met |
| project-detail::REQ-002/AC-04 (#325's part) "The Skills, Subagents, Plugins … sections show the side as their specs define" | As above | Met |

Scope beyond these units, each traced: the Claude card's skill count (agents-overview B2, written back), the MCP row
form for every side and the plugin note on Claude's plugin servers (agents-overview REQ-003 boundaries, written back),
project detail's grouped Subagents layout for every side (subagents-view Implementation Decisions, written back), the
block-scalar reading on every side (plugins-view and subagents-view boundaries, written back), the picker listing stale
projects (skill-install::REQ-003/AC-01 itself). No code contradicts a spec statement. Written back on this branch
(2026-10-29): agents-overview B2 and the REQ-003 boundaries; skills-view's REQ-001/REQ-002 boundaries; skill-install
REQ-001 and REQ-003 boundaries; subagents-view REQ-001 boundaries and the project detail layout; plugins-view REQ-001's
settled boundaries; project-detail REQ-002's MCP group visibility.

## Self-check of the test review's fixes (item 1)

Not applicable: the fixes for the post-implementation check's six findings (round 1, 2026-10-29) change no product
code — tests, the e2e fixture home and the records only.
The same holds for round 2's fix (finding 7): E4's home and reads only.
