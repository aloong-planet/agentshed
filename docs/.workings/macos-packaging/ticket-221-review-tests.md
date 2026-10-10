# Review — tests (step 6), ticket aloong-planet/agentshed#221

- Date: 2026-10-10
- Version: branch `fix/local-mac-signing`, commit 592a9c8 plus the step-5 review fix
- Scope: `scripts/check-mac-identity.test.mjs` (6 cases, run by `pnpm test:scripts` inside `verify`), and
  the gate it adds to `pnpm dist:mac:local`
- Review path: see `ticket-221-review-code.md` (tracker ticket, `docs/.workings/macos-packaging/`).

## Dimension 1 — coverage

| Requirement (ticket #221) | Covered by | Input that reaches it |
|---|---|---|
| A Developer ID Application identity among others is accepted | parser: "finds the Developer ID…"; CLI: "passes when…" | real-shape output with Developer ID, Apple Development and Apple Distribution lines |
| Other identity kinds do not count | parser: "other identity kinds…" | development, distribution and Developer ID **Installer** lines only |
| No identity → error with guidance | CLI: "fails with install guidance…" | stub printing two non-Developer-ID identities |
| A failed keychain query is an error, not "none" | CLI: "fails when the keychain query itself fails…" | stub exiting 2 with an error line |
| The gate stops the build | manual run of `pnpm dist:mac:local` with the same stub first on PATH: exit 1, vite and electron-builder never ran, the existing DMG's mtime unchanged | — |
| The package is signed with Developer ID and launches | manual, see review-code ② | — |

- Fixture shape comes from the real `security find-identity -v -p codesigning` output on this machine,
  including the mixed identity kinds that the first fixture design would have missed.
- **Gaps (not automatable here):**
  - Signing and launching a real package needs the Developer ID certificate, so it was verified by hand
    on a machine that has it (review-code ②). Re-check by hand whenever the packaging configuration
    changes.
  - "Credentials present → electron-builder still does not notarise" rests on `notarizeIfProvided`
    returning on `notarize === false` before reading any credentials, plus the build log's "skipped macOS
    notarization … set explicitly `false`". No run with real Apple credentials in the environment.

## Dimension 2 — case design

No mocks of project modules. The only stand-in is the external `security` command, through a stub first
on PATH, and the cases assert the CLI's exit status and message. Each case creates its own temporary
directory.

## Dimension 3 — false greens

- The first red failed for a missing module, which is not the failure these cases guard, so validity was
  established by mutation:
  - accepting any identity name turned 3 cases red, all asserting which identities count;
  - treating a failed query as "none" turned exactly the query-failure case red.

  Both mutations were applied to the working file and restored from a copy.
- The test run's count was read from the reporter output (`tests 6, pass 6`), because node's default
  spec reporter does not print the TAP lines a first check grepped for.
