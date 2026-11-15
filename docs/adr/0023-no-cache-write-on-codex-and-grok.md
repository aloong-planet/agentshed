# ADR-0023: Cache creation is not collected on the Codex and Grok sides

- Status: Accepted (2026-08-18)

## Context

Codex and Grok records carry a cache-write field that has never held a non-zero value, though the writes do happen,
while their cached reads sit inside reported input and each side's own reported total is input + output. Whether
written tokens, once reported, would sit inside input as cached reads do or beside it cannot be observed from this data.
A cache-write term in the total makes ours disagree with the total each side publishes about itself, and silently,
since nothing compares the two.

## Options

1. **Do not collect it: read the field as zero on both sides and leave it out of the total, so the total reproduces
   the figure each side reports for itself**
2. Keep the term, total = input + output + cache write, and document the hazard — rejected: if written tokens sit
   inside input, it double-counts the day the field carries a value, and a latent double-count no test can reach is
   not mitigated by a note.
3. Leave the term out of the total but keep parsing the field — rejected: once the field went non-zero, the four fields
   would no longer sum to the total, breaking the invariant the composition view rests on and showing a figure that
   belongs to no total.
4. Also subtract it from input, so that a non-zero field would be handled as a subset — rejected: it encodes a guess
   about a shape never observed, and if written tokens sit beside input it under-counts, the harder direction to notice.

## Decision

We adopt **option 1**. On the Codex and Grok sides the cache-write field is not read, it is recorded as zero, and the
total is `input + output`: the `total_tokens` / `totalTokens` each side publishes about itself, the only figure on these
sides that can be checked against the source. Zero states that the side does not report writes, rather than asserting a
quantity.

## Consequences

- Positive: each side's total equals the total it reports for itself, which raw data can verify.
- Positive: the four fields sum to the total on every side, so a composition view can show input with cache writes,
  output and cache reads as three buckets comparable across sides.
- Negative: if either CLI starts reporting writes, the quantity is discarded, and the read-to-write ratio, the one
  signal that tells a healthy cache from one rebuilt every turn, stays a Claude-only figure.
- Negative: if written tokens turn out to sit beside reported input, this reading under-counts by exactly the discarded
  quantity. Restart condition: the first side to emit a non-zero value makes the question testable, and it is tested
  then.
- Neutral: while the field stays zero, as it was in every record scanned (Sources), this total and one with the
  cache-write term are the same figure, so the choice shows in no figure until a side reports writes.

## Sources

A full-population scan of this machine on 2026-08-18: `~/.codex/sessions`, 414 files and 50791 usage records, and
`~/.grok/sessions`, 41 files and 380 records. The cache-write field was present in 50632 Codex records (only in files
written from 2026-07-21 on) and in all 380 Grok records, and zero in every one; cached ≤ input in every record; total =
input + output in 50379 of 50791 Codex records (the rest have an all-zero breakdown) and in 380 of 380 Grok records. The
models then in use (`gpt-5.6-sol`, `gpt-5.6-terra`) are of the generation OpenAI bills cache writes for at 1.25×, and
Grok's cached-read hit rate was 96.2%, reachable only by writing the cache first. OpenAI's prompt-caching
documentation: cache writes billed at 1.25× from the GPT-5.6 generation on, `cached_tokens` reported as a detail of
input rather than beside it.
