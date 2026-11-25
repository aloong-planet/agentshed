# ADR-0050: The landing page is in Chinese and English

- Status: Accepted (2026-11-24)

## Context

The release line (ADR-0031) needs an entry point for people who have never seen the repository, one that offers
whichever release exists. The page lies outside ADR-0013's i18n scope, so its languages are set here. Where its
source lives and how it is built and deployed is decided by aloong-planet-home's [ADR-0001](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/adr/0001-app-websites-in-this-repository.md).

## Options

1. **The landing page in Chinese and English only, offering the latest formal release or the newest pre-release** —
   chosen.
2. A landing page in more languages than Chinese and English — rejected by the owner for the smaller volume of copy, as
   Transfer's page does.
3. The landing page as one static HTML file — rejected: one file duplicates copy and download links per language.
4. A second copy of the landing page on the Aliyun ECS with the ICP filing number — rejected: it speeds up only the
   page, not the download, on a server short of memory. Restart condition: the page loads too slowly in mainland China.
5. The page's source in this repository as a `site/` project, deployed by Cloudflare Pages from here — dropped: the
   owner moved the app websites into aloong-planet-home, where the three sites share their header, i18n and tests.

## Decision

We choose **option 1**. The landing page is `agentshed.aloongplanet.com`, in Chinese and English only. It offers the
latest formal release from the R2 mirror or, while none exists, the newest pre-release on GitHub, labelled as one
([agentshed-site](https://github.com/aloong-planet/aloong-planet-home/blob/main/docs/specs/agentshed-site.md), the spec in aloong-planet-home).

## Consequences

- Positive: people who have never seen the repository find the app from one page that offers whichever release
  exists.
- Positive: the copy and the download links exist once per language.
- Negative: the page's copy and download links change in aloong-planet-home, not in the repository of the releases
  they describe.
- Negative: the page is served only through Cloudflare, so nothing speeds it up for visitors in mainland China.
- Neutral: the page's two languages are its own choice and happen to be the app's (ADR-0035).

## Sources

The owner's decisions of 2026-10-12 and 2026-11-24. Transfer's landing page. aloong-planet-home's ADR-0001 and its
`docs/specs/agentshed-site.md`.
