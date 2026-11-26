# ADR-0058: The download count's Worker and core live in aloong-planet-home, which infra deploys them from at a pinned commit, and this repository keeps no copy

- Status: Accepted (2026-11-26)

## Context

The owner decided that the download count's collection code, the Worker's main module and the core it runs, leaves
this repository. Infra deploys the Worker from modules fetched at the commit it pins, each checked against its pinned
SHA-256 (ADR-0056), so their home must be a public repository whose required check runs the Worker's tests. The
watchdog this repository keeps reads the statistics file with two of the core's names, the statistics file's key and
the run record's, and with its test of a UTC time.

## Options

1. **aloong-planet-home, in a workspace package of its own, `workers/download-count/`, whose tests its required CI
   gate runs; the watchdog holding its own copies of the two keys and of the test of a UTC time** — chosen.
2. Keeping the code in this repository — rejected: the owner decided on 2026-11-25 that it leaves (not recorded).
3. A new repository of its own — rejected: it needs the owner to create a public repository and its required check,
   and a scaffold of its own, for nothing option 1 lacks but a history and a CI of its own.
4. aloong-planet/infra itself, deploying from its own files — rejected: it would replace the deploy from modules
   fetched at a pinned commit and checked against their hashes, and infra runs no Node. It would make a change to the
   Worker one pull request rather than two.
5. The watchdog fetching the core from the home at a pinned commit and hash — rejected: an hourly fetch of code is one
   more way for the watchdog to fail, and its pin would move with every change to the core, while a copy that drifts
   from the core fails the watchdog's runs rather than passing them.
6. The watchdog moving to the home as well — rejected: once it holds its own copies it needs nothing from the home, and
   moving it would move a workflow and the tests that guard it here for no gain.

## Decision

We adopt **option 1**. The Worker's main module and the core live in aloong-planet-home, and aloong-planet/infra
deploys them from the home commit it pins, each checked against its pinned SHA-256; this repository keeps no copy of
either. The watchdog holds its own copies of the statistics file's and the run record's keys and of the core's test of
a UTC time, and fetches nothing from the home.

## Consequences

- Positive: nothing in this repository writes the count, and the Worker's code sits in the repository of the one page
  that reads its statistics file, Agentshed's landing page.
- Negative: a change to either key or to the form of the time the files write needs the watchdog's copies changed in
  this repository too, and until then the watchdog's runs fail.
- Negative: a push to the home's default branch deploys every site there, one that changes only the Worker included.
- Neutral: the core counts Agentshed's disk images alone, so Transfer's collection, planned as its own ticket, needs a
  change to the core or a core of its own, and the home can hold either.

## Sources

The owner's decision of 2026-11-25, in translation from Chinese, asked whether the Worker's code should leave this
repository: "Move it out; open a ticket" (#577). Their confirmation of this entry and of the change to ADR-0056,
2026-11-26: "Confirmed, continue."
aloong-planet-home on 2026-11-25: public; its default branch's ruleset requires the check `CI gate`; its Deploy
workflow deploys every site after CI succeeds on a push to its default branch; Agentshed's site reads
`stats/downloads.json` from `dl.agentshed.aloongplanet.com`, and Transfer's site reads Transfer's own file from
`dl.aloongplanet.com`. Infra fetches the modules from `raw.githubusercontent.com` without credentials, so their
repository must be public (aloong-planet/infra, `stacks/workers/download-count.tf`). Transfer's collector counts macOS
disk images and Windows installers and records each asset's operating system (aloong-planet/transfer at `57cd79e8`,
`build/collect-download-statistics.cjs`).
