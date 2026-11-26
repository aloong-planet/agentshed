# ADR-0056: A Cloudflare Worker on a Cron Trigger collects the download count every hour, deployed from infra, and a workflow that holds no secret watches it

- Status: Accepted (2026-11-26)

## Context

The download count has to be brought up to date every hour (download-count::REQ-011/AC-04), and GitHub's schedule does
not run this repository's workflow anywhere near that often. A credential Terraform cannot create is one the owner
makes and renews by hand, nothing may need a paid plan, and the R2 share cannot be recounted once the analytics no
longer hold its hours.

## Options

1. **A Worker with an hourly Cron Trigger runs the collection itself: GitHub's releases read with a read-only token
   (ADR-0057), the analytics with the existing analytics token, the bucket through an R2 binding; a stack in
   aloong-planet/infra deploys it from the repository ADR-0058 names, at the commit and module hashes it pins, with a
   Workers token another stack mints** — chosen.
2. Keep GitHub's schedule — rejected: it never ran this workflow, and Transfer's identical hourly cron runs 2 to 8 times
   a day, so "every hour" would not hold.
3. A Worker cron that only dispatches the workflow — rejected: it needs a GitHub credential that can write to this
   repository's Actions, where the Worker's own token only reads public repositories (ADR-0057).
4. A workflow that dispatches its own next run — rejected: a runner busy around the clock, Actions write on the job
   that holds the bucket's keys, and a chain that one failure ends with nothing to restart it.
5. Cloudflare Workflows or a Durable Object alarm instead of a Cron Trigger — rejected: their retries add nothing when
   the next run counts a failed hour, for more moving parts.
6. Deploying the Worker from the CI of the repository that holds its code — rejected: it puts an account-wide Workers
   write token in that repository's secrets, and what such a token can bind in the account is unverified.
7. Widening the Terraform token by hand — rejected: it needs the owner, while a minted token keeps the permission in
   infra's state.
8. The Worker writing the statistics file from its first run — rejected: a defect would write into the only copy of a
   count that cannot be recounted, where a shadow file compared with the workflow's file risks nothing.
9. Alerting through a Cloudflare monitor — rejected: it is created in the dashboard only, by the owner, and fails along
   with Cloudflare.
10. Taking the statistics file over only after 7 consecutive UTC days in which, among five conditions, GitHub
    read `ok` in 95% of the hours and every comparison with the workflow's file was equal — rejected (not recorded).

## Decision

We adopt **option 1**. The Worker writes the statistics file, and the Download count workflow, holding no secret, is
its watchdog (download-count Failure G8).

## Consequences

- Positive: the count is brought up to date every hour without GitHub's scheduler, and no scheduled job holds the
  bucket's write key; the key stays in Actions for the release workflow's mirror job.
- Positive: the collection needs no paid plan.
- Negative: the Worker's own failures show only in Cloudflare and in the run record, and the watchdog runs on GitHub's
  schedule, which GitHub disables after 60 days without activity in the repository.
- Negative: every change to the Worker's code needs a second pull request in infra to pin it, and infra's state holds
  an account-wide Workers token.
- Negative: the Worker took the count over after a shadow period of under two days and few comparisons, and nothing
  catches a wrong count it writes: the watchdog checks only that the file is brought up to date.
- Negative: the Worker adds R2 operations, charged only when the account is already beyond R2's free tier
  (download-count::CON-004).
- Neutral: GitHub's 60-day disabling can stop only the watchdog, not the count.

## Sources

Scheduled runs (2026-11-22): this workflow, none since it reached `main` that day; Transfer's
`download-statistics.yml` (`17 * * * *`), 2 to 8 a day since September and never 24. GitHub: "The `schedule` event
can be delayed during periods of high loads" and "some queued jobs may be dropped"
(<https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>). Workers Free: 5
Cron Triggers an account, 10 ms of CPU and 50 subrequests a Cron invocation, errors rather than charges past them
(<https://developers.cloudflare.com/workers/platform/limits/>, 2026-11-22). Terraform: the GitHub provider 6.13.0 has
no resource that creates a GitHub App or token; a provider block cannot use a resource attribute computed in its own
configuration (Terraform 1.16). R2's added operations, at most those of the shadow period: about 5,760 Class A and
3,600 Class B a month, at most about $0.03 at $4.50 and $0.36 a million, and only when the account is already beyond
R2's free tier (<https://developers.cloudflare.com/r2/pricing/>, 2026-11-22). The shadow period's comparisons:
`stats/shadow-comparisons.json`, written no more. The owner's decision of 2026-11-25, in translation from Chinese:
"Switch directly."
