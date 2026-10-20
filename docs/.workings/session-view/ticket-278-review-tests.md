# Test review — #278

Ticket: [#278](https://github.com/aloong-planet/agentshed/issues/278) · feature `session-view` · branch
`fix/stripped-fork-title`. Scope: the tests that reproduce the stripped fork's title mismatch and hold the fix.

## Design review

Checked 2026-10-20. Implementation version: a1b04b5 (main, where the work began). Requirement source: the
session-view spec A4 and B2's re-titling of a stripped fork, as #278 states them.

### Test design table

Seams: the token engine (its build and its session questions) and the project search over a fixture home, the
seams of the existing fork cases; and e2e under the built app over `mkForkHome` (a Codex parent asking "Parent first
question", a fork replaying it and asking "Child new question", an orphan fork).

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U1 (changed; reproduces the bug) | token-stats.test · a prefix-stripped legacy fork with no `thread_name` is re-titled | A4, B2 | the engine | a parent asking "parent question one" and a fork replaying it then asking "child new question", no `thread_name`; the fork's session questions after the build | the session questions' title is "child new question", the listed title the case already asserts — literal | the existing case's Codex rollout lines, in the real `user_message` shape | none |
| U2 (changed) | token-stats.test · a prefix-stripped fork with a `thread_name` keeps it | A4 | the engine | the same pair with the fork's `thread_name` "fork thread name" in the session index | the session questions' title is "fork thread name" — literal | the existing case | none |
| U3 (new; reproduces the bug) | search-sessions.test · a stripped fork's card carries its own title | A4, B2 | the project search | the D3 case's pair (a parent asking "magicword in the parent session", the fork replaying it then asking "child new question"); a question-mode search for "child new" | one group, the fork's, titled "child new question" — literal | the D3 case's lines | none |
| E1 (changed; reproduces the bug) | app.spec · the session page banner | B2 | e2e | the stripped child opened, then its banner's parent link, sampled inside the 600 ms delay while the child page stays | the header reads "Child new question", where the case read "Parent first question" — the child's own title, so the sample now tells the child page from the parent's | `mkForkHome` | one launch, unchanged |
| E2 (changed; reproduces the bug) | app.spec · a fork session shows only the questions left after stripping | A4, B2 | e2e | the stripped child opened from the Sessions tab | the header reads "Child new question" — literal | `mkForkHome` | one launch, unchanged |

Red first: U1, U3, E1 and E2 reproduce the bug, so each must fail on the unfixed code at its title assertion
before the fix (`/tdd`'s rule for a bug's reproducing test). U2 guards A4 against the fix and passes before and
after. Per the project's capability declaration, `mutation-testing` is not enabled, so mutation testing is skipped.

### Dimension 1: Coverage

The surfaces that take the engine's title, found by `rg -n "sessionQuestions\(" src` and following each caller's use
of `title`: the session page (`getSessionPage`) and the project search (`searchProjectSessions`) — U1, E1, E2 and
U3. The global search corpus also calls it but takes its card titles from the scan's listed sessions, which already
carry the re-title (#271's cases). The boundaries: a fork whose title came from its first question (U1, U3, E1, E2);
one with a `thread_name` (U2); a fork with nothing stripped (a paginated one) keeps its title, as nothing is
re-titled when nothing is stripped — held by the existing paginated case's listed title and unchanged by the fix.
The uncertain tier is not one of these: it strips too (the burst heuristic with the parent missing, or the part of a
partial match that passed), and the re-title follows the strip whatever the state — corrected after the
post-implementation check (F2) and covered by U5 in the increment below. Each claimed boundary names its input above.

Fixture: the existing cases' lines, already in the real rollout shape the scan reads.

### Dimension 2: Case design

No red flag: the engine and the search are driven through their public calls; the e2e cases through the window.
E1's change also removes a false green: both pages carried the same title before, so the sample could not tell them
apart.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: each title assertion compares a literal that differs between the parent and the fork.
- Tautology: the expected titles are literals from the fixtures.
- Stale path: E1's old expectation was the bug's value; it is replaced.

### Dimension 4: Resource reuse

The unit cases build a temporary home each, as every case in their files does (well under a second); the e2e cases
keep their one launch each.

### Increment: the post-implementation check's findings

Checked 2026-10-20 on fcdb6c7, before any of these tests was written or changed. Source: findings F1–F5 of the
post-implementation check below, all taken into #278 (Dispositions there). Requirement: spec B2's re-title and A4,
and the stripped banner carrying "the parent session's title" (spec, Further Notes, the three tiers of presenting
uncertainty) — the parent's title as A4 and B2 give it, which is the title the list shows for the parent.

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U4 (new; reproduces F1) | token-stats.test · a fork of a stripped fork: the banner names the parent by the parent's listed title | B2, A4; the stripped banner's parent title | the engine | three generations, no `thread_name`: G asks "grandparent question"; P forks G, replays it and asks "parent new question"; C forks P, replays both and asks "child new question"; C's session questions after the build | P's listed title is "parent new question" and C's `forkParentTitle` is the same literal, its `forkParentFile` P's file, its state `stripped` — literals | the existing fork cases' legacy lines, in the real `user_message` shape | none |
| U5 (new; F2) | token-stats.test · an orphan fork whose opening burst is stripped is re-titled on the list and on its page | B2 (the heuristic tier), A4 | the engine | an orphan fork (its parent id in no rollout of the scan set), no `thread_name`: two questions 300 ms apart, then "orphan new question" 30 s later | listed: state `uncertain`, one question, titled "orphan new question"; the session questions: state `uncertain`, one question, the same title — literals | the banner case's orphan fork, its timestamps set by B2's burst rule (no legacy fork exists in today's real data, so the shape cannot be re-sampled; see the check's Dimension 1) | none |
| U3 (changed per F5) | search-sessions.test · question mode: a stripped Codex fork's card carries its own title | A4, B2 | the project search | the D3 pair, written by a helper the D3 case shares; a question-mode search for "child new" | one group, the fork's, titled "child new question" — literal | the D3 case's lines | none |
| D3 (changed per F5) | search-sessions.test · hits inside an already-stripped fork prefix count as folded (D3) | D3 | the project search | the same pair through the helper; a full-text search for "magicword" | unchanged: one hit, one folded, the parent's group; U3's assertion leaves this case | the D3 case's lines | none |
| U6 (changed per F3) | token-stats.test · a pure-replay fork is not listed, and its tokens still count | B2 (stripped empty) | the engine | the case's pair (the fork only replays); the fork's session questions after the build | resolves rather than rejecting; state `stripped`, no question, title "parent question one" — the title it was parsed with, as no question is left to re-title it from | the case's lines | none |
| U7 (new; F4, added while writing U4's fix) | token-stats.test · when the parent's first question left cannot be read back, the banner keeps the title the parent was parsed with | B2 (a failed re-title read keeps the original title and hurts only that session); the stripped banner's parent title | the engine | U4's chain, built; then the parent's file deleted (the parent's cache entry is not checked against its file when the child's page opens); C's session questions | resolves; `forkParentTitle` "grandparent question", `forkParentFile` still P's file — literals | U4's lines, through a helper the two cases share | none |

F4: the fallback a failed re-title read takes is driven by U7 through the parent's read. The session's own read
stays undrivable — its signature is checked just before it, so it fails only when the file changes in between — and
gets a gap note in `token-stats.test.ts`'s header.

Red first: U4 reproduces F1's bug and must fail on fcdb6c7 at the `forkParentTitle` assertion, with "grandparent
question", before the fix. U5, U3, D3 and U6 cover behaviour fcdb6c7 already has, so they are not required to be red
first (`/tdd`'s rule); U7 covers the fix's own fallback, not a reproduced bug, so neither is it. When each goes red:
U5 when the list or the page keeps a replayed question as the title in the uncertain tier, or when the burst is not
stripped (the state and count assertions); U3 when the fork's card carries any other title, or another group answers
"child new"; D3 as before; U6 when the session questions of a fork stripped empty reject (without the guard on the
first question left) or return questions; U7 when a failed read of the parent's line rejects the page or names the
parent by anything but its parsed title.

- Dimension 1 (Coverage): F1's surface is the banner of a stripped fork and of a partial-match uncertain fork
  (both read `forkParentTitle`); U4 drives the stripped one at the engine, where the value is made, and the
  rendering of that value is asserted by E1's banner text. U5 drives the heuristic tier; the partial-match tier
  re-titles by the same length test on the same strip result, so one uncertain case drives the branch. U6 drives
  the guard on an empty strip through the public call. U7 drives the failed read through a state the app reaches:
  the parent's file removed after the scan, before the child's page opens. The session's own read failing stays a
  gap, noted in `token-stats.test.ts`'s header with the condition for covering it.
- Dimension 2 (Case design): all through public calls (`build`, `sessionQuestions`, `searchProjectSessions`); no
  internal state written; every state reachable on disk. U3 standing alone removes F5's masking.
- Dimension 3 (the three judged on the design): every compared title differs between the generations or between
  the stripped and kept questions, so none holds by construction; every expected value is a literal from the
  fixture; `forkParentTitle` is the live field the banner renders (`SessionPane.tsx`, both banners).
- Dimension 4 (Resource reuse): a temporary home per case, as in both files; nothing expensive added.

## Post-implementation check

Checked 2026-10-20, independently of the agent that implemented #278: run by a separate sub-agent that took no part
in the design review or the implementation. Ticket [#278](https://github.com/aloong-planet/agentshed/issues/278) ·
feature `session-view` · this record, as the ticket declares it. Implementation version: fcdb6c7 (the fix and its
tests); HEAD 2ccbbb8 adds working records only (`git diff --name-only fcdb6c7 2ccbbb8` lists nothing outside
`docs/.workings/session-view/`). Scope: the five rows of the test design table, the change `git diff a1b04b5
fcdb6c7`, and every surface that shows a session's title.

Inputs, and how each was checked:

- Gateway: `pnpm verify` on fcdb6c7, [log](evidence/ticket-278/verify-fcdb6c7.log). The `&&` chain ran to its last
  step (`SMOKE_OK`, line 586); the log does not record the exit status, so exit 0 rests on the implementer's report
  together with the chain reaching its end. 864 unit tests passed and 1 was skipped by design (line 118); 148 e2e
  cases passed after one `electron-vite build` (lines 401–428, 579).
- Capability declaration, read with Python's `tomllib`: `[mutation-testing] enabled = false`.
- Probes: three temporary vitest files under `src/main/providers/`, each deleted after its run. Before and after
  each, `git status --short --ignored` compared equal (`cmp`), and the SHA-256 of the directory's entry listing
  (without its own `.` line, whose mtime a create and a delete move) was the same, `a2c84b63…`. No source, test or
  fixture file was changed. Their output is quoted where it is used.
- Real data, read only: every rollout in the Codex scan set (`~/.codex/sessions`, 2316 files, and
  `~/.codex/archived_sessions`, 58; `codex.ts:42` scans both), each streamed in full.

### Per-case consistency with the test design table

| # | Written test | Seam · input · assertion and expected value · fixture · resources | Conclusion |
|---|---|---|---|
| U1 | `token-stats.test.ts:1636`, assertion added at 1654 | the engine · build, then `sessionQuestions` on the same engine · title `'child new question'`, a literal · the case's existing lines · none | Matches |
| U2 | `token-stats.test.ts:1657`, assertion added at 1686 | the engine · the same pair with `thread_name` `'fork thread name'` · that literal · the existing lines · none | Matches |
| U3 | `search-sessions.test.ts:120`, assertions added at 150–151 | the project search · `run('child new', false)` · `[[true, 'child new question']]`, a literal · the D3 case's lines · none | Does not match: the row is a new case, "a stripped fork's card carries its own title"; the assertions were appended to the existing D3 case "hits inside an already-stripped Codex fork prefix count as folded…", and no case of the row's name exists. F5 |
| E1 | `e2e/app.spec.ts:1231`, assertion changed at 1251 | e2e over `mkForkHome` with `AGENTSHED_FETCH_DELAY_MS=600` · the header sampled after the banner, inside the delay · `'Child new question'` · `mkForkHome` · one launch | Matches |
| E2 | `e2e/app.spec.ts:1038`, assertion added at 1049 | e2e over `mkForkHome` · opened from the Sessions tab · `'Child new question'` · `mkForkHome` · the case's existing launch | Matches |

Header gap notes: `token-stats.test.ts` carries Gap (#158) only; `search-sessions.test.ts` has no gap section;
`e2e/app.spec.ts` lists two UI gaps unrelated to #278. One path of the change cannot be driven and has no note: F4.

### Dimension 1: Coverage

Conclusion: the surfaces #278 names are covered — the session page header (the value by U1, the rendering by E1 and
E2) and the project search card (the value by U3; the card renders `g.title`, `DetailPane.tsx:376`, a wiring the
existing session search e2e asserts at `app.spec.ts:1484`); `thread_name` keeping priority (U2); the scan's
re-title, now routed through the shared function (the listed-title assertions of U1 and U2, lines 1652 and 1684).
Four findings: F1, F2, F3, F4.

- Surfaces that show a session's title, enumerated by every title field the engine produces rather than only the
  `title` of `sessionQuestions`' callers. `rg -n "sessionQuestions\("` gives the session page (`index.ts:317`,
  `title` at 334), the turn fetch (`index.ts:371`, no title), the project search (`search-sessions.ts:104`,
  `title` at 176) and the global search corpus (`question-corpus.ts:117`, card title from the listed session at
  144). The field the design's enumeration did not follow is `forkParentTitle` (`token-stats.ts:713`, shown by the
  fork banner, `SessionPane.tsx:66–90`): it carries the parent's cached `agg.title`, never re-titled. Probe, a
  fork of a fork (G asks "grandparent question"; P forks G, replays it and asks "parent new question"; C forks P,
  replays both and asks "child new question"):
  `listedParent=["stripped","parent new question"] parentPage=["stripped","parent new question"]
  listedChild=["stripped","child new question"] childPage=["stripped","child new question","grandparent question"]`.
  C's banner names its parent "grandparent question", while the list and P's own page title it "parent new
  question". F1.
- The uncertain tier. The design's sentence "a fork not stripped (uncertain, or paginated) keeps its title" treats
  uncertain as unstripped, but `stripReplayPrefix` strips in that tier too (`question-index.ts:86–109`, the burst
  heuristic with the parent missing; 120–128, a partial fingerprint match), and both the scan (`token-stats.ts:996`)
  and the session questions (702–705) re-title on the length test alone, whatever the state. Probe on fcdb6c7: burst
  `listed=["uncertain",1,"orphan new question"] page=["uncertain",1,"orphan new question"]`; partial match
  `listed=["uncertain",1,"child new question"] page=["uncertain",1,"child new question"]`. The fix serves this
  tier; no case drives it. F2.
- An empty input. A fork stripped empty is not listed but stays on the read allow-list (spec B2), and the new guard
  on `first` (`token-stats.ts:703`) is what keeps its session questions from reading `undefined[0]`. Probe:
  `listed=no allowList=true page=resolved ["stripped",0,"parent question one"]`. Reachable through the engine's
  public call and, in the app, when an open page of a fork revalidates after its parent enters the scan set and
  verifies the whole replayed span. No case drives it: the pure-replay case (`token-stats.test.ts:1695`) does not
  call the session questions. F3.
- The read-failure fallback (`strippedForkTitle` returning null, `token-stats.ts:732–740`, so `retitled ??
  agg.title` keeps the cached title). The indexer records only a line whose real text is non-null, and the
  signature is checked just before the read, so the read fails only if the file changes between the two: a racing
  writer, as in Gap (#158). Not drivable, and not noted. F4.
- A cold rollout: the title read goes through `readRanges`, whose streaming path for `.jsonl.zst` is held by the
  cold-twin cases (`token-stats.test.ts:716`, `:788`; `search-sessions.test.ts:155`). Nothing in the title read is
  specific to the cold reader; no case is needed for it.
- A fork not stripped, and Codex sessions that are not forks: nothing is re-titled, and a re-read would give the
  same `clipTitle` of the same real text the parse stored (`token-stats.ts:1453`), so that branch has no
  observable effect to drive.
- Fixture shape: the fork lines keep only the fields the parser reads, a shape verified against the two real forks
  of 2026-08-02 (`token-stats.test.ts:207–215`). Today's data cannot re-check it: all 2373 readable rollouts of the
  scan set are paginated (a `session_meta` line with `ordinal`; the one other file is empty), none holds a legacy
  `event_msg/user_message`, and the 154 that carry `forked_from_id` (9 not spawned as subagents) are all
  paginated, so none reaches the strip or the re-title. The count in `mkForkHome`'s comment ("0 real forks", of
  244 sessions, `app.spec.ts:309`) is older than today's 9, but its conclusion — the legacy path can only be built
  — still holds.

### Dimension 2: Case design

Conclusion: no implementation-coupling red flag; one finding on isolation, F5.

- `rg -n "vi\.mock|vi\.spyOn|jest\.|as any|\.skip|test\.fixme"` over the three test files: no match (exit 1; the
  same files return matches for other patterns, so they were read). The unit cases go through `build`,
  `sessionQuestions` and `searchProjectSessions`; the e2e cases click through the window; no internal state is
  written or read, and no state is built that the public path cannot reach.
- U3 shares a case with D3's folding assertions and runs after them: a folding regression ends the case before the
  title is checked, and a title regression reports under the D3 name, as the red run did (`red-unit.log:5`). F5.

### Dimension 3: False greens

Conclusion: no false green found. Per the project capability declaration, `mutation-testing` is not enabled;
mutation testing is skipped. When each test goes red, answered against the code under test and the source of its
expected value:

- U1: when the session questions give any title other than the first question left — the cached replayed question
  (red on a1b04b5 with `'parent question one'`, `red-unit.log:37–46`), or the cached title after a failed read —
  and, through its existing assertion, when the scan's listed title is not re-titled.
- U2: when either side lets the re-title displace `thread_name`; without the `!agg.titleFromThread` test at
  `token-stats.ts:703` the session questions would give `'child new question'`. It passed on a1b04b5, as designed
  (`red-unit.log:54`).
- U3: when the fork's card carries another title (on a1b04b5 `'magicword in the parent session'`,
  `red-unit.log:13–33`), when the parent also returns a group for "child new", or when no group returns.
- E1: when the header sampled during the pending jump is not the child's own title — the stale title (red on the
  unfixed build, `red-e2e.log:38–61`), or the parent's `'Parent first question'` if the page switched before the
  parent's data arrived (P2). Before #278 both pages read `'Parent first question'`, so this sample could not tell
  them apart; now it can. Its one exposure is a false red, not a false green: the banner and the header are two
  samples, and the case goes red if the 600 ms window closes between them.
- E2: when the header shows any other title (`red-e2e.log:11–36`).
- The three judged on the design, re-checked on the written tests. Constant truth: every title compared differs
  between the fork and its parent, and U3's `toEqual` on a one-element list fails on an empty result. Tautology:
  every expected value is a literal from the fixture. Stale path: `sessionQuestions().title` reaches the page
  (`index.ts:334`) and the project search (`search-sessions.ts:176`), and `.pane-head .stitle` renders
  `page.title` (`SessionPane.tsx:157`).
- Conditional skips and assertions that may not run: none; every assertion is awaited, and none sits in a callback
  or a loop.
- Browser assertions, against the form list in review-code's `false-greens.md`: they assert text, not existence
  (form 1); the clicks are real, with no dispatched events (form 2); the changed assertions were red on unfixed
  code (form 4) — `red-e2e.log` records no build step, but the value it received, the stale title on the child's
  page, shows the app under test lacked the fix, and the green run rebuilt first (`verify-fcdb6c7.log:401–426`);
  the polled expression is the asserted one (form 5).

### Dimension 4: Resource reuse

Conclusion: as the table states; no expensive resource is added, and none is built per case.

- Counted from the full run (`verify-fcdb6c7.log`): `electron-vite build` once, before the 148 cases (lines
  401–426); the quiet Electron copy comes from the playwright global setup, once per run (`e2e/global-setup.ts`,
  silent when current). An app launch is not an expensive resource by the 1 s definition: E2 took 795 ms in all,
  its launch included (line 459); E1 took 4.0 s, its fetches delayed 600 ms each (line 464). E1 and E2 keep
  one launch each and add none.
- Unit: a temporary home per case, as in every case of both files. `token-stats.test.ts` ran 95 cases in 2414 ms
  and `search-sessions.test.ts` 8 in 212 ms (lines 67 and 38); U1 took 15 ms and U3 18 ms on the red run
  (`red-unit.log:8`, `:5`).

### Findings

| # | Case or file | Dimension | What is wrong | Evidence | Recommended change |
|---|---|---|---|---|---|
| F1 | `token-stats.ts:713` (`forkParentTitle`); no case | Coverage | "One title per session everywhere" (#278) still fails on the fork banner: when a fork's parent is itself a stripped fork titled from its first question, the banner names the parent by the replayed question, while the list and the parent's own page use its re-titled title. Only legacy fork chains; none in this machine's data today | The chain probe in Dimension 1 | The owner decides the scope. Recommended: take it into #278, since the requirement covers it and the code is in the same function: give `forkParentTitle` the parent's displayed title (its own strip against its parent, then `strippedForkTitle`), with a test design table row for an engine-seam case: a three-generation chain whose child's `forkParentTitle` equals the parent's listed title (red on fcdb6c7). Kept out of #278, it needs a ticket of its own, as nothing else records it |
| F2 | token-stats.test (no case); the design's Dimension 1 sentence on "uncertain" | Coverage | The uncertain tier with leading entries stripped is re-titled on the list and the page, but no case drives it, and the design calls that tier unstripped | The burst and partial-match probes in Dimension 1 | A test design table row, reviewed before writing: an orphan fork (parent outside the scan set) whose opening burst is stripped, no `thread_name`; assert the listed `forkState` `'uncertain'` and that the listed and session-question titles are both the first question left. By the diff it would have been red on a1b04b5 (the page took `agg.title`); reasoned, not run. Correct the design sentence |
| F3 | token-stats.test · the pure-replay case (1695) | Coverage | The new guard on `first` (a fork stripped empty) is reachable and undriven | The empty-strip probe in Dimension 1 | Extend that case with the fork's session questions: resolves with no questions and keeps its cached title. Without the guard it rejects with a TypeError on `undefined[0]`; reasoned, not run |
| F4 | `token-stats.test.ts` header | Coverage | The re-title read failure (both callers keep the cached title) cannot be driven, and the header does not say so | `token-stats.ts:732–740`; the reasoning in Dimension 1 | A header gap note: not driven, as it needs the file to change between the signature check and the range read; to be covered once a range-reader hook or an injectable reader lets a test fail that read |
| F5 | search-sessions.test · U3 | Case design (and the per-case check) | U3 was written into the D3 case, not as the new case the table names; a folding regression hides the title check, and a title regression reports under the D3 name | `search-sessions.test.ts:120–152`; `red-unit.log:5` | Recommended: its own case, named as the row says, sharing the fork pair with the D3 case through a local helper. Otherwise amend the row to "changed: the D3 case gains the title assertion" and review it again |

### Outside the four dimensions

- The code review's cost note (R1; Runnability in `ticket-278-review-code.md`) names the session page, the project
  search and the global search corpus as the callers that pay the extra read. The turn fetch (`index.ts:371`) calls
  `sessionQuestions` too, so a stripped fork pays the read on every turn expansion as well, without using the title.
- `final-regression.md`, Stage 2, says the fork title sentence of the feature entry is "True on every surface now";
  F1 is a surface where it is not.

### Document sync this check creates

For the owner; this check changed nothing but this section:

- `ticket-278-doc-sync.md`: the disposition of F1–F5 (the table rows, cases and header note), pending until decided.
- `checklist.md`: verification rows for any case added for F1–F3.
- `final-regression.md`, Stage 2: the row on the fork title, after F1's disposition.
- `ticket-278-tasks.md`, task 10: done once these findings are disposed of.

### Dispositions

Decided 2026-10-20 by the implementing agent, on the recommendations above; all five are taken into #278.

| # | Disposition |
|---|---|
| F1 | Fixed in #278: the parent's title the banner carries is the parent's displayed title — its own strip against its parent, then the re-title — so the banner, the list and the parent's page agree. Test U4, red first on fcdb6c7 (increment above) |
| F2 | Test U5 added; the design's sentence on the uncertain tier corrected in place (Design review, Dimension 1) |
| F3 | The pure-replay case extended with the fork's session questions (U6) |
| F4 | The fallback is driven through the parent's read (U7); the session's own read, which stays undrivable, gets a gap note in `token-stats.test.ts`'s header |
| F5 | U3 made its own case, sharing the fork pair with the D3 case through a helper |
| Outside: R1 | The code review's cost note now names the turn fetch among the callers that pay the read |
| Outside: Stage 2 | `final-regression.md`'s Stage 2 row on the fork title rewritten once F1 is fixed |
