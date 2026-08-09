# Subagents view

## Overview
Both agent sides support custom subagents (specialised assistant definitions), but the definitions
live in two different directories in two different formats, so a user cannot see "which ones are
defined on this machine, and which one actually applies in this project". This feature adds a
Subagents section to both the global page and project detail for viewing them together.

## Capabilities
- Global page: both sides' definitions merged into one column, with same-name entries merged onto one
  row carrying both side badges; a single-side entry marks the missing side with a dashed badge
- Clicking an entry opens a drawer directly: metadata (tools/model on the Claude side, model/sandbox
  on the Codex side) and the full definition as written; an entry present on both sides can switch
  sides inside the drawer, which refreshes in place without closing
- Same-name entries on both sides are not compared by content (the two formats are different, so no
  "are they the same" signal is offered)
- When a file is corrupt, unnamed or unreadable, the entry stays with the appropriate label, and the
  other entries and the same-name shadowing judgement are unaffected
- A Codex custom name matching a built-in assistant (default/worker/explorer) is marked "overrides
  built-in"
- Project detail: the effective view — project-level and global-layer entries side by side, with
  same-name pairs on either side shadowed at the project level (shadowed entries greyed out and
  labelled); this differs from Skills' Codex same-name coexistence semantics, and each component's
  labels follow its own meaning

## Boundaries and non-goals
- Read-only: no creating, editing or deleting subagents
- Overly long definition files are truncated for display
