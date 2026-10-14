# Code review — ticket #233

Ticket: [#233 Package through the electron-scaffold asset](https://github.com/aloong-planet/agentshed/issues/233)
· feature `macos-release-line` · spec [mac-distribution](../../specs/mac-distribution.md)

- Date: 2026-10-14
- Version: branch `feat/mac-packaging-asset` on 5911d52, uncommitted working tree
- Scope: the copied asset and its tests (as an integration, not a review of the asset itself — that is
  skillshed's), `electron-builder.yml`, `package.json` scripts and the electron-builder upgrade, the lockfile,
  `capabilities.toml`, the lint configuration, the retired identity script and its tests, the runbook and the
  spec write-back

## Underlying premises

- The asset's own requirements, read from its header, plus the policy (`macos-signing.md` §0–§9, read in full):
  checked against the configuration. Holds, with one gap below.
- **Not holding (found by a real run, fixed)**: the asset's header lists the dmg target, the output directory,
  `mac.notarize: false` and the DMG name as the configuration it needs; it does not list `dmg.sign: true`.
  electron-builder leaves DMGs unsigned without it, and the asset's gate then failed the first local packaging
  after the full build ("code object is not signed at all"). The configuration now sets it (Transfer's does
  too). The header's list is the asset's to fix — see the destination below.
- electron-builder 26.17.0: the lockfile resolves `electron-builder` 26.17.0 on `app-builder-lib` 26.17.0; the
  Windows-only squirrel peer stays at 26.15.3 with its own app-builder-lib, the same shape as Transfer's lockfile,
  which passed real notarizations. Holds.
- The minimum macOS: the app declares 12.0, and Electron 43.2.0's framework is built for 12.0 (`vtool`
  `minos 12.0`), so the declaration matches the runtime's floor, as the spec says. Holds.
- Hardened runtime, the precondition for notarization (policy §2): the signed app's CodeDirectory carries the
  runtime flag. Holds; the entitlements are electron-builder's defaults and are first judged by Apple in #234's
  verification run.
- Comments that state causes: "electron-builder leaves DMGs unsigned otherwise" and "the asset fails a
  packaging whose DMG is unsigned" — both observed in the failed run. The others restate the asset's header or
  the policy.

## Runnability

- `pnpm dist:mac:local`: ran end to end through the asset — one builder call, the app and the DMG signed with
  the Developer ID identity, no notarization attempted with three Apple variables loaded
  (`evidence/ticket-233/local-packaging.txt`).
- Without an identity: a stand-in `security` reporting none → the asset stopped before building, with the
  install hint, exit 1.
- `pnpm dist:mac:release`: not run here — it submits to Apple and needs the owner's credentials. Its order and
  failure paths are the asset's tests; its first real run is #234's manual verification tier. Gap stated.
- The lint failed on the two copies (three findings in the asset's own code). They are not edited here
  (mac-distribution::CON-001); the copies are left out of the project's lint by exact file name, and the
  findings go to the asset. Escape surface: none for the product — lint does not run in packaging.
- The retired script imported only Node built-ins: no orphan left.

## Security

- Credentials: the asset passes the Apple password to `notarytool` as an argument (visible in the process
  list while it runs, not in logs) and prints no credential in its errors (it prints a failed command's
  output, never its arguments). The evidence used placeholders, not real values.
- **Not holding yet**: CON-006 says credentials live locally in an untracked environment file. `.env.local` is
  tracked in this repository today; the change that stops tracking it (branch `fix/untrack-env-local`) waits
  for the owner's npm password rotation. The runbook says so and keeps signing credentials out of it until
  then. This is the owner's pending action, not this ticket's change.

## Consistency

- The capability declaration follows the registry's format (fields, the two fixed sub-tables), read back with
  a TOML parser.
- The runbook holds this project's values and cites the policy by section rather than copying it.
- The CI workflow's comment that the macOS surface is guarded by "local verify and the release process" stays
  true; the release workflow is #234's.
- Smells: none in the changed configuration and scripts.

Class-level check, "a configuration the asset's gate depends on but its header does not list": the gate's
checks against the header — the dmg target and arch list (listed), the output directory (listed), the DMG
name (listed), `mac.notarize: false` (listed), the app signature (the certificate, listed), the stapled app
(release; the hook, listed), the DMG signature (**not listed**). One instance.

## Findings outside this change

| Finding | Impact | Suggested | Destination |
|---|---|---|---|
| The asset's header omits `dmg.sign: true`, and the asset does not check it before building | Every project adopting the asset hits a failed packaging after a full build (minutes), as this one did | Add it to the header's list and to the run-time configuration check | The owner chose a comment on zhoulf1006/skillshed#18 (2026-10-14): [posted](https://github.com/zhoulf1006/skillshed/issues/18#issuecomment-6162295063) |
| The asset's code has three findings under this project's lint (`preserve-caught-error` in the YAML loader; two unused variables in its tests) | None at run time; they are why the copies are not linted here | Fix in the asset | Same comment |

## Conclusion

One bug in this change fixed (the unsigned DMG, by configuration), one gap stated (`dist:mac:release` runs first
in #234), one pending owner action (`.env.local`), and two asset findings for skillshed, posted on
zhoulf1006/skillshed#18 as the owner chose.
