# Review — tests (step 6), #209: the file table's listing failure wording (2026-10-08)

Case: e2e "a skill package removed after the scan: the file table shows the toast's wording in both
skill lists (#209)" — the only test added or changed.

## Dimension 1 — coverage: no finding

- A11 / H10 (the expanded area's wording): driven in both lists. The input that reaches the failure
  branch is the package directory removed between the scan and the expand, which makes the main
  process throw `skill-package-unavailable` — a real failure path, not a forged state.
- Both callers carry their own copy of the line, so both halves are needed: the Skills-tab half went
  red on the unfixed code; the plugin half was proven separately by reverting only PluginSkillList
  (red at the plugin area's table, restored from a backup copy).
- A11's no-second-toast rule keeps its documented gap; this change does not touch it.
- Fixture: the home layout (skills dir, plugin package, installed_plugins.json, settings.json) follows
  the suite's existing real-shaped fixtures.

## Dimension 2 — case design: no finding

Drives the public UI; asserts rendered text only; no mocks. The env and filesystem are the only
inputs.

## Dimension 3 — false greens: two points examined

- The expected text is read from the toast, which uses the same function as the table. A regression
  of `errorText` itself would move both alike; the table's `not.toContainText('Error invoking remote
  method')` and the toast's `toContainText('Listing failed: ')` catch that case.
- In the plugin half `.toast` `.last()` may still be the first half's toast (same error, same
  sentence), so the plugin half does not independently prove a second toast appeared. That is not what
  the case pins; its table assertion is the one proven effective by the plugin-only revert.
