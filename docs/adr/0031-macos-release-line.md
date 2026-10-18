# ADR-0031: A notarized macOS release line, built in CI, mirrored to R2 and fronted by a landing page

- Status: Proposed (the download host's certificate coverage is untested; see Decision)

## Context

Until now Agentshed had never been released. The repository is public and its six READMEs face users,
yet the only way to get the app was to build it from source; `pnpm dist:mac:local` produces a Developer
ID–signed package that is never notarized, which is right for the developer's own machine and wrong for
anyone else's. Distributing to others brings in the macOS distribution policy (electron-scaffold's
`macos-signing.md`: every release notarized and stapled, the `.app` and the DMG each), a place to
download from, and an entry point for people who have never seen the repository.

The forces: Transfer already runs this policy through the same packaging asset and a tag-triggered
workflow, so most of the pipeline exists; the skill allows mirror sync and the latest pointer only on
formal-release events (`macos-signing.md` §5); and a Cloudflare R2 mirror gives a stable download host
and a latest pointer but, by Transfer's own measurement, does not make downloads faster in mainland
China.

## Options

1. **Release builds in CI on a release tag; arm64 only; every release on GitHub Releases; formal
   releases also mirrored to a dedicated R2 bucket behind a custom download host, with a latest pointer;
   a landing page in Chinese and English; the first release a pre-release, `v0.1.0-beta`**
2. Release builds on the developer's machine only, uploaded by hand — rejected: a release would depend
   on one machine and on manual steps, and could carry uncommitted local state into a published package
3. A mainland-China mirror on Aliyun (OSS, or the existing ECS behind the filed `.com.cn` domain),
   instead of R2 or alongside it — rejected: no existing pipeline, traffic billing or a server whose
   memory is already tight, and new compliance work; R2 matches Transfer and costs nothing within its free
   tier
4. Pre-releases mirrored too, under a separate beta pointer that never touches the formal latest —
   rejected: it contradicts `macos-signing.md` §5 as written ("only on formal-release events"). That
   rule's source (the deleted `electron-macos-release/references/direct-distribution.md`, line 117)
   forbade only mutating the *formal* mirror and latest, so amending the skill to that intent was
   considered; the owner chose to follow the current rule. Restart condition: the skill rule changes
5. Sharing Transfer's bucket under a prefix — rejected: one token would write both projects' installers,
   and that bucket's custom domain (`dl.aloongplanet.com`) is already taken
6. A landing page in all six languages — rejected by the owner in favour of Chinese and English, as
   Transfer's landing page does, for the smaller volume of copy. ADR-0013 includes the README in the six
   languages as "a public-facing front door"; the landing page is a new front door outside that ADR's
   scope list, and this entry records that its two languages are deliberate, not an omission
7. The landing page as one static HTML file, or in its own repository — rejected: a single file
   duplicates copy and download links per language; a separate repository has to keep versions and links
   in step across repositories. A `site/` project in this repository, as in Transfer, avoids both
8. A second copy of the landing page on the Aliyun ECS with the ICP filing number — rejected: it speeds up
   only the page, not the download, on a server short of memory. Restart condition: page load time in
   mainland China becomes a problem
9. x64 and universal DMGs as well — deferred: each architecture adds two Apple notarizations and an
   artifact per release, and the expected users are on Apple Silicon (inference). Restart condition: an
   Intel Mac user asks
10. Download statistics on the landing page — deferred to #229
11. Releasing the first version as a formal release (`v0.1.0` or `v1.0.0`) — rejected: only a real release
    tag or the manual verification tier exercises notarization end to end, so a pre-release proves the
    whole line before anything is announced as formal

## Decision

We choose **option 1**:

- **Build**: a release tag runs the `release` packaging profile on a macOS runner in CI, through the
  electron-scaffold packaging asset (`mac-packaging.cjs` and its tests, copied into `build/`), with the
  four CI tiers of `macos-signing.md` §5. arm64 only.
- **Where releases go**: every release, pre-release included, is published on GitHub Releases. Formal
  releases are also copied to the R2 bucket `agentshed-releases` behind a custom download host, and only
  then is the latest pointer updated (`macos-signing.md` §8). Pre-releases never reach R2.
- **Download host**: `dl.agentshed.aloongplanet.com`, provided its certificate is valid; otherwise
  `dl-agentshed.aloongplanet.com`. Cloudflare's Universal SSL does not cover a second-level subdomain, but
  an R2 custom domain is issued a certificate of its own (the existing `dl.aloongplanet.com` serves one
  for `7656d542.sni.cloudflaressl.com` that names only that host), and whether that also holds a level
  deeper is undocumented. This entry stays Proposed until the host is added to the bucket and its
  certificate is checked from outside.
- **Landing page**: `agentshed.aloongplanet.com`, a `site/` project built with Astro and deployed by
  Cloudflare Pages, in Chinese and English. Its download points at the latest formal release on R2; while
  no formal release exists, it points at the GitHub pre-release and labels it a test version.
- **First release**: `v0.1.0-beta`, a pre-release.

## Consequences

- Positive: people other than the developer can install a notarized Agentshed, from a stable host, and
  find it from a landing page
- Positive: release packages are built from a clean checkout of the tagged commit, never from a working
  tree
- Positive: the pipeline is Transfer's, already proven with real notarizations, rather than a new design
- Negative: the R2 mirror does not make downloads faster in mainland China; it buys a stable host and a
  latest pointer, not speed
- Negative: every release waits for Apple twice per architecture (the `.app` and the DMG), typically
  10–30 minutes
- Negative: nine secrets to keep — five for the certificate and Apple, held as organization secrets visible to
  this repository (the owner's choice of 2026-10-18: they serve the whole team), and four for R2 in the
  repository — and a second workflow and a website to maintain
- Negative: the landing page speaks two languages while the app speaks six
- Negative: pre-release users find the download on GitHub only, until the first formal release
- Neutral: adopting the packaging asset requires electron-builder 26.17.0 (the asset's behaviour was
  verified on it; 26.15.3, installed today, mishandles the CI keychain import)
- Neutral: `macos-distribution` becomes enabled in `capabilities.toml`, which brings the macOS release
  steps of `github-ops` and `macos-signing.md` into every release

## Sources

The owner's decisions in the requirements session of 2026-10-12. Transfer's `docs/ops/cn-mirror-deploy.md`
(the R2 mirror does not speed up mainland downloads), `docs/ops/r2-setup-guide.md` and the `sync` job of
`.github/workflows/build.yml` (formal releases only). electron-scaffold's `macos-signing.md` §5 and §8, and
skillshed commit `eb50330`, whose parent holds the deleted `direct-distribution.md`. Cloudflare's
[Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
and the certificate served for `dl.aloongplanet.com` on 2026-10-12. The handoff of 2026-10-12 for the
electron-builder 26.15.3 keychain-import failure in Transfer's CI.
