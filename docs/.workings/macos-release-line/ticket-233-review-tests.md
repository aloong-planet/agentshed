# Test review — ticket #233

Ticket: [#233 Package through the electron-scaffold asset](https://github.com/aloong-planet/agentshed/issues/233)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-14
- Version: branch `feat/mac-packaging-asset` on 5911d52, uncommitted working tree
- Scope: the asset's tests as wired into the project (`pnpm test:scripts`, 51 cases), and the evidence runs in
  `evidence/ticket-233/`. The asset's tests are the asset's own; their design is reviewed in skillshed, so this
  review judges the wiring and the evidence, not the cases' design

## Coverage

| Item of #233 | Covered by |
|---|---|
| mac-distribution::US-001/AC-04 (default DMG look) | Evidence: the owner's screenshot of the mounted DMG's window ([evidence/ticket-233/dmg-window.png](evidence/ticket-233/dmg-window.png), the DMG built at 496287b): the app icon, the Applications link and electron-builder's default background with its arrow; earlier, the volume's contents and the default 540 × 380 window |
| mac-distribution::REQ-001/AC-01 (name and signing) | Evidence: `Agentshed-0.1.0-mac-arm64.dmg`; app and DMG signed by the Developer ID identity, Team ID, timestamp; the asset's gate asserted the same during the build |
| mac-distribution::REQ-001/AC-04 (declaration) | Evidence: `LSMinimumSystemVersion` 12.0 in the packaged app; Electron's framework `minos 12.0` |
| mac-distribution::CON-001 | Gate: the asset's tests in `pnpm verify`; Evidence: `cmp` of both copies against skillshed |
| mac-distribution::CON-003 (local) | Gate: the asset's certificate cases; Evidence: the run without an identity |
| mac-distribution::CON-005 | Gate: the frozen lockfile; Evidence: the resolved versions |
| mac-distribution::CON-006 | Evidence: no credential in the packaging logs; the local file untracked and ignored since #245 (`git check-ignore -v .env.local` → `.gitignore:18:.env*.local`) |
| mac-distribution::CON-007 | Evidence: the capability file read with a TOML parser |
| Failures A3, B2 | Gate: the asset's tests (leftover clearing; Invalid with a failing log fetch) |
| Failure E1 | Evidence: the run with Apple variables loaded (no submission) and the run without an identity |
| Failure E2 | Evidence: `scripts/check-fuses.mjs` on the packaged app, 7 of 7 |

Gaps, with their conditions:

- The DMG window: `screencapture` could not capture it without Screen Recording permission for this
  terminal. Closed on 2026-10-14 by the owner's screenshot (`evidence/ticket-233/dmg-window.png`).
- `pnpm dist:mac:release` never ran here (it submits to Apple with real credentials): first real run in #234's
  manual verification tier.

## Case design

Not judged here (the asset's cases are skillshed's). The wiring: the cases run on the project's copies, through
the project's script, in the gateway.

## False greens

- The wiring can fail: with the copy's certificate check mutated to pass with no identity, `pnpm test:scripts`
  went red (3 cases), naming the certificate cases; the copy was restored by copy and is byte-identical to the
  asset again.
- "No submission to Apple": the count of `notarytool`, `[mac] notarizing` and `afterSign` in the packaging log
  is 0 — over a log that does contain the build's own lines (`[mac] electron-vite build`, the signing line), so
  the search read the right file.
- Found and corrected in the evidence: the stapler's exit status was first read after a pipe in zsh, which left
  it empty; it was re-captured without a pipe (65, "does not have a ticket stapled"), and the record says so.
- The stand-in `security` (no identity) is a fake at the system boundary, named as such in the record; it shows
  the asset's behaviour when the keychain has no identity, not this Mac's keychain.

## Conclusion

The wiring is proven able to fail; the evidence covers #233's items, the DMG screenshot included since the
owner took it. The release profile's first real run stays with #234.
