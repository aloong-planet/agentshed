# Skills install

> Related decision: ADR-0004

## Overview
Setting up skills for a project meant copying by hand, which is easy to put in the wrong place and
easy to trip over symlinks. This feature makes the global library the only install source, lands a
copy into a chosen project, and can uninstall the project-level copy.

## Capabilities
- "Install to…" on each row of the Agents page's Skills section: opens a target project picker (stale
  projects excluded, sorted by activity); it installs to the intersection of the sides the skill is
  available on and the sides the project belongs to, and installs to both when both qualify
- Installing is a full copy: the project's copy is self-contained, and a symlinked source lands as a
  real file; an interruption or failure cleans up automatically and leaves nothing half-finished
- If the target already has a project-level skill of the same name, the install is refused with a
  notice rather than overwriting
- In project detail's Skills section, a project-level entry can be uninstalled: a confirmation dialog
  shows the full path to be deleted, and confirming deletes the copy
- Every operation gives an explicit success or failure notice; afterwards only that project is
  refreshed

## Boundaries and non-goals
- The global library is read-only: nothing is added to or removed from it via this app; plugins
  cannot be installed or uninstalled
- Uninstalling does not check for divergence between copies; the project's git state is the user's to
  handle
