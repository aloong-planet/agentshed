# README — documentation regression

## Ticket #292 — the READMEs describe what the app does today

- Date: 2026-10-21
- Scope: #292's change only: the six READMEs and the new `LICENSE`, on branch `docs/readme` from 9b7bb13
- Languages: the two full READMEs are Chinese and English and say the same thing; each claim below was checked in
  both. The four short READMEs (French, Spanish, Russian, Japanese) repeat the opening, the reads/writes/network
  line and the requirements, and were checked against the same sources

### Stage 1: changed declarations — each claim against its source

| Claim (README.en.md, and README.md the same) | Source | Conclusion |
|---|---|---|
| The opening summary, shared word for word with the website's hero paragraph (the owner's decision of 2026-10-21): which skills, plugins and MCP servers the agents installed, what they remember, how many tokens they burned; every session read question by question, a search across all of them, skills installed from the global library | the rows below for each part: plugins (`plugins-view.md`), memory (`memory-view.md`), tokens (`token-stats.md`), sessions (`session-view.md`), global search (`global-search.md`), skill install (`skill-install.md`) | True; the four short READMEs open with the same summary in their languages |
| The Agents page opens first, one screen for every agent side | `docs/features/agents-overview.md` Overview ("the default landing page … onto one screen") | True |
| Token totals for all history, today, the last 7 days and the last 30, 60 or 90 days | `token-stats.md:13–19` | True |
| The Agents page's sections: skills, subagents, plugins, MCP servers, memory and configuration | `agents-overview.md:21–35` | True |
| Every registered project, one directory to one project, sorted by activity; search by name or path, one side, show or hide projects whose directory is gone | `projects-list.md:8, 16, 19–22` | True |
| A project's page: skills, subagents, plugins, MCP servers, memory and configuration as they take effect there, the documents its agents produced, its sessions | `project-detail.md` Overview (nine sections, Artifacts and Sessions among them); the catalogue's line ("each component's effective view") | True |
| Filter a skills list by name; expand a skill to read its files | `skills-view.md` Overview | True |
| Install a skill as a full copy; uninstall a project's copy after a confirmation that shows what is deleted | `skill-install.md:18, 22–23` | True |
| Subagents in one view, showing which one applies in a project | `subagents-view.md` Overview | True |
| Plugins by side, installation and enablement, bundled skills, subagents, hooks and MCP servers, read its skills before enabling | `plugins-view.md` Overview | True |
| Memory, summarised and in full | `memory-view.md` Overview | True |
| Tokens per project and overall, by day, project and model, with a daily 30/60/90-day trend | `token-stats.md:13–19, 36–37` | True |
| Each day's totals archived, surviving an agent's cleanup or rewrite | `token-stats.md:66–67` | True |
| Sessions one per row with the question count; read by question; expand a whole turn (tool calls, subagents, reasoning) | `session-view.md` Overview; the catalogue's line | True |
| A project's session search by question or full text, jumping to the hit | `session-view.md:96` and its search capabilities | True |
| A fork shows only what is new since it; a branched session shows the branch carried on; the unrecoverable is labelled | `session-view.md:56, 76–79`; the catalogue's line | True |
| Global search from its own page or ⌘⇧F; grouped by project; a hit opens at that question inside its project | `global-search.md:12–14, 23, 36` | True |
| Light, dark or the system's, in three themes | `appearance.md` and the catalogue's line | True |
| The interface language follows the system or the user's pick | `i18n.md` Overview | True; no count of languages is given, so the line holds whatever the number |
| Updates download in the background and install with one click or on quit | `app-update.md` Overview | True |
| It reads the agents' files; writes to them only to install or uninstall a skill; never changes an agent's configuration | `project-detail.md:44–45` ("the product itself never writes to any agent's configuration"); `skill-install.md`; `appearance.md` ("Nothing is written to the agent configuration") | True |
| Its one network use is the update check on GitHub Releases | `app-update.md:50–51`; the code: `electron-updater` from GitHub Releases is the app's only outgoing request, and the window's content policy allows the app itself and the local development server only | True |
| macOS 12 or later, Apple Silicon | `docs/specs/mac-distribution.md` (REQ-001/AC-04, and its story for Apple Silicon users); the landing page's platform line | True |
| pnpm 9 and Node.js 22 | `package.json` (`packageManager: pnpm@9.12.3`); every workflow's `node-version: 22` | True |
| What `pnpm verify` runs; the smoke run is of the app in development | `package.json`'s `verify`; `scripts/smoke.sh` (it starts `pnpm dev`) | True |
| MIT licence | `package.json`'s `license`; the new `LICENSE` | True |
| Agent sides named as examples, never as the complete set | every README: "and other", the Chinese and Japanese READMEs' own words for "and others", "et d'autres", "y otros", "и другие" | True; the old READMEs listed three sides as the whole set |

### Stage 2: related declarations

| Statement (unchanged file) | Its counterpart changed this round | Conclusion |
|---|---|---|
| `package.json`'s `license: MIT` | the new `LICENSE` | Now agree; before, the repository had no licence text |
| The landing page's hero paragraph (`site/src/i18n/ui.ts`) | the READMEs' opening summary | The same summary, by the owner's decision of 2026-10-21; #279 puts it on the page. Until #279 lands the page's older paragraph says less (no memory, session review or search), and nothing false |
| The feature catalogue's index (`docs/features/README.md`) | the README's pointer to it | True |
| #239's plan for the READMEs (download and install steps in all six, with the first release) | the new layout: two full READMEs, four short | Recorded on #239 for restating when it resumes |

### Stage 3: events

| Event | Lines checked | Conclusion |
|---|---|---|
| An enumerable dimension | the READMEs name agent sides only as examples and give no number of interface languages | None changed; nothing here goes false when a side or a language is added or removed |
| Pending notes | none in the READMEs | — |
| A rule written this round | none | — |
| Work state | #292 closes with the merge; #239's README item restated on #239 | Recorded in the document sync checklist |

### Convergence

Every row was processed; no text was changed by the regression.
