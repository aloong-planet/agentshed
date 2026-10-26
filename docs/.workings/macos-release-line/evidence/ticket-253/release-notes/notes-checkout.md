##### v5.0.0 (2025-08-11)
## What's Changed
* Update actions checkout to use node 24 by @salmanmkc in https://github.com/actions/checkout/pull/2226
* Prepare v5.0.0 release by @salmanmkc in https://github.com/actions/checkout/pull/2238

## ⚠️ Minimum Compatible Runner Version

**v2.327.1**  
[Release Notes](https://github.com/actions/runner/releases/tag/v2.327.1)

Make sure your runner is updated to this version or newer to use this release.

**Full Changelog**: https://github.com/actions/checkout/compare/v4...v5.0.0

##### v5.0.1 (2025-11-17)
## What's Changed
* Port v6 cleanup to v5 by @ericsciple in https://github.com/actions/checkout/pull/2301


**Full Changelog**: https://github.com/actions/checkout/compare/v5...v5.0.1

##### v5.1.0 (2026-07-20)
## What's Changed
* **[BREAKING]** backport `allow-unsafe-pr-checkout` to v5 by @aiqiaoy in https://github.com/actions/checkout/pull/2501
* backport fixes to releases-v5 by @aiqiaoy in https://github.com/actions/checkout/pull/2523

https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/ for more details about this breaking change

**Full Changelog**: https://github.com/actions/checkout/compare/v5.0.1...v5.1.0

##### v6.0.0 (2025-11-20)
## What's Changed
* Update README to include Node.js 24 support details and requirements by @salmanmkc in https://github.com/actions/checkout/pull/2248
* Persist creds to a separate file by @ericsciple in https://github.com/actions/checkout/pull/2286
* v6-beta by @ericsciple in https://github.com/actions/checkout/pull/2298
* update readme/changelog for v6 by @ericsciple in https://github.com/actions/checkout/pull/2311


**Full Changelog**: https://github.com/actions/checkout/compare/v5.0.0...v6.0.0

##### v6.0.1 (2025-12-02)
## What's Changed
* Update all references from v5 and v4 to v6 by @ericsciple in https://github.com/actions/checkout/pull/2314
* Add worktree support for persist-credentials includeIf by @ericsciple in https://github.com/actions/checkout/pull/2327
* Clarify v6 README by @ericsciple in https://github.com/actions/checkout/pull/2328


**Full Changelog**: https://github.com/actions/checkout/compare/v6...v6.0.1

##### v6.0.2 (2026-01-09)
## What's Changed
* Add orchestration_id to git user-agent when ACTIONS_ORCHESTRATION_ID is set by @TingluoHuang in https://github.com/actions/checkout/pull/2355
* Fix tag handling: preserve annotations and explicit fetch-tags by @ericsciple in https://github.com/actions/checkout/pull/2356

**Full Changelog**: https://github.com/actions/checkout/compare/v6.0.1...v6.0.2

##### v6.0.3 (2026-06-02)
## What's Changed
* Update changelog by @ericsciple in https://github.com/actions/checkout/pull/2357
* fix: expand merge commit SHA regex and add SHA-256 test cases by @yaananth in https://github.com/actions/checkout/pull/2414
* Fix checkout init for SHA-256 repositories by @yaananth in https://github.com/actions/checkout/pull/2439
* Update changelog for v6.0.3 by @yaananth in https://github.com/actions/checkout/pull/2446

## New Contributors
* @yaananth made their first contribution in https://github.com/actions/checkout/pull/2414

**Full Changelog**: https://github.com/actions/checkout/compare/v6...v6.0.3

##### v6.1.0 (2026-07-20)
## What's Changed
* **[BREAKING]** backport `allow-unsafe-pr-checkout` to v6 by @aiqiaoy in https://github.com/actions/checkout/pull/2500
* backport fixes to releases-v6 by @aiqiaoy in https://github.com/actions/checkout/pull/2527

https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/ for more details about this breaking change

**Full Changelog**: https://github.com/actions/checkout/compare/v6.0.3...v6.1.0

##### v7.0.0 (2026-06-18)
## What's Changed
* block checking out fork pr for pull_request_target and workflow_run by @aiqiaoy in https://github.com/actions/checkout/pull/2454
* Bump actions/publish-immutable-action from 0.0.3 to 0.0.4 in the minor-actions-dependencies group across 1 directory by @dependabot[bot] in https://github.com/actions/checkout/pull/2458
* Bump flatted from 3.3.1 to 3.4.2 by @dependabot[bot] in https://github.com/actions/checkout/pull/2460
* Bump js-yaml from 4.1.0 to 4.2.0 by @dependabot[bot] in https://github.com/actions/checkout/pull/2461
* Bump @actions/core and @actions/tool-cache and Remove uuid by @dependabot[bot] in https://github.com/actions/checkout/pull/2459
* upgrade module to esm and update dependencies by @aiqiaoy in https://github.com/actions/checkout/pull/2463
* Bump the minor-npm-dependencies group across 1 directory with 3 updates by @dependabot[bot] in https://github.com/actions/checkout/pull/2462
* getting ready for checkout v7 release by @aiqiaoy in https://github.com/actions/checkout/pull/2464
* update error wording by @aiqiaoy in https://github.com/actions/checkout/pull/2467

## New Contributors
* @aiqiaoy made their first contribution in https://github.com/actions/checkout/pull/2454

**Full Changelog**: https://github.com/actions/checkout/compare/v6.0.3...v7.0.0

##### v7.0.1 (2026-07-20)
## What's Changed
* skip running unsafe pr check if input is default by @aiqiaoy in https://github.com/actions/checkout/pull/2518
* trim only ascii whitespace for branch by @aiqiaoy in https://github.com/actions/checkout/pull/2521
* escape values passed to --unset by @aiqiaoy in https://github.com/actions/checkout/pull/2530
* Various dependency updates 

**Full Changelog**: https://github.com/actions/checkout/compare/v7...v7.0.1

