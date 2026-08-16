# Skills install

> Related: [features](../features/skill-install.md) · ADR-0004 (land by copy, symlinks rejected) · ADR-0002 (dual seam)
> Note on reconstruction: this document was **reconstructed backwards** after specs became persistent
> artifacts on 2026-08-01 — the boundary entries were inferred from the existing test cases; the
> trade-offs behind the landing method are in ADR-0004 and are not restated here.

## Problem Statement

Setting up skills for a project meant copying by hand: easy to put in the wrong place (the two sides'
directories differ), easy to trip over a symlink (editing follows through into the global library),
and an interruption leaves a half-finished directory that the next scan mistakes for an installed
skill.

## Solution

Make the global library the only install source and **land a copy** into the chosen project (a
symlinked source lands as a real file), so the project's copy is self-contained; a project-level copy
can be uninstalled. The global library itself is read-only.

## User Stories

1. As a user, I want to pick the target project straight from a global library entry, so that I do
   not have to remember either side's directory structure.
2. As a user, I want the install to be a full copy with symlinked sources dereferenced, so that the
   project's copy is self-contained and editing does not follow through to the global library.
3. As a user, I want to be blocked rather than overwritten when the target already has a
   project-level skill of the same name, so that my customised version is not silently wiped.
4. As a user, I want nothing half-finished left behind on interruption or failure, so that the next
   scan does not mistake a broken directory for an installed skill.
5. As a user, I want to see the full path to be deleted and confirm before uninstalling a
   project-level copy, so that I do not delete the wrong thing.
6. As a user, I want each operation to give an explicit success or failure notice and to refresh only
   that project, so that feedback is prompt without interrupting my browsing elsewhere.

## Failure modes and boundaries

**Sequence A: install**
- A1 Installing on the Claude side → copies into the project's `.claude/skills/`, contents intact.
- A2 Installing on the Codex side → lands in `.agents/skills/`; on the Grok side (since #126) →
  `.grok/skills/`. The sides' directories differ and must not be crossed — the mapping is the
  shared PROJECT_SKILLS_DIR record, so a new side is a compile error rather than a wrong landing.
- A3 The source is a symlink → **dereferenced and copied as a real directory** (ADR-0004).
- A4 The target already has a project-level skill of the same name → conflict, blocked with a notice,
  not overwritten.
- A5 The target project directory does not exist (a stale project) → refused with a notice.
- A6 The source is missing from the global library → missing-source, and **no half-finished directory
  is left** (copy to a temporary name first, then rename; clean up on failure).
- A7 A skill name containing path traversal (`../` and so on) → refused.
- A8 The intersection of the skill's available sides and the project's sides is empty → a notice that
  the project does not belong to that side, no install.
- A9 Both sides qualify → install to both, each reporting its own success or failure.

**Sequence B: uninstall**
- B1 Deletes the project-level copy; **the global library is unaffected**.
- B2 The target does not exist → report an error rather than throwing (the UI shows a failure notice).
- B3 Name traversal → refused.
- B4 The confirmation dialog must show the full path to be deleted (the user can see what is going).

**Cross-cutting**
- R1 Install and uninstall touch only the global library and the project's skills directory, and
  nothing else (plugin entries have no install/uninstall entry point, plus a level guard as a second
  line of defence).
- R2 After an operation, only that project is refreshed; no global rescan is triggered.

## Implementation Decisions

- **Landing method**: see ADR-0004 (land by copy; copy to a temporary name in the same directory
  first, then rename, cleaning up on failure).
- **Per-side directories**: Claude = `.claude/skills/`, Codex = `.agents/skills/`; the install sides
  = the skill's available sides ∩ the project's sides.
- **Name validation**: path traversal is refused at both the install and uninstall ends (the caller is
  not trusted).

## Testing Decisions

Following ADR-0002's dual seam: the providers layer **measures real filesystem effects** on a
temporary fixture directory (after installing the files are really there, after uninstalling they are
really gone, a symlink is really dereferenced, a failure really leaves no residue) rather than
mocking `fs`.

## Out of Scope

- Adding to or removing from the global library via this app (it is read-only).
- Installing or uninstalling plugins (see the plugins-view spec's Out of Scope).
- Checking for divergence between copies when uninstalling (the project's git state is the user's to
  handle).
- Version management and update notifications.
