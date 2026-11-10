# ADR-0041: An e2e case goes in its feature's file, and a shared helper in `e2e/support/`

- Status: Accepted (2026-11-05)

## Context

ADR-0038 says what e2e admits but not which file a case goes in. At commit `8998938` one spec file held 8,373 lines
and 109 case definitions, and the other specs showed what follows when a case simply goes elsewhere:
`global-search.spec.ts` had reached 1,330 lines, the update feature sat in three files, and seven files each had
their own `launch`. Of the largest file's 38 helper functions, 25 were used by cases of two or more features, with
nowhere to import them from.

## Options

1. **One file per feature, placed by the spec that holds the rule, with no limit on size**
2. Ban new cases from the largest file and say nothing else — rejected: with no named home, cases spread and helpers
   get copied, which the files above already show.
3. A line cap and a CI line budget — rejected by the owner as too strict. The figures proposed (800 lines for an e2e
   file, 500 for other test files, 100 for a new e2e case) came from this repository's distribution, not from a
   standard.
4. Split by theme into about ten files, unrelated to the feature documents — rejected: the themes would be one
   author's reading of today's cases, and the next case would have no rule to follow.
5. One file for cases that move between pages — rejected: 76 of the 109 case definitions click the rail and 13 click
   the back control, so it would collect most of the suite again, while by their titles only about 11 have the move
   itself as the rule under test. Each such rule checked is already in a feature's spec.

## Decision

We choose **option 1**.

**A case** goes in `e2e/<slug>.spec.ts`, where `<slug>` names the document in `docs/features/` whose rule the case
asserts. The spec that holds the rule decides:

- Moving between pages only to reach what is asserted does not count: the case goes with the feature asserted on.
- When the move is the rule, the case goes with the spec that states it, wherever the move starts.
- When two specs each state a part, each part's assertions go with their own spec.
- A case asserting several features' rules goes with its main assertion when it is moved. Moving does not split it.
- When no spec states the rule, the spec is written first.

> **Amended (2026-11-10)**: the feature catalogue was merged into the specs and `docs/features/` removed, so
> `<slug>` names the document in `docs/specs/`. Every document the catalogue held has a spec of the same name, so
> no e2e file changes its name.

A case about how the application starts, refreshes or keeps its cache, rather than what a feature shows, goes in
`e2e/lifecycle.spec.ts`. A test of the e2e harness itself is not a feature's and stays beside what it tests.

**A helper** that cases of two or more features use lives in `e2e/support/`, and one that a single feature uses stays
in that feature's file. A helper needed in a second file moves there and is not copied.

**A file** is split only where part of it is a sub-topic that stands alone, as `e2e/<slug>-<sub-topic>.spec.ts`. Size
alone is no reason, and there is no limit on it.

## Consequences

- Positive: a case has one home, and the number of files follows the number of features. A simulated split at commit
  `cfa6e82` gives 16: 14 features with e2e cases, the lifecycle file and the harness's own test.
- Positive: a new spec imports the helpers it needs instead of copying them.
- Negative: nothing enforces this. No test or gate checks where a case went, so it holds through this rule and review.
- Negative: a file can grow without limit. The same simulation has at least five files above 1,000 lines, the largest
  about 1,500.
- Negative: placing a case can take reading it. 85 of the 109 case definitions cite no spec identifier and 6 cite two
  or more, so no search can decide it, and two authors can reasonably differ.
- Neutral: this decision moves no case by itself. Until the launchers are one, a feature can sit in several files,
  since each has its own `launch` and fixtures and folding them would change code.

## Sources

ADR-0038 and the [test-layers spec](../specs/test-layers.md). A count of the tree at commits `8998938` and `cfa6e82`,
with cases assigned to features by title; the assignment is a heuristic. Rules checked in the specs: project-detail
T9, session-view P2 and P8, skills-view E10, global-search's sequence J, agents-overview::REQ-007 and
projects-list::REQ-002. The owner's rulings of 2026-11-05.
