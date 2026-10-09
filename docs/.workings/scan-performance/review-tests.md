# Review — tests (step 6), #160: one session walk per scan (2026-10-09)

Cases: "scan() counts the sessions of the supplied walk, not ones that appeared after it"
(activity.test.ts) and "build() aggregates the sessions of the supplied walk, not ones that appeared
after it" (token-stats.test.ts).

## Dimension 1 — coverage: one gap, recorded

- Each case drives the property through a realistic sequence: sessions exist, the walk runs, more
  sessions are written, then the function runs with the walk. Codex and Grok are both in each case.
- Gap: `doScan` passing its walk to both readers is main-process wiring with no unit seam. Recorded in
  the activity.test.ts header with the condition that retires it; meanwhile the bench prints the walk on
  its own line in the app's order, and the walkers are called only inside `walkSessions` (grep).
- Fixtures: the suites' existing Codex rollout and Grok session builders, which follow the measured
  real layouts (session_meta first line; sessions/<encoded cwd>/<id>/updates.jsonl + summary.json).

## Dimension 2 — case design: no finding

Public functions only, real files in a temporary home, no mocks. The walk is passed through the public
parameter, not forged.

## Dimension 3 — false greens: four mutations, all red

Red first was for the wrong reason (`walkSessions is not a function`), so each case was checked by
mutation, restoring from a backup copy each time:

| Mutation | Case | Result |
|---|---|---|
| scan() walks again (ignores `deps.sessions`) | scan | red: 4 sessions, expected 2 |
| build() walks again (ignores `sessions`) | build | red: Codex 1210, expected 110 |
| only scan()'s Grok half walks again | scan | red: 3 sessions, expected 2 |
| only build()'s Grok half walks again | build | red: Grok 605, expected 55 |

The last two exist because in the second row the Codex assertion failed first, so it said nothing about
the Grok half.
