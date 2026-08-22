# Agents overview

## Overview
Users running several coding agents want to know, the moment the app opens, "what state is each
side in and how much has each burned". This page is the default landing page and gathers every
agent side's global picture onto one screen.

## Capabilities
- A summary card per side at the top: that side's detection status, token figure, project count
  and global skill count; if one side's registry is corrupt it degrades to an error explanation while
  the other sides are unaffected
- While a launch's first scan runs, the page keeps its shape: real headings and labels with pulsing
  placeholder blocks where the figures will land, and a scanning note beside the title. Nothing on
  the page responds to clicks until the data arrives, the data then fills in place without the page
  jumping, and a later refresh never brings the placeholders back
- Token section (the default): a large 30-day daily trend chart (switchable between combined and a
  single side) and a cross-project model breakdown; the totals include stale projects
- Skills section: every side's global library merged into one column, with side badges showing which
  sides have each entry and symlinks marked; no cross-side content diff; on-disk skills expand to
  preview a package's files (see [Skills view](skills-view.md)); global library entries can start an
  "Install to…" action; plugin entries are read-only and expand to preview the package (see
  [Plugins view](plugins-view.md))
- Subagents section: the Claude and Codex sides' subagent definitions in one view (see
  [Subagents view](subagents-view.md))
- Plugins section: the plugin list grouped by side, with bundled components expandable (see
  [Plugins view](plugins-view.md))
- MCP section: the Claude and Codex sides' global MCP servers grouped by origin (global config / bundled with a
  plugin / config.toml)
- Memory section: a summary of each project's automatic memories, with viewing (see
  [Memory view](memory-view.md))
- Configuration section: the global CLAUDE.md and global AGENTS.md rendered for reading, and a
  read-only config.toml summary; missing files show "none"

## Boundaries and non-goals
- The Grok side: its own global skills are listed and installable like the others'; components it
  borrows from Claude Code at runtime stay out of its lists, and the Skills section says so in one
  line. Its agent definitions, plugins, memory and user-level MCP are not yet parsed — there is no
  real data to ground a parser on this machine, so those categories show nothing for Grok rather
  than a guessed reading
- The global library is read-only: its contents are never added to, changed or removed via this app
- A side that is not installed shows "not detected" rather than an error
