# Feature catalogue

This directory describes **the current behaviour of features the current version already has** —
a product overview written for people.
- Invariants: appearing in this directory = available in the current version; behaviour changes are
  rewritten in place; a removed feature has its file deleted.
- Future plans belong in the roadmap; history in git / release notes; implementation and decisions in
  docs/adr.
- Content rules: user-visible behaviour only, zero implementation detail; terminology comes from
  CONTEXT.md.

| Feature | In one line |
|---|---|
| [Agents overview](agents-overview.md) | The default landing page: both agent sides' global picture and total consumption at a glance |
| [Project list](projects-list.md) | The union of both sides' registered projects, filterable, searchable and hideable |
| [Project detail](project-detail.md) | What one project has installed: each component's effective view, MCP, configuration and artifacts |
| [Subagents view](subagents-view.md) | Both sides' subagent definitions merged into one view, showing at a glance which ones are in effect in a project |
| [Memory view](memory-view.md) | What the agent remembers about each project, as a summary and in full |
| [Plugins view](plugins-view.md) | Plugins grouped by side, enablement reported truthfully per viewpoint, bundled components expandable |
| [Token statistics](token-stats.md) | Per-project and cross-project token consumption, trends and session traces |
| [Session view](session-view.md) | Session list → question trunk → fetch a whole turn on demand (tools / subagents / reasoning) → search jumps straight there; forks and branches are normalised, and anything unrecoverable is labelled explicitly |
| [Skills install](skill-install.md) | Install and uninstall skills from the global library for a given project, guarded throughout |
| [Skills view](skills-view.md) | Filter either skills list by name, and expand to preview a package's files and contents (no cross-side diff) |
| [Appearance](appearance.md) | App-wide light/dark (follow system / light / dark) × theme (purple / mist blue / amber brown), the two independent |
| [UI language](i18n.md) | The UI switches between six languages (menus, failure notices, dates and numbers included), following the system's preferred language by default |
