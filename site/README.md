# Agentshed's landing page (`site/`)

An Astro static site in two languages: Chinese at `/`, English at `/en`. What it must do is in
[the landing-page spec](../docs/specs/landing-page.md); why it is a `site/` project in this repository is
ADR-0031. It is a package of its own, with its own lockfile, outside the app's dependencies.

## Commands

```sh
cd site
pnpm install --frozen-lockfile
pnpm dev        # http://localhost:4321/
pnpm build      # the static site, into site/dist/
pnpm preview    # serve site/dist/
pnpm check      # astro check: the TypeScript of every .astro and .ts file
pnpm test       # unit tests and the built-site check
```

From the repository root, `pnpm test:site` runs `check` and `test`. It is part of `pnpm verify`, and CI runs
it in its checks job; the root `pnpm lint` covers the site's TypeScript and scripts too (not its `.astro`
files), which is why CI installs the site's dependencies before linting.

## Where things are

- `src/pages/index.astro`, `src/pages/en/index.astro`: the two pages, the same sections in the same order.
- `src/layouts/Base.astro`: the head, the sticky header (brand, navigation, language toggle), the footer, and
  the page's one script.
- `src/components/`: one component per section (`Hero`, `Features`, `Install`, `Download`), and `Icon.astro`,
  the page's icons as inline SVG copied from Lucide. A new icon goes there, never a character or an emoji.
- `src/i18n/ui.ts`: every string of the page, in both languages. This dictionary is the site's own, separate
  from the app's (`src/shared/i18n/`). New copy goes here, in both languages.
- `src/styles/global.css`: the palette (the app's purple theme, light and dark, by the visitor's system
  appearance) and every rule of the page, interaction states included. Markup carries classes only.
- `src/releases.ts`: the two things the page reads in the visitor's browser, the R2 latest pointer and GitHub's
  releases for this repository, each answer validated before anything of it is used.
- `src/download.ts`: the download state the two reads decide (formal from R2, formal from GitHub, test, or the
  list), and what each state's buttons say and where they lead. The page is served in the list state, which
  leads to GitHub's release list.
- `src/scripts/`: the features section's pinned showcase, whose step follows the scroll (`features.ts`), the language switch that keeps
  the current step and scroll position (`language-switch.ts`), and the download script that reads, decides and
  shows the state in place (`download.ts`, applying it with `apply-download.ts`).
- `src/shots.ts` and `public/shots/`: the screenshots, one set per language: the hero and four feature cuts
  over the owner's data, approved for publication (2026-10-13; the hero's retake 2026-10-21), and the memory and
  search cuts over made-up data. They change only by retaking them from the app, at the same sizes (the hero
  2560×1536, every feature cut 1840×1035).
- `public/icon-64.png`, `public/icon-256.png`: the app icon, scaled from `build/icon.png`:
  `sips -z 64 64 build/icon.png --out site/public/icon-64.png` (and 256 for the other), from the repository
  root.

## Tests

- Unit tests sit next to the modules they test (`src/**/*.test.ts`).
- `test/built-site.test.ts` checks the pages one fresh build produces: `test/build-site.ts` builds the site
  into a new temporary directory once per test run, so the check never reads an old `dist/`. Its file header
  says what it cannot see (scrolling, layout across widths, the two appearances), which is measured in a browser
  instead.
- `test/apply-download.test.ts` and `test/init-download.test.ts` apply the download states to that build's
  pages, the second through the page's script with a fake network. The reads' tests answer through an injected
  fetch too, so no test reaches the network; `test/fixtures/` holds the answers they use: the pointer as the
  release script writes it, and a real releases answer from GitHub reshaped to this repository.

## Deploying (Cloudflare Pages)

The page is served by Cloudflare Pages at `agentshed.aloongplanet.com`. The Pages project needs:

| Setting | Value |
|---|---|
| Root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `dist` (relative to the root directory) |
| Build watch path | `site/*`: a push that changes nothing under `site/` is skipped (Cloudflare still builds a push of more than 20 commits or 3000 files). The build reads nothing outside `site/`; a change that makes it depend on a file elsewhere must widen this path |
| `NODE_VERSION` | 22.23.3, on production and preview. At least 22.22.2: Astro 7 refuses a Node older than 22.22.0, and the corepack in Pages' build image warns below 22.22.2 |
| `PNPM_VERSION` | 9.12.3, on production and preview, so the build runs the site's pnpm rather than the build image's default pnpm 10 |

The site uses pnpm 9 (`packageManager` in `package.json`), hence `PNPM_VERSION`. Connecting the project to this repository
requires the Cloudflare Workers & Pages GitHub App on the `aloong-planet` organization, with access to
`agentshed` only.
