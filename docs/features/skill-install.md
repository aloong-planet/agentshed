# Skills install

> Related decision: ADR-0004

## Overview
Setting up skills for a project meant copying by hand, which is easy to put in the wrong place and
easy to trip over symlinks. This feature makes the global library the only install source, lands a
copy into a chosen project, and can uninstall the project-level copy.

## Capabilities
- "Install to…" on each row of the Agents page's Skills section: opens a target project picker sorted by
  activity; it installs to the intersection of the sides the skill is available on and the sides the
  project belongs to, into each qualifying side's folder. Each target row shows where the skill would
  land; the folder Codex and Antigravity CLI both load is one mark badged with both sides, installed
  once with one notice saying both load it
- A stale project is listed in the picker, disabled and labelled as stale. A project that already holds
  a skill of that name where it would land is tagged "Same name installed"; choosing it shows the
  blocked notice and installs nothing anywhere
- Antigravity CLI's global skills install like the others; the copy installed is the one agy uses
- The picker stays open while you look through it: **scrolling its list** reaches targets below the
  fold, and **resizing the window** moves it along with its button rather than closing it. It closes
  when you pick a target, when you scroll the page behind it, or when you start typing in the filter
  box — in each of those the row it was opened from has moved or gone
- Installing is a full copy: the project's copy is self-contained, and a symlinked source lands as a
  real file; an interruption or failure cleans up automatically and leaves nothing half-finished
- If the target already has a project-level skill of the same name, the install is refused with a
  notice rather than overwriting
- In project detail's Skills section, a project-level entry can be uninstalled: a confirmation dialog
  shows the full path to be deleted, and confirming deletes the copy. For the folder Codex and
  Antigravity CLI share, the dialog says that both sides lose the skill
- Every operation gives an explicit success or failure notice, and the result is visible right away:
  a project's contents are read when the project is opened, so nothing has to be refreshed and no
  other project is disturbed

## Boundaries and non-goals
- The global library is read-only: nothing is added to or removed from it via this app; plugins
  cannot be installed or uninstalled
- Uninstalling does not check for divergence between copies; the project's git state is the user's to
  handle
