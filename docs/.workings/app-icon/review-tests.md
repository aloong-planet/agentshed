# Application icon — interim verification review (2026-09-14)

## 1. Coverage

The existing complete gate passes: 708 unit tests, one existing skipped test, 78 e2e cases and smoke.
This establishes regression coverage only. It does not establish the icon's actual appearance;
asset alpha, native conversion, packaged bundle and visible Dock checks remain pending.

## 2. Design

No unit tests were added for a simple native setter/configuration change; such tests would mirror
implementation rather than verify macOS appearance. Existing e2e launches use isolated userData and
fixture homes. The real smoke launch uses its established isolation and orphan checks.

## 3. False greens

The missing-development-asset fallback currently prevents setIcon from running. Therefore a green
test run must not be cited as success-path icon evidence. `hasAlpha: no` on both preview PNGs is a
confirmed defect in the input deliverables, not a macOS rendering issue. Final verification must
inspect the processed assets and a fresh package, and exercise the development success path.

## Final review — 2026-09-14

### 1. Coverage

Every coverage unit has a final checklist entry. Source fidelity, alpha, all native icon sizes,
the packaged resource, the development success path from another cwd, missing-image fallback and
quiet mode were exercised. Full gate passed with the final assets. Actual packaged startup passed
on a temporary ad-hoc-signed copy; default unsigned distribution trust is not claimed. Dock screenshots
could not be obtained, so native API and NSWorkspace evidence are the stated boundary.

### 2. Design

No implementation-mirroring unit test was added. The temporary native observer forwards the exact
input to the real macOS setter, captures its image, and records actual visibility. NSWorkspace reads
the built application rather than merely reopening the source PNG. All process tests isolate userData.
The source images are actual user-approved inputs, not fabricated fixtures matching a guessed design.

### 3. False greens

The prior missing-image test run was not claimed as success-path evidence. The original source PNGs
are negative controls for alpha (both lacked it). The first native probe crashed and was rejected as
evidence. A blank sandboxed native render was likewise rejected despite command exit 0; the system
render is nonempty and visibly cyan. Bundle/source equality uses SHA-256, and decoded iconset files
were enumerated (ten), not sampled. RGBA fidelity checks compare bytes directly: Pillow's RGBA
`getbbox` can ignore RGB differences when the difference image has zero alpha, so that weaker check
was replaced and the intended assertion rerun successfully. No claim of a Dock screenshot, signing
or notarisation is derived from package success.

## 2026-09-14 — dark-background revision

- **Coverage:** six CLI cases cover real PNG and ICNS under new names, NUL source alongside valid art, renamed text in PNG and ICNS, unknown binary content, and escaped-NUL source. Image checks cover alpha extrema/corners, production RGB preservation, unchanged development bytes, all ten ICNS sizes and decoded 1024px equality. Small rendered images were inspected at 32/64/128px on light/dark backgrounds.
- **Case design:** tests use the real CLI in temporary Git repositories and real image fixtures, with no internal mocks or implementation-derived expected result. Gate exit status and offender names are the public contract. All temporary test repositories are removed in finally.
- **False greens:** the acceptance case failed against the old gate for the exact three real binary fixtures, then passed after the predicate change. Negative cases actually returned failure for source NULs and fake image text; escaped source passed. The tests deliberately do not claim image decodability from signatures, Dock appearance from resource existence, or new package notarization. User must restart dev to see the new live Dock icon.
