# Spec directory

This directory describes **each feature's full requirements and boundaries in the current version**,
written for whoever is about to change that code. It is also the overview of what the app does today:
the table below says it in one line per feature.

- **Invariants**: one document per feature; it describes the present and is **rewritten in place**
  (no change history — that lives in git); removing a feature deletes the file.
- **Why it persists**: "Failure modes and boundaries" is the only place in the whole documentation set
  that records *which boundaries this feature enumerated and which things are explicitly not done* —
  ADRs record decisions and trade-offs and do not cover this layer. Lose it and the next person
  changing this code has no way to judge whether they have thought of everything.
- **No separate feature catalogue**: a spec states the user-visible behaviour as well as the
  requirements behind it.
- **Division of labour with ADRs**: decisions and trade-offs belong in ADRs; a spec cites the number
  and does not restate them.
- **Consistency**: step 8 of every development round runs a single cross-regression
  (spec ↔ implementation ↔ ADR ↔ CONTEXT ↔ prototypes).
- Tickets are the disposable working documents (`.scratch/`); a spec is not.

| Spec | In one line |
|---|---|
| [app-icon](app-icon.md) | A reactor identity: cyan production and yellow development |
| [agents-overview](agents-overview.md) | The default landing page: every agent side's global picture and total consumption at a glance |
| [projects-list](projects-list.md) | The union of every side's registered projects, filterable and searchable |
| [project-detail](project-detail.md) | What one project has installed: each component's effective view, MCP, instructions and artifacts |
| [subagents-view](subagents-view.md) | The agent sides' subagent definitions merged into one view, showing at a glance which ones are in effect in a project |
| [memory-view](memory-view.md) | What the agent remembers about each project, as a summary and in full |
| [plugins-view](plugins-view.md) | Plugins grouped by side, enablement reported truthfully per viewpoint, bundled components expandable |
| [token-stats](token-stats.md) | Per-project and cross-project token consumption, trends and session traces |
| [session-view](session-view.md) | Session list → question trunk → fetch a whole turn on demand (tools / subagents / reasoning) → search jumps straight there; forks and branches are normalised, and anything unrecoverable is labelled explicitly; the page copies a session's own ID and the command to resume it in its tool |
| [global-search](global-search.md) | Search what you asked across every project's sessions, and open a hit's session inside its project |
| [i18n](i18n.md) | The UI switches between Chinese and English (menus, failure notices, dates and numbers included), following the system's preferred language by default |
| [skill-install](skill-install.md) | Install and uninstall skills from the global library for a given project, guarded throughout |
| [skills-view](skills-view.md) | Filter either skills list by name, and expand to preview a package's files and contents (no cross-side diff) |
| [appearance](appearance.md) | App-wide light/dark (follow system / light / dark) × theme (purple / mist blue / amber brown), the two independent |
| [app-update](app-update.md) | New versions are found and downloaded in the background, and installed with one click or on quit |
| [mac-distribution](mac-distribution.md) | How the macOS app is packaged, signed, notarized and published |
| [prototype-pages](prototype-pages.md) | How the prototype pages are organised and checked |
| [landing-page](landing-page.md) | The website that introduces Agentshed in Chinese and English and offers whichever release exists |
| [test-layers](test-layers.md) | Which test layers there are and what goes in each |
| [ci-routing](ci-routing.md) | Which checks run for which changed paths |
