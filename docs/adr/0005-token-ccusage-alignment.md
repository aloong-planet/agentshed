# ADR-0005: Token accounting aligned with ccusage: the whole tree, deduplicated entries, all four fields in the total

- Status: Accepted (2026-07-30)

## Context

The figures must reconcile against ccusage, the meter the user checks them with, which sums all four token fields.
Claude Code attaches usage to every assistant message, keeps the sessions of projects its registry no longer lists,
and has subagent transcripts replay their parent's messages under a new `requestId`, so a per-project line-by-line sum
both misses usage and counts some of it twice. What the totals cover must not move with what the interface happens to
show.

## Options

1. **Align with ccusage's Claude adapter: scan the whole `~/.claude/projects` tree, subagent transcripts included;
   deduplicate entries across files as ccusage does; total = input + output + cache creation + cache read; count
   every project; cut days in local time**
2. Total = input + output, with cache reads and writes listed beside it and left out, summed per registered project
   — rejected: it disagrees with the meter the user reconciles against, and the missed projects and the double-counted
   replays are factual errors.
3. Totals that cover only the projects the project list shows — rejected: what the list shows is browsing state, so a
   figure that is a fact would change with every change of view, and the cache would be invalidated with it.
4. Replicate every detail of ccusage (both XDG data roots, `CLAUDE_CONFIG_DIR`, rejecting null fields, splitting
   advisor iterations, the `-fast` suffix) — deferred: aligning the trunk meets the reconciliation need. Restart
   condition: the figures differ from ccusage's perceptibly.
5. Convert usage to a dollar cost — deferred: a price table needs manual upkeep, and the vendors' billing models
   (subscription or API, cache pricing) do not line up. Restart condition: a reliable source of prices.

## Decision

We adopt **option 1**, in the rules of the token-stats spec, Sequence A.

- The Claude side counts every session file under `~/.claude/projects`, whatever the registry lists; stale projects
  count, and no filter of the project list changes a total.
- Subagent usage counts toward the statistics; a subagent session does not enter the session list.
- Entries are deduplicated across files in the aggregation layer, keyed on the message and request ids, a sidechain
  replay yielding to the original; so the incremental cache holds entries, never a deduplicated result.
- The total sums all four fields; an entry with the `<synthetic>` model or none counts toward the total but enters no
  model bucket.
- Days are cut in local time.

## Consequences

- Positive: the figures reconcile against ccusage, a subagent's replayed messages count once, and the usage of
  projects the registry does not list counts.
- Positive: the totals do not drift with browsing state, so the global and per-project views reconcile against one
  source.
- Negative: the incremental cache grows, since it holds entries rather than per-file sums.
- Negative: the sides' totals are not alike: where reported input already includes cached reads, a four-field sum
  would count them twice, so those sides take another rule (ADR-0023).
- Neutral: the model breakdown can add up to less than the total, by the tokens of entries with the `<synthetic>` model
  or none, which count in the total and in no model's figure.

## Sources

Source-level research of ccusage on 2026-07-30 at `main@a71d92eb2fc9`: `rust/adapters/claude/src/lib.rs`
(`push_deduped_entry`, `should_replace_deduped_entry`), `paths.rs` (the whole-tree enumeration) and
`ccusage-core/types.rs` (`TokenCounts::total`), including the comment that subagent transcripts replay their parent's
messages. Measurement against this machine's data on 2026-07-30: the shape of the usage fields and the subagents
directory. The user's ruling of 2026-07-30 to count everything.
