# ADR-0004: Skills install by a dereferencing copy; symlinks rejected

- Status: Accepted (2026-07-29)

## Context

Installing lands a skill from a side's global library in a project's own skills directory. How it lands decides
whether the project depends on the library staying in place, whether the project's git holds the skill's content, and
how far an edit to the landed skill reaches.

## Options

1. **A dereferencing deep copy, written under a temporary name in the same directory, renamed into place and removed
   on failure** — chosen.
2. A symlink — rejected: an edit follows the link into the global library, the project's git holds a link rather than
   content, and Windows permissions make links awkward.
3. A recursive copy straight to the target name — rejected: an interrupted copy leaves a half-written directory, which
   the next scan takes for an installed skill.

## Decision

We adopt **option 1**. A symlink in the source lands as a real file, so the project's copy stands without the global
library. Uninstalling deletes the project's copy without comparing it with the library, and this app never writes to
a global library.

## Consequences

- Positive: no edit reaches the global library, the project commits the skill whole, and an interruption at any moment
  leaves no broken directory.
- Negative: a project's copy does not follow an update of the global library, and nothing tells the user it has
  drifted.
- Neutral: a name already in the project is refused rather than overwritten, so replacing a skill takes an uninstall
  first.

## Sources

The owner's choice of landing by copy, 2026-07-29 (the skill-install spec); the symlink pass-through measured while the
project was being prepared, 2026-07-29. `src/main/providers/install.ts`.
