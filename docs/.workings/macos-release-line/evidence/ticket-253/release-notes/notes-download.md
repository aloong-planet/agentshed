##### v5.0.0 (2025-08-05)
## What's Changed
* Update README.md by @nebuk89 in https://github.com/actions/download-artifact/pull/407
* BREAKING fix: inconsistent path behavior for single artifact downloads by ID by @GrantBirki in https://github.com/actions/download-artifact/pull/416

## v5.0.0

### 🚨 Breaking Change

This release fixes an inconsistency in path behavior for single artifact downloads by ID. **If you're downloading single artifacts by ID, the output path may change.**

#### What Changed

Previously, **single artifact downloads** behaved differently depending on how you specified the artifact:

- **By name**: `name: my-artifact` → extracted to `path/` (direct)
- **By ID**: `artifact-ids: 12345` → extracted to `path/my-artifact/` (nested)

Now both methods are consistent:

- **By name**: `name: my-artifact` → extracted to `path/` (unchanged)
- **By ID**: `artifact-ids: 12345` → extracted to `path/` (fixed - now direct)

#### Migration Guide

##### ✅ No Action Needed If:

- You download artifacts by **name**
- You download **multiple** artifacts by ID
- You already use `merge-multiple: true` as a workaround

##### ⚠️ Action Required If:

You download **single artifacts by ID** and your workflows expect the nested directory structure.

**Before v5 (nested structure):**

```yaml
- uses: actions/download-artifact@v4
  with:
    artifact-ids: 12345
    path: dist
# Files were in: dist/my-artifact/
```

> Where `my-artifact` is the name of the artifact you previously uploaded

**To maintain old behavior (if needed):**

```yaml
- uses: actions/download-artifact@v5
  with:
    artifact-ids: 12345
    path: dist/my-artifact  # Explicitly specify the nested path
```

## New Contributors
* @nebuk89 made their first contribution in https://github.com/actions/download-artifact/pull/407

**Full Changelog**: https://github.com/actions/download-artifact/compare/v4...v5.0.0

##### v6.0.0 (2025-10-24)
## What's Changed

**BREAKING CHANGE:** this update supports Node `v24.x`. This is not a breaking change per-se but we're treating it as such.

* Update README for download-artifact v5 changes by @yacaovsnc in https://github.com/actions/download-artifact/pull/417
* Update README with artifact extraction details by @yacaovsnc in https://github.com/actions/download-artifact/pull/424
* Readme: spell out the first use of GHES by @danwkennedy in https://github.com/actions/download-artifact/pull/431
* Bump `@actions/artifact` to `v4.0.0`
* Prepare `v6.0.0` by @danwkennedy in https://github.com/actions/download-artifact/pull/438

## New Contributors
* @danwkennedy made their first contribution in https://github.com/actions/download-artifact/pull/431

**Full Changelog**: https://github.com/actions/download-artifact/compare/v5...v6.0.0

##### v7.0.0 (2025-12-12)
## v7 - What's new

> [!IMPORTANT]
> actions/download-artifact@v7 now runs on Node.js 24 (`runs.using: node24`) and requires a minimum Actions Runner version of 2.327.1. If you are using self-hosted runners, ensure they are updated before upgrading.
### Node.js 24

This release updates the runtime to Node.js 24. v6 had preliminary support for Node 24, however this action was by default still running on Node.js 20. Now this action by default will run on Node.js 24.

## What's Changed
* Update GHES guidance to include reference to Node 20 version by @patrikpolyak in https://github.com/actions/download-artifact/pull/440
* Download Artifact Node24 support by @salmanmkc in https://github.com/actions/download-artifact/pull/415
* fix: update @actions/artifact to fix Node.js 24 punycode deprecation by @salmanmkc in https://github.com/actions/download-artifact/pull/451
* prepare release v7.0.0 for Node.js 24 support by @salmanmkc in https://github.com/actions/download-artifact/pull/452

## New Contributors
* @patrikpolyak made their first contribution in https://github.com/actions/download-artifact/pull/440
* @salmanmkc made their first contribution in https://github.com/actions/download-artifact/pull/415

**Full Changelog**: https://github.com/actions/download-artifact/compare/v6.0.0...v7.0.0

##### v8.0.0 (2026-02-26)
## v8 - What's new

> [!IMPORTANT]
> actions/download-artifact@v8 has been migrated to an ESM module. This should be transparent to the caller but forks might need to make significant changes.

> [!IMPORTANT]
> Hash mismatches will now error by default. Users can override this behavior with a setting change (see below).

### Direct downloads

To support direct uploads in `actions/upload-artifact`, the action will no longer attempt to unzip all downloaded files. Instead, the action checks the `Content-Type` header ahead of unzipping and skips non-zipped files. Callers wishing to download a zipped file as-is can also set the new `skip-decompress` parameter to `true`.

### Enforced checks (breaking)

A previous release introduced digest checks on the download. If a download hash didn't match the expected hash from the server, the action would log a warning. Callers can now configure the behavior on mismatch with the `digest-mismatch` parameter. To be secure by default, we are now defaulting the behavior to `error` which will fail the workflow run.

### ESM

To support new versions of the @actions/* packages, we've upgraded the package to ESM.

## What's Changed
* Don't attempt to un-zip non-zipped downloads by @danwkennedy in https://github.com/actions/download-artifact/pull/460
* Add a setting to specify what to do on hash mismatch and default it to `error` by @danwkennedy in https://github.com/actions/download-artifact/pull/461


**Full Changelog**: https://github.com/actions/download-artifact/compare/v7...v8.0.0

##### v8.0.1 (2026-03-11)
## What's Changed

* Support for CJK characters in the artifact name by @danwkennedy in https://github.com/actions/download-artifact/pull/471
* Add a regression test for artifact name + content-type mismatches by @danwkennedy in https://github.com/actions/download-artifact/pull/472

**Full Changelog**: https://github.com/actions/download-artifact/compare/v8...v8.0.1

##### v8.0.2 (2026-10-07)
## What's Changed
* Update the readme by @danwkennedy in https://github.com/actions/download-artifact/pull/473
* Improves artifact download retries when the service returns HTTP 429 (rate limiting), including honoring valid Retry-After headers.
* Update @actions/artifact to 6.3.1 by @tunc-d in https://github.com/actions/download-artifact/pull/492
* Prepare download-artifact v8.0.2 by @tunc-d in https://github.com/actions/download-artifact/pull/493

## New Contributors
* @tunc-d made their first contribution in https://github.com/actions/download-artifact/pull/492

**Full Changelog**: https://github.com/actions/download-artifact/compare/v8.0.1...v8.0.2

