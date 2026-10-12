# Document sync checklist — ticket aloong-planet/agentshed#223

Artifacts: [code review](ticket-223-review-code.md) · [test review](ticket-223-review-tests.md) · this checklist ·
raw evidence in [`ticket-223-evidence/`](ticket-223-evidence/).
Scope checked on 2026-10-12: `README*`, `AGENTS.md`, `CONTEXT.md`, `capabilities.toml`, `docs/` (features,
specs, ADR, prototypes, agents), `docs/.workings/` (hidden and ignored, read directly), `scripts/`,
`.github/`; search terms `mockupOnly`, `gallery`, `gallery-template`, `prototypes/index.html`,
`tooling beside`, `check-lang`, `check:lang`, searched with `grep -ra` so that no file is skipped as binary.

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| Declare this ticket's artifact paths; before the PR opens | [#223](https://github.com/aloong-planet/agentshed/issues/223) | Done — [comment](https://github.com/aloong-planet/agentshed/issues/223#issuecomment-6119569122) |

Pre-delivery scope re-check (2026-10-12):

- `docs/specs/i18n.md` Further Notes call this exemption "mockup content but not the tooling beside it"; the
  gate now matches that sentence, so no spec text becomes false and none is missing.
- `docs/specs/project-detail.md` B4 already excludes the gallery shell and `vendor/` from the project
  detail's prototype list, which agrees with how this change classifies them. No change.
- ADR-0017 and ADR-0030 describe the gate and its predicate form, not this exemption's file test. No change.
- `docs/features/` has no statement about the prototype gallery or the language gate. No sentence becomes
  false and none is missing, so step 8 is skipped for this ticket.
- `CONTEXT.md`: no term or invariant involved.
- The working records that mention `check-lang` describe past runs and stay as written.
- Raw evidence that quotes Chinese stays untracked in `ticket-223-evidence/`, because a tracked file there
  would itself fail the working-language gate: `red-before-copy.log`, `mutation-M1-shell-title.log`,
  `mutate.sh` and `logic-pages-vs-template.diff`. The other evidence files are committed.
