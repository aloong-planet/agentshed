# ADR-0056: A Cloudflare Worker on a Cron Trigger collects the download count every hour, deployed from infra and proven against the workflow before it takes over

- Status: Proposed

## Context

The download count has to be brought up to date every hour (landing-page::REQ-011/AC-04), and GitHub's schedule does
not run this repository's workflow anywhere near that often. New credentials may only come from Terraform, nothing
may need a paid plan, and the R2 share cannot be recounted once the analytics no longer hold its hours.

## Options

1. **A Worker with an hourly Cron Trigger runs the collection itself: GitHub's public releases read without a token,
   the analytics with the existing analytics token, the bucket through an R2 binding; a stack in aloong-planet/infra
   deploys it from the agentshed commit and module hashes it pins, with a Workers token another stack mints** — chosen.
2. Keep GitHub's schedule — rejected: it never ran this workflow, and Transfer's identical hourly cron runs 2 to 8 times
   a day, so "every hour" would not hold.
3. A Worker cron that only dispatches the workflow — rejected: it needs a GitHub credential with Actions write, which
   Terraform cannot create, so the owner would make and rotate one by hand.
4. A workflow that dispatches its own next run — rejected: a runner busy around the clock, Actions write on the job
   that holds the bucket's keys, and a chain that one failure ends with nothing to restart it.
5. Cloudflare Workflows or a Durable Object alarm instead of a Cron Trigger — rejected: their retries add nothing when
   the next run counts a failed hour, for more moving parts.
6. Deploying the Worker from this repository's CI — rejected: it puts an account-wide Workers write token in this
   repository's secrets, and what such a token can bind in the account is unverified.
7. Widening the Terraform token by hand — rejected: it needs the owner, while a minted token keeps the permission in
   infra's state.
8. The Worker writing the statistics file from its first run — rejected: a defect would write into the only copy of a
   count that cannot be recounted, where a shadow file compared with the workflow's file risks nothing.
9. Alerting through a Cloudflare monitor — rejected: it is created in the dashboard only, by the owner, and fails along
   with Cloudflare.
10. A read-only GitHub credential for the releases — deferred: needed only if unauthenticated reads fall short of the
    switch's threshold, and it needs the owner.

## Decision

We adopt **option 1**. Until the switch conditions of landing-page's "The shadow period" all hold, the Worker writes a
shadow file and the workflow keeps writing the statistics file; then the Worker takes the statistics file over, and
the workflow becomes a read-only watchdog that fails, and so notifies through GitHub, when the file stops being
updated (landing-page Failure G8).

## Consequences

- Positive: the count is brought up to date every hour without GitHub's scheduler, and no hourly job runs with the
  bucket's write key any more; the key stays in Actions for the release workflow's mirror job.
- Positive: the collection needs no GitHub credential and no paid plan.
- Negative: reads without a token share GitHub's per-address limit with other users of Cloudflare's network, so some
  runs fail and their hours are counted later; too many such failures bring option 10 back.
- Negative: the Worker's own failures show only in Cloudflare and in the run record, and the watchdog runs on GitHub's
  schedule, which GitHub disables after 60 days without activity in the repository.
- Negative: every change to the Worker's code needs a second pull request in infra to pin it, and infra's state holds
  an account-wide Workers token.
- Neutral: GitHub's 60-day disabling can no longer stop the count, only its watchdog.

## Sources

Scheduled runs (`gh run list --event schedule`, 2026-11-22): this workflow, none since it reached `main` that day;
Transfer's `download-statistics.yml` (`17 * * * *`), 2 to 8 a day since September and never 24. GitHub: "The
`schedule` event can be delayed during periods of high loads" and "some queued jobs may be dropped"
(<https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>); unauthenticated
requests are limited to 60 an hour per originating IP address
(<https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>). Workers Free: 5 Cron Triggers an
account, 10 ms of CPU and 50 subrequests a Cron invocation, errors rather than charges past them
(<https://developers.cloudflare.com/workers/platform/limits/>, 2026-11-22). Terraform: the GitHub provider 6.13.0 has
no resource that creates a GitHub App or token; a provider block cannot use a resource attribute computed in its own
configuration (Terraform 1.16). R2's added operations in the shadow period: about 5,760 Class A and 3,600 Class B a
month (the Worker's 2,880 and 1,440, the comparisons' 2,880 and 2,160), at most about $0.03 at $4.50 and $0.36 a
million, and only when the account is already beyond R2's free tier (<https://developers.cloudflare.com/r2/pricing/>,
2026-11-22).
