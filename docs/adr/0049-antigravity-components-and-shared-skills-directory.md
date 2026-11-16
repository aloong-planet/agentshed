# ADR-0049: Antigravity CLI's components are shown where agy was seen to load them, `.agents/skills` is shared with Codex, and Instructions shows CLAUDE.md and AGENTS.md

- Status: Accepted (2026-10-28)

## Context

Antigravity CLI (ADR-0037) loads skills, subagents, plugins, MCP servers, rules, instruction files and memory, some
from places its documentation names but agy was not seen to read, and it ships built-in skills of its own. Its
project-level skills directory, `.agents/skills`, is the one Codex loads as its own, so the directory belongs to two
sides at once. The agents page and project detail must decide which of these to show, under which side, and how the
Instructions section reads once a third side's instruction files join it.

## Options

1. **Built-in skills unlisted; each component category shown only where agy was seen to load it in a sample made with
   agy itself; `.agents/skills` one group shared with Codex and one install target; Instructions as two entries,
   CLAUDE.md and AGENTS.md** — chosen.
2. Listing agy's built-in skills — rejected: they ship with the tool and are rewritten by it, and no other side's
   built-in skills are listed.
3. Showing nothing for component categories without local data, as for Grok — rejected by the owner: samples can be
   generated with agy itself, so each category can rest on a real one.
4. Listing `.agents/skills` under both Codex and Antigravity — rejected by the owner in favour of one shared group: it
   shows the same files twice.
5. Listing `.agents/skills` under Codex only, with a note that Antigravity borrows it — rejected by the owner: it
   misdescribes a directory agy's documentation names as its own default.
6. A Codex install target and an Antigravity install target for the project's `.agents/skills` — rejected by the
   owner: two options that land in the same place and behave identically confuse.
7. Instructions grouped by side, with Codex's `config.toml` summary, Claude's project settings summary, and agy's
   GEMINI.md files and rules — rejected by the owner, reason not recorded.

## Decision

We adopt **option 1**:

- **Built-in skills**: agy's built-in skills are not listed.
- **Grounding**: on the Antigravity side a component category is shown only where agy was seen to load it, in samples
  written as agy's documentation describes and confirmed through agy's own listings; the agents page's, project
  detail's and each component view's specs name what that grounds.
- **Shared skills directory**: the project-level `.agents/skills` is one group shared by Codex and Antigravity (the
  shared skills directory, `docs/CONTEXT.md`). A project install offers it as one target marked with both sides, and
  uninstalling from it says the skill goes for every side that loads it.
- **Instructions**: the section has two entries, CLAUDE.md and AGENTS.md, not grouped by side, and AGENTS.md shows
  every global AGENTS.md a side was seen to load. No side's settings summary is shown, nor any of agy's GEMINI.md
  files or rules.

## Consequences

- Positive: whatever the Antigravity side lists is something agy loads, and the shared directory's files appear once,
  named with both sides that load them.
- Negative: `.agents/skills` belongs to two sides at once, a case no other directory has, so the effective view and
  project install each carry a rule for it, and an uninstall there reaches both sides.
- Negative: what agy documents but was not seen to load, such as a project's own MCP file and the CLI-only rules
  directory, is not shown, nor is agy's memory, of which no sample exists, so a user relying on them sees nothing
  there.
- Neutral: a project's own AGENTS.md, read by Codex and agy alike, is shown once as a project file
  (project-detail::REQ-002/AC-02).

## Sources

`~/research/antigravity-cli-internals/local-data-and-usage.md` (the component samples of 2026-10-28: agy's official
`flutter` plugin, and global and project-level MCP, subagent and rule files, confirmed through agy's own listings; no
knowledge item over an eight-turn session); the agents-overview, project-detail, plugins-view, subagents-view,
skills-view, skill-install and memory-view specs. The owner's rulings of 2026-10-28 on every part above.
