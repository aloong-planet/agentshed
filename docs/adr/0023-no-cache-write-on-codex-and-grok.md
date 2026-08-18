# ADR-0023: Cache creation is not collected on the Codex and Grok sides

- Status: Accepted (2026-08-18). Supersedes in part the Codex cache-write clause of ADR-0005 and the
  matching clause of ADR-0006; both remain valid in every other respect.

## Context

ADR-0005 gave the two non-Claude sides the formula `total = input + output + cacheWrite`, reasoning
by analogy with the Claude side, where cache creation is a genuine fourth bucket. That term has never
been exercised: a full scan of this machine's data (50791 Codex usage records, 380 Grok records)
found the cache-write field present but **never non-zero** — on Codex it only appears in files
written from 2026-07-21 onward, and reads zero in all of them.

Zero does not mean the writes did not happen. The models in use (`gpt-5.6-sol`, `gpt-5.6-terra`)
belong to the generation OpenAI charges 1.25× for cache writes, and Grok's cached-read hit rate is
96.2%, which is only reachable by writing the cache first. The agent CLIs simply do not record the
quantity.

What the same scan *did* establish, over the whole population rather than a sample:

- cached reads are a **subset** of reported input on both sides (Codex 50791/50791, Grok 380/380);
- each side's own reported total equals input + output, with no cache-write term (Codex 50379/50791,
  the remainder being records with an all-zero breakdown; Grok 380/380).

Two readings survive those measurements. If the written tokens sit inside reported input the way
cached reads do, keeping `+ cacheWrite` double-counts them the day the field starts carrying a value.
If instead they sit beside it, then each side's own total under-reports and ours would be the more
complete figure. **Which one holds is not observable from this data** — there is no non-zero record
to test either reading against, and this ADR does not claim to know.

What *is* settled is that keeping the term makes our total disagree with the total each side
publishes about itself, and that the disagreement would appear silently: nothing in the pipeline
compares the two.

## Options

1. **Do not collect it**: parse the field as zero on both sides and drop the term from the total, so
   the total reproduces the figure each side reports for itself
2. Drop the term from the total but keep parsing the field — rejected: the four fields would then no
   longer sum to the total once the field went non-zero, breaking the invariant the composition view
   depends on, and leaving a displayed figure that belongs to no total
3. Subtract it from input as well, so a non-zero field would be handled "correctly" — rejected: it
   encodes a guess about a shape never observed. If the field turns out to be additive rather than a
   subset, this reading is wrong in the harder-to-notice direction (an under-count), and there is no
   data with which to test either reading
4. Leave the code as it is and document the hazard — rejected: a latent double-count that no test can
   reach is not meaningfully mitigated by a note

## Decision

We choose **option 1**. On the Codex and Grok sides the cache-write field is not read, the recorded
value is zero, and the total is `input + output`.

Zero is the honest reading here: it says "this side does not report writes", which is what the data
shows, rather than asserting a quantity. The resulting total is not an estimate — it reproduces the
`total_tokens` / `totalTokens` each side publishes about itself, which is the only figure on these
sides that can be checked against the source.

The field's slot in the per-file aggregate cache is **kept** (written as zero) rather than removed.
Removing it would change the cache structure and therefore force a `CACHE_VERSION` bump; ADR-0019
records that an old cache entry read as a new shape is the 2026-07-30 production crash. Keeping the
slot makes this change invisible to the cache.

## Consequences

- Positive: the latent double-count is gone, and the two sides' totals now equal the totals those
  sides report for themselves — a claim that can be verified against raw data rather than argued from
  analogy
- Positive: the four fields still sum to the total on every side, so a composition view can present
  "uncached input / output / cache read" as three cross-side comparable buckets
- Negative: if either CLI starts reporting writes, the quantity is discarded rather than shown, and
  the read/write ratio — the only signal distinguishing a healthy cache from one rebuilt every turn —
  remains available on the Claude side alone
- Negative, and the reason this decision is worth revisiting rather than settling: **if the written
  tokens turn out to sit beside reported input rather than inside it**, this reading under-counts by
  exactly the discarded quantity. The restart condition is therefore concrete — the first side that
  emits a non-zero value makes the question testable, and it should be tested then rather than
  assumed either way
- Neutral: no user-visible change on current data, since the field is zero throughout; the Grok
  fixture that asserted the old formula is rewritten to assert the new one

## Sources

Full-population scan of this machine 2026-08-18: `~/.codex/sessions` 414 files / 50791 usage records,
`~/.grok/sessions` 41 files / 380 records — cache-write field present (Codex 50632, Grok 380) and
zero in every one; `cached ≤ input` in every record; `total == input + output` in 50379/50791 and
380/380. OpenAI's prompt-caching documentation (cache writes billed at 1.25× from the GPT-5.6
generation onward, `cached_tokens` reported as a detail of input rather than beside it).
