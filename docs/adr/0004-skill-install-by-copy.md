# ADR-0004: Skills install by copy (symlinks rejected)

- Status: Accepted (2026-07-29, decided by the user during requirements analysis)

## Context

A project install has to land a skill from the global library into the project's directory. How it
lands determines the project's dependency on the global library, whether it can be committed to git,
and the blast radius of editing it.

## Options

1. **Dereferencing deep copy: copy to a temporary name in the same directory first, then rename,
   cleaning up on failure; symlinks in the source land as real files**
2. Land as symlinks — rejected: editing follows the symlink through into the global library or the
   other end (measured while preparing this project); what lands in the project's git is a link, not
   content; and Windows permissions are awkward
3. `cpSync` straight to the target name — rejected: an interrupted copy leaves a half-finished
   directory, and the next scan takes that broken directory for an installed skill

## Decision

We choose **option 1**: installs are dereferencing deep copies, so the project's copy is
self-contained and does not depend on the global library continuing to exist. Uninstalling deletes
the project's copy. No divergence detection between copies (phase two). The global library is
permanently read-only as far as this product is concerned.

## Consequences

- Positive: no risk of edits following through; the project can be committed as a whole; an
  interruption at any moment never produces a broken directory
- Negative: a project's copy does not follow along when the global library is updated (a
  version-drift notice is left to phase two)
- Neutral: name collisions are always refused rather than overwritten — the user uninstalls first,
  then installs

## Sources

The spec's install/uninstall clause (the user chose "land by copy"); the symlink pass-through
measurement during grilling (2026-07-29).
