# Code review — #278

Ticket: [#278](https://github.com/aloong-planet/agentshed/issues/278) · feature `session-view` · branch
`fix/stripped-fork-title`. Checked 2026-10-20 on fcdb6c7 against a1b04b5: the engine's session questions for a
Codex fork, the title function they now share with the scan's re-title, and the tests.

## Underlying premises

- The cause, reproduced before the fix: a probe and the four reproducing cases failed on the unfixed code, the
  engine handing "parent question one" where the list showed "child new question"
  ([probe](evidence/ticket-278/probe-red.log), [unit](evidence/ticket-278/red-unit.log),
  [e2e](evidence/ticket-278/red-e2e.log)).
- Who reads the engine's title: `rg -n "sessionQuestions\(" src` lists the session page handler, the project search
  and the global search corpus; the first two put `title` on their payloads, and the corpus takes its card titles
  from the scan's listed sessions. So the fix reaches every surface that showed the stale title.
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

### Refactor list (for the owner's decision)

| # | What | Why | Impact | Recommendation |
|---|---|---|---|---|
| R1 | Read the re-title from the questions' own read rather than a second read | a cold stripped fork pays a second streaming pass per session page open or search | self-inflicted: that one session is slower; such forks are rare | Do not: it would thread the title through the callers' reads for a case this rare |
