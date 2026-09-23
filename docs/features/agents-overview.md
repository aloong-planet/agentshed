# Agents overview

## Overview
Users running several coding agents want to know, the moment the app opens, "what state is each
side in and how much has each burned". This page is the default landing page and gathers every
agent side's global picture onto one screen.

## Capabilities
- A summary card per side at the top: that side's detection status, token figure, project count
  and global skill count; if one side's registry is corrupt it degrades to an error explanation while
  the other sides are unaffected
- Reopening the app immediately shows the last saved overview and project list while a scan runs
  in the background. The page remains usable; the title's scanning note disappears when fresh data
  arrives in place. If scanning fails, the note stops spinning, previous data stays visible and
  the app retries automatically
- On a first launch, or when the saved display cannot be used, real headings and labels surround
  placeholder figures until the first scan finishes. Page controls wait for that data while the
  navigation rail remains usable; data fills in place and later scans never bring placeholders back
- Token section (the default): a large daily trend chart with 30 / 60 / 90 day spans (switchable between
  combined and a single side) and a cross-project model breakdown; the totals include stale projects
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
- Every restart opens Agents. Previously viewed content is remembered, but the last selected project,
  session, scroll position, open groups, searches and active totals card are not. The global 30/60/90-day
  trend choice is remembered (see [Token statistics](token-stats.md))
- The Grok side: its own global skills are listed and installable like the others'; components it
  borrows from Claude Code at runtime stay out of its lists, and the Skills section says so in one
  line. Its agent definitions, plugins, memory and user-level MCP are not yet parsed — there is no
  real data to ground a parser on this machine, so those categories show nothing for Grok rather
  than a guessed reading
- The global library is read-only: its contents are never added to, changed or removed via this app
- A side that is not installed shows "not detected" rather than an error
