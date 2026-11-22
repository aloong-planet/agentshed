# ADR-0055: The download count is the disk image's downloads from GitHub and the download host, added up hour by hour in a statistics file that starts over only when absent

- Status: Accepted (2026-11-22)

## Context

The landing page shows how many times Agentshed has been downloaded (landing-page::REQ-011). From the first formal
release its hero downloads the disk image from the download host, which GitHub's counts never see. Cloudflare keeps
the download host's traffic analytics for a limited time only.

## Options

1. **Disk images only, as GitHub's count of each DMG asset plus the download host's bytes served divided by each
   DMG's size, added every hour into a statistics file in the release bucket, which starts the count over only when
   that file is absent** — chosen.
2. Count the update ZIPs and the update metadata as well — rejected: those are downloads by people already counted
   once, and Transfer's landing page counts installers only, so the owner's two pages would mean different things by
   the figure.
3. GitHub's counts alone — rejected: the figure would miss every download the hero makes from the download host.
4. Count the download host's requests instead of bytes over size — rejected: a download fetched in ranges would count
   once per range.
5. Start the count over whenever the previous file cannot be read, as Transfer's collector does — rejected: one
   failed read would drop every hour the analytics no longer hold, and nothing can count those again.
6. Count nothing for hours the analytics no longer hold, and carry on — rejected: the figure would stop being a true
   count without anyone noticing; a gap is accepted only deliberately, and recorded.

## Decision

We adopt **option 1**. The download count counts disk images only, from both sources, and its statistics file starts
over only when it is absent. Where and how the hourly collection runs is ADR-0056.

## Consequences

- Positive: the figure grows with every installer download, wherever the page or a link sends the visitor.
- Positive: the count outlives the analytics' retention, since each hour is added to the file once and kept.
- Negative: hours left uncounted past the analytics' retention are lost for good, and runs fail until the gap is
  accepted.
- Neutral: downloads are counted as events, not people, and the project's own downloads count too.

## Sources

Transfer's download statistics: its `docs/ops/download-statistics.md` and its collector. Cloudflare's adaptive
datasets "retain at least 31 days of data on every plan", and each dataset's limits are read from the analytics'
`settings` (<https://developers.cloudflare.com/analytics/graphql-api/limits/>,
<https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/>, 2026-11-22). On 2026-11-22
every release was a pre-release, with 20 DMG downloads on GitHub.
