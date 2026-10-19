# Test review — ticket #239

Ticket: [#239 Launch v0.1.0-beta: the first pre-release, the live landing page and the README](https://github.com/aloong-planet/agentshed/issues/239)
· feature `macos-release-line` · specs [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md)

## Design review

- Date: 2026-10-19
- Version: implementation starts from bedc384 (`origin/main`), branch `feat/launch-beta`
- Scope: every verification this ticket plans. It writes or changes no test: the change is a version string, the
  READMEs' copy and documents, and the release itself, which only real runs and checks can show

### Test design table

No new or changed test. Each unit's behaviour either has its test already or is shown only by a real run:

| What changes | Why no test is written | What verifies it |
|---|---|---|
| The package version 0.1.0-beta | Consumed by code whose tests already cover a pre-release version: the tag check (`release-tag.test.mjs`: `v0.1.0-beta.2` against `0.1.0-beta.2`, and the mismatches), the updater's channel (`update-source.test.ts`: `0.1.0-beta` allows pre-releases), the run-version record. A test of the literal in `package.json` would only restate it | The tag check run by hand (accepts `v0.1.0-beta`, refuses `v0.1.0`); the verification run and the tag's run, whose tag check fails before Apple on a mismatch (Failure A1) |
| The READMEs' instructions | Copy. Its languages are a gate's subject, not a test's | `check:lang` (each README in its own language), shown red under a planted Han word |
| The landing-page feature entry, the specs' Pending notes, the specs index | Documents | Step 8's cross-regression |
| The first pre-release | Only a release tag exercises Apple, GitHub and the published files end to end (`macos-signing.md` §9) | The verification run on the branch, the tag's run, the independent check of the downloaded artifacts (§7), the live page read in a browser, the first launch from a browser download |

### Coverage

| Unit | Mechanism |
|---|---|
| mac-distribution::US-001/AC-01 | Evidence: a browser download of the published DMG, opened, dragged, launched; a screenshot of the notice's wording (Failure D1) |
| mac-distribution::US-001/AC-02 | Gate: the asset validates the `.app`'s stapled ticket; Evidence: the first launch with the network off |
| mac-distribution::US-001/AC-03 | Gate: the DMG gate (stapler, hdiutil, spctl); Evidence: the independent check of the downloaded DMG |
| mac-distribution::US-002/AC-02 | Test: the static workflow test (existing); Evidence: the `v0.1.0-beta` run and its release (Pre-release, nothing on R2, no pointer) |
| mac-distribution::US-003/AC-01 | Gate: `check:lang`; Evidence: the README change in the release change |
| mac-distribution::REQ-001/AC-04 | Evidence: the packaged app's `LSMinimumSystemVersion` (12.0); the README and the page say macOS 12 or later |
| mac-distribution::REQ-005 | Evidence: the published note, written only after the gates and the independent check |
| mac-distribution::REQ-006 | Evidence: the tagged commit's package version |
| landing-page::REQ-001/AC-05 | Test: the site's unit tests (no version constant; existing); Evidence: the live page offers `v0.1.0-beta` with no site change |
| landing-page::CON-001 | Evidence: the live URL serving the site's build |
| The spec headers' Pending notes | Evidence: the landing-page entry and the specs index; mac-distribution's resolved by the owner's choice |

Conclusion: every unit has a mechanism; the gaps are the real runs, which come after the merge.

### Case design

No case is written, so there is nothing to judge here.

Conclusion: not applicable.

### False greens (judged from the design)

The instruments are command-line and browser checks, judged by `review-code/false-greens.md`:

- `spctl --assess` succeeds online whether or not a ticket is stapled, and `codesign` ignores tickets: the stapled
  tickets are decided by `stapler validate`, on the DMG and on the `.app` inside it and inside the ZIP (§7).
- The served HTML is in the list state by design (landing-page::REQ-001/AC-04): reading it with `curl` cannot show
  the test state. The live page is read in a browser after its script ran, the hero's text read back from the page.
- A first launch from Terminal (`open`) or of an app without the quarantine attribute shows no notice at all: the
  launch evidence comes from a browser download, opened from Finder.
- The verification run cannot show publishing: the publish job does not run in that tier (C4). Only the tag's run
  shows the release, its Pre-release mark and the untouched R2.
- `check:lang` was shown to read the READMEs: a planted Han word turns it red at that line.

Conclusion: no finding; each instrument has the input that would turn it red named.

### Resource reuse

No expensive resource: no test runs here.

Conclusion: no finding.
