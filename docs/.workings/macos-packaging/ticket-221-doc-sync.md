# Document sync checklist — ticket aloong-planet/agentshed#221

Artifacts: [code review](ticket-221-review-code.md) · [test review](ticket-221-review-tests.md) · this checklist.
Scope checked on 2026-10-10: `README*`, `CONTEXT.md`, `docs/` (features, specs, ADR, ops), `docs/.workings/`
(hidden directory, read directly), `capabilities.toml`, `package.json`, `electron-builder.yml`, `scripts/`;
search terms `dist:mac`, `identity`, `notari`, `codesign`, `Developer ID`, `unsigned`.

| Sync item and trigger | Documents | Status |
|---|---|---|
| Declare this ticket's artifact paths and correct the earlier statement that signing needs hardened runtime and entitlements; before the PR opens | [#221](https://github.com/aloong-planet/agentshed/issues/221) | Done — [comment](https://github.com/aloong-planet/agentshed/issues/221#issuecomment-6096568469) |

Pre-delivery scope re-check (2026-10-10): `docs/features/` has no packaging or signing statement (no sentence becomes false, none is missing); `CONTEXT.md` "Application icon" separates icon acceptance from distribution trust and still holds; `dist:mac` appears nowhere outside past working records, which stay as written. No further sync items.
