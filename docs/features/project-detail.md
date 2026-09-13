# Project detail

> Related decision: ADR-0004

## Overview
"What capabilities does this project have installed, what conventions does it follow, and what has it
accumulated" is the product's founding question. The detail page answers it across nine sections:
Overview (default), Skills, Subagents, Plugins, MCP, Memory, Configuration, Artifacts and Sessions.

## Capabilities
- Switching between projects turns a page rather than flashing one: the page you are on stays put
  until the next project's detail has arrived, then the whole page switches at once — no empty pane,
  no loading label, no new title over old content. Only the list highlight moves right away. A
  project already opened comes back at once, including after quitting and reopening the app, and
  quietly refreshes behind the scenes. Its last successful content stays readable if a refresh
  fails; a project never opened before waits for its first detail. Leaving for Agents or Settings
  and returning is likewise instant.
- Skills effective view: within one side, a same-name pair shows only the project-level entry (the
  shadowed global one is not listed alongside); anything that exists only globally is still listed;
  on-disk skills expand to preview a package's files (see [Skills view](skills-view.md)); symlinks
  are marked; project-level entries can be uninstalled; the plugin-bundled skills group is read-only
  and expands to preview (see [Plugins view](plugins-view.md))
- Subagents effective view: project-level and global-layer entries side by side, with same-name pairs
  on either side shadowed at the project level (see [Subagents view](subagents-view.md))
- Plugins: effective enablement from this project's point of view, with bundled components expandable
  (see [Plugins view](plugins-view.md))
- MCP: the servers in the project's `.mcp.json` and their enabled / disabled / default state; if
  there are none, a pointer to the Agents page for the global ones
- Memory: this project's automatic memories in full (see [Memory view](memory-view.md))
- Configuration: the project's CLAUDE.md and AGENTS.md rendered for reading, plus a settings summary;
  missing files show "none"; a link to one of the project's listed documents opens it in the same
  reading overlay as the Artifacts tab, and a link outside them shows a notice
- Artifacts tab: the six kinds of artifact laid out flat in reverse chronological order, filterable
  by type chips; the chips are ordered by the top-down derivation chain (CONTEXT.md → ADR → specs →
  prototypes → features → postmortems); markdown opens in an overlay for reading, and prototypes'
  HTML opens with the system default application. Reopening a file you already read (from the list or
  from a cross-reference link) shows it at once, including after restarting. A failed refresh keeps
  an already read preview; a file never successfully read reports the failure in a toast
- Sessions: this project's sessions on every agent side, with sorting and search, opening to the full
  conversation (see [Session view](session-view.md))
- A stale project's detail page opens as a note page instead of the sections: it names why the
  project is stale (the directory no longer exists while the listed agents' registries still record
  it), notes that removal takes the row off the list without affecting token totals, and hands over
  a copyable one-line message to send to each recording agent so the agent deletes its own record —
  the product itself never writes to any agent's configuration

## Boundaries and non-goals
- For a project not following the eight-step process, the artifacts tab shows a "nothing accumulated
  by convention" empty state, which is not treated as an error
