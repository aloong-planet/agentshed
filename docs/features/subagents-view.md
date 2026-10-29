# Subagents view

## Overview
Agent sides support custom subagents (specialised assistant definitions), but each keeps its
definitions in its own folders and format, so a user cannot see "which ones are defined on this
machine, and which one actually applies in this project". This feature adds a Subagents section to
both the global page and project detail for viewing them together.

## Capabilities
- Global page: Claude Code's, Codex's and Antigravity CLI's definitions merged into one column, with
  same-name entries merged onto one row carrying each side's badge; a side without the entry shows a
  dashed badge
- Clicking an entry opens a drawer directly: metadata (tools/model on the Claude side, model/sandbox
  on the Codex side; tools, whether it may run as a subagent or as the main agent, and model on the
  Antigravity CLI side) and the full definition as written; an entry present on more than one side can
  switch sides inside the drawer, which refreshes in place without closing
- An Antigravity CLI definition that agy will not offer as a main agent is listed like any other: agy still
  loads it. Subagents bundled with an Antigravity CLI plugin show inside that plugin's expansion instead
- Same-name entries across sides are not compared by content (the two formats are different, so no
  "are they the same" signal is offered)
- When a file is corrupt, unnamed or unreadable, the entry stays with the appropriate label, and the
  other entries and the same-name shadowing judgement are unaffected
- A Codex custom name matching a built-in assistant (default/worker/explorer) is marked "overrides
  built-in"
- Project detail: the effective view, grouped — each side's project-level group headed by the folder it
  reads, then each side's global group, every heading with its count. On Claude's and Codex's sides
  same-name pairs are shadowed at the project level (shadowed entries greyed out and labelled); this
  differs from Skills' Codex same-name coexistence semantics, and each component's labels follow its own
  meaning. Antigravity CLI's rows carry no shadowing label: whether agy lets a project definition override a
  global one has not been observed

## Boundaries and non-goals
- Grok agent definitions are not yet read: there is no real sample to ground a parser on this
  machine, so the Grok side contributes nothing here rather than a guessed reading
- Read-only: no creating, editing or deleting subagents
- Overly long definition files are truncated for display
