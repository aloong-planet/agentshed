# Review — code (step 5), #201: the NUL gate reads new files (2026-10-08)

Scope: `scripts/check-raw-nul.mjs` (enumeration, header, output wording) and its CLI test file.

## ① Underlying premises — one claim measured

- **"A conflicted file has several index entries" (the reason for the Set).** Measured in a scratch
  repository with a real merge conflict: `git ls-files -z --cached --others --exclude-standard` printed
  `f.txt` three times (stages 1–3 in `ls-files -s`). Without the Set, one NUL in a conflicted file was
  reported three times. Holds.
- "check-lang already enumerates this way" — read at `scripts/check-lang.mjs:234`. Holds.
- The other mentions of "tracked" left in the header (a newly tracked icon fires; a format not listed
  fires on its first tracked file) stay true: tracked files are still scanned.

## ② Runnability — no finding

- A listed path that cannot be read (deleted from the worktree, or a symlink to a directory) falls into
  the existing `catch { continue }`. Escape surface: self-harm (that path is skipped).
- CI checks out a clean tree, so it has no untracked files; the gate behaves there exactly as before.
- Untracked, non-ignored files are now read; a large untracked data dir costs read time locally.
  Ignored directories (`node_modules`, `out`) stay out.

## ③ Security — no finding

## ④ Consistency — class-level check done, no other instance

"A gate enumerating files from the git index alone cannot see a new file": enumerated how every script
under `scripts/` finds files. Only `check-raw-nul.mjs` used the index alone; `check-lang.mjs` already
adds `--others --exclude-standard`; `check-i18n.mjs` and `check-shared-ui.mjs` walk directories on
disk; lint and tsc read the filesystem. Smell baseline: no hit.

## Refactor list

None.
