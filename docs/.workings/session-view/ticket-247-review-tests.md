# Test review — #247

Ticket: [#247](https://github.com/aloong-planet/agentshed/issues/247) (the Codex-compressed session case collects a
stderr chunk without the expected error code). Task list: [ticket-247-tasks.md](ticket-247-tasks.md).

## Design review (2026-10-23, implementation starts from 1349d76)

Scope: the first change, before the cause is known — the case's stderr assertion names the chunk that breaks it. Rows
for the fix are added by an incremental review once the cause is known. Spec: [session-view](../../specs/session-view.md).
Mutation testing: by the project capability declaration, mutation-testing is not enabled, so it is skipped; the case's
"when does it go red" is answered below. The issue asks for one planted line (a non-matching chunk shown in the
failure message); that is acceptance evidence, run once.

### Test design table

| # | Test | Spec item | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape | Expensive resource |
|---|---|---|---|---|---|---|---|
| E1 | e2e, changed: "a session whose file Codex compresses while cached (query layer)…", its stderr check | session-view P6, P7 | the app through its real IPC and renderer; the main process's stderr as the launcher collects it (unchanged) | as before: the plain rollout compressed and removed while its page is open, rescans every 250 ms | each collected chunk carries `sessionFileUnreadable` or `sessionNotWhitelisted`, as before; a chunk that does not fails with the chunk itself as the message. Values: the error codes (`ERR`, the contract's own names) | as before: a Codex rollout of the real format's shape (taken in the case's ticket) | one launch, unchanged |

### Coverage

- Unchanged spec units: P6 (the page's error state) and P7 (the compressed identity).
- Gaps: none new.

### Case design

- No mock or internal write; the stderr is the process's own output, collected by the launcher as for every case.

### False greens (design-level)

- Constant-true: the loop runs over a list the case first asserts is not empty (`l.errors.length > 0`).
- Tautology: the codes come from `ERR`, the contract's names — the same constant the app throws, imported. This is the
  existing assertion's source, and a code renamed in both places would still be the code the app throws; the
  assertion's subject is which error was raised, not the name's spelling.
- When it goes red: if a collected chunk carries neither code, with that chunk in the message. To be shown by a planted
  chunk that matches the launcher's filter and carries neither code.

### Resource reuse

- Unchanged: one launch; the change adds none.
