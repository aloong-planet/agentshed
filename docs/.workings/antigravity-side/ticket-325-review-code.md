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
