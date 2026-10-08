# ADR index

ADR conventions for this repository: MADR minimal, five sections (Context / Options / Decision /
Consequences / Sources), all mandatory. "Options" is mandatory so the elimination process is
preserved. Three states (Proposed | Accepted | Superseded); once accepted, an ADR is only appended
to, never rewritten — to reverse one, open a new entry. Only this project's architectural decisions
belong here (process conventions do not). An entry is written only when all three thresholds are met:
hard to reverse, baffling without context, and a real trade-off.

| # | Decision | Status |
|---|---|---|
| [0001](0001-ipc-contract-single-source.md) | Single type source for the IPC contract, with runtime validation on both sides | Accepted |
| [0002](0002-dual-seam-testing.md) | Dual-seam testing strategy (data-layer injection + IPC contract) | Accepted |
| [0003](0003-token-accounting.md) | Token accounting rules | Superseded by 0005 |
| [0004](0004-skill-install-by-copy.md) | Skills install by copy (symlinks rejected) | Accepted |
| [0005](0005-token-ccusage-alignment.md) | Token accounting aligned with ccusage (whole tree + dedup + four-field rule) | Accepted (cache-write clause superseded in part by 0023) |
| [0006](0006-codex-usage-accounting.md) | Codex usage accounting (two data roots + fork replay stripping) | Accepted (four-field clause superseded in part by 0023; usage-source clause by 0027) |
| [0007](0007-usage-archive.md) | Usage history archive (resilient to the agent's own cleanup) | Accepted (conflict rule superseded by 0026) |
| [0008](0008-trend-by-provider.md) | Trend bars segmented by provider | Accepted |
| [0009](0009-trend-xaxis-data-days.md) | Trend x axis labels data days only, with hierarchical date labels | Accepted |
| [0010](0010-plugin-skills-in-effective-view.md) | Plugin-bundled skills join the effective view (namespace-isolated, filtered by enablement) | Accepted |
| [0011](0011-question-index-in-token-cache.md) | The question index rides on the token metering cache (one cache, two readings) | Accepted |
| [0012](0012-plugin-skill-preview-decoupled-from-enablement.md) | Plugin skill preview decoupled from enablement; Codex does not join the effective view | Accepted |
| [0013](0013-ui-language-set-and-i18n-scope.md) | UI language set and i18n scope boundary (six languages, all LTR, no RTL commitment) | Accepted |
| [0014](0014-self-built-typed-i18n-layer.md) | Self-built typed i18n layer (general-purpose i18n frameworks rejected) | Accepted |
| [0015](0015-structured-ipc-errors.md) | Failures cross IPC as an error code plus parameters; wording is left to the renderer | Accepted |
| [0016](0016-no-natural-language-across-ipc.md) | The main process emits no user-facing natural language (not just failure text) | Accepted |
| [0017](0017-repo-working-language-english.md) | Repository working language is English (comments, docs, test names, terminal output) | Accepted (scope extended by 0030) |
| [0018](0018-icons-are-inline-svg-from-one-source.md) | Icons are inline SVG from a single source; the prototypes derive theirs from it | Accepted |
| [0019](0019-grok-as-third-agent-side.md) | Onboarding Grok as the third agent side (registry, compatibility rule, no cost, session identity) | Accepted |
| [0020](0020-day-usage-keyed-by-side.md) | Daily usage is keyed by agent side, not by a field per side | Accepted |
| [0021](0021-side-colour-follows-provider.md) | One colour per agent side, taken from that side's provider colour | Accepted |
| [0022](0022-remove-manual-hiding.md) | Manual project hiding is removed | Accepted |
| [0023](0023-no-cache-write-on-codex-and-grok.md) | Cache creation is not collected on the Codex and Grok sides | Accepted |
| [0024](0024-composition-colours-overlap-the-provider-palette.md) | The composition bar uses blue / yellow / green, overlapping the provider palette | Accepted |
| [0025](0025-usage-rows-are-the-renderer-contract.md) | Usage rows are the one source every token figure derives from | Accepted |
| [0026](0026-archive-retention-by-accounting-stamp.md) | Archive retention by accounting stamp, liveness per (day, side) | Accepted |
| [0027](0027-codex-usage-records.md) | Codex usage from usage records; ccusage no longer the basis for rollouts carrying them | Accepted |
| [0028](0028-tanstack-query-as-the-renderer-query-layer.md) | TanStack Query is the renderer's on-demand read layer; page switches run as Transitions | Accepted |
| [0029](0029-startup-display-persistence.md) | Separate startup display persistence, including previously viewed pages | Accepted |
| [0030](0030-message-language.md) | Commit messages and pull-request text follow the working language (hook + PR workflow; skipped when Chinese) | Accepted |
