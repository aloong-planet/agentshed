# Code review — #278

Ticket: [#278](https://github.com/aloong-planet/agentshed/issues/278) · feature `session-view` · branch
`fix/stripped-fork-title`. Checked 2026-10-20 on fcdb6c7 against a1b04b5: the engine's session questions for a
Codex fork, the title function they now share with the scan's re-title, and the tests.

## Underlying premises

- The cause, reproduced before the fix: a probe and the four reproducing cases failed on the unfixed code, the
  engine handing "parent question one" where the list showed "child new question"
  ([probe](evidence/ticket-278/probe-red.log), [unit](evidence/ticket-278/red-unit.log),
  [e2e](evidence/ticket-278/red-e2e.log)).
- Who reads the engine's title: `rg -n "sessionQuestions\(" src` lists the session page handler, the turn fetch, the
  project search and the global search corpus; the session page and the project search put `title` on their
  payloads, the turn fetch uses only the questions, and the corpus takes its card titles from the scan's listed
  sessions. So the fix reaches every surface that showed the stale title as a session's own; the parent's title on
  the fork banner, a field this enumeration did not follow, was found by the post-implementation check (F1) and is
  covered by the increment below.
- The re-title rule is the scan's own, unchanged: only when the title did not come from `thread_name` and leading
  questions were stripped (spec B2 and A4).
- The e2e banner case's old expectation was the bug's value: while the banner's jump is pending the page is still
  the child's, whose header read the parent's question. The new comment states that only, without a cause beyond
  what the probe shows.
- The kept comment "0 in this machine's real data" is the scan's earlier measurement of how many such forks exist;
  the new sentence claims only that the function runs for such forks alone.

## Runnability

- The title is computed from the same `shown` the session questions return, so the title and the questions shown
  share their source even where the live strip differs from the build's (a parent indexed since).
- Error path: a line that cannot be read or holds no real text gives null, and the cached title stays — the
  scan's own degradation, hurting only that session (self-inflicted).
- A fork with nothing left after the strip is not listed (A3a) and has no first question; the guard on `first`
  keeps the cached title rather than reading nothing.
- Cost: each call for such a fork reads one more line — the session page, a project search over its project and
  the global search corpus each call it. On a cold (compressed) rollout that is one more streaming pass. Such forks
  are rare, and the cost falls on that session alone. Recorded as R1 below.

## Security

No new input: the file is one the engine already holds in its cache (the callers read only allow-listed files),
read through the existing range reader. Nothing to report.

## Consistency

- Duplicated Code removed: the scan's re-title and the session questions call one function
  (`strippedForkTitle`) rather than two copies of the read-and-clip.
- Naming and comments follow the file's; the shared function's comment names both callers and the spec item.
- No bug beyond #278's.

## Increment: the fork banner's parent title (F1)

Checked 2026-10-20 on 4dd8a6f against fcdb6c7: the session questions' Codex branch moved into one method
(`codexShown`: the parent lookup, the strip and the re-title), which now also gives the fork banner its parent's
title; the tests U4–U7 and U3 as its own case (the test review's increment).

### Underlying premises

- The parent's title the banner should carry is the parent's displayed title: spec B2 and the three tiers note
  ("the stripped banner carries the parent session's title"), with a session's title given by A4 and B2. Confirmed
  by U4: red on fcdb6c7 with the replayed question ([log](evidence/ticket-278/red-f1.log)).
- The re-title reads `agg.file` where it read the requested `file`: a Codex entry's `file` is the path it was
  parsed from (`parseCodexFile` sets it from the job's file, `token-stats.ts:1469`, the job's file being the cache
  key, `:557`), and a cached entry without a non-empty `file` is rejected (`isWellFormedAgg`, `:1146`). So for the
  session itself the two are the same path, and the parent's read needs its own.
- The new comments state what is done (the parent named as its own page and the list name it; the shared function's
  callers); no cause is claimed beyond what U4 shows.

### Runnability

- The parent's title is computed one level only: `codexShown` of the parent strips the parent against its own parent
  and re-titles it, and does not go on to the grandparent's title, so there is no recursion and a cycle in the data
  cannot loop.
- The parent's cache entry is not checked against its file (only the requested session's signature is), as before
  for its questions. Its line may then fail to read back — the file deleted or moved since the scan; the cache drops
  it only at the next scan (`token-stats.ts:511`). The read gives null and the banner keeps the parent's parsed title:
  self-inflicted, that banner's text only. Driven by U7. A file rewritten in place could make the stale range read
  another line; Codex rollouts are appended to, not rewritten, and the outcome would again touch only that banner.
- Cost: every Codex session with its parent in the cache now does a second pass over the cache's entries (the
  grandparent lookup) per call; the global search corpus calls the session questions for every listed session on
  each pass, so that is one extra pass per fork — 154 rollouts in this machine's scan set carry `forked_from_id`,
  against about 2.4 thousand entries. The extra line read happens only when the parent is itself a stripped legacy
  fork titled from its first question; none exists in this machine's data. Folded into R1.
- Concurrency: a build replacing the cache between the two awaits leaves the parent lookup reading the newer map,
  whose entries are as valid; nothing is written.

### Security

The parent's read takes its path from the engine's own cache, entries the scan walked under the Codex roots, as the
scan's re-title already does for every stripped fork; nothing from the renderer reaches it, and the banner's link
still goes through the allow-listed session read. Nothing to report.

### Consistency

- The session's own title and its parent's now come from one method, so the page's header and the banner cannot
  drift from each other. The rule deciding a re-title (`!titleFromThread`, something stripped, a question left)
  still appears twice in the file: the scan's combine and `codexShown` (R2).
- Naming and comments follow the file's. No other path changes: the Claude and Grok branches are untouched, and the
  returned shape is the same.
- No bug found in the increment.

### Refactor list (for the owner's decision)

| # | What | Why | Impact | Recommendation |
|---|---|---|---|---|
| R1 | Read the re-title from the questions' own read rather than a second read | a cold stripped fork pays a second streaming pass on every call of its session questions: the session page, the turn fetch on each expansion (`index.ts:371`, which does not use the title), a project search over its project and each global search corpus pass; and, since F1, a fork whose parent is such a fork pays one for the parent's title | self-inflicted: that one session is slower; such forks are rare (none in this machine's data) | Do not: it would thread the title through the callers' reads for a case this rare |
| R2 | One function deciding whether and from which question a stripped fork is re-titled, used by the scan's combine and the session questions | the same rule written twice in `token-stats.ts` (Duplicated Code); a drift between them is the class of bug #278 fixed | self-inflicted per surface: a drift would show one title on the list and another on the page | Do not now: U1, U2, U4 and U5 assert the listed title and the page's title together, so a drift turns them red; the combine is a module-level function and the session questions an engine method, so sharing it means a new helper for two one-line conditions |
