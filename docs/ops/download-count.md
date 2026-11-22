# Download count · this project's runbook

This runbook holds **Agentshed's own values and steps** for the landing page's download count. What the count is and
how a run must behave: `docs/specs/landing-page.md` (REQ-011, Failures G1–G10, Implementation Decisions "The
collection", "The statistics file", "The run record" and "The shadow period"). Decisions: ADR-0055, and ADR-0056 for
the Worker that takes the collection over. The bucket and its download host: `docs/ops/r2-setup.md`.

## What exists, and where it is managed

| What | Value |
|---|---|
| Workflow | `.github/workflows/download-count.yml`, "Download count": every hour at minute 47, and by hand; one run at a time, a new one waiting for the one in progress |
| Script | `scripts/download-count.mjs`, which runs the count's core (`scripts/download-count-core.mjs`) on the bucket through aws-cli (`scripts/lib/r2-bucket.mjs`, shared with the release mirror) |
| Statistics file | `stats/downloads.json` in the release bucket, served at `https://dl.agentshed.aloongplanet.com/stats/downloads.json` (r2-setup.md, "Layout") |
| Analytics token | `agentshed-download-count`: an account API token with the zone permission group "Analytics Read" on `aloongplanet.com`, and nothing else. Managed with Terraform in [`aloong-planet/infra`](https://github.com/aloong-planet/infra), stack `apps` (`stacks/apps/download-counts.tf`) |
| Repository secrets | `CF_ANALYTICS_API_TOKEN` (that token's value) and `CF_ZONE_ID` (the zone's ID), written by the same stack; the bucket's four `R2_*` secrets, written for the release mirror (r2-setup.md) |
| GitHub | The workflow's own token, with `contents: read`, for the releases' download counts |
| Worker | `agentshed-download-count`, run every hour by a Cron Trigger, once aloong-planet/infra's `workers` stack is applied; see "The Worker in the shadow period" below |
| Shadow period files | `stats/downloads-shadow.json` and `stats/worker-runs.json`, written by the Worker once it runs; `stats/shadow-comparisons.json`, written by the workflow (r2-setup.md, "Layout") |

## What a run does

1. It fails at once when any of the six secrets is missing.
2. It reads the previous statistics file from the bucket itself, never through the download host's cache. When the
   bucket holds no such object, the count starts over. A file that is there but cannot be read, or is not one the
   run can take, fails the run (Failure G1).
3. It reads GitHub's releases, every page, and the bucket's listing under `releases/`.
4. It reads the analytics' limits: how far back a query may reach (`notOlderThan`), the widest range a query may span
   (`maxDuration`) and the page size. Then it reads the download host's traffic from the file's cursor, in ranges
   no wider than `maxDuration`, to the last full hour that ended at least 30 minutes before the run started. A run
   on time, at minute 47, counts to the last full hour. A run that starts in the first half of an hour, delayed by
   GitHub or started by hand, stops an hour sooner, and the next run counts that hour. A first run starts at the
   oldest full hour the analytics hold.
5. Only after every read has succeeded does it write the new file. A run that fails writes nothing, and the cursor
   stays where it was. The next run counts the hours the failed one missed (Failure G2).
6. It logs one line: the total, GitHub's share, the download host's share, and the hour counted to. No credential is
   ever logged.
7. In the shadow period, it compares the file it wrote with the Worker's shadow file and appends the comparison to
   `stats/shadow-comparisons.json`, then logs the comparison's status. When the shadow file, the run record or the
   comparison record cannot be read or is not one, it appends nothing, leaves the record as it was, and logs one
   warning; the run still succeeds.

## The first runs

The secrets were written on 2026-11-22 (aloong-planet/infra#14, Terraform run 45007382234). The first run after this
workflow reaches `main` creates the statistics file, scheduled or started by hand
(`gh workflow run download-count.yml -R aloong-planet/agentshed`). The tests answer for GitHub, the bucket and
Cloudflare with stand-ins. These runs are the first to meet the real services: the analytics' answers and aws-cli's
listing output. Check:

- The run succeeded, and its log line names the hour it counted to, as step 4 sets it.
- The file is served:

  ```bash
  curl -sS https://dl.agentshed.aloongplanet.com/stats/downloads.json
  ```

  It has `"schemaVersion": 1`, `r2Gaps` empty, and GitHub's share equal to the DMG counts GitHub reports:

  ```bash
  gh api 'repos/aloong-planet/agentshed/releases?per_page=100' --paginate \
    --jq '.[] | select(.draft | not) | .assets[] | select(.name | test("^Agentshed-.*-mac-(arm64|x64|universal)\\.dmg$")) | .download_count' \
    | paste -sd+ - | bc
  ```

- The landing page shows the line below the download card, in both languages.

## When something fails

- **The credentials are missing**: the first step fails, naming the six secrets. Apply the `apps` stack in
  aloong-planet/infra.
- **A read fails** (GitHub, the bucket, the analytics, or an answer the run cannot validate): the run fails and
  writes nothing. Nothing is lost: the next run counts from the same cursor. Look closer only when runs keep failing.
- **"stats/downloads.json in the bucket is not JSON"** or **"stats/downloads.json has …"**: the file in the bucket is
  not one the run can take (Failure G1). Do not delete it to start over: the counts it holds, those of deleted GitHub
  assets and removed objects included, cannot be read back from anywhere else. Only this workflow writes it, so find
  which run wrote it and why.
- **"… is N bytes in the bucket, not the M recorded"**: a mirrored DMG was replaced at the same key (Failure G5).
  A version's DMG never changes, so find out what wrote it.
- **"… is older than …, the oldest full hour the analytics hold"**: the count stalled for longer than the
  analytics keep traffic, the workflow stopped or its runs kept failing (Failure G3). Every scheduled run fails
  until a manual run accepts the gap: Actions → Download count → Run workflow, with "accept_gap" checked, or

  ```bash
  gh workflow run download-count.yml -R aloong-planet/agentshed -f accept_gap=true
  ```

  That run resumes from the oldest full hour the analytics hold and records the skipped range in `r2Gaps`. Those
  hours are never counted. A scheduled run never accepts a gap.

## The Worker in the shadow period

What this section describes exists once aloong-planet/infra's `workers` stack is applied.

The Worker `agentshed-download-count` runs the same core on the same bucket every hour, at minute 31, so that its
cursor is the one a workflow run at minute 47 reaches. Until the switch (the spec's "The shadow period"), it writes
`stats/downloads-shadow.json` and never the statistics file: the key is a constant in its code, not a setting.

| What | Value |
|---|---|
| Modules | `scripts/download-count-worker.mjs` (the main module) and `scripts/download-count-core.mjs`, as two ES modules under those names, from the agentshed commit aloong-planet/infra pins, each checked against its pinned SHA-256 before the deploy |
| Deployed by | aloong-planet/infra, stack `workers`, with a Workers token that the stack `apps` mints with Workers Scripts Write only; `workers.dev` is off, so the Worker answers no request |
| `BUCKET` | The R2 binding to the release bucket |
| `CF_ANALYTICS_API_TOKEN`, `CF_ZONE_ID` | The analytics token (a secret binding) and the zone, as the workflow's |
| `DOWNLOAD_HOST`, `GITHUB_REPOSITORY` | `https://dl.agentshed.aloongplanet.com` and `aloong-planet/agentshed` |
| `CORE_SHA256` | The pinned SHA-256 of the core module, recorded in every run |
| `ACCEPT_GAP_FROM` | Bound only while a gap is to be accepted (below) |
| GitHub | No token: the releases are read without one, with the User-Agent `agentshed-download-count` |

**A change to the Worker** takes two pull requests, in this order: the agentshed one, which changes the modules,
merges first; then one in aloong-planet/infra pins its merge commit and the two modules' SHA-256 (`shasum -a 256
scripts/download-count-worker.mjs scripts/download-count-core.mjs` at that commit). A hash that does not match fails
infra's plan, and nothing is deployed.

**What each run leaves**: the shadow file, when the run succeeded, and one entry in `stats/worker-runs.json`, the
run record, which keeps the newest 336 runs. An entry says which file the run wrote, whether it did, how each source
fared (`github` is `rate-limited` when GitHub refused the read for its rate limit), what failed the run, with the
analytics token removed, and the cursor reached. A run that failed, or whose entry could not be appended, also fails
the invocation, which then shows as an error, with that text, in the Worker's Cron Events in Cloudflare's dashboard.

```bash
curl -sS https://dl.agentshed.aloongplanet.com/stats/worker-runs.json | jq -c '.runs[-24:][]'
curl -sS https://dl.agentshed.aloongplanet.com/stats/shadow-comparisons.json | jq -c '.comparisons[-7:][] | [.at, .status, .checks, .r2BytesSinceSeed]'
```

Note that the download host caches both files for five minutes.

**The first run** finds no shadow file, so it starts from the statistics file and records it as the run record's
`seed`, which it writes before the shadow file: a run that cannot write the seed writes no shadow file and fails with
"the seed was not written to stats/worker-runs.json: …", and the next run seeds again. The shadow file's first write
is conditioned on there being no shadow file yet, so it is the first to show that the binding accepts
`If-None-Match: *`. Whether the binding enforces that condition, and the etag condition every later write carries
(Failure G10), is what Cloudflare documents; it has not been observed. The run record's newest entries are what to
check after the deploy: one an hour, `written` true.

**Every UTC day until the switch**, start the workflow by hand at least once
(`gh workflow run download-count.yml -R aloong-planet/agentshed`), so that a comparison is made every day, which
GitHub's schedule does not promise.

**When no comparison other than `cursors-differ` has `r2BytesSinceSeed` above 0 by the fifth day** of the window, no
visitor has downloaded from the download host since the seed. Read 1 KB of the newest DMG through it, once, so that
both counts have bytes to agree on; it counts like any download (Failure G6):

```bash
curl -sS -r 0-1023 -o /dev/null -w '%{http_code}\n' https://dl.agentshed.aloongplanet.com/releases/v0.2.0/Agentshed-0.2.0-mac-arm64.dmg
```

It answers `206`.

**A stalled Worker count** (Failure G3): every run fails with "… is older than …, the oldest full hour the analytics
hold", naming the cursor. An infra pull request binds `ACCEPT_GAP_FROM` to that cursor; the next run accepts the gap
and records it in the shadow file's `r2Gaps`, and any run whose cursor differs ignores the setting. Then the next infra
pull request removes it.

## The schedule stops after 60 days without activity

GitHub disables a public repository's scheduled workflows after 60 days in which the repository had no activity.
When the count stops moving:

1. Re-enable the workflow (`gh workflow enable download-count.yml -R aloong-planet/agentshed`).
2. If its cursor has aged past what the analytics hold, start a run that accepts the gap, as above.
