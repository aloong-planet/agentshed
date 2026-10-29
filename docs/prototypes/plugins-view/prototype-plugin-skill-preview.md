# Reviewer notes: prototype-plugin-skill-preview.html

## Question

What the Plugins section of the Agents page looks like when each plugin row carries its enablement and its
installation records, its expanded area shows the bundled components one category tab at a time, and a plugin's
skill package is read in place: a row per skill with its file count and size, the package's file table under the
row, and the file drawer over the page. The feature is the plugins view's in-place preview of plugin skills
(plugins-view spec, sequences E and H).

The mock draws a plugin with two installation records (`superpowers@official`), among its skills one whose
directory is missing (greyed out, the reason in its stats slot) and one with references deeper than two levels (the
notice under its file table); a plugin that is not enabled and stays readable (`content-tools@local`); a plugin
whose install directory is missing, with the banner in its expanded area and its skill row greyed out
(`ghost@legacy`); and a probe-style Codex plugin whose expanded area has a Skills tab only (`documents`).

## Structure basis

- The app window, the rail, the Agents page heading and its section tabs with Plugins selected: the Agents page's
  frame, drawn as context; it is judged on the Agents page prototype (prototype-agents).
- The plugin row (name, version, the enablement or marketplace pill, the installation-record chips), the expanded
  area's category tabs and the Skills tab's row list: the direction confirmed for the plugins view, as the
  plugins-view spec states it (Solution; Implementation Decisions, UI).
- The skill rows and how they expand and collapse: the Skills section's rows on the Skills view prototype
  (prototype-skills-preview), the same interaction.
- The file table under a skill row: the expanded file table of the Skills view prototype (columns file / lines /
  size / modification date, the entry-point tag on `SKILL.md`, the notice about deeper paths); the two change
  together.
- The file drawer: the shared file-drawer form, the one the skill file drawer and the memory file drawer take; its
  body is the shared md-preview block.

## Demo scaffolding

The page has no demo bar. Its language, light/dark and palette follow the gallery's settings and the settings
prototype.

- The annotation under the section tabs (beginning "插件行内直接给启用态与安装记录"): not part of the design; do not
  implement. Nothing in the product shows it.
- The footer annotation ("注:启用态判定来自 settings 分层合并(现行逻辑),本页为静态 mock;…"): not part of the design;
  do not implement.
- The annotations at the foot of the expanded areas of `content-tools@local` ("未启用插件的 skill 仍可审阅(ADR-0012:…)")
  and `documents` ("探测式:无启用态语义,不并入 Skills 分栏(ADR-0012);仅缓存最高版本目录"): not part of the design; do
  not implement.
- These annotations stay in Chinese in every language.
- The first Claude plugin and its first skill row are open when the page loads: not part of the design; do not
  implement. In the product a row opens when the user clicks it.

## Uncovered dimensions

- The agent sides: the page draws the Claude and Codex groups only. The Antigravity CLI group (plugins-view::REQ-001:
  the version, the enablement, "From <marketplace>", and the Skills, Subagents and MCP tabs) is not drawn here.
