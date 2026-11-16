# ADR-0050: The landing page is a `site/` project in this repository, in Chinese and English

- Status: Accepted (2026-10-19)

## Context

The release line (ADR-0031) needs an entry point for people who have never seen the repository, one that offers
whichever release exists. Transfer fronts its releases with a landing page in Chinese and English built as a `site/`
project in its own repository. The page lies outside ADR-0013's i18n scope, so its languages, like where it lives, are
set here.

## Options

1. **A `site/` project in this repository at `agentshed.aloongplanet.com`, built with Astro and deployed by Cloudflare
   Pages, in Chinese and English, offering the latest formal release or the newest pre-release** — chosen.
2. A landing page in more languages than Chinese and English — rejected by the owner for the smaller volume of copy, as
   Transfer's page does.
3. The landing page as one static HTML file, or in its own repository — rejected: one file duplicates copy and download
   links per language, and a separate repository must keep versions and links in step across repositories.
4. A second copy of the landing page on the Aliyun ECS with the ICP filing number — rejected: it speeds up only the
   page, not the download, on a server short of memory. Restart condition: the page loads too slowly in mainland China.
5. Download statistics on the landing page — deferred, reason not recorded, and kept as an open issue.

## Decision

We choose **option 1**. The landing page is `agentshed.aloongplanet.com`, this repository's `site/` project, built
with Astro and deployed by Cloudflare Pages, in Chinese and English only. It offers the latest formal release from the
R2 mirror or, while none exists, the newest pre-release on GitHub, labelled as one (landing-page spec).

## Consequences

- Positive: people who have never seen the repository find the app from one page that offers whichever release
  exists.
- Positive: the copy and the download links exist once per language and change in the same repository as the
  releases they describe.
- Negative: a website to maintain beside the app, a package with its own lockfile.
- Negative: the page is served only through Cloudflare, so nothing speeds it up for visitors in mainland China.
- Neutral: the page's two languages are its own choice and happen to be the app's (ADR-0035).

## Sources

The owner's decisions of 2026-10-12. Transfer's landing page and its `site/` project. `docs/specs/landing-page.md`.
