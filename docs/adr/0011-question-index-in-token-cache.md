# ADR-0011: The question index rides on the token metering cache (one cache, two readings)

- Status: Accepted (2026-08-06, retroactively recording the decision already made while implementing
  ticket session-view/03a on 2026-08-03)

## Context

Session viewing needs a per-file question offset index (the byte ranges of question lines and turns,
timestamps, volume counts, content fingerprints), and it has to be produced in the same pass as the
scan — scanning the whole library a second time (~2000 files / 700 MB on this machine) would throw
away the cost advantage of riding along with the token statistics. Token statistics already have a
per-file incremental cache keyed by a (path, mtime, size) signature (`token-cache.json`). Where does
the index go: the same cache, or a separate cache file?

## Options

1. **Ride along inside the token cache's `FileAgg` (chosen)**: one cache, one signature, one scan
   pass; display and metering share the same invalidation judgement.
2. A separate index cache file — rejected: two caches with two signatures drift (the same file
   invalidates at different moments on each side), the scan has to write in two places, and a rebuild
   has to be judged twice; all of which buys only the isolation of "a display-side change does not
   invalidate the metering cache".
3. No cache — scan on demand when the session page opens — rejected: the session list needs
   `questionCount` for every project, so scanning on demand means re-reading every session file on
   every visit to the detail page.

## Decision

We choose **option 1**. The index is stored as `FileAgg` fields (`questions` / `forkPoints` /
`titleFromThread` and so on) alongside the metering data, and **contains no question text**
(spec session-view D2a: only offsets and a 4-byte fingerprint).

**The costs and coupled rules** (what choosing this commits us to):

- Any change to the display side's shape or algorithm must bump `CACHE_VERSION`, which
  **invalidates the whole metering cache** and triggers a full rescan (measured: ~100 ms warm,
  ~3 s cold). All four bumps from v7 to v10 were of this kind.
- The cache grows by 207 KB / 4.3% (measured over 1823 files); the cold scan actually improved from
  3537 ms to 2916 ms (line reading switched from `readline` to splitting a Buffer on `0x0A`, and the
  decoding overhead saved outweighs the added per-line classification).
- Corruption or drift within one version is guarded by `isWellFormedAgg` (adding a required field
  means adding its check at the same time); shape changes are caught by a field-set fingerprint test
  that forces the author to think about the version number; algorithm changes have no automated
  defence and rely on the process question (see the spec's Implementation Decisions).

## Consequences

- Good: two readings from one scan pass, with a single point of signature invalidation; the session
  page's single-file rebuild (`sessionQuestions`) reuses the same cache entry directly.
- Bad: the display and metering cache lifecycles are welded together — a purely display-side
  iteration forces a full metering recomputation; and the two readings' fields share one structure,
  so reading the code requires keeping in mind that "metering deduplicates, display strips" and that
  neither one's conclusions transfer to the other (emphasised repeatedly in spec B2/R2).
