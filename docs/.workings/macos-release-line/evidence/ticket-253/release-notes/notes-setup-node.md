##### v5.0.0 (2025-09-04)
## What's Changed

### Breaking Changes
* Enhance caching in setup-node with automatic package manager detection by @priya-kinthali in https://github.com/actions/setup-node/pull/1348

This update, introduces automatic caching when a valid `packageManager` field is present in your `package.json`. This aims to improve workflow performance and make dependency management more seamless. 
To disable this automatic caching, set `package-manager-cache: false`
```yaml
steps:
- uses: actions/checkout@v5
- uses: actions/setup-node@v5
  with:
    package-manager-cache: false
```
* Upgrade action to use node24 by @salmanmkc in https://github.com/actions/setup-node/pull/1325

Make sure your runner is on version v2.327.1 or later to ensure compatibility with this release. [See Release Notes](https://github.com/actions/runner/releases/tag/v2.327.1)


### Dependency Upgrades
* Upgrade @octokit/request-error and @actions/github by @dependabot[bot] in https://github.com/actions/setup-node/pull/1227
* Upgrade uuid from 9.0.1 to 11.1.0 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1273
* Upgrade undici from 5.28.5 to 5.29.0 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1295
* Upgrade form-data to bring in fix for critical vulnerability by @gowridurgad in https://github.com/actions/setup-node/pull/1332
* Upgrade actions/checkout from 4 to 5 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1345

## New Contributors
* @priya-kinthali made their first contribution in https://github.com/actions/setup-node/pull/1348
* @salmanmkc made their first contribution in https://github.com/actions/setup-node/pull/1325

**Full Changelog**: https://github.com/actions/setup-node/compare/v4...v5.0.0

##### v6.0.0 (2025-10-14)
## What's Changed

**Breaking Changes**

- Limit automatic caching to npm, update workflows and documentation by @priyagupta108 in https://github.com/actions/setup-node/pull/1374

**Dependency Upgrades**

- Upgrade ts-jest from 29.1.2 to 29.4.1 and document breaking changes in v5 by @dependabot[bot] in [#1336](https://github.com/actions/setup-node/pull/1336)
- Upgrade prettier from 2.8.8 to 3.6.2 by @dependabot[bot] in [#1334](https://github.com/actions/setup-node/pull/1334)
- Upgrade actions/publish-action from 0.3.0 to 0.4.0 by @dependabot[bot] in [#1362](https://github.com/actions/setup-node/pull/1362)


**Full Changelog**: https://github.com/actions/setup-node/compare/v5...v6.0.0

##### v6.1.0 (2025-12-03)
## What's Changed
### Enhancement:
* Remove always-auth configuration handling by @priyagupta108 in https://github.com/actions/setup-node/pull/1436

### Dependency updates:
* Upgrade @actions/cache from 4.0.3 to 4.1.0 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1384
* Upgrade actions/checkout from 5 to 6 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1439
* Upgrade js-yaml from 3.14.1 to 3.14.2 by @dependabot[bot] in https://github.com/actions/setup-node/pull/1435

### Documentation update:
* Add example for restore-only cache in documentation by @aparnajyothi-y in https://github.com/actions/setup-node/pull/1419


**Full Changelog**: https://github.com/actions/setup-node/compare/v6...v6.1.0

##### v6.2.0 (2026-01-15)
## What's Changed

### Documentation
* Documentation update related to absence of Lockfile by @mahabaleshwars in https://github.com/actions/setup-node/pull/1454
* Correct mirror option typos by @MikeMcC399 in https://github.com/actions/setup-node/pull/1442
* Readme update on checkout version v6 by @deining in https://github.com/actions/setup-node/pull/1446
* Readme typo fixes @munyari in https://github.com/actions/setup-node/pull/1226
* Advanced document update on checkout version v6 by @aparnajyothi-y  in https://github.com/actions/setup-node/pull/1468

### Dependency updates:
* Upgrade @actions/cache to v5.0.1 by @salmanmkc in https://github.com/actions/setup-node/pull/1449

## New Contributors
* @mahabaleshwars made their first contribution in https://github.com/actions/setup-node/pull/1454
* @MikeMcC399 made their first contribution in https://github.com/actions/setup-node/pull/1442
* @deining made their first contribution in https://github.com/actions/setup-node/pull/1446
* @munyari made their first contribution in https://github.com/actions/setup-node/pull/1226

**Full Changelog**: https://github.com/actions/setup-node/compare/v6...v6.2.0

##### v6.3.0 (2026-03-04)
## What's Changed

### Enhancements:
* Support parsing `devEngines` field by @susnux in https://github.com/actions/setup-node/pull/1283
>  When using node-version-file: package.json, setup-node now prefers devEngines.runtime over engines.node.

### Dependency updates:
* Fix npm audit issues by @gowridurgad in https://github.com/actions/setup-node/pull/1491
* Replace uuid with crypto.randomUUID() by @trivikr in https://github.com/actions/setup-node/pull/1378
* Upgrade minimatch from 3.1.2 to 3.1.5 by @dependabot in https://github.com/actions/setup-node/pull/1498

### Bug fixes:
* Remove hardcoded bearer for mirror-url @marco-ippolito in https://github.com/actions/setup-node/pull/1467
* Scope test lockfiles by package manager and update cache tests by @gowridurgad in https://github.com/actions/setup-node/pull/1495

## New Contributors
* @susnux made their first contribution in https://github.com/actions/setup-node/pull/1283

**Full Changelog**: https://github.com/actions/setup-node/compare/v6...v6.3.0

##### v6.4.0 (2026-04-20)
## What's Changed

### Dependency updates:
* Upgrade @actions dependencies by @Copilot in https://github.com/actions/setup-node/pull/1525
* Update Node.js versions in versions.yml and bump package to v6.4.0  by @priya-kinthali in https://github.com/actions/setup-node/pull/1533

## New Contributors
* @Copilot made their first contribution in https://github.com/actions/setup-node/pull/1525

**Full Changelog**: https://github.com/actions/setup-node/compare/v6...v6.4.0

##### v6.5.0 (2026-07-14)
## What's Changed
* Update @actions/cache to 5.1.0 and add security overrides for undici and fast-xml-parser by @HarithaVattikuti in https://github.com/actions/setup-node/pull/1579


**Full Changelog**: https://github.com/actions/setup-node/compare/v6.4.0...v6.5.0

##### v7.0.0 (2026-07-14)
## What's Changed

### Enhancements:
* Add cache-primary-key and cache-matched-key as outputs by @gowridurgad in https://github.com/actions/setup-node/pull/1577
* Migrate to ESM and upgrade dependencies by @gowridurgad in https://github.com/actions/setup-node/pull/1574

### Bug fixes:
* Remove dummy NODE_AUTH_TOKEN export by @gowridurgad in https://github.com/actions/setup-node/pull/1558
* Only use `mirrorToken` in `getManifest` if it's provided by @deiga in https://github.com/actions/setup-node/pull/1548

### Documentation updates:
* Add documentation for publishing to npm with Trusted Publisher (OIDC) by @chiranjib-swain in https://github.com/actions/setup-node/pull/1536
* docs: Update restore-only cache documentation by @priya-kinthali in https://github.com/actions/setup-node/pull/1550
* docs: Update caching recommendations to mitigate cache poisoning risks by @chiranjib-swain in https://github.com/actions/setup-node/pull/1567

### Dependency update:
* Upgrade @actions/cache to 5.1.0, log cache write denied by @jasongin in https://github.com/actions/setup-node/pull/1569

## New Contributors
* @chiranjib-swain made their first contribution in https://github.com/actions/setup-node/pull/1536
* @deiga made their first contribution in https://github.com/actions/setup-node/pull/1548
* @jasongin made their first contribution in https://github.com/actions/setup-node/pull/1569

**Full Changelog**: https://github.com/actions/setup-node/compare/v6...v7.0.0

##### v7.1.0 (2026-10-08)
## What's Changed

### Enhancements:
* Add support for mise.toml file by @gperdomor in https://github.com/actions/setup-node/pull/1421
* Support absolute paths in node-version-file by @v-mahabaleshwars in https://github.com/actions/setup-node/pull/1633

### Bug fixes:
*  Add Node version validation and manifest fetch retry by @v-jitenderpalsingh in https://github.com/actions/setup-node/pull/1580

### Documentation updates:
* README.md: bump actions/checkout to latest version 7 by @deining in https://github.com/actions/setup-node/pull/1578
* docs: add V7 ESM migration and NODE_AUTH_TOKEN behavior change by @v-gowridurgad in https://github.com/actions/setup-node/pull/1593
* Fixed cache recommendation syntax by @SubJunk in https://github.com/actions/setup-node/pull/1603

### Dependency updates:
*  Update workflow pins and migrate Node matrices to modern versions by @v-HarithaVattikuti in https://github.com/actions/setup-node/pull/1583
* Upgrade  @actions/cache to 6.2.0 by @philip-gai in https://github.com/actions/setup-node/pull/1584
* Pin @types/node to v24 by @v-priyagupta108 in https://github.com/actions/setup-node/pull/1585
* Override brace-expansion to 5.0.8 by @v-priyagupta108 with @Copilot in https://github.com/actions/setup-node/pull/1599
* Upgrade  actions/checkout from 7.0.0 to 7.0.1 by @dependabot in https://github.com/actions/setup-node/pull/1598
* Upgrade  prettier from 3.8.4 to 3.9.6 by @dependabot in https://github.com/actions/setup-node/pull/1590
* Upgrade  @vercel/ncc from 0.44.0 to 0.45.0 by @dependabot in https://github.com/actions/setup-node/pull/1610
* Upgrade  pnpm/action-setup from 6.0.9 to 6.0.10 by @dependabot in https://github.com/actions/setup-node/pull/1602
* Upgrade  baseline-browser-mapping from 2.10.38 to 2.11.22 by @dependabot in https://github.com/actions/setup-node/pull/1629
* Upgrade @types/semver from 7.7.1 to 7.8.0 by @dependabot in https://github.com/actions/setup-node/pull/1616
* Upgrade @typescript-eslint/parser from 8.62.0 to 8.70.0 by @dependabot in https://github.com/actions/setup-node/pull/1615
* Upgrade pnpm/action-setup from 6.0.10 to 6.1.0 by @dependabot in https://github.com/actions/setup-node/pull/1631
* Upgrade jest-each from 30.4.1 to 30.5.2 by @dependabot in https://github.com/actions/setup-node/pull/1636
* Upgrade eslint-plugin-n from 18.1.0 to 18.3.0 by @dependabot in https://github.com/actions/setup-node/pull/1638
* Update dependencies and add license files by @v-HarithaVattikuti in https://github.com/actions/setup-node/pull/1642
* Upgrade eslint from 10.5.0 to 10.11.0 and package.json from 7.0.0 to 7.1.0 by @dependabot in https://github.com/actions/setup-node/pull/1635



## New Contributors
* @v-jitenderpalsingh made their first contribution in https://github.com/actions/setup-node/pull/1580
* @philip-gai made their first contribution in https://github.com/actions/setup-node/pull/1584
* @gperdomor made their first contribution in https://github.com/actions/setup-node/pull/1421
* @SubJunk made their first contribution in https://github.com/actions/setup-node/pull/1603

**Full Changelog**: https://github.com/actions/setup-node/compare/v7.0.0...v7.1.0

