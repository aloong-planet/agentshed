# Plugins view

> Related decisions: ADR-0010 · ADR-0012

## Overview
A plugin can be installed at the user level or only for one project, and its package bundles skills,
subagents, hooks, MCP servers and other components — the viewer previously treated plugins as a
purely global concept, could not see the bundled components, and got project-scope installs wrong.
This feature groups plugins by side, reports each installation record and each viewpoint's enablement
truthfully, expands to show bundled components by category, and can **preview a plugin's skill
package in full, in place** (review before enabling).

## Capabilities
- Two groups by side: a Claude Code group and a Codex group; plugins with the same name are not
  merged across sides
- Each Claude row: name, version, enablement, and **inline chips for each installation record**
  (scope and owning project; multiple records are not merged; if the owning project no longer exists
  it is marked "project lost")
- Enablement is read differently per page: the global page uses the user layer; project detail merges
  the layers actually in effect for that project (local > project > user) and states which layer the
  enabled/disabled judgement came from — a plugin installed for one project only shows as enabled in
  that project's detail and truthfully as not enabled elsewhere
- Clicking a row expands into **category tabs** (Skills/Subagents/Hooks/MCP; empty categories get no
  tab): subagents by name, a hooks event summary, MCP servers by name; if the install directory has
  been cleaned up, the whole area is marked "cannot be read" while the list row remains
- **The Skills tab is a row list** (name + description + file count · size): clicking a row expands
  the package's file table (per-file line count / size / modification date), and clicking a file opens
  a drawer to read it (markdown previews by default and can be switched to raw) — **independent of
  enablement, so a disabled plugin can be reviewed too**; a row whose package cannot be read is
  greyed out
- The skills bundled with effectively enabled plugins also appear in the Skills section as
  "pluginName:skillName" entries, badged "plugin", read-only with no install or uninstall, coexisting
  with an on-disk skill of the same name without shadowing either way; those entries **expand and
  preview on equal footing with on-disk skills** (inline counts / file table / drawer)
- The Codex group is probe-style: it appears only if a Codex plugin cache exists on this machine, and
  lists name / origin / version (a multi-version cache notes the count and takes the highest version);
  **bundled skills expand and preview** (the Skills category only), but do not join the Skills section
  (there are no enablement semantics, and we do not fabricate an "in effect" signal)

## Boundaries and non-goals
- Read-only: no installing, uninstalling, enabling or disabling plugins; previewing changes no
  enablement state
- Codex plugins' enablement and their bundled components other than skills are not shown (the
  semantics are not wired up, and we do not give uncertain signals)
- Hooks show an event summary only, never command contents; subagent / hook / MCP entries are not
  clickable and have no preview
