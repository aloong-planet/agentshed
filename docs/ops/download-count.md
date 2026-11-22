# Download count · this project's runbook

This runbook holds **Agentshed's own values and steps** for the landing page's download count. What the count is and
how a run must behave: `docs/specs/landing-page.md` (REQ-011, Failures G1–G7, Implementation Decisions "The
collection" and "The statistics file"). Decision: ADR-0055. The bucket and its download host: `docs/ops/r2-setup.md`.

## What exists, and where it is managed

| What | Value |
|---|---|
| Workflow | `.github/workflows/download-count.yml`, "Download count": every hour at minute 47, and by hand; one run at a time, a new one waiting for the one in progress |
| Script | `scripts/download-count.mjs`, reaching the bucket through aws-cli (`scripts/lib/r2-bucket.mjs`, shared with the release mirror) |
| Statistics file | `stats/downloads.json` in the release bucket, served at `https://dl.agentshed.aloongplanet.com/stats/downloads.json` (r2-setup.md, "Layout") |
| Analytics token | `agentshed-download-count`: an account API token with the zone permission group "Analytics Read" on `aloongplanet.com`, and nothing else. Managed with Terraform in [`aloong-planet/infra`](https://github.com/aloong-planet/infra), stack `apps` (`stacks/apps/download-counts.tf`) |
| Repository secrets | `CF_ANALYTICS_API_TOKEN` (that token's value) and `CF_ZONE_ID` (the zone's ID), written by the same stack; the bucket's four `R2_*` secrets, written for the release mirror (r2-setup.md) |
| GitHub | The workflow's own token, with `contents: read`, for the releases' download counts |

## What a run does

1. It fails at once when any of the six secrets is missing.
2. It reads the previous statistics file from the bucket itself, never through the download host's cache. When the
   bucket holds no such object, the count starts over. A file that is there but cannot be read, or is not one the
   run can take, fails the run (Failure G1).
3. It reads GitHub's releases, every page, and the bucket's listing under `releases/`.
4. It reads the analytics' limits: how far back a query may reach (`notOlderThan`), the widest range a query may span
   (`maxDuration`) and the page size. Then it reads the download host's traffic from the file's cursor, in ranges
   no wider than `maxDuration`, to the last full hour that ended at least 30 minutes before the run started. A run
   on time, at minute 47, counts to the last full hour; one that GitHub delays into the next hour, or one started by
   hand in the first half of an hour, stops an hour sooner, and the next run counts that hour. A first run starts at
   the oldest full hour the analytics hold.
5. Only after every read has succeeded does it write the new file. A run that fails writes nothing, and the cursor
   stays where it was. The next run counts the hours the failed one missed (Failure G2).
6. It logs one line: the total, GitHub's share, the download host's share, and the hour counted to. No credential is
   ever logged.

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
- **"the statistics file …"**: the file in the bucket is not one the run can take (Failure G1). Do not delete it
  to start over: the counts it holds, those of deleted GitHub assets and removed objects included, cannot be read
  back from anywhere else. Only this workflow writes it, so find which run wrote it and why.
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

## The schedule stops after 60 days without activity

GitHub disables a public repository's scheduled workflows after 60 days in which the repository had no activity.
When the count stops moving:

1. Re-enable the workflow (`gh workflow enable download-count.yml -R aloong-planet/agentshed`).
2. If its cursor has aged past what the analytics hold, start a run that accepts the gap, as above.
