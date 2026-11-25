# Download count

> Related: [ADR-0055](../adr/0055-download-count.md) (what the count counts) ·
> [ADR-0056](../adr/0056-download-count-collected-by-a-cloudflare-worker.md) (the Worker that collects it) ·
> [mac-distribution](mac-distribution.md) (the releases, the release bucket and the download host,
> mac-distribution::REQ-004)

## Problem Statement

The landing page shows how many times Agentshed has been downloaded, yet no single place holds that figure: GitHub
counts the downloads of its release assets, while the download host serves disk images that GitHub never sees. The
two have to be added up, kept current, and never lose a download once it has been counted.

## Solution

A collection that runs on a schedule adds the disk image's downloads from GitHub and from the download host into a
statistics file in the release bucket, which the download host serves for the landing page to read. A Cloudflare
Worker runs it, proven against the Download count workflow before it takes the statistics file over.

## Functional Requirements

### download-count::REQ-011 The download count

- download-count::REQ-011/AC-02: The count is the sum, over every published release, formal or pre-release,
  of its disk image's downloads: on GitHub, the download count GitHub reports for the DMG asset; on the
  download host, the bytes the DMG was served in successful `GET` requests from visitors (status 200 or 206)
  divided by the DMG's size. Drafts, the update ZIPs, their blockmaps, the update metadata, the latest
  pointer and the statistics file count for nothing. A download is an event: nothing is de-duplicated
  between the two sources or between visitors.
- download-count::REQ-011/AC-03: The count never goes down. A DMG asset deleted from GitHub keeps the last
  count read for it, and a DMG removed from the bucket keeps the bytes it was served.
- download-count::REQ-011/AC-04: The count is brought up to date every hour and published as the statistics
  file `stats/downloads.json` on the download host. Each update counts the download host's traffic up to the
  last full hour that ended at least 30 minutes before the update started.

  > Pending: the Worker writes `stats/downloads.json` (Implementation Decisions "The shadow period").

## Constraints

### download-count::CON-004 What the collection may cost (direct acceptance)

Applies to: the collection and every Cloudflare resource it uses (Implementation Decisions "The collection"). It
runs within Cloudflare's Workers Free plan and triggers no paid plan. The R2 operations that it and the shadow period's
comparisons add cost at most about $0.03 a month at R2's listed prices, and only when the account is already beyond
R2's free tier.

## Failure modes and boundaries

**The download count**

- G1 A statistics file that exists in the bucket but cannot be read, is not JSON, has a `schemaVersion`
  other than 1 or does not match the statistics file's fields (Implementation Decisions) → the run fails
  and writes nothing. The count starts over only when the bucket holds no such object.
- G2 A run in which any read fails or answers what the run cannot validate (GitHub's releases, GitHub
  refusing a read without a token for its rate limit included; the bucket's listing; the analytics or their
  limits) → it writes nothing and the cursor stays where it was; the next run counts the hours this one missed.
- G3 A cursor older than the oldest full hour the analytics still hold, after the collection stopped or its
  runs kept failing → every run fails, until the gap is accepted: a run whose cursor equals the Worker's
  `ACCEPT_GAP_FROM` setting resumes from the oldest full hour the analytics hold and records the skipped hours
  in `r2Gaps`, and a run whose cursor differs from the setting ignores it. Those hours are never counted.
- G4 No DMG mirrored yet, while only pre-releases exist → the download host's share is zero and the run
  succeeds.
- G5 A mirrored DMG whose size in the bucket differs from the size the statistics file recorded for it →
  the run fails.
- G6 The project's own downloads count like anyone's: the release workflow reads each mirrored DMG back
  once per formal release ([mac-distribution::REQ-003](mac-distribution.md)), and that read counts as one
  download.
- G8 The collection stops for any reason, the Worker no longer running included → the statistics file's
  `updatedAt` stops moving. The watchdog, which holds no secret, fails its run, and so GitHub notifies, when the
  file read through the download host answers other than 200, is not JSON, has a `schemaVersion` other than 1, or
  has an `updatedAt` more than 6 hours before the watchdog's clock or more than 5 minutes after it; the failed run
  shows the run record's newest 24 entries.

  > Pending: the Download count workflow is the watchdog.
- G9 A run record or comparison record that cannot be read, or that is not one (Implementation Decisions) →
  the statistics file is counted and written as in any other run; nothing is appended to that record, which is
  left as it is, and the run reports it. A run whose run-record entry was not appended counts as missing.
- G10 Two runs overlapping → a run writes its file only if it is still the object the run read, and creates it
  only if there is none; the run that finds it changed fails (Failure G2), so an older read never replaces a
  newer count.

**Content brought in from outside**

- E4 The run record's entries, whose failures quote what GitHub, Cloudflare or the bucket answered, are external
  data in the watchdog's log (Failure G8): each is printed as one line of JSON, so no text in it is read as a
  workflow command.

  > Pending: the Download count workflow is the watchdog.

## Implementation Decisions

- **The collection** is a Cloudflare Worker that a Cron Trigger runs every hour, running the modules of the
  agentshed commit that aloong-planet/infra pins, each checked against its pinned SHA-256 (ADR-0056). A DMG is an
  asset or object named `Agentshed-<version>-mac-<arch>.dmg`, the packaged name, with `<version>` an `x.y.z`
  version, optionally with a pre-release suffix, and `<arch>` one of `arm64`, `x64` and `universal`. A run
  reads the previous statistics file from the bucket itself, through the Worker's binding to it, never through
  the download host's cache; GitHub's releases, every page, drafts skipped, without a token and with a
  User-Agent; the bucket's listing under `releases/`, every page of it; and Cloudflare's
  `httpRequestsAdaptiveGroups` for the zone, filtered to the download host as `clientRequestHTTPHost`, to the
  method and statuses download-count::REQ-011/AC-02 counts, to `clientRequestPath` under `/releases/` and to
  `requestSource` `eyeball`, summing `edgeResponseBytes` by `clientRequestPath`. It first reads the dataset's
  `notOlderThan`, `maxDuration` and `maxPageSize` from the analytics' `settings`, queries from the cursor to the hour
  download-count::REQ-011/AC-04 counts to, in ranges no wider than `maxDuration`, each asking for `maxPageSize`
  rows, and on a first run starts at the oldest full hour `notOlderThan` allows. A range answered with a full
  page fails the run, and so does an analytics answer that carries `errors`, even with HTTP 200, or that is
  not for exactly one zone. It writes the new file (Failures G2, G10) as `application/json` with
  `public, max-age=300`. A run without its credentials fails.
- **The statistics file** is JSON with these fields. The collection keeps publishing every one of them, with the
  type and meaning the table gives it.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1`; another value: Failure G1 |
| `updatedAt` | string, ISO 8601 UTC | When the run that wrote the file read its sources |
| `r2Cursor` | string, ISO 8601 UTC, on the hour | The download host's traffic before this hour is counted, and none after it |
| `r2Gaps` | array of `{ from, to }`, each ISO 8601 UTC on the hour | The ranges accepted as never counted (Failure G3); empty when there are none |
| `summary.total` | number | `summary.sources.github` plus `summary.sources.r2`, unrounded |
| `summary.sources.github` | number | The sum of `downloads` over `github.assets` |
| `summary.sources.r2` | number | The sum of `bytes` divided by `size` over `r2.objects`, unrounded |
| `github.assets` | object keyed by GitHub's asset ID | `{ name, downloads }`: the DMG's file name and the highest count read for it |
| `r2.objects` | object keyed by the object's key in the bucket | `{ name, size, bytes }`: the DMG's file name, its size in bytes and the bytes it was served in counted requests |

- **The run record** is `stats/worker-runs.json` in the bucket, written by the Worker alone after every run,
  as `application/json` with `public, max-age=300`. Another `schemaVersion`, or any other shape: Failure G9.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1` |
| `seed` | `{ at, r2Cursor, r2Bytes }` or null | The statistics file the shadow file started from ("The shadow period"): when it was read, its `r2Cursor`, and the sum of `bytes` over its `r2.objects`; null when the shadow file started over |
| `runs` | array, oldest first | The newest 336 runs; appending one more drops the oldest |
| `runs[].scheduledTime` | string, ISO 8601 UTC | The Cron Trigger's scheduled time for the run |
| `runs[].coreSha256` | string, 64 lowercase hex digits | The pinned SHA-256 of the core module the run used |
| `runs[].key` | string | The file the run writes, `stats/downloads.json` or `stats/downloads-shadow.json` |
| `runs[].written` | boolean | Whether the run wrote that file |
| `runs[].github` | `ok`, `rate-limited`, `failed` or `not-read` | GitHub's read. `rate-limited`: GitHub answered 403 or 429 with `x-ratelimit-remaining` `0`, or with a message naming a secondary rate limit; `failed`: any other failed read or answer the run cannot validate; `not-read`: the run failed before any of these reads started. A run refused for a cursor the analytics no longer hold (Failure G3) fails none of them |
| `runs[].analytics` | `ok`, `failed` or `not-read` | The analytics' settings and traffic reads, as for `github` |
| `runs[].bucket` | `ok`, `failed` or `not-read` | The previous file, the listing, the seed's write ("The shadow period") and the file's write, as for `github` |
| `runs[].failure` | string or null | What failed the run, never a credential; null when it wrote its file |
| `runs[].r2Cursor` | string, ISO 8601 UTC, on the hour, or null | The cursor of the file the run wrote; null when it wrote nothing |

- **The shadow period** lasts until the switch below. The Worker writes `stats/downloads-shadow.json`, a
  statistics file in every respect but its key (Failures G1 to G5, G10 apply to it), and the Download count
  workflow keeps collecting into the statistics file, one run at a time, on GitHub's schedule and when run by
  hand, accepting a gap only in a manual run asked to. While the shadow file is absent, the Worker takes the
  statistics file as the previous file, starting over only when that is absent too (Failure G1), and records it
  as the run record's `seed`. It writes the seed into the run record before it writes the shadow file. A run that
  cannot write the seed fails and writes no shadow file, and the next run seeds again; so does a run whose run record
  cannot be read or is not one, an exception to Failure G9.

  After each run in which it wrote the statistics file, the workflow compares it with the shadow file and appends
  the comparison to `stats/shadow-comparisons.json`, which it alone writes, with the run record's content type and
  cache control. A comparison never fails the run. A shadow file or run record that cannot be read, or is not one
  (Failure G1 for the shadow file, Failure G9 for the run record), leaves the run with no comparison: nothing is
  appended, and the run reports it. One the bucket does not hold is taken as null.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | `1` |
| `comparisons` | array, oldest first | Every comparison of the shadow period |
| `comparisons[].at` | string, ISO 8601 UTC | When the workflow compared |
| `comparisons[].workflowRunId` | number | The workflow run that compared |
| `comparisons[].workflowCommit` | string, 40 lowercase hex digits | The commit that run used |
| `comparisons[].workflowCoreSha256` | string, 64 lowercase hex digits | The SHA-256 of the core module at that commit |
| `comparisons[].workerScheduledTime` | string, ISO 8601 UTC, or null | The newest run record entry that wrote the shadow file |
| `comparisons[].workerCoreSha256` | string, 64 lowercase hex digits, or null | That entry's `coreSha256` |
| `comparisons[].r2Cursor` | `{ statistics, shadow }`, each ISO 8601 UTC or null | Each file's `r2Cursor` |
| `comparisons[].status` | `cursors-differ`, `equal` or `not-equal` | `cursors-differ` when the two cursors differ, in which case nothing else is compared; otherwise `equal` when every check holds and `not-equal` when one fails |
| `comparisons[].checks` | `{ r2Bytes, githubAssets, core }`, each boolean, or null | `r2Bytes`: every key of either file's `r2.objects` has the same bytes in the other, a key one file lacks counting as 0, and the same size where both have it; `githubAssets`: every asset of the file with the earlier `updatedAt` is in the other with at least its downloads, each way when the two `updatedAt` are the same instant; `core`: the two core hashes are equal. Null for `cursors-differ` |
| `comparisons[].r2BytesSinceSeed` | number or null | The sum of `bytes` over the statistics file's `r2.objects` minus the seed's `r2Bytes`; null when the run record holds no seed, or the bucket holds no run record |

  The Worker takes the statistics file over only when, over a window of at least 7 consecutive UTC days and at
  least 168 scheduled hours, all five hold:

  1. scheduled hours with no run record entry are at most 5% of the scheduled hours;
  2. entries whose `github` is `ok` are at least 95% of the scheduled hours;
  3. every comparison other than `cursors-differ` is `equal`, at least one such comparison is made on every UTC day of
     the window, and at least one such comparison has an `r2BytesSinceSeed` above 0;
  4. download-count::CON-004 holds;
  5. the workflow's scheduled runs started on every UTC day of the window.

  The switch deletes the shadow file and the run record's `seed`, leaves the comparison record as it is, written no
  more, and makes the workflow the watchdog (Failure G8).
