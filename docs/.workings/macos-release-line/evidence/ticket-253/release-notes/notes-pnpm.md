##### v4.4.0 (2026-03-13)
Updated the action to use Node.js 24.

##### v5.0.0 (2026-03-17)
Updated the action to use Node.js 24.

##### v6.0.0 (2026-04-10)
Added support for pnpm [v11](https://github.com/pnpm/pnpm/releases/tag/v11.0.0-rc.0).

##### v6.0.1 (2026-04-17)
Update pnpm to v11.0.0-rc.2. `pnpm-lock.yaml` will not be saved with two documents unless the `packageManager` is set via `devEngines.packageManager`. Related issue: https://github.com/pnpm/action-setup/issues/228

##### v6.0.2 (2026-04-18)
## What's Changed
* fix: pnpm self-update binary shadowed by bootstrap on PATH by @oniani1 in https://github.com/pnpm/action-setup/pull/230

## New Contributors
* @oniani1 made their first contribution in https://github.com/pnpm/action-setup/pull/230

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.1...v6.0.2

##### v6.0.3 (2026-04-21)
Updated pnpm to v11.0.0-rc.5

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.2...v6.0.3

##### v6.0.4 (2026-04-30)
## What's Changed
* fix: use npm co-located with the action node binary by @benquarmby in https://github.com/pnpm/action-setup/pull/239

## New Contributors
* @benquarmby made their first contribution in https://github.com/pnpm/action-setup/pull/239

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.3...v6.0.4

##### v6.0.5 (2026-05-02)
## What's Changed
* fix: append (not prepend) action node dir to PATH for npm bootstrap by @zkochan in https://github.com/pnpm/action-setup/pull/241


**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.4...v6.0.5

##### v6.0.6 (2026-05-08)
## What's Changed
* fix: bin_dest output points to self-updated pnpm, not bootstrap by @zkochan in https://github.com/pnpm/action-setup/pull/249


**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.5...v6.0.6

##### v6.0.7 (2026-05-11)
## What's Changed
* fix: honor devEngines.packageManager.onFail=error (#252) by @zkochan in https://github.com/pnpm/action-setup/pull/254
* fix: restore inputs from state in post by @haines in https://github.com/pnpm/action-setup/pull/255
* fix: self-update bootstrap to packageManager-pinned version (#233) by @zkochan in https://github.com/pnpm/action-setup/pull/256

## New Contributors
* @haines made their first contribution in https://github.com/pnpm/action-setup/pull/255

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.6...v6.0.7

##### v6.0.8 (2026-05-12)
## What's Changed
* docs(README): fix `cache_dependency_path` type by @haines in https://github.com/pnpm/action-setup/pull/257
* fix: drop patchPnpmEnv so standalone+self-update works on Windows by @zkochan in https://github.com/pnpm/action-setup/pull/258
* fix: update pnpm to 11.1.1 by @mungodewar in https://github.com/pnpm/action-setup/pull/248

## New Contributors
* @mungodewar made their first contribution in https://github.com/pnpm/action-setup/pull/248

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.7...v6.0.8

##### v6.0.9 (2026-06-15)
## What's Changed
* fix: update pnpm to v11.7.0 by @zkochan in https://github.com/pnpm/action-setup/pull/267


**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6...v6.0.9

##### v6.0.10 (2026-08-03)
## What's Changed
* docs(README): point users to the successor pnpm/setup action by @BlackHole1 in https://github.com/pnpm/action-setup/pull/282
* refactor: introduce restore keys for cache by @SukkaW in https://github.com/pnpm/action-setup/pull/280
* ci: use pnpm 11 for `pr-check` by @jamietanna in https://github.com/pnpm/action-setup/pull/284
* fix: update pnpm to v11.19.0 by @jamietanna in https://github.com/pnpm/action-setup/pull/283
* docs: update README to include devEngines.packageManager by @nemchik in https://github.com/pnpm/action-setup/pull/273

## New Contributors
* @jamietanna made their first contribution in https://github.com/pnpm/action-setup/pull/284
* @nemchik made their first contribution in https://github.com/pnpm/action-setup/pull/273

**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6...v6.0.10

##### v6.1.0 (2026-09-05)
## What's Changed
* feat: support pnpm v12 by @zkochan in https://github.com/pnpm/action-setup/pull/288


**Full Changelog**: https://github.com/pnpm/action-setup/compare/v6.0.10...v6.1.0

