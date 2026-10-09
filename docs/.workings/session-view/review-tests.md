
---

# Review — tests (step 6), #217: a grown Grok session's page (2026-10-09)

Case: "the session page of a Grok session whose stream grew — rebuilds through the Grok parse and
matches a cold scan of the grown stream" (token-stats.test.ts).

- **Coverage**: the input that reaches the bug is a stream changed after the scan (an appended user
  question), opened through the public `sessionQuestions`. Claude and Codex rebuilds keep their
  existing cases: Claude's "a changed signature: only that file's index is rebuilt, and the new index is
  written back to the cache" and Codex's "the session page rebuilds a grown rollout to the same index a
  cold scan gives" — each appends to a scanned file before opening its page. Fixture: the suite's measured Grok layout builder.
- **Design**: public API only, real files, no mocks; compared with a cold engine's page.
- **False greens**: red first for the reason it guards (`session-meta-unreadable`). The `isFresh`
  assertion was added after the fix and checked by mutation — keeping the entry only for Claude again
  turns it red ("expected false to be true").
