# Review — tests (step 6), unit tests without the real electron package

Date: 2026-10-08 · Scope: the verification of a test-infrastructure change; no new test cases. Every run
below starts from a fresh state: `node_modules/electron/dist`, `path.txt` and the quiet copy deleted.

## Dimension 1 — coverage

| Run | Expected | Got |
|---|---|---|
| Unit tests, before the change | the race | 3 downloads, one test file failed to load (`File exists`); the loser varies between runs |
| Unit tests, stub applied | no download | 0 downloads, 725 passed, `dist/` still absent |
| e2e, stub applied, setup unchanged | fails at the copy step | exit 1: "cannot find node_modules/electron/dist/version" |
| e2e, stub + setup change | one download, green | 1 download in the setup, copy built, 89 passed |
| Stub probe: import of an unexported name | `undefined`, no error | `undefined` |

Plus `typecheck`, `lint`, `check:ui`, `check:lang`, `check:i18n`, `check:nul`: all 0.

**Gap:** the CI checks job has not yet run with this change (it will on this pull request); there it
should no longer download Electron during `pnpm test`.

## Dimension 2 — case design

The race is environmental and not reproducible as a unit test; the evidence is the fresh-state runs
above, each with its exit code taken directly and the download count read from the output.

## Dimension 3 — false greens

- One intermediate run was **invalid** and is recorded as such: the config write had failed, so the unit
  tests ran without the stub, reproduced the race, and installed `dist/` as a side effect — the e2e run
  that followed passed only because of that. The state was reset and both runs repeated; the results in
  the table are from the repeated runs.
- "No download" is read from the output and cross-checked by `dist/` still being absent afterwards — two
  independent observations of the same fact.
