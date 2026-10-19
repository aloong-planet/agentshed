# Code review — ticket #239

Ticket: [#239 Launch v0.1.0-beta: the first pre-release, the live landing page and the README](https://github.com/aloong-planet/agentshed/issues/239)
· feature `macos-release-line` · specs [mac-distribution](../../specs/mac-distribution.md),
[landing-page](../../specs/landing-page.md)

- Date: 2026-10-19
- Version: branch `feat/launch-beta`, commit 5b63b16 on bedc384, plus two uncommitted corrections found here
  (below)
- Scope: the release change before the tag — the package version, the six READMEs' download and install
  instructions, the landing-page feature entry and the catalogue index, the two specs' headers and Out of Scope,
  the specs index. The release itself (the tag's run, the published files and note) is reviewed when it exists

## Underlying premises

| Premise | How established |
|---|---|
| The version `0.1.0-beta` passes the tag check for `v0.1.0-beta` and fails it for any other tag | run as the workflow runs it (`GITHUB_REF_NAME=v0.1.0-beta node scripts/release-tag.mjs`: exit 0; `v0.1.0`: exit 1, naming the expected tag) |
| The rest of the release line takes a pre-release version as it is | read: the asset names the DMG and the ZIP `${productName}-${version}-mac-${arch}`, the publish step's version check is `-<version>-mac-`, the workflow marks a tag a pre-release by a `-` after the version, and the updater allows pre-releases for a `-beta` version (its unit test) |
| The version string goes through Apple's notarization and every gate | measured by the manual verification run on this branch (Runnability below) |
| The READMEs' requirements are true of the app | macOS 12: the packaged app's `LSMinimumSystemVersion` is 12.0 (#235's verification run, `evidence/ticket-235/verification-run.txt`); Apple Silicon: arm64 only (ADR-0031). The notice's wording is the one `macos-signing.md` §7 and Failure D1 name; the first launch's screenshot evidences it after the release |
| The landing-page entry's statements are the page's behaviour | each traced to the landing-page spec's user-visible requirements, which #237 and #238 verified in a browser on the built site (the coverage checklist's rows for them); the page serves the list state today (`curl`) |
| The links the READMEs add resolve | `curl -L` on the three URLs: 200 each |

Two findings, both corrected (documents only):

1. The mac-distribution spec's new Out of Scope entry gave the reason "the feature catalogue describes the app
   itself", while the same change adds the landing page, a website, to the catalogue. The reason is narrower: the
   catalogue leaves distribution out. Rewritten to say that.
2. The feature catalogue's README did not state that rule, so the spec cited a rule its reader could not find in the
   project. The README's content rules now say distribution is not catalogued, and that the README tells users how
   to install.

Conclusion: two findings, corrected; one premise (the version through Apple) left to the verification run.

## Runnability

Filled in after the verification run and the gateway (below).

## Security

No secret, credential or new network path: the change is text and a version string. The READMEs link only to the
landing page and the repository's release list, over HTTPS.

Conclusion: no finding.

## Consistency

- Class-level: the six READMEs are one contract (mac-distribution's Implementation Decision on the README). Each was
  checked mechanically for every element of it: the landing page link, the release list link, "macOS 12", Apple
  Silicon, dragging to Applications in the language's own folder name, the notice, the Open button, three steps,
  and no version anywhere. All six carried all of them. The French, Spanish, Russian and Japanese READMEs were then
  returned to main's text, since #277 removes them (the owner's decision of 2026-10-19); the Chinese and English
  ones keep the section.
- Against the landing page: the same requirements ("macOS 12 or later", Apple Silicon) and the same three steps in
  the same order; the READMEs leave out the update button, which the spec does not ask them to state.
- The specs index's one-to-one rule now names its exception, and its two rows agree with the specs' headers.
- Smells: none applies to text.

Conclusion: no finding beyond the two above.

## Refactoring list

None.

## Findings outside this ticket's change

None.
