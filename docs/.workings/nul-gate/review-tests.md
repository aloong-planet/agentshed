# Review — tests (step 6), #201: the NUL gate reads new files (2026-10-08)

Cases added to `scripts/check-raw-nul.test.mjs`, which runs the gate's CLI in a real temporary
repository: "rejects a NUL in a new file that is not staged yet" and "does not scan a git-ignored
file, such as build output". The `check()` helper gained an optional list of files to stage (default:
all, so the six existing cases are unchanged) and creates parent directories.

## Dimension 1 — coverage: one gap, recorded

- Issue acceptance 1 (an untracked NUL fails and is named) and 2 (an ignored NUL is not scanned) each
  have a case, and were also probed on the real repository (untracked `src/__nul_probe.ts` → exit 1
  naming it; the same probe under the ignored `out/` → exit 0; probes removed). Acceptance 3 (the real
  repository passes) is the existing `pnpm check:nul` gate.
- Gap: the de-duplication of a conflicted file's index entries has no case. It changes whether one
  file is reported once or three times, never whether the gate passes; building a merge conflict in a
  test buys little. Measured once by hand instead (see review-code ①).

## Dimension 2 — case design: no finding

Real `git` and the real script; no mocks. Each case states its inputs in full.

## Dimension 3 — false greens: no finding

- The untracked case was red first for the reason it guards: the old enumeration printed "none in 1
  tracked file(s)".
- The ignored case was green before the fix (nothing untracked was read then), so being green proved
  nothing; it was checked by mutation instead — dropping `--exclude-standard` turns it red. Restored
  from a backup copy and compared byte for byte.
