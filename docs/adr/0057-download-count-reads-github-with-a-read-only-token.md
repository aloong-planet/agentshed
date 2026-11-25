# ADR-0057: The download count's Worker reads GitHub's releases with the owner's read-only token, and never without it

- Status: Accepted (2026-11-25)

## Context

The Worker reads GitHub's releases every hour (ADR-0056), and how often those reads succeed decides whether it may take
the statistics file over (download-count "The shadow period"). Terraform cannot create a GitHub token, so a GitHub
credential is one the owner makes and renews by hand.

## Options

1. **A fine-grained personal access token on the owner's account, with public repositories read-only and no
   permissions** — chosen.
2. Reading the releases without a token — rejected: those reads share GitHub's limit per originating address with
   other users of Cloudflare's network, and too few of them succeed for the switch (Sources).
3. A read without the token when GitHub refuses it — rejected: a token expired or revoked would then hide among the
   rate-limited runs, where a refusal shows in the run record as `failed`.

## Decision

We adopt **option 1**, and no read of GitHub's releases goes without the token (download-count "The collection",
Failure G2).

## Consequences

- Positive: GitHub counts the Worker's reads against the owner's own limit, not against one that an address on
  Cloudflare's network shares with its other users.
- Positive: the token reads only public repositories, so whoever obtained it could read nothing that is not public.
- Negative: the owner makes, renews and revokes the token by hand, outside Terraform (aloong-planet/infra,
  `docs/ops/releases-read-token.md`), and every run fails while it is unbound, expired or revoked
  (docs/ops/download-count.md).
- Negative: its reads count toward the owner's personal limit of 5,000 requests an hour, which the owner's other
  authenticated use of GitHub shares.
- Neutral: the Download count workflow reads the releases with its own token, not with this one.

## Sources

GitHub: unauthenticated requests are limited to 60 an hour per originating IP address, and a personal access token's
count toward its user's personal limit of 5,000 an hour
(<https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>, 2026-11-25); a fine-grained
personal access token reads every public repository
(<https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>,
2026-11-25), unless its lifetime breaks the policy of an organization its user is a member of, which by default allows
at most 366 days and blocks a member's token that breaks it from the organization
(<https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization>,
2026-11-25). The Worker's runs with the token (`stats/worker-runs.json`): two tokens with no expiration were answered
HTTP 403 at 2026-11-25T07:31Z and 08:31Z, and one that expires within a year read GitHub, `github` `ok`, at 09:31Z.
The Worker's runs without a token
(`stats/worker-runs.json`, 2026-11-25T03:34Z): GitHub `ok` in 3 of the first 7 and in 4 of 11, `rate-limited` in the
rest. The owner's decision of 2026-11-25, in translation from Chinese:
"Agreed, make the read-only GitHub token" and "The token is made, and the secret is stored."
