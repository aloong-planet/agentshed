# Smoke went red three times: a silent lock exit, and the evidence destroyed three times over

## Symptom

Smoke went red intermittently inside `pnpm verify`, reporting "first scan did not complete within
READY_TIMEOUT (cache not updated)"; running `pnpm smoke` on its own never reproduced it. Three times
(2026-08-03 ×1, 08-04 ×2), across two tickets.

## Root cause (reproduced deterministically)

```
An existing instance (the user's own app / another pnpm dev) holds the real userData's single-instance lock
    ↓
The dev app smoke starts cannot get the lock → app.exit(0)          ← silent, zero errors in the log
    ↓
The startup gate's pgrep is satisfied by [that earlier instance]     ← false pass
    ↓
The readiness gate waits for a dead app to write the cache → timeout ← no timeout value is large enough
```

Reproduction: start a `pnpm dev` by hand first, then run smoke — every signature reproduces exactly
(startup gate passes, readiness times out, no errors in the log). Who held the lock on each of the
three historical occasions is no longer knowable (the evidence was not kept at the time), but the
mechanism is the only one that fits.

## Why it was misdiagnosed three times

1. **The evidence was destroyed by my own hand ×3**: `die()` does print the last 25 lines of the log,
   but all three times the caller filtered them out (`... | grep -E 'SMOKE_OK|Tests'`). The third time
   happened after knowing the first two had been lost the same way — **the lesson is not in "knowing"
   but in the fact that the first reflex on failure is still to filter for the lines I want**.
2. **Correlation taken for causation**: the first two failures both happened on the first verify
   after a `CACHE_VERSION` bump, so "bump → slow cold scan → timeout" followed naturally,
   `READY_TIMEOUT` went 60 → 180, and that causal story was written into a comment and merged to
   master. The third time it went red at 180 s anyway (30× the measured cold scan), falsifying the
   causal story — **and what falsified it was the very value that had been raised on the strength of
   the wrong diagnosis**, which counts as cheap luck.
3. **"A process exists" is a startup criterion of tautological magnitude**: `pgrep` cannot tell "the
   one I started" from "the one that was already there". The single-instance lock plus the silent
   exit cut the causal chain between the two gates, and each gate looked "normal" on its own.

## Fix (scripts/smoke.sh; the first version blocked in preflight, the final version was changed to **coexist** per the user's ruling)

- **userData isolation**: the dev app starts via `pnpm dev -- --user-data-dir=<temp dir>` (measured:
  electron-vite passes the argument through and Electron honours it). The lock is scoped by userData,
  so once isolated it **does not contend with the user's running instance** — the user no longer has
  to close their own app.
  Honest record of the cost: a fresh userData every time = a full scan every time (~6 s, versus ~1 s
  with a warm cache); what it buys is gate determinism and zero interference. The "migrating an old
  cache" scenario belonged to e2e anyway.
- **Process group isolation**: `set -m` puts background jobs in their own process group, and probing
  and killing go by pgid so they only ever touch our own tree — the previous pattern's `pkill` would
  have killed the user's instance in the coexistence scenario.
- **Detect process death during the readiness wait**: if electron exits partway, report "it started
  and then exited" immediately instead of waiting out the timeout.
- **Self-diagnose a broken redirect**: if the isolated cache is untouched while the real cache moves,
  the pass-through is broken (e.g. an electron-vite upgrade dropping it), and that gets its own error
  rather than a generic timeout.
- **`die()` preserves evidence**: on failure the whole log is copied to
  `/tmp/agentshed-smoke-fail-<timestamp>.log`, so it no longer depends on the caller not grepping.
- `READY_TIMEOUT` back to 60 (180 had been set on the strength of a falsified diagnosis; with no lock
  to contend for, anything that reaches the timeout is a real timeout).
- An existing instance only prints one informational line (filtered by `ps -o comm=`, because
  `pgrep -f` gets false positives from path strings in other processes' argv — measured: the
  background `pkill` process used for verification was itself caught by it).

All four failure branches plus the coexistence happy path were forced and verified: passing with no
instance, passing with an instance running and that instance's pid unchanged, the specific error on
mid-run death, and the specific error on a broken redirect.

## Lessons

- **When a gate fails, the first action is to save the output verbatim; analysis is the second
  action.** Filtering is a means of analysis, not a means of looking.
- The right way to rule out "slow" was this round's accidental gift: raise the timeout to 30× the
  measured magnitude, and if it is still red, "slow" is out.
- Silent exit paths (`app.exit(0)` and the like) are indistinguishable from "running normally" as far
  as a test script is concerned. For any gate relying on an indirect signal such as "a process exists"
  or "a file changed", ask: **does the signal belong to the process I started?**
