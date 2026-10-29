# Feature catalogue

This directory describes **the current behaviour of features the current version already has** —
a product overview written for people.
- Invariants: appearing in this directory = available in the current version; behaviour changes are
  rewritten in place; a removed feature has its file deleted.
- Future plans belong in the roadmap; history in git / release notes; implementation and decisions in
  docs/adr.
- Content rules: user-visible behaviour only, zero implementation detail; terminology comes from
  CONTEXT.md. Distribution is not catalogued: how the app is packaged, signed and published, and so how to
  install it, is told by the README.

| Feature | In one line |
|---|---|
| [Application icon](app-icon.md) | A reactor identity: cyan production and yellow development |
| [Agents overview](agents-overview.md) | The default landing page: every agent side's global picture and total consumption at a glance |
| [Project list](projects-list.md) | The union of every side's registered projects, filterable and searchable |
| [Project detail](project-detail.md) | What one project has installed: each component's effective view, MCP, configuration and artifacts |
| [Subagents view](subagents-view.md) | The agent sides' subagent definitions merged into one view, showing at a glance which ones are in effect in a project |
| [Memory view](memory-view.md) | What the agent remembers about each project, as a summary and in full |
| [Plugins view](plugins-view.md) | Plugins grouped by side, enablement reported truthfully per viewpoint, bundled components expandable |
| [Token statistics](token-stats.md) | Per-project and cross-project token consumption, trends and session traces |
| [Session view](session-view.md) | Session list → question trunk → fetch a whole turn on demand (tools / subagents / reasoning) → search jumps straight there; forks and branches are normalised, and anything unrecoverable is labelled explicitly; the page copies a session's own ID and the command to resume it in its tool |
| [Global search](global-search.md) | Search what you asked across every project's sessions, and open a hit's session inside its project |
| [Skills install](skill-install.md) | Install and uninstall skills from the global library for a given project, guarded throughout |
| [Skills view](skills-view.md) | Filter either skills list by name, and expand to preview a package's files and contents (no cross-side diff) |
| [Appearance](appearance.md) | App-wide light/dark (follow system / light / dark) × theme (purple / mist blue / amber brown), the two independent |
| [UI language](i18n.md) | The UI switches between Chinese and English (menus, failure notices, dates and numbers included), following the system's preferred language by default |
| [App updates](app-update.md) | New versions are found and downloaded in the background, and installed with one click or on quit |
| [Landing page](landing-page.md) | The website that introduces Agentshed in Chinese and English and offers whichever release exists |
