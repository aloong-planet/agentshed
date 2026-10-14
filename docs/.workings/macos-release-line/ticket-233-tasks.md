# Ticket #233 — task list

Package through the electron-scaffold asset. Working record, not a requirement authority (the spec is
`docs/specs/mac-distribution.md`). Checkpoints are what proves each step done.

| # | Task | Checkpoint | State |
|---|---|---|---|
| 1 | Copy the asset and its tests into `build/`, unmodified, from skillshed's HEAD | `cmp` against skillshed | done: identical to skillshed HEAD (280b789 for the script) and to its working tree |
| 2 | `electron-builder.yml`: the fixed DMG name, `minimumSystemVersion: '12.0'`, comments | the asset's run-time check passes; Info.plist | done: Info.plist 12.0; the asset run-time check passed; `dmg.sign: true` added after the first run failed on an unsigned DMG |
| 3 | electron-builder 26.17.0 | lockfile; resolved version | done: electron-builder 26.17.0 → app-builder-lib 26.17.0; the Windows-only squirrel peer stays 26.15.3, as in Transfer's verified lockfile |
| 4 | Scripts: `dist:mac:local`, `dist:mac:release`, `test:scripts` runs the asset tests; retire `scripts/check-mac-identity.mjs` and its tests | `pnpm test:scripts` | done: 51 asset tests pass; a mutation of the copy's certificate check turned 3 red, restored and identical again; the retired script imported only Node built-ins (no orphans) |
| 5 | `capabilities.toml`: `macos-distribution` enabled, source, gate, two profiles (registry format) | read with a TOML parser | done |
| 6 | Local packaging with fake Apple credentials loaded: signed, never submitted; DMG name; signature; minimum macOS; fuses; the DMG window | command outputs, screenshot | done: evidence/ticket-233/local-packaging.txt (no submission with Apple variables loaded; name; both signatures; minimum 12.0, Electron framework minos 12.0; fuses 7/7; the DMG contents and default window); the screenshot, which this terminal could not take, came from the owner (evidence/ticket-233/dmg-window.png) |
| 7 | Local packaging without an identity fails before building | command output | done: a stand-in `security` reporting no identity → exit 1 with the install hint, nothing built |
| 8 | Runbook `docs/ops/mac-signing.md` | review against the policy | done |
| 9 | Full verification gateway | `pnpm verify` exit 0 | done: `pnpm verify` exit 0 (after leaving the two copies out of lint); check:lang and check:nul rerun after the last doc edits, 0 |
| 10 | Step 5 /review-code, step 6 /review-tests, spec final check, step 7, step 8 | records | done: review records written; spec Implementation Decisions written back; step 8 skipped by its two questions (no feature entry states anything this changes; the mac-distribution entry is written with the first release, #239) |
| 11 | Document sync, PR, stop for the owner | PR link | done: PR #244; CI green (run 38444583938) |
| 12 | After #243 merged: merge main into the branch (no force push), check the lockfile, re-verify, package again | `pnpm install --frozen-lockfile`; `pnpm verify`; packaging evidence | done: merged without conflicts (496287b); the frozen install passed (electron-updater 6.8.9, electron-builder 26.17.0); `pnpm verify` exit 0; `dist:mac:local` signed and gated the app with the updater inside (evidence/ticket-233/local-packaging-merged.txt) |
| 13 | The two asset findings to skillshed (the owner chose a comment on zhoulf1006/skillshed#18) | comment link | done: https://github.com/zhoulf1006/skillshed/issues/18#issuecomment-6162295063 |
| 14 | After #245 merged: merge main again; the runbook's Pending note becomes plain text; CON-006 and the DMG screenshot checked on #233 | `git check-ignore`; the screenshot file; CI | done: main merged (ddc3c2a); `.env.local` untracked and ignored; the runbook and the records updated |
