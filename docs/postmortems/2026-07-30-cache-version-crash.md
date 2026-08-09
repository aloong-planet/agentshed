# A cache structure change without a version bump crashed startup (2026-07-30)

## Symptom

After the packaged build started, `agentshed:get-snapshot` threw
`TypeError: Cannot read properties of undefined (reading 'length')` (inside `combine`), the snapshot
could not be returned, and the UI stayed in its scanning state. The same code ran fine in dev on the
development machine.

## Root cause

The token cache stores `FileAgg` **structs**. The Codex side's agg had changed from
`{ totals, byDay }` to `{ events }` that same day (to implement fork replay stripping), but
`CACHE_VERSION` was still 2 — so the old cache was judged a hit and used directly as the new
structure, `a.events` was undefined, and `.length` crashed.

## Why no test caught it

All three layers missed it:

1. **Unit tests** use a temporary `cacheDir` and therefore always start from an empty cache → they
   only cover "cold start" and "same-structure idempotence", never constructing "old-structure cache
   + new code".
2. **The dev smoke run** runs against the real `userData`, and the development machine's cache had
   already been rewritten by the new code during the change → it happened to be the new structure, so
   nothing reproduced. **A smoke script's dependence on environment state is its inherent blind spot.**
3. **There were no e2e tests**: an exception in a main-process IPC handler only appears on the main
   process's stderr, and neither the unit tests nor the smoke run asserted on that channel.

## Defences put in place

- The `CACHE_VERSION` constant now says next to it that "changing the shape of `FileAgg` requires
  bumping this at the same time", and `loadCache` compares against the constant.
- Beyond the version, an `isWellFormedAgg` shape check was added: a corrupt or drifted entry within
  one version is treated as a miss and recomputed, so a missing field never flows into the
  aggregation layer.
- Two unit tests added: an old-structure cache does not crash and is recomputed into the new
  structure; a cache full of garbage triggers a full recompute.
- **e2e added** (Playwright driving a real Electron with its own `userData`, so a cache can be
  seeded): one case specifically seeds an old-structure cache at startup and asserts that the main
  process's stderr has no `Error occurred in handler` / `UnhandledPromiseRejection` / `TypeError`.
- The smoke script was consolidated into `scripts/smoke.sh` with error detection added, and its
  header notes "depends on environment state; migration-style scenarios belong to e2e".
- The verification gate was consolidated into `pnpm verify` = typecheck + unit tests + e2e + smoke.

## Lesson

When what is persisted is a **structure** rather than a scalar, the structure definition and the
version number are two halves of the same change; changing only one half plants a time bomb. And "it
works on my machine" is precisely the characteristic symptom of this class of bug — because the local
state has already been washed through by one's own new code.
