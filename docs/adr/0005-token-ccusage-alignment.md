# ADR-0005: Token accounting aligned with ccusage (whole-tree scan + dedup + four-field rule)

- Status: Accepted (2026-07-30)

## Context

The first accounting rules (ADR-0003) summed per registered project, counted only input+output as
the total, and did no deduplication. They do not match the facts: (1) sessions in unregistered
projects, or projects cleared from the registry, were missed; (2) Claude subagent transcripts
**replay the parent's messages** under a new `requestId` (confirmed by a comment in the ccusage
source), so a line-by-line sum double-counts them; (3) the user reconciles against ccusage, and the
total rule disagreed with it (ccusage sums all four fields).

## Options

1. **Align with ccusage (verified at source level, the Rust implementation in the ccusage/ccusage
   repository)**: recursively scan the whole `~/.claude/projects` tree for Claude (independent of the
   registry); deduplicate at entry level — exact key `message.id + requestId`, falling back to
   message.id-only when either side is `isSidechain`, keeping the non-sidechain entry and otherwise
   the one with the larger four-field sum; total = input + output + cacheCreation + cacheRead;
   `<synthetic>` and missing-model entries count toward the total but not into a model bucket; days
   are cut in local time by default
2. Keep the ADR-0003 rules (cache listed separately and excluded, summed per registered project) —
   superseded by this ADR: it conflicts with the user's reconciliation baseline, and the missed and
   double counts are factual errors
3. Replicate every detail of ccusage (dual XDG roots, `CLAUDE_CONFIG_DIR`, rejecting null fields,
   advisor iteration splitting, the `-fast` suffix) — deferred: aligning the trunk already satisfies
   the reconciliation need, and the long tail can be added as required (restart condition: the
   numbers still differ from ccusage perceptibly)

## Decision

We choose **option 1**. The Codex side keeps its native rules: total = input + output + cacheWrite
(its input already includes cached, so cached is not added twice). The incremental cache now stores
**entry-level** data — deduplication has to happen across files, in the aggregation layer, so a
deduplicated result cannot be what is cached.

## Consequences

- Positive: reconcilable against ccusage; eliminates both subagent replay double-counting and the
  under-count from unregistered projects; with cache included, the totals are the same order of
  magnitude as the user's intuition (the ccusage report)
- Negative: the cache grows (entry-level); the two sides' `total` are not exactly isomorphic (Codex's
  cached is a subset of input, so a four-field sum is inherently impossible there)
- Neutral: ADR-0003 is marked superseded by this one; long-tail differences such as the second XDG
  data root go on the backlog

## Sources

Source-level research of ccusage (2026-07-30, `main@a71d92eb2fc9`:
`rust/adapters/claude/src/lib.rs` — `push_deduped_entry` / `should_replace_deduped_entry`;
`paths.rs` whole-tree enumeration; `ccusage-core/types.rs` `TokenCounts::total`); measurement against
the subagents directory on this machine.
