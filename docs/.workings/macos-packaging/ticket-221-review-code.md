# Review — code (step 5), ticket aloong-planet/agentshed#221

- Date: 2026-10-10
- Version: branch `fix/local-mac-signing`, commit 592a9c8 plus the review fix below
- Scope: `scripts/check-mac-identity.mjs` (new), `electron-builder.yml` (mac block), `package.json`
  (`dist:mac` → `dist:mac:local`, `test:scripts`, `verify`), `capabilities.toml` (`macos-distribution`)
- Review path: tracker ticket without a feature checklist; artifacts under `docs/.workings/macos-packaging/`
  with the `ticket-221-` prefix (code review, test review, document sync checklist).

## ① Underlying premises — one finding, fixed

- "electron-builder skips signing without failing when it finds no identity": shown by the previous
  build (`identity: null`) and by app-builder-lib 26.15.3's `sign()` returning false when no identity is
  found. Holds.
- "electron-builder notarises on its own whenever Apple credentials are present": `notarizeIfProvided`
  skips only on an explicit `notarize: false`. Holds; the yml comment states it.
- **Finding (comment attributed the wrong cause):** the check's comment said `-p codesigning` keeps an
  identity with a broken trust chain out. In app-builder-lib `macCodeSign.js` the valid-only filter comes
  from `-v`; electron-builder queries both `find-identity -v` and `find-identity -v -p codesigning` and
  takes the union. The comment now attributes the filtering to `-v`, as electron-builder does. Self-harm
  only (a misleading comment); fixed.

## ② Runnability — one finding, fixed

- A failed `security` call (non-zero status or spawn error) is an error with its own message, never read
  as "no identity": tested.
- **Finding (claim the script cannot back):** the success line said "signing with <identity>", but which
  identity signs is electron-builder's choice; with several Developer ID identities the line could name
  the wrong one. It now prints every identity found. Fixed.
- The real package built with `pnpm dist:mac:local`: Authority Developer ID Application, Team
  RHQ28XS7D9, `codesign --verify --deep --strict` passes, `check-fuses.mjs` passes, and the app stays up
  after 10 s when launched with an isolated `--user-data-dir` (41 files written there, the real userData
  unchanged). The pre-fix package on disk failed `codesign --verify` and was killed at launch (exit 137).

## ③ Security — no finding

No secret is read or printed; the check only lists identity names. Tests use a stub on a temporary PATH.

## ④ Consistency — no finding

- `dist:mac` had no other references outside working records (`git grep`); README, docs, CI and
  scripts do not name it. The working records that mention it describe past runs and stay as written.
- `CONTEXT.md` "Application icon" still holds: it separates icon acceptance from distribution trust and
  makes no claim that packages are unsigned.
- Smell baseline: no hit.
- Class-level check: "a packaging configuration that skips signing silently" — the only packaging target
  is macOS; Windows is not built in this repository.

## Deferred (not part of this ticket)

- Hardened runtime, entitlements, DMG signing and notarisation belong to a release line, which does not
  exist yet (`macos-distribution` is declared `enabled = false`). Signing alone does not require
  hardened runtime.
