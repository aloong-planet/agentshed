# Download count · this project's runbook

This runbook holds **Agentshed's own values and steps** for the landing page's download count. What the count is and
how a run must behave: `docs/specs/download-count.md` (REQ-011, Failures G1–G6 and G8–G10, Implementation Decisions "The
collection", "The statistics file" and "The run record"). Decisions: ADR-0055, ADR-0056 for the Worker that collects it
and the workflow that watches it, and ADR-0057 for the token it reads GitHub with. The bucket and its download host:
`docs/ops/r2-setup.md`.

## What exists, and where it is managed

| What | Value |
|---|---|
| Worker | `agentshed-download-count`, run every hour at minute 31 by a Cron Trigger, deployed by aloong-planet/infra's `workers` stack ("The Worker" below) |
| Statistics file | `stats/downloads.json` in the release bucket, written by the Worker alone, served at `https://dl.agentshed.aloongplanet.com/stats/downloads.json` (r2-setup.md, "Layout") |
| Run record | `stats/worker-runs.json` in the release bucket: the Worker's newest 336 runs |
| Watchdog | `.github/workflows/download-count.yml`, "Download count": every hour at minute 47, and by hand. It runs `scripts/download-count-watchdog.mjs`, holds no secret and writes nothing |
| Analytics token | `agentshed-download-count`: an account API token with the zone permission group "Analytics Read" on `aloongplanet.com`, and nothing else. Managed with Terraform in [`aloong-planet/infra`](https://github.com/aloong-planet/infra), stack `apps` (`stacks/apps/download-counts.tf`), and bound to the Worker |
| GitHub token | The read-only token bound to the Worker as `RELEASES_READ_TOKEN` ("When the Worker cannot read GitHub with its token" below) |
| Left from the shadow period | `stats/shadow-comparisons.json`, the shadow period's comparisons with the workflow's count, written no more |

## What a Worker run does

1. It fails at once, reading and writing nothing, when `CORE_SHA256` is not a SHA-256 or `BUCKET` is not bound.
2. It reads the previous statistics file from the bucket through its binding, never through the download host's
   cache. When the bucket holds no such object, the count starts over. A file that is there but cannot be read, or
   is not one the run can take, fails the run (Failure G1).
3. It reads GitHub's releases, every page, with the read-only token, and the bucket's listing under `releases/`.
4. It reads the analytics' limits: how far back a query may reach (`notOlderThan`), the widest range a query may span
   (`maxDuration`) and the page size. Then it reads the download host's traffic from the file's cursor, in ranges
   no wider than `maxDuration`, to the last full hour that ended at least 30 minutes before the run started: a run
   at minute 31 counts to the last full hour.
5. Only after every read has succeeded does it write the new file, and only if the file is still the one it read
   (Failure G10). A run that fails writes nothing, and the cursor stays where it was. The next run counts the hours
   the failed one missed (Failure G2).
6. It appends its entry to the run record and logs one line: the total, GitHub's share, the download host's share,
   and the hour counted to. No credential is ever logged. A run that failed, or whose entry could not be appended,
   also fails the invocation, which then shows as an error, with that text, in the Worker's Cron Events in
   Cloudflare's dashboard.

An entry in the run record says which file the run wrote, whether it did, how each source fared (`github` is
`rate-limited` when GitHub refused the read for its rate limit), what failed the run, with both tokens removed, and
the cursor reached. A read GitHub or Cloudflare refused shows as the status they answered and, after a colon, the
reason they gave, if any. The oldest entries are earlier Workers', until they age out: the shadow period's, `key`
`stats/downloads-shadow.json`, then those of the first runs on the statistics file, which also say what became of the
shadow file (`shadowFile`: `deleted`, `absent` or `failed`). To read the newest entries:

```bash
curl -sS https://dl.agentshed.aloongplanet.com/stats/worker-runs.json | jq -c '.runs[-24:][]'
```

Both files are served with `Cache-Control: public, max-age=300`, so a browser may show a copy up to five minutes old;
Cloudflare's edge does not cache them (`cf-cache-status: DYNAMIC`).

## What the watchdog does

Each run reads `stats/downloads.json` through the download host, as the landing page does, and fails when the file
answers other than 200, is not JSON, has a `schemaVersion` other than 1 or no `updatedAt` that is a UTC time, or was
last updated more than 6 hours before the run's clock or more than 5 minutes after it (Failure G8). A failed run's
log opens with the error, then prints the run record's newest 24 entries, one line of JSON each, oldest first; when
the run record cannot be read, one line says why instead. GitHub notifies of the failed run. To run it by hand:

```bash
gh workflow run download-count.yml -R aloong-planet/agentshed
```

## When the watchdog fails

The error names what the file showed:

- **"… was last updated at …, more than 6 hours before …"**: the Worker has written no count for 6 hours. The entries
  the run printed say why: a `failure` that repeats (the next section), or no entries for the recent hours, when the
  Worker is not running: look at its Cron Events in Cloudflare's dashboard and at the last apply of infra's `workers`
  stack.
- **"… answered HTTP 404"**: the bucket no longer holds the file, or the download host does not serve it. Find out
  why before the Worker's next run: a Worker that finds no file starts the count over (Failure G1), and the counts the
  file held, those of deleted GitHub assets and removed objects included, cannot be read back from anywhere else.
- **"… answered HTTP 5xx"** or **"… could not be read: …"**: the download host did not answer. Run the watchdog again
  by hand later; look closer only when its runs keep failing.
- **"… is not JSON"**, **"… has schemaVersion …"** or **"… has updatedAt …, not a UTC time"**: the file is not one the
  Worker can take, so its runs fail too (Failure G1). Do not delete it to start over; find which run wrote it and why.
- **"… more than 5 minutes after …"**: the file's `updatedAt` is ahead of the runner's clock, so one of the two
  clocks is wrong. Run the watchdog again by hand.

## When a Worker run fails

The run record's `failure`, and the Worker's Cron Events, say why:

- **A read fails** (GitHub, the bucket, the analytics, or an answer the run cannot validate): the run fails and
  writes nothing. Nothing is lost: the next run counts from the same cursor. Look closer only when runs keep failing.
- **"stats/downloads.json in the bucket is not JSON"**, **"stats/downloads.json has …"** or **"stats/downloads.json
  does not have the statistics file's fields: …"**: the file in the bucket is not one the run can take (Failure G1).
  Do not delete it to start over: the counts it holds cannot be read back from anywhere else. Only the Worker writes
  it, so find which run wrote it and why.
- **"… is N bytes in the bucket, not the M recorded"**: a mirrored DMG was replaced at the same key (Failure G5).
  A version's DMG never changes, so find out what wrote it.
- **"stats/downloads.json changed in the bucket since the run read it"**: another writer replaced or created the
  file during the run (Failure G10). Only the Worker writes it, so find out what else did.
- **"the run's entry was not appended to stats/worker-runs.json: …"**: the run record cannot be read or is not one
  (Failure G9). The statistics file is still written, but no entry is added, so the watchdog's failed runs print
  none of the new ones until the record is repaired.
- **"… is older than …, the oldest full hour the analytics hold"**: the count stalled for longer than the analytics
  keep traffic, while the Worker stopped or its runs kept failing (Failure G3). See "A stalled Worker count" below.

## The Worker

| What | Value |
|---|---|
| Modules | `workers/download-count/scripts/download-count-worker.mjs` (the main module) and `download-count-core.mjs` beside it, in [`aloong-planet/aloong-planet-home`](https://github.com/aloong-planet/aloong-planet-home), as two ES modules under those names, from the aloong-planet-home commit aloong-planet/infra pins, each checked against its pinned SHA-256 before the deploy (ADR-0058); this repository holds no copy |
| Deployed by | aloong-planet/infra, stack `workers`, with a Workers token that the stack `apps` mints with Workers Scripts Write only; `workers.dev` is off, so the Worker answers no request |
| `BUCKET` | The R2 binding to the release bucket |
| `CF_ANALYTICS_API_TOKEN`, `CF_ZONE_ID` | The analytics token (a secret binding) and the `aloongplanet.com` zone |
| `DOWNLOAD_HOST`, `GITHUB_REPOSITORY` | `https://dl.agentshed.aloongplanet.com` and `aloong-planet/agentshed` |
| `CORE_SHA256` | The pinned SHA-256 of the core module, recorded in every run |
| `ACCEPT_GAP_FROM` | Bound only while a gap is to be accepted (below) |
| `RELEASES_READ_TOKEN` | The read-only GitHub token (a secret binding) the releases are read with, with the User-Agent `agentshed-download-count` |

**A change to the Worker** takes two pull requests, in this order: the aloong-planet-home one, which changes the
modules in `workers/download-count/scripts/`, merges first; then one in aloong-planet/infra pins its merge commit and
the two modules' SHA-256 (`shasum -a 256 workers/download-count/scripts/download-count-worker.mjs
workers/download-count/scripts/download-count-core.mjs` at that commit). A hash that does not match fails infra's
plan, and nothing is deployed. A change to either file's key, or to the form in which the files write their instants,
also takes a pull request here, because the watchdog holds its own copies of both (`scripts/download-count-watchdog.mjs`).

**After an apply**, check the run record's newest entries: one an hour, `key` `stats/downloads.json`, `written` true.
Whether the binding enforces the conditions every write carries (Failure G10), an etag or `If-None-Match: *`, is what
Cloudflare documents; it has not been observed.

**A stalled Worker count** (Failure G3): every run fails with "… is older than …, the oldest full hour the analytics
hold", naming the cursor. An infra pull request binds `ACCEPT_GAP_FROM` to that cursor; the next run accepts the gap
and records it in the statistics file's `r2Gaps`, and any run whose cursor differs ignores the setting. Those hours
are never counted. Then the next infra pull request removes the binding.

### When the Worker cannot read GitHub with its token

The Worker reads GitHub's releases with the token bound as `RELEASES_READ_TOKEN`, and never without it (ADR-0057). A
failure that quotes the token's value shows `[the GitHub token]` instead. The run record shows when it cannot read
GitHub with the token:

- **"RELEASES_READ_TOKEN is not set"**, with every source `not-read`: the binding is missing or empty, and every run
  fails. A Worker at a commit that reads the token fails this way until infra binds it, so the infra pull request that
  pins such a commit binds the token too.
- **"page 1 of GitHub's releases answered HTTP 401: Bad credentials"**, with `github` `failed`: GitHub does not take
  the token, which has expired or been revoked. Every run fails until it is replaced.
- **"page 1 of GitHub's releases answered HTTP 403: …"**, with `github` `failed`: GitHub refused the read for another
  reason than its rate limit; the text after the colon is GitHub's reason. A token whose lifetime aloong-planet's
  policy does not allow is refused this way, and every run fails until it is replaced.

To make, store, renew or replace the token: aloong-planet/infra's
[`docs/ops/releases-read-token.md`](https://github.com/aloong-planet/infra/blob/main/docs/ops/releases-read-token.md).

## The watchdog's schedule stops after 60 days without activity

GitHub disables a public repository's scheduled workflows after 60 days in which the repository had no activity. The
count goes on, since the Worker runs it, but nothing watches it. When the Download count workflow has not run for a
day, re-enable it:

```bash
gh workflow enable download-count.yml -R aloong-planet/agentshed
```
