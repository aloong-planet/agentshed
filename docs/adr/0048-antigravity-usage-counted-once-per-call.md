# ADR-0048: Antigravity CLI usage: each call counted once across its conversation databases, a four-field total, model names as recorded

- Status: Accepted (2026-10-28)

## Context

Antigravity CLI (ADR-0037) records a usage entry per model call in each conversation's database, failed attempts and
background calls included. Every call is stored three times in one database, a fork copies the whole database, a
rewind deletes usage, agy's input excludes cache reads, and its model names are not normalised (a model id can carry a
routing suffix, and the display name adds an effort level). Each of these admits more than one way to count the side's tokens.

## Options

1. **Usage from the conversation databases, each call counted once across every database; a total of input, output,
   cache reads and cache writes; the model name as agy records it** — chosen.
2. Usage from `transcript_full.jsonl` — rejected: it is append-only and simpler to parse, but carries no model name and
   no call id, and the per-model breakdown needs the billed model.
3. agy's own `total_tokens` (input + output) as the total — rejected: agy's input excludes cache reads, so cache reads
   would fall outside the total and the composition bar's buckets could not sum to it (token-stats G8).
4. Normalised model names, a routing suffix stripped or the display name used without its effort level — rejected:
   the suffix rule rests on one observed sample, and the display name is a different naming form from every other
   side's model ids.

## Decision

We adopt **option 1**. The side's usage is read from its conversation databases, and each model call counts once
across all of them by its call id (token-stats::REQ-003), a failed attempt that carries token counts and an id of its
own included; a call without a timestamp is an undated row. The total is input + output + cache reads + cache writes,
so cache writes are a figure the Antigravity CLI side reports, as the Claude Code side does. The model is
`response_model` as agy records it, without normalisation.

## Consequences

- Positive: individual users' usage of Google's models is counted from a source that records background calls, failed
  retries and a server-side id per call, and the total keeps one meaning across the four sides.
- Positive: forks, the triple record and subagents cannot double-count, because identity is per call across every
  database rather than per file.
- Negative: a rewind deletes usage from the database, so today's figure falls with it, and a past day is kept only by
  the archive's retention (ADR-0026), that is only if a scan saw it first.
- Negative: the Antigravity total reads higher than agy's own by the cache reads, and by the cache writes of a call
  that reports any; model names may carry unexplained routing suffixes such as `-n`.
- Neutral: a usage row carries its side as a value (ADR-0020), so the side changes neither the archive format nor its
  version.

## Sources

`~/research/antigravity-cli-internals/local-data-and-usage.md` §4 (the usage record, its token semantics, the model
field and the call ids) and §10 (real sessions on this machine on 2026-10-28, reconciled call by call against agy's
headless output); token-stats G8; ADR-0026. On the data measured to 2026-10-29 no call reported a cache write, so the
difference from agy's own total was exactly the cache reads; a Claude model run through agy reports them. The owner's
rulings of 2026-10-28.
