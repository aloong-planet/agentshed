# The site's tests read a development build

**Date**: 2026-11-22 · **Surface**: the site's test build (`site/test/build-site.ts`) and every test that reads it

## What happened

For a while, #229's landing page chose the statistics file's URL by `import.meta.env.DEV`: the dev server's own path
in development, the download host's URL otherwise. A built-site case asserted that the built script names the download
host and never the dev path. It failed. The bundle that Vitest's global setup built held the dev path,
`__download-count`, in `_astro/Base.astro_astro_type_script_index_0_lang.*.js`. A command-line `astro build` of the
same tree held none.

So every built-site test had been reading a build that differs from the deployed one wherever the site branches on
development and production. Nothing shipped wrong: until then no site code branched on it. The independent review
later removed the dev path itself.

## Root cause

Vitest runs with `NODE_ENV=test`. Vite takes a `NODE_ENV` that is already set as given, and builds as production
only for `"production"` (Vite 8.3.4: `isProduction = process.env.NODE_ENV === "production"`). Astro's `build()`,
called from the global setup, therefore built with `import.meta.env.DEV` true. `astro build` from the command line,
with `NODE_ENV` unset, builds as production.

## Why no test caught it

- The global setup promised a fresh build, so that no test reads a stale one. Nothing compared its mode with that of
  the build that is deployed.
- No site code read `import.meta.env`, so both modes produced files every assertion held for. The first case whose
  expectation depended on the mode was the one that failed.

## What it settled

- **The test build is a production build.** `build-site.ts` sets `NODE_ENV=production` around `build()` and restores
  it afterwards. Its header and `site/README.md` say why.
- **The setting has no case of its own** since the dev path went: the site has no mode branch left to assert on. A
  change that gives the site one shows its production branch in a built-site case, which reads this build.
