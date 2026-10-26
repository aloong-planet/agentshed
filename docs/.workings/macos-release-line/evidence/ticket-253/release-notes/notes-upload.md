##### v5.0.0 (2025-10-24)
## What's Changed

**BREAKING CHANGE:** this update supports Node `v24.x`. This is not a breaking change per-se but we're treating it as such.

* Update README.md by @GhadimiR in https://github.com/actions/upload-artifact/pull/681
* Update README.md by @nebuk89 in https://github.com/actions/upload-artifact/pull/712
* Readme: spell out the first use of GHES by @danwkennedy in https://github.com/actions/upload-artifact/pull/727
* Update GHES guidance to include reference to Node 20 version by @patrikpolyak in https://github.com/actions/upload-artifact/pull/725
* Bump `@actions/artifact` to `v4.0.0`
* Prepare `v5.0.0` by @danwkennedy in https://github.com/actions/upload-artifact/pull/734

## New Contributors
* @GhadimiR made their first contribution in https://github.com/actions/upload-artifact/pull/681
* @nebuk89 made their first contribution in https://github.com/actions/upload-artifact/pull/712
* @danwkennedy made their first contribution in https://github.com/actions/upload-artifact/pull/727
* @patrikpolyak made their first contribution in https://github.com/actions/upload-artifact/pull/725

**Full Changelog**: https://github.com/actions/upload-artifact/compare/v4...v5.0.0

##### v6.0.0 (2025-12-12)
## v6 - What's new

> [!IMPORTANT]
> actions/upload-artifact@v6 now runs on Node.js 24 (`runs.using: node24`) and requires a minimum Actions Runner version of 2.327.1. If you are using self-hosted runners, ensure they are updated before upgrading.
### Node.js 24

This release updates the runtime to Node.js 24. v5 had preliminary support for Node.js 24, however this action was by default still running on Node.js 20. Now this action by default will run on Node.js 24.

## What's Changed
* Upload Artifact Node 24 support by @salmanmkc in https://github.com/actions/upload-artifact/pull/719
* fix: update @actions/artifact for Node.js 24 punycode deprecation by @salmanmkc in https://github.com/actions/upload-artifact/pull/744
* prepare release v6.0.0 for Node.js 24 support by @salmanmkc in https://github.com/actions/upload-artifact/pull/745


**Full Changelog**: https://github.com/actions/upload-artifact/compare/v5.0.0...v6.0.0

##### v7.0.0 (2026-02-26)
## v7 What's new

### Direct Uploads

Adds support for uploading single files directly (unzipped). Callers can set the new `archive` parameter to `false` to skip zipping the file during upload. Right now, we only support single files. The action will fail if the glob passed resolves to multiple files. The `name` parameter is also ignored with this setting. Instead, the name of the artifact will be the name of the uploaded file.

### ESM

To support new versions of the `@actions/*` packages, we've upgraded the package to ESM.

## What's Changed
* Add proxy integration test by @Link- in https://github.com/actions/upload-artifact/pull/754
* Upgrade the module to ESM and bump dependencies by @danwkennedy in https://github.com/actions/upload-artifact/pull/762
* Support direct file uploads by @danwkennedy in https://github.com/actions/upload-artifact/pull/764

## New Contributors
* @Link- made their first contribution in https://github.com/actions/upload-artifact/pull/754

**Full Changelog**: https://github.com/actions/upload-artifact/compare/v6...v7.0.0

##### v7.0.1 (2026-04-10)
## What's Changed
* Update the readme with direct upload details by @danwkennedy in https://github.com/actions/upload-artifact/pull/795
* Readme: bump all the example versions to v7 by @danwkennedy in https://github.com/actions/upload-artifact/pull/796
* Include changes in typespec/ts-http-runtime 0.3.5 by @yacaovsnc in https://github.com/actions/upload-artifact/pull/797


**Full Changelog**: https://github.com/actions/upload-artifact/compare/v7...v7.0.1

##### v7.0.2 (2026-10-07)
## What's Changed
- Improves artifact download retries when the service returns HTTP 429 (rate limiting), including honoring valid Retry-After headers.
- Updates @actions/artifact to v6.3.1.


## New Contributors
* @tunc-d made their first contribution in https://github.com/actions/upload-artifact/pull/821

**Full Changelog**: https://github.com/actions/upload-artifact/compare/v7.0.1...v7.0.2

