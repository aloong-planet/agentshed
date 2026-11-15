# ADR-0011: The question index rides on the token metering cache (one cache, two readings)

- Status: Accepted (2026-08-06)

## Context

Session viewing needs a per-file question offset index (the byte ranges of question lines and turns, timestamps,
volume counts, content fingerprints), and it has to be produced in the same pass as the scan: scanning every
session file a second time would throw away the cost advantage of riding along with the token statistics (Sources).
Token statistics already keep a per-file incremental cache keyed by each file's signature, the token store
(ADR-0044). Where does the index go: the same cache, or a separate one?

## Options

1. **Ride along inside each file's entry in the token cache** — chosen: one cache, one signature, one scan pass;
   display and metering share the same invalidation judgement.
2. A separate index cache — rejected: two caches with two signatures drift (the same file invalidates at different
   moments on each side), the scan has to write in two places, and a rebuild has to be judged twice; all of which
   buys only the isolation of "a display-side change does not invalidate the metering cache".
3. No cache, scanning on demand when the session page opens — rejected: the session list needs every session's
   question count for every project, so scanning on demand means reading every session file again at every visit
   to the detail page.

## Decision

We adopt **option 1**. The index is stored in each file's per-file aggregate, alongside the metering data, and
contains no question text (session-view D2a: only offsets and a 4-byte fingerprint). A change to the index's shape
or to how it is computed is a change to the per-file aggregate, so it bumps the cache structure version
(token-stats, Implementation Decisions, Cache version bumps and Codex usage sources).

## Consequences

- Positive: two readings from one scan pass, with a single point of signature invalidation; the session page's
  single-file rebuild reuses the same cache entry directly.
- Negative: the display and metering cache lifecycles are welded together: a purely display-side change bumps the
  cache structure version, so every session file is parsed again wherever a store of the old version is open
  (token-stats C1).
- Negative: the two readings' fields share one structure, so reading the code requires keeping in mind that
  "metering deduplicates, display strips" and that neither one's conclusions transfer to the other.
- Negative: a change to how a stored field is computed has nothing automated to notice a missed version bump.

## Sources

Measured on this machine on 2026-08-03, as session-view ticket 03a was implemented, over 1,823 files and 287.8 MB: the
index added 207 KB (4.3%) to the cache; a scan that found every file in the cache took 99 ms, and a full cold scan,
which a version bump brings, 2,916 ms. When the entry was written, on 2026-08-06, scanning every session file again
meant about 2,000 files and 700 MB. All of this was before the token store (ADR-0044) and the engine module (ADR-0045).
