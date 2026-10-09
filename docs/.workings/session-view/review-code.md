
---

# Review — code (step 5), #217: a grown Grok session's page (2026-10-09)

Scope: the Grok branch of `sessionQuestions`' rebuild, `readGrokSessionMeta` (grok.ts), the rebuilt
entry kept for every side but Codex (whose entry is stored with its resume state).

## ① Underlying premises — no finding

- "The walk reads a stream's cwd from the directory two levels up and the subagent flag from the
  summary beside it" — read in `readGrokSessions`; `readGrokSessionMeta` applies the same two rules.
- A page can only be opened for a file in the scan's cache (the read allow-list), which the walk
  produced, so the path always has the sessions/<cwd>/<id>/updates.jsonl depth.

## ② Runnability — no finding

A directory name that is not valid percent-encoding returns null and the page reports
`session-meta-unreadable` (self-harm; the walk skips such a directory, so it never reaches here in
practice). The root test appends the separator, so a sibling directory sharing the prefix is not taken
for the sessions root.

## ③ Security — no finding

The entry point still requires the file to be in the cache; nothing new is read from outside it.

## ④ Consistency — class-level check done, no other instance

"A reader picks a side from a file's path and defaults to Codex": enumerated the path-based side
decisions in src/main — this rebuild was the only one. The other side-dispatching readers (turn
content, question text, search) take the side from `sessionQuestions`' result (the parsed agg's kind),
which now routes correctly. Smell baseline: no hit.

## Outside this change (recorded, not fixed)

The Claude branch's root test (`file.startsWith(claudeRoot)`) has no separator, so a sibling directory
named like `projects-x` would match. No such directory exists in Claude's layout; recorded only.
