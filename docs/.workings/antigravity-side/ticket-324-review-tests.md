# Test review — #324 Antigravity sessions and turns

Ticket: [#324](https://github.com/aloong-planet/agentshed/issues/324) (feature `antigravity-side`) · feature checklist:
[checklist.md](checklist.md) · spec units: session-view::REQ-003, REQ-004, REQ-005 and the Antigravity clauses of
session-view::US-001/AC-01, AC-04, AC-07; token-stats::REQ-003/AC-07 (no row), token-stats::CON-002 (the summaries
database); project-detail::REQ-002/AC-04 (Sessions); global-search::REQ-001 (regression).

## Design review

Date 2026-10-29 · implementation base c9f69aa (#323's head, `feat/antigravity-usage`; the spec as of cbe22ca) ·
branch `feat/antigravity-sessions` · scope: every test this ticket writes or changes, listed in the table below.

**Fixture sources.** Transcripts: `src/main/testing/agy-transcript-fixture.ts` — six real transcripts copied line for
line from agy 1.4.9's conversations of 2026-10-28 (paths substituted), after a full enumeration of every transcript on
this machine (15 transcripts, 104 lines; the line types and field sets are listed in that file's header and match the
spec's figures: 24 user-input lines all with the request block, 13 with a settings change; 44 assistant lines, 19 with
thinking; 24 calls, each followed by exactly one result line). Conversation databases: the existing real trajectory
records and encoders of `agy-fixture.ts` (#322, #323). The summaries database: the schema dumped from the real
`conversation_summaries.db` (user version 3, the measured `CREATE TABLE`), its titles copied from the real rows.
Derived shapes (not observed, marked in each case): a user-input line without a request block, an empty request, an
invented line type, a rewind to a step inside a turn, a subagent messaging again in a later turn, a fork of a fork.

### Test design table

Seam abbreviations: **P** = providers (the token engine, range reader, indexer and block assembler over fixture homes or
fixture text); **U** = pure unit; **E** = e2e (Playwright under Electron, fixture home, clipboard and Finder intercepted at
the main process's Electron boundary as the existing session-ID case does).

| # | Test (file) | Spec units | Seam | Input that drives the target branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| T1 | question text of a user-input line (question-index.test.ts) | REQ-004/AC-01 | U | measured `main` lines 0 (request + metadata + settings change) and 5 (request + metadata); derived: a content with no request block, an empty request block, a SYSTEM_MESSAGE line, a request spread over several lines | `questionTextOfRange('antigravity', line)`: the request body as written in the real line; the whole content (whitespace collapsed) without a block; null for an empty request and for a system message | real lines; derived shapes marked | none |
| T2 | the index over the measured main transcript (question-index.test.ts) | REQ-004/AC-01, AC-02, AC-07 | U | measured `main`, fed line by line through `eachJsonlLine` | 4 questions at the real lines' byte offsets (0, 2213, 8274, 11694 — read off the file, not computed by the indexer), each turn ending at the next question's line and the last at the file's end; tools [1, 3, 2, 0], subagents [0, 0, 0, 0] — counted by hand from the real tool calls | real | none |
| T3 | dispatch counts (question-index.test.ts) | REQ-004/AC-07 | U | measured `dispatch` and `cancelledDispatch` | `dispatch`: 1 question, tools 1 (manage_subagents), subagents 1; `cancelledDispatch`: three questions with tools [1, 5, 0] and subagents [0, 1, 0] (hand count) | real | none |
| T4 | the measured rewind (question-index.test.ts) | REQ-004/AC-03 | U | measured `forkRewound`: lines at steps 19, 20, 21, then 19 again | one question, the redo's text at byte 1141 (read off the file); the undone question ("forked") is absent; the title is the kept question | real | none |
| T5 | a rewind to the question vs to a step inside a turn (question-index.test.ts) | REQ-004/AC-03, AC-07 | U | derived lines in the measured shape: (a) Q(0) A(1) Q(2) B(3) ↺ Q'(2) B'(3); (b) Q(0) T(1, a tool call) R(2) ↺ T'(1) R'(2) Q2(3) | (a) questions [Q, Q']; Q's turn ends at the undone Q's line start, so its range holds A only; (b) questions [Q, Q2]; Q's tool count 1 (the undone call not counted) | derived from the measured rewind's mechanism | none |
| T6 | a bad line is skipped (question-index.test.ts) | REQ-004/AC-08 | U | measured `main` with a garbage line and a half-written last line inserted | the same 4 questions and texts as T2; the last turn ends at the end of the last parseable line | real + corruption | none |
| T7 | turn blocks of the measured main transcript (turn-content.test.ts) | REQ-004/AC-04, AC-06 | U | the range of `main`'s second turn (steps 5–11) and fourth turn | kinds in order; each tool's name and arguments; outputs paired in order with the following result line (the permission-denied ERROR result as the edit_file output); the thinking block's body equals the real line's `thinking`; system notices leave no block and no trace | real | none |
| T8 | a returned dispatch (turn-content.test.ts) | REQ-004/AC-05 | U | `dispatch`'s turn | a sub block named `self`, prompt = the real `Prompt` argument, result = the content of the system message whose sender is the id the creation echo names (the real message text), never the echo; steps empty, unlinked; manage_subagents a tool with its output | real | none |
| T9 | a cancelled dispatch, a running call, a timer message (turn-content.test.ts) | REQ-004/AC-04, AC-05, AC-06 | U | `cancelledDispatch`'s second turn | the research sub block's result is null (the cancellation notice comes from `sender=system`); the `schedule` call's output is its RUNNING result text; the timer's message renders nothing | real | none |
| T10 | a failed call's error line; an invented line type (turn-content.test.ts) | REQ-004/AC-06 | U | `failedFirstCall`'s turn; a derived line `{"type":"BRAND_NEW",...}` | the error line is a prose block whose body is the real error text; the invented type is one unknown trace naming it, after the blocks | real + derived | none |
| T11 | a later message from a dispatched subagent (turn-content.test.ts) | session-view failure mode "messaged again" | U | derived: turn 1 = `dispatch`'s turn; turn 2 = a question then a system message with the same sender | turn 1's sub block has its return; turn 2 renders no block for the message | derived from the measured message shape | none |
| T12 | a rewind inside a turn, at fetch time (turn-content.test.ts) | REQ-004/AC-03 | U | T5 (b)'s range | the blocks hold T' and R' and not the undone T and R | derived | none |
| T13 | the offset fetch equals the full parse; one turn reads far below the file (turn-content.test.ts) | REQ-004/AC-02 | U | `main` with a 2 MB answer appended after its last question | every turn's blocks from its own range equal those from a whole-file read of all ranges; turn 1's `bytesRead` < 20 KB while the file is over 2 MB | real + padding | none |
| T14 | the listed sessions of a project (antigravity.test.ts) | REQ-003/AC-01, AC-02, AC-04, AC-05, AC-06 (data), token-stats::REQ-003/AC-07 | P | a trusted folder holding: `dispatch` (db with a call and step times; transcript; summaries title), its subagent (the measured subagent record, a call, the `subagent` transcript), the measured empty conversation (no transcript), a conversation whose transcript asks nothing (system message only); db mtimes set unlike the step times | `perProject.sessions` equals one literal row: side `antigravity`, title "List Calc.py Function Names" (the real summaries row), `at` = the largest step time written, tokens = its own call, `questionCount` 1, forkState `none`; the global total includes the subagent's call | real records/transcripts + real title | none |
| T15 | the title falls back to the first question (antigravity.test.ts) | REQ-003/AC-03 | P | the same conversation with (a) no summaries db, (b) a row with an empty title (as agy writes for forks), (c) a summaries file that is not a database, (d) a summaries db of another shape (no `title` column) | the title is the first question clipped to 60 characters (the real question, clipped by hand) in each case; the session is still listed | real title row; derived broken files | none |
| T16 | a fork with its parent (antigravity.test.ts) | REQ-005/AC-02, AC-03, REQ-003/AC-05, AC-06 | P | parent db (calls, `main` transcript, summaries title) and a fork db holding the parent's steps (their source naming the parent) and its own call, with the `forkRewound` transcript | fork row: forkState `stripped`, tokens = its own call only, questionCount 1; `sessionQuestions(fork)`: forkState `stripped`, forkParentFile = the parent's db, forkParentTitle = the parent's summaries title, questions = the fork's one | real transcripts; copied steps by the measured mechanism | none |
| T17 | a fork whose parent is gone, then a parent deleted after a scan (antigravity.test.ts) | REQ-005/AC-04, AC-05; failure mode "parent deleted" | P | (a) the fork alone; (b) T16's home, built, then the parent's db removed and built again | forkState `stripped` (never `uncertain`), forkParentFile and forkParentTitle null in both | as T16 | none |
| T18 | a fork of a fork (antigravity.test.ts) | failure mode "fork of a fork" | P | B holds A's copied steps; C holds A's and B's copied steps, B's last | C's parent is B (the source of the last copied step) | derived from the measured mechanism | none |
| T19 | the session ID and the read source (antigravity.test.ts) | US-001/AC-01; REQ-004/AC-09 | P | a conversation named by a real conversation id | `sessionQuestions(db).sessionId` = the database's name without `.db` (written as a literal); its questions read from the transcript path give the real texts | real | none |
| T20 | the read allow-list (antigravity.test.ts) | REQ-004/AC-09; R1 | P + security judge | T14's home | `sessionFiles` holds the listed conversation's database; `sessionReadTarget` refuses the subagent's database, the subagent's transcript and the listed conversation's transcript path (only the session's identity is admitted) | as T14 | none |
| T21 | reading the summaries writes nothing (antigravity.test.ts) | token-stats::CON-002 | P | a summaries db with no log, then one kept open by a writer (WAL, a title only the log holds) | the data root's listing (names, sizes, times) equal before and after the build; the log-only title is the row's title | real schema; WAL by the existing writer mechanism | none |
| T22 | a changed transcript rebuilds its index only (antigravity.test.ts) | failure mode "agy still working" (C4) | P | T14's conversation built; a question line in the measured shape appended to its transcript, the database untouched | `isFresh` false; `sessionQuestions` gives 2 questions; the next build lists questionCount 2 | real shape | none |
| T23 | an unreadable conversation with a transcript is not listed (antigravity.test.ts) | token-stats::REQ-004/AC-01; REQ-003/AC-01 | P | user version 2 db with the `main` transcript | no row; `sessionQuestions` refuses it with a structured error; counted unreadable | derived (existing unreadable shape) | none |
| T24 | the page reads only the questions' ranges (antigravity.test.ts) | REQ-004/AC-02 | P | T14's conversation with a long answer padding the transcript | the range reads of the page's questions total less than the transcript's size | real + padding | none |
| T25 | existing case "an Antigravity conversation has no session page yet" — **replaced** by T19 (antigravity.test.ts) | — | — | — | the old assertion guards a behaviour this ticket retires (an old path) | — | none |
| T26 | the corrupt-entry cases (antigravity.test.ts, `it.each`) — **extended** | token-stats cache rule; this ticket's new fields | P | an entry missing each new required field (questions, listed, subagent, at, forkOf, conversationId, title) under the current signature | read again (the real figure), not reused (the sentinel) | existing mechanism | none |
| T27 | FileAgg's field set (token-stats.test.ts) — **changed** | cache rule (shape change ⇒ version bump) | P | the existing shape fixture | the Antigravity entry's key list written as a literal | — | none |
| T28 | global search includes an Antigravity session's displayed questions only (question-corpus.test.ts) | global-search::REQ-001 | P | a home with `main` (listed), `forkRewound` as a fork (its undone question), the subagent | searching the kept question hits it with its number; "forked" (undone) and the subagent's dispatch text hit nothing | real | none |
| T29 | a project's session search over an Antigravity session (search-sessions.test.ts) | REQ-004/AC-02 (search reads the transcript), REQ-004/AC-03 (undone not searched) | P | `forkRewound` listed | question mode: "simplest" hits question 1; "forked" hits nothing in question mode; in full text it counts as folded | real | none |
| T30 | the Antigravity sessions end to end (e2e/app.spec.ts) | REQ-003/AC-06, REQ-005/AC-01, AC-04, AC-05, US-001/AC-01, AC-04, AC-07, REQ-004/AC-04, project-detail::REQ-002/AC-04, global-search::REQ-001 | E | one fixture home: parent (`main`), fork (`forkRewound`), a fork whose parent is gone, `dispatch` and its subagent, an empty conversation | Sessions tab: four AG rows, the two forks with the fork pill and the copied-history tooltip; the fork page: banner naming the parent's title as a link, meta "Antigravity · 1 question", session ID = the db name, the copy-ID and resume clipboard writes (`cd '<dir>' && agy --conversation <id>`), Finder handed the database; its turn: a thinking block and prose whose `file://` link is plain text; the banner link opens the parent, whose first turn shows a read_file tool and thinking; the gone fork's banner with no link; global search "simplest" lists the fork's group with AG and the fork pill; "forked" finds nothing | real transcripts | one Electron launch (the suite's rule: one per distinct fixture) |

### Dimension: Coverage

Checked against session-view's "Failure modes and boundaries: Antigravity sessions" and the ticket's product
acceptance, unit by unit:

| Failure mode / unit | Covered by |
|---|---|
| A session open while agy is still working: refetch, index rebuilt for that file only | T22 (rebuild); P5's refetch is the existing transfusion path (no Antigravity-specific code) |
| agy rewrites a transcript on compaction: identities that no longer match are refused | **gap** — the refusal is the existing revision check in the IPC handler, now keyed by the transcript's identity; no unit seam reaches the handler. Closed by the e2e of session-view::REQ-001/AC-04 if a transcript rewrite is staged there; recorded in the test file header |
| A rewind while the page is open: the next snapshot drops the undone question | T4, T5 (rule), T22 (a changed transcript is re-indexed) |
| The parent of an open fork deleted: the banner switches at the next scan | T17 (b) |
| A fork of a fork | T18 |
| A subagent messaged again | T11 |
| The header's ID and command: the fork's own; a subagent has no page | T19, T20, T30 |
| Introduced content: `file://` links as text; titles as text | T30 (no anchor inside prose) |
| REQ-004/AC-08 missing transcript / bad line | T14 (empty conversation), T6 |
| token-stats::CON-002 for the summaries database | T21 |
| REQ-003/AC-02 a fork that asked nothing of its own | T14's question-less conversation is a non-fork; **added**: T16 also writes a second fork whose transcript holds a system message only — no row, its own call counted |

Fixture independence (dimension 1's sub-rule): every transcript case starts from real lines; the derived shapes are
named in their rows and are each a mechanism the real data shows (a redo reusing indices, a message by sender) applied
to a position not observed.

### Dimension: Case design

- Every case goes through the public seams the product uses: the token engine's `build` and `sessionQuestions`, the
  shared range reader, `questionTextOfRange` and `turnBlocksFromText` — the same calls the IPC handlers compose. No
  case reads the cache file to assert behaviour except T26/T27, whose subject is the cache's shape itself (the
  existing pattern).
- No case builds a state the public path cannot reach: the fork's copied steps are written as agy writes them (the
  measured source field), not by setting an internal flag.
- T25: the existing case asserting "no session page yet" is a guard on a retired behaviour and is replaced, not kept.

### Dimension: False greens

The three design-time checks:
- **Always-true assertions**: T13 and T24 compare a read size against a file deliberately padded past it (2 MB against
  a 20 KB bound), so an implementation reading whole fails them; T2/T3's counts are hand counts with non-zero values
  in different turns, so a counter that never increments or counts the wrong turn fails.
- **Tautologies**: no expected value is computed by the code under test: offsets are read off the fixture text with
  `indexOf` of the real line, texts are the real request bodies written out, titles are the real summaries rows.
- **Old paths**: T25 removes the one assertion on a retired path; T26/T27 assert the new shape.

Mutation testing: per the project's capability declaration, `mutation-testing` is not enabled, so it is skipped;
each test's "when does it go red" is answered in the post-implementation check.

### Dimension: Resource reuse

The only expensive resource is the Electron launch of T30 (and the build `pnpm e2e` runs once before the suite):
one launch for the whole Antigravity journey, as the suite's rule requires (one per distinct fixture home). The
providers cases create a temporary home of small SQLite files and transcripts per case (milliseconds; the existing
`antigravity.test.ts` pattern, reused: `roots`, `trust`, `usageConversation`, `build`). No shared setup clears a
resource another case uses.

### Findings

No findings. (Design gaps were folded into the table before review: the "fork that asked nothing" case was added to
T16.)
