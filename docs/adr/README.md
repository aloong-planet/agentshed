# ADR index

ADR conventions for this repository:

- **What is written here**: a decision that is hard to reverse, baffling without context, and the product of a real
  trade-off, all three, when it is one of this project's architectural decisions, the trade-off behind a product
  behaviour or a way of computing a figure, or this project's choice on a process question (the choice and its reason,
  not the rules of the practice chosen). A rule for whoever changes the code goes in the invariants of `AGENTS.md`, a
  product behaviour or a computation in its spec, an incident in a postmortem, and how code implements a decision in
  that code's comments.
- **Five sections, all mandatory**: Context (the problem and the constraints on it, at most 3 sentences); Options (the
  chosen one first, then each rejected or deferred one with its reason, at most 2 sentences each, and an option whose
  comparison was never recorded marked "not recorded"); Decision (the rule in force); Consequences (the positive,
  negative and neutral ones still true, at most 2 sentences each); Sources (pointers to the evidence, and the key
  figures with their premises).
- **Never in an entry**: how a rule came about; how it was verified or landed; one-off costs already paid; how code
  implements it, or interface detail; how a measurement was taken; line numbers or lists of positions; a restatement
  of another ADR, a spec or a skill (point to it instead); options about how to record the decision.
- **Length**: at most 5,000 characters, the title and the status line excluded. An entry over it first moves out what
  is never in an entry, and one still over is split by decision.
- **Status**: Proposed (the direction is set, the evidence is not yet in) or Accepted (with the date the decision in
  force was confirmed by the owner).
- **Edited in place**: an entry states only the decision in force, and a decision that changes edits its entry rather
  than opening a new one. A change to what an entry chose, rejected or accepts as a consequence is confirmed by the
  owner before it is written: the abandoned approach becomes a rejected option with its reason, and the date moves to
  that confirmation. A rewrite that changes no decision (compressing, merging entries, correcting a stale fact) is
  listed in the pull request that makes it. A new decision edits every entry whose Decision it makes untrue or
  incomplete, and opens a new entry only where there is none.
- **Retired numbers**: an entry merged into another, or withdrawn, gives up its number in the same change: its file
  is deleted, every reference in the repository moves to the entry it joined (or is removed, for a withdrawn one), and
  the number is listed under Retired numbers below. Numbers are never reused.

## General

| # | Decision | Status |
|---|---|---|
| [0001](0001-ipc-contract-single-source.md) | The IPC contract has one type source in `src/shared/`, is validated on both sides, and carries structured signals only | Accepted |
| [0017](0017-repo-working-language-english.md) | The repository's working language is English, for its files and for the text beside them, checked at commit and in the pull request | Accepted |
| [0038](0038-test-layers.md) | Test layers: the data layer, the contract, e2e for what only the assembled app can show, and component tests for the rendering branches nothing else checks | Accepted |
| [0041](0041-e2e-case-placement.md) | An e2e case goes in its feature's file, placed by the spec that holds the rule, and a shared helper in `e2e/support/`; no limit on file size | Accepted |
| [0042](0042-packaged-build-refuses-launch-inputs.md) | A packaged build refuses every launch input outside an allow-list, and the packaging proves it | Accepted |

## Projects and sides

| # | Decision | Status |
|---|---|---|
| [0019](0019-grok-as-third-agent-side.md) | Onboarding Grok as the third agent side | Accepted |
| [0021](0021-side-colour-follows-provider.md) | One colour per agent side, taken from that side's provider colour | Accepted |
| [0022](0022-remove-manual-hiding.md) | Manual project hiding is removed | Accepted |
| [0037](0037-antigravity-cli-as-fourth-agent-side.md) | Onboarding Antigravity CLI as the fourth agent side | Accepted |
| [0051](0051-project-documents-are-not-listed-or-read.md) | A project's documents are neither listed nor read, and the read path they shared is memory files' alone | Accepted |

## Components

| # | Decision | Status |
|---|---|---|
| [0004](0004-skill-install-by-copy.md) | Skills install by a dereferencing copy; symlinks rejected | Accepted |
| [0010](0010-plugin-skills-in-effective-view.md) | An enabled plugin's skills join the effective view under a namespace, and every plugin skill can be read, enabled or not | Accepted |
| [0049](0049-antigravity-components-and-shared-skills-directory.md) | Antigravity CLI's components are shown where agy was seen to load them, `.agents/skills` is shared with Codex, and Instructions shows CLAUDE.md and AGENTS.md | Accepted |

## Sessions and search

| # | Decision | Status |
|---|---|---|
| [0011](0011-question-index-in-token-cache.md) | The question index rides on the token metering cache (one cache, two readings) | Accepted |
| [0034](0034-global-search-question-corpus-in-memory.md) | Global search reads every project's question texts from main-process memory, warmed when its page opens | Accepted |
| [0036](0036-injected-text-stays-a-question.md) | Text the agent tools write into a session as the user stays a question | Accepted |
| [0052](0052-full-text-search-streams-in-the-engine-module.md) | A project's search runs in the engine module, off the main thread, reading the full text a line at a time and handing back only what it shows | Accepted |
| [0054](0054-turns-read-and-assembled-in-the-engine-module.md) | The engine module reads each turn the session page expands and assembles its blocks | Accepted |

## Usage and the archive

| # | Decision | Status |
|---|---|---|
| [0005](0005-token-ccusage-alignment.md) | Token accounting aligned with ccusage: the whole tree, deduplicated entries, all four fields in the total | Accepted |
| [0006](0006-codex-usage-accounting.md) | Codex usage accounting: two data roots, per-turn increments by day, fork replay stripping | Accepted |
| [0007](0007-usage-archive.md) | Usage history archive | Accepted |
| [0008](0008-trend-by-provider.md) | Trend bars are segmented by provider, the model vendor inferred from the model name | Accepted |
| [0009](0009-trend-xaxis-data-days.md) | The trend x axis labels data days only, with the month shown where it is new | Accepted |
| [0020](0020-day-usage-keyed-by-side.md) | Daily usage is keyed by agent side, not by a field per side | Accepted |
| [0023](0023-no-cache-write-on-codex-and-grok.md) | Cache creation is not collected on the Codex and Grok sides | Accepted |
| [0024](0024-composition-colours-overlap-the-provider-palette.md) | The composition bar colours cache reads blue, uncached input yellow and output green, overlapping the provider palette | Accepted |
| [0025](0025-usage-rows-are-the-renderer-contract.md) | Usage rows are the one source every token figure derives from | Accepted |
| [0026](0026-archive-retention-by-accounting-stamp.md) | Archive retention by accounting stamp, liveness per (day, side) | Accepted |
| [0027](0027-codex-usage-records.md) | Codex usage comes from usage records; ccusage is the alignment basis only for rollouts without them | Accepted |
| [0039](0039-archive-file-failure-stops-no-scan.md) | An archive file that cannot be written or read stops no scan | Accepted |
| [0043](0043-scan-on-a-worker-thread.md) | A scan runs on one worker thread that owns the token cache; the main process only starts it and takes its result | Accepted |
| [0044](0044-token-cache-in-sqlite-by-deduplication-group.md) | The token cache lives in a SQLite store and is aggregated by de-duplication group; the display copy is written while the window has no focus | Accepted |
| [0045](0045-token-engine-as-a-rust-module.md) | The token engine, the session walk, the question-text rules and the display copy's writer are one Rust module that builds only the values a rule reads | Accepted |
| [0046](0046-engine-module-in-the-apps-own-threads.md) | The engine module is loaded through Node-API by the app's own threads, rather than written in Go or run as a separate process | Accepted |
| [0047](0047-no-fallback-engine.md) | No fallback engine: a module that will not load, or is another build, fails what needs it | Accepted |
| [0048](0048-antigravity-usage-counted-once-per-call.md) | Antigravity CLI usage: each call counted once across its conversation databases, a four-field total, model names as recorded | Accepted |

## Interface

| # | Decision | Status |
|---|---|---|
| [0013](0013-ui-language-set-and-i18n-scope.md) | The i18n scope is the app's copy, its menu and the README, every language left to right, with no RTL commitment | Accepted |
| [0014](0014-self-built-typed-i18n-layer.md) | A self-built typed i18n layer; general-purpose i18n frameworks rejected | Accepted |
| [0018](0018-icons-are-inline-svg-from-one-source.md) | Icons are inline SVG from one icon module, Lucide first and a library drawn the same way where Lucide lacks the meaning | Accepted |
| [0028](0028-tanstack-query-as-the-renderer-query-layer.md) | TanStack Query is the renderer's on-demand read layer | Accepted |
| [0033](0033-app-is-the-interface-baseline.md) | The app is the interface's baseline; the prototypes are kept by hand, never generated from the app or compared with it | Accepted |
| [0035](0035-ui-languages-chinese-and-english.md) | The UI languages are Simplified Chinese and English, and the READMEs follow them | Accepted |
| [0053](0053-display-copy-restores-read-pages.md) | A display copy kept apart from the accounting cache restores the pages read after a restart, keeping turns' content only within a size per turn and a total | Accepted |

## Updates

| # | Decision | Status |
|---|---|---|
| [0031](0031-macos-release-line.md) | A notarized macOS release line, built in CI and mirrored to R2 | Accepted |
| [0032](0032-app-updates.md) | App updates from GitHub Releases, offered rather than pushed — the app's one outbound request | Accepted |
| [0050](0050-landing-page-in-this-repository.md) | The landing page is in Chinese and English | Accepted |
| [0055](0055-download-count.md) | The download count is the disk image's downloads from GitHub and the download host, added up hour by hour in a statistics file that starts over only when absent | Accepted |
| [0056](0056-download-count-collected-by-a-cloudflare-worker.md) | A Cloudflare Worker on a Cron Trigger collects the download count every hour, deployed from infra, and a workflow that holds no secret watches it | Accepted |
| [0057](0057-download-count-reads-github-with-a-read-only-token.md) | The download count's Worker reads GitHub's releases with the owner's read-only token, and never without it | Accepted |
| [0058](0058-download-count-code-lives-in-aloong-planet-home.md) | The download count's Worker and core live in aloong-planet-home, which infra deploys them from at a pinned commit, and this repository keeps no copy | Accepted |

## Retired numbers

- 0002: merged into 0038
- 0003: merged into 0005
- 0012: merged into 0010
- 0015: merged into 0001
- 0016: merged into 0001
- 0029: merged into 0028
- 0030: merged into 0017
- 0040: merged into 0038
