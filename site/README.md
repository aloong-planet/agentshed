# Agentshed's landing page (`site/`)

An Astro static site in two languages: English at `/`, Chinese at `/zh/`. What it must do is in
[the landing-page spec](../docs/specs/landing-page.md); why it is a `site/` project in this repository is
ADR-0050. It is a package of its own, with its own lockfile, outside the app's dependencies.

## Commands

```sh
cd site
pnpm install --frozen-lockfile
pnpm exec playwright install --only-shell chromium   # once per Playwright version: the browser the tests run
pnpm dev        # http://localhost:4321/
pnpm build      # the static site, into site/dist/
pnpm preview    # serve site/dist/
pnpm check      # astro check: the TypeScript of every .astro and .ts file
pnpm test       # unit tests, the built-site check and the browser cases
```

The browser cases run the headless Chromium of the Playwright `package.json` pins, which the root's Playwright does
not install: without it every browser test file fails at launch, naming the missing executable. On Linux,
`--with-deps` also installs the system libraries and fonts it needs, as `site-checks` does.

From the repository root, `pnpm test:site` runs `check` and `test`. It is part of `pnpm verify`, and CI runs
it in `site-checks` when a pull request changes website inputs, and on every push to `main`. That job also runs `pnpm lint:site` with the root ESLint
configuration, covering the site's TypeScript and scripts (not its `.astro` files), so it installs both
packages. Application-only checks use `pnpm lint:app` and need no website install. Changing the app's
theme also selects website checks because the palette test reads it. See [CI routing](../docs/ops/ci.md).

## Where things are

- `src/pages/index.astro`, `src/pages/zh/index.astro`: the two pages, the same sections in the same order.
- `public/_redirects`: permanent Cloudflare Pages redirects from `/en` and `/en/` to `/`.
  The Astro redirect also emits a static fallback for local previews.
- `src/layouts/Base.astro`: the head, the sticky header (the trail back to the author's homepage ending in the brand,
  navigation, language toggle), the footer, and the page's one script.
- `src/components/`: one component per section (`Hero`, `Features`, `Install`, `Download`), and `Icon.astro`,
  the page's icons as inline SVG copied from Lucide. A new icon goes there, never a character or an emoji.
- `src/i18n/ui.ts`: every string of the page, in both languages. This dictionary is the site's own, separate
  from the app's (`src/shared/i18n/`). New copy goes here, in both languages.
- `src/styles/global.css`: the palette (the app's purple theme, light and dark, by the visitor's system
  appearance) and every rule of the page, interaction states included. Markup carries classes only.
- `src/releases.ts`: the two things the page reads in the visitor's browser to decide the download, the R2 latest
  pointer and GitHub's releases for this repository, each answer validated before anything of it is used.
- `src/download-count.ts`: the page's one other read, the download count's statistics file on the download host,
  of which only a validated total reaches the page. The hourly workflow that writes it is in
  [its runbook](../docs/ops/download-count.md). The download host answers CORS for the landing page's own origin
  only, so `pnpm dev`, `pnpm preview` and a Pages preview show no count, as they show no formal release from R2.
- `src/download.ts`: the download state the two reads decide (formal from R2, formal from GitHub, test, or the
  list), and what each state's buttons say and where they lead. The page is served in the list state, which
  leads to GitHub's release list.
- `src/scripts/`: the features section's pinned showcase, whose step follows the scroll (`features.ts`), the language switch that keeps
  the current step and scroll position (`language-switch.ts`), and the download script that reads, decides and
  shows the state in place (`download.ts`, applying it with `apply-download.ts`), and fills the download count's
  line without the download waiting for it.
- `src/shots.ts` and `public/shots/`: the screenshots, one set per language. The overview, project, token and
  Chinese session cuts show the owner's data, approved for publication (2026-10-13). The memory, search and
  English session cuts show made-up data (the memory and search cuts by the owner's choice, 2026-10-21; the
  English session retaken 2026-11-09). They change only by retaking them from the app, at the same size
  (every cut 1840×1035). The root READMEs' picture is not among them: it shows the owner's data (approved
  2026-10-13, retaken 2026-10-21, 2560×1536) and is kept in the repository's `docs/assets/readme/` so that
  the site does not serve it.
- `public/media/agentshed-intro-poster.jpg`: the shared 1600×900 poster. Both walkthroughs use the English narration.
  The [English captions](https://youtu.be/lQ-Bg8nXJKM) and [Chinese captions](https://youtu.be/TpCgkGiVqlk)
  are part of their respective YouTube videos. `src/scripts/hero-video.ts`
  loads the privacy-enhanced YouTube iframe only after activation, while the poster and the separate
  “Watch on YouTube” link work without scripts. Narration and music are part of the uploaded video.
- `public/icon-64.png`, `public/icon-256.png`: the app icon, scaled from `build/icon.png`:
  `sips -z 64 64 build/icon.png --out site/public/icon-64.png` (and 256 for the other), from the repository
  root.

## Tests

- Unit tests sit next to the modules they test (`src/**/*.test.ts`).
- `test/built-site.test.ts` checks the pages one fresh build produces: `test/build-site.ts` builds the site
  into a new temporary directory once per test run, so the check never reads an old `dist/`. Its file header
  says what it cannot see (scrolling, layout, the two appearances): what has no browser case yet is measured in a
  browser by hand.
- `test/support/browser.ts` loads that build in a real browser, with no server and no network: it serves the
  build's files and the stand-in answers a case gives to the page's reads, and refuses any other request, which fails
  the case, named. `test/support/browser.test.ts` is its own check. `test/landing-page-layout.test.ts` measures the
  layout there (landing-page::QR-001/AC-01) at four widths, in both languages, both appearances and every download
  state. `test/landing-page-features.test.ts` drives the features section there (landing-page::REQ-004), in both
  languages: the pinned showcase at four widths, the step each scroll position gives, a step turning, the stacked steps
  below 760px and without scripts, a resize and a language switch. Every browser case opens the build through
  `visit()`, and `pnpm lint:site` fails on any other import of Playwright under `site/`.
- `test/apply-download.test.ts` and `test/init-download.test.ts` apply the download states to that build's
  pages, the second through the page's script with a fake network. The reads' tests answer through an injected
  fetch too, so no test reaches the network; `test/fixtures/` holds the answers they use: the pointer as the
  release script writes it, and a real releases answer from GitHub reshaped to this repository.
- `test/build-site.ts` builds as production, as `pnpm build` does: the tests run with `NODE_ENV=test`, under which
  the build would otherwise keep the dev server's choices, such as `import.meta.env.DEV` being true.

## Deploying (Cloudflare Pages)

The page is served by Cloudflare Pages at `agentshed.aloongplanet.com`. The Pages project needs:

| Setting | Value |
|---|---|
| Root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `dist` (relative to the root directory) |
| Build watch path | `site/*`: a push that changes nothing under `site/` is skipped (Cloudflare still builds a push with no changed files, at least 20 commits or at least 3000 files). The build reads nothing outside `site/`; a change that makes it depend on a file elsewhere must widen this path |
| `NODE_VERSION` | 22.23.3, on production and preview. At least 22.22.2: Astro 7 refuses a Node older than 22.22.0, and the corepack in Pages' build image warns below 22.22.2 |
| `PNPM_VERSION` | 9.12.3, on production and preview, so the build runs the site's pnpm rather than the build image's default pnpm 10 |

The site uses pnpm 9 (`packageManager` in `package.json`), hence `PNPM_VERSION`. Connecting the project to this repository
requires the Cloudflare Workers & Pages GitHub App on the `aloong-planet` organization, with access to
`agentshed` only.
