# ADR-0031: A notarized macOS release line, built in CI and mirrored to R2

- Status: Accepted (2026-10-19)

## Context

Distributing Agentshed beyond its developer needs packages notarized under electron-scaffold's `macos-signing.md` and
a place to download them from. Transfer already runs that policy with the same packaging asset and a tag-triggered
workflow, and the policy syncs a mirror and moves the latest pointer only on formal-release events (§5). A Cloudflare
R2 mirror gives a stable host and a latest pointer but, by Transfer's measurement, no faster downloads in mainland
China.

## Options

1. **CI builds on a release tag, arm64 only; every release on GitHub Releases, formal ones also on a dedicated R2
   bucket behind a custom host with a latest pointer; a pre-release first** — chosen.
2. Builds on the developer's machine, uploaded by hand — rejected: a release would depend on one machine and manual
   steps, and could carry uncommitted local state into a published package.
3. A mainland-China mirror on Aliyun (OSS, or the ECS behind the filed `.com.cn` domain), instead of R2 or beside it —
   rejected: no existing pipeline, traffic billing or a server already short of memory, and new compliance work, while
   R2 matches Transfer and is free within its tier.
4. Pre-releases mirrored too, under a beta pointer apart from the formal latest — rejected: it contradicts
   `macos-signing.md` §5, which the owner chose to follow rather than amend to its source's narrower intent. Restart
   condition: that rule changes.
5. Sharing Transfer's bucket under a prefix — rejected: one token would write both projects' installers, and that
   bucket's custom domain is taken.
6. x64 and universal DMGs as well — deferred: each architecture adds two notarizations and an artifact per release, and
   the expected users are on Apple Silicon (inference). Restart condition: an Intel Mac user asks.
7. A formal first release — rejected: only a real release tag or the manual verification tier exercises notarization
   end to end, so a pre-release proves the line before anything is formal.

## Decision

We choose **option 1**:

- **Build**: a release tag runs the `release` packaging profile in CI on a macOS runner, through electron-scaffold's
  packaging asset and the CI tiers of `macos-signing.md` §5; arm64 only.
- **Where releases go**: every release, pre-releases included, is published on GitHub Releases. A formal one is also
  copied to the R2 bucket `agentshed-releases` behind `dl.agentshed.aloongplanet.com` before the latest pointer moves
  (`macos-signing.md` §8); a pre-release never reaches R2.
- **First release**: `v0.1.0-beta`, a pre-release.

## Consequences

- Positive: people other than the developer can install a notarized Agentshed from a stable host.
- Positive: packages are built from a clean checkout of the tagged commit, never from a working tree.
- Positive: the pipeline is Transfer's, proven with real notarizations, not a new design.
- Negative: the R2 mirror buys a stable host and a latest pointer, not faster downloads in mainland China.
- Negative: every release waits for Apple twice per architecture (the `.app` and the DMG), typically 10–30 minutes.
- Negative: nine secrets to keep, five for the certificate and Apple as organization secrets and four for R2 in the
  repository, and a second workflow to maintain.
- Negative: pre-release users find the download on GitHub only, until the first formal release.
- Neutral: the packaging asset needs electron-builder 26.17.0 or later, since 26.15.3 mishandles the CI keychain
  import.
- Neutral: `macos-distribution` is enabled in `capabilities.toml`, bringing the macOS release steps of `github-ops` and
  `macos-signing.md` into every release.

## Sources

The owner's decisions of 2026-10-12, and of 2026-10-18 that the certificate and Apple secrets are organization secrets
because they serve the whole team. Transfer's `docs/ops/cn-mirror-deploy.md` (the R2 mirror does not speed up
mainland downloads), `docs/ops/r2-setup-guide.md` and the `sync` job of `.github/workflows/build.yml` (formal releases
only). `macos-signing.md` §5 and §8, and skillshed commit `eb50330`, whose parent holds the deleted
`direct-distribution.md`, which forbade only mutating the formal mirror and latest. Cloudflare's
[Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/) (a
second-level subdomain is not covered, while an R2 custom domain is issued a certificate of its own); the certificate
of `dl.agentshed.aloongplanet.com`, checked from outside Cloudflare on 2026-10-17, issued by Google Trust Services and
valid until 2027-01-15 (`aloong-planet/infra`, `stacks/apps/README.md`). The handoff of 2026-10-12 for the
electron-builder 26.15.3 keychain-import failure in Transfer's CI. The landing page in front of these releases:
ADR-0050.
