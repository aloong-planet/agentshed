# Code review — #247

Ticket: [#247](https://github.com/aloong-planet/agentshed/issues/247). Date 2026-10-23. Implementation: 78a05d0 on
`fix/codex-compressed-stderr` (from 1349d76). Scope: the Codex-compressed session case's stderr assertion
(`e2e/app.spec.ts`), which now carries the collected chunk as its message. No product code changes.

## Underlying premises

- **The launcher collects chunks, not lines**: `app.process().stderr?.on('data', …)` pushes each chunk that matches its
  filter (`e2e/app.spec.ts:112`). The message prints the chunk whole, so a chunk holding two lines shows both. Holds.
- **The comment "a failure says which line broke it"**: shown by the planted line, whose text is the failure's message
  (`evidence/ticket-247/plant-line.txt`). Holds.

## Runnability

- The message is built only when the assertion is evaluated, from a string already collected; a long chunk prints in
  full. No new path.

## Security

- The chunk is the app's own stderr in a test run, printed to the test's own output. Nothing new leaves the machine.

## Consistency

- Matches the file's other assertions that name their subject in the message (`expect(x, 'why').toBe(…)`).
- Smells: none on one changed line.

## Refactoring list

None.
