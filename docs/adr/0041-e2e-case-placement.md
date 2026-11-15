# ADR-0041: An e2e case goes in its feature's file, placed by the spec that holds the rule, and a shared helper in `e2e/support/`; no limit on file size

- Status: Accepted (2026-11-05)

## Context

ADR-0038 says what e2e admits but not which file a case goes in. Without a rule, cases collect in one file, and a
case placed elsewhere brings its own copy of the helpers it needs.

## Options

1. **One file per feature, placed by the spec that holds the rule, with no limit on size**
2. Ban new cases from the largest file and say nothing else — rejected: with no named home, cases spread and helpers
   get copied.
3. A line cap and a CI line budget (800 lines for an e2e file, 500 for other test files, 100 for a new e2e case) —
   rejected by the owner as too strict; the figures came from this repository's distribution, not from a standard.
4. Split by theme into about ten files, unrelated to the feature documents — rejected: the themes would be one
   author's reading of today's cases, and the next case would have no rule to follow.
5. One file for cases that move between pages — rejected: most cases click the rail or the back control, so it would
   collect most of the suite again, while few have the move itself as the rule under test, each in a feature's spec.

## Decision

We adopt **option 1**.

**A case** goes in `e2e/<slug>.spec.ts`, where `<slug>` names the document in `docs/specs/` whose rule the case
asserts. The spec that holds the rule decides:

- Moving between pages only to reach what is asserted does not count: the case goes with the feature asserted on.
- When the move is the rule, the case goes with the spec that states it, wherever the move starts.
- When two specs each state a part, each part's assertions go with their own spec.
- A case asserting several features' rules goes with its main assertion when it is moved; moving does not split it.
- When no spec states the rule, the spec is written first.

A case about how the application starts, refreshes or keeps its cache, rather than what a feature shows, goes in
`e2e/lifecycle.spec.ts`. A test of the e2e harness itself is not a feature's and stays beside what it tests.

**A helper** that cases of two or more features use lives in `e2e/support/`, and one that a single feature uses stays
in that feature's file. A helper needed in a second file moves there and is not copied.

**A file** is split only where part of it is a sub-topic that stands alone, as `e2e/<slug>-<sub-topic>.spec.ts`.
Size alone is no reason, and there is no limit on it.

## Consequences

- Positive: a case has one home, and the number of files follows the number of features.
- Positive: a new spec imports the helpers it needs instead of copying them.
- Negative: nothing enforces this; no test or gate checks where a case went, so it holds through this rule and
  review.
- Negative: a file can grow without limit.
- Negative: placing a case can take reading it, since most cases cite no spec identifier; no search can decide it,
  and two authors can reasonably differ.
- Neutral: this decision moves no case by itself.

## Sources

ADR-0038 and the [test-layers spec](../specs/test-layers.md). A count of the tree at commit `8998938`: one spec file
held 8,373 lines and 109 case definitions, of which 76 click the rail, 13 click the back control, about 11 have the
move as the rule by their titles, 85 cite no spec identifier and 6 cite two or more; 25 of that file's 38 helpers
were used by cases of two or more features. A simulated split at commit `cfa6e82` gives 16 files, at least five above
1,000 lines and the largest about 1,500. Cases were assigned to features by title, a heuristic. The owner's rulings
of 2026-11-05.
