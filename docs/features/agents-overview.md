# Agents overview

## Overview
Users running several coding agents want to know, the moment the app opens, "what state is each
side in and how much has each burned". This page is the default landing page and gathers every
agent side's global picture onto one screen.

## Capabilities
- A summary card per side at the top: that side's detection status, token figure, project count,
  global skill count and subagent count — the skill count is the side's own library, not the skills its
  plugins bring; if one side's registry is corrupt it degrades to an error explanation while the other
  sides are unaffected
- When the last scan could not read some of Antigravity CLI's conversations in the format the app
  supports, the Antigravity CLI card's last line says how many, in the warning colour, and hovering it
  explains that Antigravity CLI may have changed its conversation format in an update and that their
  usage is not counted; the figure above still shows what could be read, and the usual line returns
  once every conversation reads again. A corrupt registry's explanation takes precedence over it
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
  sides have each entry and symlinks marked; no cross-side content diff; on-disk skills expand to preview a package's files (see [Skills view](skills-view.md)); global library
  entries can start an "Install to…" action; plugin entries are read-only and expand to preview the package (see
  [Plugins view](plugins-view.md))
- Subagents section: the Claude Code, Codex and Antigravity CLI subagent definitions in one view (see
  [Subagents view](subagents-view.md))
- Plugins section: the plugin list grouped by side, with bundled components expandable (see
  [Plugins view](plugins-view.md))
- MCP section: each side's global MCP servers grouped by origin (global config / bundled with a plugin /
  config.toml / Antigravity CLI's global MCP file); a server its configuration disables is marked
  Disabled, and a plugin's server names the plugin it comes from
- Memory section: a summary of each project's automatic memories, with viewing (see
  [Memory view](memory-view.md))
- Configuration section: two entries, CLAUDE.md and AGENTS.md, rather than one set per side. CLAUDE.md
  is the global one; AGENTS.md shows every global AGENTS.md an agent side loads — Codex's, then
  Antigravity CLI's two, its root one first — one after another, each headed by its path. Files are
  rendered for reading in a card that scrolls past about half the window; an entry with no file shows
  "None", a file that cannot be read says so under its path, and overly long files are truncated. No
  side's settings summary is shown, and Antigravity CLI's GEMINI.md files and rules are not shown

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
- The Antigravity CLI side: its card reports whether Antigravity CLI is installed, its usage in the
  selected window, how many projects it registers, and how many global skills and subagents it has; its
  skills, subagents, plugins and MCP servers appear in their sections. Its memories, rules and built-in skills
  are not shown, nor a project's own MCP file for it
