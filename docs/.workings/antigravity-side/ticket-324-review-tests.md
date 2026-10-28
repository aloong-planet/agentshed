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

### Increment: the post-implementation check's findings (2026-10-29)

Rows added or changed for F1, F3 and F4 of the post-implementation check below, designed before the tests were
written (implementation version 05faa8a plus the fix's working tree). F2 adds no test: the gap goes into
`antigravity.test.ts`'s header with its closing condition (the refusal of a rewritten transcript is the IPC handler's
end-of-read identity check and its question revision; no unit seam reaches the handler, and a rewrite in the middle of
a read is a race the e2e cannot stage without a pause). The fix also rewords the subagent block's unattributed note
(a dictionary entry, no test change: the e2e reads keep their phrase "stable reference chain").

| # | Test (file) | Spec units | Seam | Input that drives the target branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| T35 | a subagent conversation that was asked something still gets no row and is not admitted (antigravity.test.ts) — **new** | REQ-003/AC-01 (subagent clause), token-stats::REQ-003/AC-07, REQ-004/AC-09 (subagent part) | P | `dispatchHome` with the subagent's transcript given a user-input line after its measured lines; a control conversation with the same transcript under a record that names no parent | the project's rows are the dispatch's literal row and the control's (so the transcript does ask something); the global total still holds the subagent's call (7148, hand sum); `sessionReadTarget` refuses the subagent's database; the allow-list is the dispatch's and the control's databases | the real subagent record and transcript; the question line derived (no real subagent transcript holds one: a user resuming a subagent by its ID would write it) | none |
| T36 | T28 — **changed** (question-corpus.test.ts) | global-search::REQ-001 (subagent part) | P | T28's home, the subagent's transcript given the same derived question | searching that question's words finds nothing; the existing assertions unchanged | as T35 | none |
| T37 | a subagent that sends two messages within its dispatch's turn (turn-content.test.ts) — **new** | session-view failure mode "more than one message back" | U | `dispatch`'s turn with a second system message from the same sender after the answer (the measured message, its index after the answer's, another body) | the sub block's result is the real message body, a blank line, then the derived body, in that order | real + derived | none |
| T38 | a summaries read that fails while agy writes keeps the titles last read (antigravity.test.ts) — **new** | REQ-003/AC-03 and the failure mode "a read that fails while agy writes them" | P | one engine given a directory that does not exist for the summaries copy (the engine's new constructor argument, as parse jobs carry theirs): built once with the summaries in place (no log, read in place), then the summaries replaced by an open writer whose log holds a new title, built again | the second build's row keeps "List Calc.py Function Names" — neither the log's title (a read that worked) nor the first question (titles dropped); with no titles read before, the same failing read gives the first question (clipped by hand) on a new engine's page asked before any build and at its first build | real schema and title; WAL by the existing writer | none |
| T39 | a fork whose parent cannot be read (antigravity.test.ts) — **new** | the failure mode "a fork's parent that cannot be read"; REQ-005/AC-04 | P | `parentAndFork(true)` with the parent's database set to user version 2 after it is written (agy rewriting it in another format) | the parent is counted unreadable and has no row; the fork keeps its row; its page is `stripped` with no parent file or title | real records; the format change derived | none |
| T40 | a full-text hit in lines a rewind undid inside a turn (search-sessions.test.ts) — **new** | the failure mode "a rewind back to a step inside a turn"; REQ-004/AC-03 | P | a listed conversation whose transcript is T5 (b)'s shape, the undone result holding a word no kept line holds | question mode: no group; full text: one group, its one hit question 1 in the body, nothing folded | derived from the measured rewind (as T5 (b)) | none |
| T41 | a line without a step index (question-index.test.ts) — **new** | Implementation Decisions "a line without a step index is neither a redo nor undone"; REQ-004/AC-03 | U | derived lines in the measured shape: (a) Q(0) A(1) then a question with no index; (b) a question with no index then A(0) | (a) both questions listed; (b) the unnumbered question listed | derived (every measured line has an index) | none |
| T42 | T30 — **changed** (e2e/app.spec.ts) | Implementation Decisions "the page's byte figure is the database's size" | E | the fork's page in T30's journey | the meta line holds the fork database's size as the line writes it (KB with one decimal, read from the file on disk); the transcript's size, written the same way, differs, so the read tells the two apart | as T30 | T30's launch |
| T43 | a fork's page names its parent with a corrupt entry ahead of it, before any build (antigravity.test.ts) — **new** | the cache rule (shape guard before a field is read) on the fork-parent lookup | P | `parentAndFork(true)` built; the cache file rewritten with the silent fork's entry first, as `{ sig, agg: null }` and then as `null`; a new engine asked for the fork's page before it builds | the page names the parent's database and title in both forms; the corrupt key comes before the parent's in the written file (so the lookup meets it first) | real records; corruption as T31 | none |

Review of the increment: every row drives a public seam (`build`, `sessionQuestions`, the indexer, the block assembler,
the project search, the Electron journey); the one new seam (T38's directory) is a constructor argument the engine
passes to the summaries read, with the default of every other read, so no case reaches into the engine. Expected values
are hand figures, real texts or literals; T42's KB figure is written from the file's size by the format the meta line
shows, which is not what the case tests (the case tests which file's size is shown, and asserts that the two files'
figures differ). Each derived shape is a measured mechanism at a position not observed, marked in its case. No row
adds an expensive resource. T38 was widened while it was written (the first-read fallbacks, item 3 below) and reviewed
again on the same terms. No finding.

Self-check before hand-over (items 2–5; items 6 and 7 below; item 1 in the code review record):

| Item | Object | Result |
|---|---|---|
| 2 | T35, T36 | Expected values are literals and a hand sum (330 + 7148 + 55 + 33); red when the subagent detection is lost (R1, R2). Dropping either of the two parse guards alone leaves both green (R3, R4): a subagent's transcript is never read, and a subagent is never listed — either guard alone keeps the behaviour, so the cases watch the behaviour, not one line |
| 2 | T37 | Literal from the real message; the case first asserts the real line carries that body (so the replacement cannot miss); red when only the last message is kept (R5) |
| 2 | T38 | Three reads, each awaited; red when a failed read drops the titles (R6), when the build or the page's first read is not given the copy directory (R7, R8 — the read then works and shows the log's title) |
| 2 | T39 | Literal row, count and page fields; red when a parent that cannot be read is resolved as the parent (the unreadable entry would have to carry the parent's id) or when the fork loses its row or state — answered against `agyParent` and the unreadable entry's empty id; no single line to alter |
| 2 | T40 | Question mode empty, full text one hit at question 1 in the body, nothing folded; red when a full-text hit in undone lines inside a turn is dropped, folded or put in another turn — the project search maps a hit by the turn ranges, which hold the undone lines (T5 (b)) |
| 2 | T41 | Red when a line without an index can be undone (R9) or acts as a redo (R10) |
| 2 | T42 | The two figures are first asserted to differ (384.0 KB against 3.7 KB in the run), so the read tells the files apart; red when the meta line shows the transcript's size (the e2e reach check, after a rebuild) |
| 2 | T43 | The corrupt key is asserted to come first, so the lookup meets it; red with a TypeError when the shape guard follows the field read (R11) |
| 2 | Forms | No always-true bound, no expected value computed by the code under test (T42's KB figure is the format the line shows, not the case's subject), no old path, no conditional skip (T38 throws without its writer), no loop that may run empty (T43's two fixed entries) |
| 3 | `TokenEngine`'s constructor | One new stored argument, no branch; its default is the read's own (the system's temporary directory), as before |
| 3 | The build's title read | Read works: T14, T15, T21; fails with titles read before: T38 (kept); fails with none: T38 (a new engine's first build falls back) |
| 3 | The page's first title read | Read works: T19; fails: T38 (a new engine's page falls back) — added to T38 by this item |
| 3 | `check-shared-ui.mjs`'s side-count rule | The reworded note now passes the rule's default path (no side-count word); evidence: `pnpm check:ui` in the targeted verification |
| 3 | The dictionaries' note | A string; the e2e reads of the Claude and Codex dispatches keep their phrase |
| 4 | Data | T35/T36's question line is the measured user-input shape (the case file's `question` helper, from a real line); T37's second message is the real one with another body; T40/T41's lines carry the measured key set (T41 without the index); T39's parent is the real record at another user version; T43's corruption is T31's. Each derived shape is marked in its case |
| 5 | Shared helpers | `mkAgyFork` (search-sessions.test.ts) gained a parameter; its users are that file's two cases, both in the targeted run. No shared fixture module changed |

- Item 6, evidence: [ticket-324-fix-reach.log](ticket-324-fix-reach.log) keeps the reach checks' scripts, each
  alteration's search and replacement, and their full output (each file restored byte for byte, the `src` diff
  compared before and after). The exploratory runs before it stay in the session scratch directory; one of them labelled
  an alteration "both parse guards dropped" while dropping only one, which R4 replaces with an exact label. The
  targeted run's log is [ticket-324-fix-targeted.log](ticket-324-fix-targeted.log) (OVERALL exit 0); its first run,
  [ticket-324-fix-targeted-run1.log](ticket-324-fix-targeted-run1.log), failed lint on an unused binding in T43, which
  was replaced by a copy and a delete before the run was repeated. Found by the gate, so not a self-check finding.
- Item 7, records: this increment's table (T38 widened); `antigravity.test.ts`'s header (F2's gap); the feature
  checklist's #324 rows (re-evidenced at the fix commit); the document sync checklist (the checklist rows and the
  reworded note); the decisions record; the code review record (item 1).

Self-check findings: the first pass found one — item 3: a failed summaries read with no titles read before, at a build
and on a page's first read, was driven by no case (a regression that would be missed: both lines changed in this fix).
T38 was widened (rows above) and the self-check run again over the widened case: no finding.

## Post-implementation check

Date 2026-10-29 · ticket [#324](https://github.com/aloong-planet/agentshed/issues/324) (feature `antigravity-side`) ·
implementation version 05faa8a (range `c9f69aa..05faa8a`, branch `feat/antigravity-sessions`) · scope: every test the
ticket writes or changes — T1–T30 above and T31–T34 added below · reviewer independent of the implementation · this
record's path is the test review artifact the ticket declares (`ticket-324-` prefix under the feature's working
directory). The commit after the range (ef6ee8b, the features pages) changes no test and no product code.

### Run evidence

The handed-over pre-review run log, [ticket-324-gate-prereview.log](ticket-324-gate-prereview.log) (git-ignored), read
in full against `implement/full-verification-gate.md`: `git rev-parse HEAD` = 05faa8a, the range's end; the version
manifest is empty; typecheck, lint, the unit suite, `test:scripts`, `test:site`, `check:ui`, `check:lang`, `check:i18n`,
`check:nul`, the e2e files the change touches (`app.spec.ts`, `token-span.spec.ts`) and smoke each carry their full
output and `exit=0`; `OVERALL exit=0`. The reviewed files: `question-index.test.ts` 61, `turn-content.test.ts` 34,
`antigravity.test.ts` 79, `question-corpus.test.ts` 17, `search-sessions.test.ts` 10, `token-stats.test.ts` 107 cases
passed; e2e #91 (T30), #36 (T33) and `token-span.spec.ts` #99 (T34) passed among 100. One required item is missing:
the two version commands carry no exit code (F5).

Measured by this check, on reviewed cases and real data only:
- A read-only enumeration of every `transcript_full.jsonl` under agy's data root (a script reading with `readFileSync`
  only; script and output in the session scratch directory, not kept — the figures are quoted here): 15 transcripts,
  104 lines, 0 unparsed; USER_INPUT 24 (request block 24, metadata 24, settings change 13, empty request 0),
  PLANNER_RESPONSE 44 (thinking 19, `file://` in prose 10), GENERIC 24 (DONE 20, ERROR 3, RUNNING 1), SYSTEM_MESSAGE
  11, ERROR_MESSAGE 1; 24 calls, every result line after a pending call and no response arriving with a call pending;
  every line has a step index. Each of the fixture's six transcripts equals the real one line for line after the two
  path substitutions its header names (`cancelledDispatch`: the real file's first 21 of 34 lines). Both real subagent
  transcripts (`e7f637c9`, `b5ca9570`) open with a system message and hold no user-input line.
- The real `conversation_summaries.db`, copied into the scratch directory and opened there as immutable (the copy then
  removed; agy's file unchanged, still 40960 bytes of 2026-10-28 21:25): user version 3; its `CREATE TABLE` and two
  `CREATE INDEX` statements equal the fixture's `SUMMARIES_SCHEMA` character for character; the three titles in
  `MEASURED_TITLE` equal their rows; the fork's and both subagents' titles are empty.
- `pnpm exec vitest run` on `antigravity.test.ts`, `question-corpus.test.ts` and `search-sessions.test.ts`, filtered
  with `-t` to this ticket's describes in them (`--reporter=verbose`): 31 passed, 75 skipped, `tests 534ms`; no case
  printed a duration, i.e. none reached vitest's default 300 ms slow-test threshold. Exit code 0.

### Test design table: the written tests against their rows

| Row | Written as | Agreement |
|---|---|---|
| T1 | Q "a question is the request body: …", Q "a user-input line without a request block is listed whole; …" | Agrees. The row's "line 5" is `main[4]` (step 4; `main[5]` is a notice); the cases call `questionTextAt` on the parsed line, which is what `questionTextOfRange` does after parsing — T2 drives the range form |
| T2 | Q "each question's turn runs to the next question's line, with its tool calls counted" | Agrees; the offsets are `indexOf` of the real line in the text, and the case also pins the question ends, times and title |
| T3 | Q "a subagent dispatch counts as a subagent, not as a tool" | Agrees |
| T4 | Q "a rewind: the lines it undid take no number and are not listed — the measured fork" | Agrees (offset read off the text, not the literal 1141) |
| T5 | Q "a rewind back to a question ends the turn before it at the undone lines; one inside a turn counts only the redo" | Agrees |
| T6 | Q "a line that will not parse is skipped without the rest of the file; …" | Agrees |
| T7–T10 | TC cases of the same names | Agree |
| T11 | TC "a subagent's later message, in a turn of its own, renders nothing there" | Narrower than the row: only turn 2 (the later message alone) is driven; turn 1's return is T8's assertion and the turn boundary T2's/T5's. Equivalent for the failure mode it names |
| T12, T13 | TC cases of the same names | Agree (T13 keeps the anchor form the Claude and Grok cases use) |
| T14–T24 | the `sessions: …` describe of `antigravity.test.ts` | Agree; T14 and T20's subagent parts: F1 |
| T25 | the case "an Antigravity conversation has no session page yet" | Removed, as designed |
| T26 | the `it.each` "an entry missing %s, …" over ten fields with a well-formed control | Agrees; the arity and type cases moved to T32 |
| T27 | `token-stats.test.ts` "a change to FileAgg's field set must be noticed …" | Agrees |
| T28 | G "its displayed questions are searched with their numbers; …" | Agrees, but `forkRewound` is written without copied steps (not a fork in this home); the undone question is what REQ-001 needs. The subagent part: F1 |
| T29 | S "question mode hits the kept question; the undone one is not a hit, and in full text it is folded" | Agrees; the needle is the undone question's "exactly one word" (the row said "forked", which the undone answer also holds); not a fork either |
| T30 | e2e "Antigravity sessions: AG rows and forks, …" | Agrees (undone needle "exactly one word"); one `launch(` in its body |

Four written or changed tests had no row. Added here and reviewed as the Design review prescribes:

| # | Test (file) | Spec units | Seam | Input that drives the target branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| T31 | "is read again rather than failing the build or the session page" (antigravity.test.ts) — **changed** | token-stats cache rule; C4 single-file rebuild of an Antigravity page | P | the cache entry replaced by `{ sig: '1:1', agg: null }`, then by `null`, the `dispatch` transcript beside | the build's total 110 both times (hand sum); the corrupt entry's page has the transcript's one question; an absent entry is `sessionNotIndexed` | real transcript | none |
| T32 | `it.each` "an entry with %s is read again rather than reused" (antigravity.test.ts) — **new** | token-stats cache rule (shape guard) | P | a well-formed entry with a six-element call, a six-element question record, a title of `7` | the real 110, not the sentinel 999 000 a reuse gives | existing mechanism | none |
| T33 | the archive retention case's stamp `+c19` (e2e/app.spec.ts) — **changed** | token-stats C10/ADR-0026; `CACHE_VERSION` 19 | E | the seeded archive written under the live stamp | unchanged assertions; the literal is the case's own tripwire for a version bump | existing | its existing launch |
| T34 | the retained-rows case's stamp `+c19` (e2e/token-span.spec.ts) — **changed** | as T33 | E | as T33 | as T33 | existing | its existing launch |

Review of the added rows: they drive the public seams (`build`, `sessionQuestions`) with the established on-disk
corruption; their expected values are hand figures or literals, none computed by the code under test; `+c19` is the
live path (`CACHE_VERSION = 19`); no expensive resource beyond T33/T34's existing launches. No finding.

### Dimension: Coverage

Session-view's "Failure modes and boundaries: Antigravity sessions" as it stands at 05faa8a, the 2026-10-29
write-backs included, with the ticket's Implementation Decisions statements:

| Failure mode / statement | Driven by | Verdict |
|---|---|---|
| agy still working: refetch (P5); index rebuilt for that file only (C4) | T22; P5 is the shared transfusion path | Covered |
| A compaction rewrite: identities that no longer match are refused (REQ-001/AC-04) | nothing; the Design review's gap note is in no test file | F2 |
| A rewind while the page is open: the next snapshot drops the undone question; an expanded turn's stale identity refused | T4, T5, T22; the refusal as above | Covered, refusal F2 |
| An open fork's parent deleted: the banner switches at the next scan | T17 (b) | Covered |
| A fork of a fork | T18 | Covered |
| A subagent messaged again in a later turn | T11 | Covered |
| The header's ID and command: the fork's own; a subagent has no page; no saved page predates the ID | T19, T30; a subagent's page: F1 | Covered except the subagent part |
| Introduced content: `file://` links as text; titles as text | T30 (raw link text present, no anchor in the prose); titles render through the shared text path | Covered |
| A rewind to a step inside a turn: undone lines not shown; full-text search counts a hit in them as that turn's | T12 (not shown); full-text: nothing | F3 (d) |
| A subagent sending several messages within its dispatch's turn: shown in order | nothing | F3 (a) |
| Summaries missing or of another shape: fallback; a read failing while agy writes keeps the last titles; a later title appears at the next scan | T15 (fallback); T21 (later title, the conversation's files unchanged); the failed read: nothing | F3 (b) |
| The fork pill's copied-history wording on an Antigravity row | T30 (the pill's title attribute) | Covered |
| A parent unreadable in the supported format: the banner's no-longer-here form | nothing | F3 (c) |
| Implementation Decisions: a line without a step index is neither a redo nor undone | nothing (every fixture line has one) | F3 (e) |
| Implementation Decisions: the page's byte figure is the database's size | nothing (T30 reads the meta line up to "1 question ·") | F3 (f) |
| The fork-parent lookup over a cache read from disk with a corrupt entry (the cache rule) | nothing (T31's corrupt conversation is no fork) | F4 |
| The ticket's acceptance units REQ-003 to REQ-005, US-001 (agy clauses), token-stats::REQ-003/AC-07, CON-002, REQ-004/AC-01, project-detail::REQ-002/AC-04, global-search::REQ-001 | T1–T24, T26–T30; the `agy --conversation` builder form in `session-resume.test.ts` (#322) | Covered, except the subagent clauses: F1 |

Claimed against driven inputs: T14, T20, T28 and T30 claim the subagent clause (no row, not admitted, not searched),
but the subagent fixture is the real subagent transcript, which asks nothing, so its absence follows from
REQ-003/AC-02 whatever the subagent flag says (F1). Every other claimed boundary names the input that reaches it.

Test file headers: `antigravity.test.ts`'s gap list has no entry for this ticket (F2; F3 (b) would need one if no seam is
added); the other changed files need none for what they drive.

Fixture independence: verified against the real data (Run evidence above) — the six transcripts are agy's own lines,
the summaries schema and titles agy's own; the derived shapes are marked in each case.

### Dimension: Case design

Every case drives a public seam — the indexer and block assembler, `build`, `sessionQuestions`, `isFresh`,
`sessionReadTarget`, the corpus and the project search, the Electron journey. The cache file is read or written only by
T26, T27, T31 and T32, whose subject is the cache's shape (the established pattern). T24 repeats the handler's range
read itself because the handler has no unit seam; it asserts the index the handler consumes. No case builds a state the
public path cannot reach: forks carry copied steps as agy writes them; corrupt entries are the on-disk corruption the
cache rule exists for. The clipboard and Finder are intercepted at the main process's Electron boundary as
session-view's Testing Decisions prescribe; every click is a real one. No finding beyond those listed under Coverage.

### Dimension: False greens

Mutation testing: per the project's capability declaration, `mutation-testing` is not enabled (`enabled = false`), so
it is skipped; each case's "when does it go red" is answered below against the code under test and the expected
values' sources.

| Case | Goes red when |
|---|---|
| T1 | the metadata or settings block stays in the text; a block-less line is dropped or not collapsed; an empty request or a system message (notice, subagent's opening message) becomes a question |
| T2 | an offset or turn end differs from the real lines' positions; a turn overruns the next question or the last stops short of the file's end; a tool count differs from [1, 3, 2, 0]; a time or the title differs |
| T3 | `invoke_subagent` counts as a tool, or a dispatch is not counted |
| T4 | an undone line is kept (two questions), the kept question's range or the title differs |
| T5 | (a) the undone question is listed or the first turn runs past the undone run; (b) the undone call is counted (2) or a question is lost |
| T6 | a bad line drops the file or another question, or the half-written last line extends the last turn |
| T7 | the block order or kinds change (thinking after prose, a notice rendered); an output is not the following result line's content (the ERROR result included); a thinking body differs |
| T8 | the dispatch is no sub block; its name or prompt differs; its result is the creation echo or anything but the message body; steps non-empty or linked; `manage_subagents` not a tool with its output |
| T9 | the cancellation notice or the timer's message fills the result or renders; the RUNNING result is not the call's output |
| T10 | the error line is not prose with the error text; the invented type is dropped or traced elsewhere than after the blocks |
| T11 | a sender-matched message outside its dispatch's turn renders anything |
| T12 | the undone call or its result is shown, or the redo is missing |
| T13 | a per-range read differs from the batched read (a range-reader property); turn 1's kinds change; turn 1's read reaches the 2 MB padding. The ranges' correctness itself is T2's |
| T14 | any field of the literal row differs (summaries title; `at` from the file time or the calls only; tokens of another conversation; count; fork state); the empty or silent conversation gets a row; a no-row conversation's tokens leave the total; the empty database counts unreadable. Not when the subagent flag is ignored (F1) |
| T15 | a missing, untitled, non-database or other-shaped summaries file breaks the build or gives a title other than the hand-clipped question (an empty title would show as `''`) |
| T16 | the fork's tokens include copied calls; its state is not `stripped`; its parent or the parent's title is not found; its ID differs; the silent fork gets a row or its call is lost; copied calls count twice or never |
| T17 | (a) a parentless fork is `uncertain`/`none` or names a parent; (b) a parent deleted before the next scan still resolves after it |
| T18 | the parent is the first copied step's source (`conv-a`) rather than the last (`conv-b`) |
| T19 | the ID is not the database's name; the source is not the transcript path; the title is not the summaries title read lazily on a fresh engine; the question text differs |
| T20 | the listed database is not admitted, a transcript path is admitted, or the list holds anything else. Not when the subagent flag is ignored (F1) |
| T21 | a read creates or changes a file in the data root, without or with a log; the log-only title is not read; titles are cached per conversation (the second build's conversation files are unchanged) |
| T22 | the transcript is not in the signature (`isFresh` stays true, the second question is missing, the next build counts 1), or the database is written |
| T23 | an unreadable conversation with a transcript is listed, admitted or not counted, or its page does not refuse with `sessionParseFailed` |
| T24 | a question's range reaches past its line into the 1 MB padding; a zero-byte read also fails it |
| T26 | an entry lacking the field under the current signature is reused (the sentinel 999 000); the control fails if well-formed entries stop being reused |
| T27 | the Antigravity entry's key set changes |
| T28 | a kept question is not found with its number, or the undone question is found. The subagent's text: only if system messages became questions (F1) |
| T29 | the kept question is not hit with its number; the undone question is a question-mode hit; its full-text hit is not folded (here the undone lines precede the first kept question) |
| T30 | any of its reads fails: row titles and order, badges, counts, the pill's title and count; the banner's sentence and link; the meta line's start and ID; the undone question listed; the turn's Thinking block, the raw link text, an anchor in the prose; the two clipboard writes; the tooltip's command; Finder given anything but the databases; the parent's page; the gone banner's sentence or a link in it; the global search groups, badge, pill and hits; a no-hit search showing groups; a main-process error. Not on the byte figure (F3 (f)) or the subagent (F1) |
| T31 | a corrupt entry fails the build or the page, or is not read again for the page; an absent entry stops being `sessionNotIndexed` |
| T32 | an entry with a six-element call or question record, or a non-string title, is reused |
| T33, T34 | the cache version moves without the literal (the case's own design) |

Forms checked: no always-true bound (T13: < 20 KB against a 2 MB file; T24: > 0 and < 5 KB against 1 MB); no expected
value computed by the code under test (offsets by `indexOf`, texts and titles written out, clipped titles by hand); no
old path (`+c19` and the twelve keys are live; T25 removed the retired assertion); no conditional skip (T21 throws
without its writer); no assertion that may not run (T13's loop follows `toHaveLength(4)`; every rejection is awaited).
T30's browser assertions against `review-code/false-greens.md`: each absence (`.ans a`, the gone banner's `a`, the
search groups) is read after a positive read of the same region has settled (the raw link text, the banner's whole
sentence, "No hits."); the clipboard and Finder reads poll the asserted value itself; no synthetic event or internal
call stands in for a user path.

### Dimension: Resource reuse

Expensive resources and their counts, from the pre-review run: the e2e build — one `electron-vite build` (main,
preload, renderer once, log lines 557–581) before Playwright; T30's Electron launch — #91 ran once with no retry, its
body holds one `launch(` (line 6132) and one `close(`, so one launch for the whole Antigravity journey; T33/T34 keep
their existing single launches. The providers cases are not expensive resources: each builds a small home in the
per-case `beforeEach` directory, and the measured filtered run above took 534 ms for 31 cases with none past 300 ms.
No reviewed case clears or releases a resource another case uses — no process-level cache is added by the change
(`agyTitles` is per engine instance, every case makes its own engine), what a case deletes (T17's parent, T21's
summaries, the homes `afterEach` removes) lies in that case's own home, and no e2e case rebuilds or removes the build
output — so no collection order bears on the counts. The design's
reuse of `roots`, `trust`, `usageConversation`, `build`, `corpusOver`, `run`, `launch` and `close` holds in the code.
No finding.

### Document sync for this check's findings

Scope (2026-10-29, at 05faa8a and the working tree): this record; the gate log; the four specs; issue #324 (read with
`gh`); `docs/.workings/antigravity-side/` enumerated with `ls -la`, ignored files included (the gate log is the one
git-ignored file) — `checklist.md`, `ticket-324-doc-sync.md`, `ticket-324-decisions.md`, `ticket-324-review-code.md`,
`final-regression.md` (no #324 test statement); `docs/features/{session-view,project-detail,global-search}.md` as of
ef6ee8b, `CONTEXT.md`, ADR-0037. Excluded: the other tickets' records (#322, #323, #325–#327: their own ranges) and
`docs/prototypes/` (no test statement).

Statements the findings make untrue or unsupported: the feature checklist's #324 rows session-view::REQ-003/AC-01,
REQ-004/AC-09, token-stats::REQ-003/AC-07 and the global-search::REQ-001 regression row cite cases whose subagent part
the input cannot drive (F1); its REQ-003/AC-03, REQ-004/AC-03 ("the rule's reading as written back"), REQ-004/AC-05
and REQ-005/AC-04 rows read "Verified" while the write-backs under them listed in F3 are driven by no case. The
Design review's coverage row says the compaction gap is in the test file header (F2). The features pages, CONTEXT.md
and the ADR state behaviour, which no finding changes. `ticket-324-doc-sync.md` has no item for the checklist rows: a
Pending item is owed there ("the #324 rows of the feature checklist re-evidenced after F1 and F3 are handled, or
reopened — before delivery", documents: `checklist.md`). Per the hand-off this reviewer writes only this record; the
item is listed here for the implementer to add.

### Findings

- **F1 — Every subagent fixture's transcript asks nothing, so no test drives the subagent rule of the list, the read
  allow-list or search.** `parseAntigravityFile` lists a conversation only when `!c.subagent && questions.length > 0`
  and skips a subagent's transcript altogether. The subagent in T14/T20 (`dispatchHome`), T28 (`mkAgyHome`) and T30
  is written with the real `subagent` transcript, which holds no user-input line (measured: neither real subagent
  transcript has one), so it is unlisted, unadmitted and unsearched by REQ-003/AC-02 alone: dropping `!c.subagent`, or
  a subagent detection that stops working, leaves every case green. Impact: session-view::REQ-003/AC-01's subagent
  clause, token-stats::REQ-003/AC-07's no-row part, REQ-004/AC-09's subagent part and global-search::REQ-001's subagent
  part are recorded as verified on evidence that cannot fail; it bites the day a subagent conversation's transcript
  carries a question (a user resuming it by its ID, for one). Recommended now: a derived subagent conversation (the
  measured subagent record, its transcript given a user-input line in the measured shape, marked not observed),
  asserting no row with its tokens counted, not admitted, not in the corpus — in the providers seam, through the same
  `build`; then re-evidence the four checklist rows (Document sync above).
- **F2 — The compaction-rewrite identity gap that the Design review says is recorded in the test file header is
  recorded in no test file.** The coverage row for "agy rewrites a transcript when it compacts" says the refusal is
  unreachable at the unit seam and is noted in the test file header; no changed test file's header carries it (the
  `antigravity.test.ts` gap list ends with #323's items). The detail at risk is the handlers' `sourceIdentity(source)`
  (the transcript, `src/main/index.ts`): reverted to the database's identity, a rewritten transcript is answered from
  stale offsets (session-view::REQ-001/AC-04) and nothing goes red — T30 never rewrites a transcript. Recommended now:
  either stage an Antigravity transcript rewrite in the existing e2e that asserts the refusal, or write the gap and
  its closing condition into `antigravity.test.ts`'s header, which makes the Design review's statement true.
- **F3 — Six behaviours the spec states for this side, written back or decided during implementation, are driven by no
  test and recorded as no gap.** All six entered the spec in 5a117de, after the Design review, and no row was added:
  (a) a subagent sending several messages in its dispatch's turn shows them in order — the concatenation in
  `antigravityAssemble` can become "last only" or "first only" with every case green (T8 has one message; unit seam,
  derived lines in the measured message shape); (b) a summaries read failing while agy writes keeps the titles last
  read — `?? this.agyTitles` in `build` is never reached: the engine passes no `tmpParent` to `readAgySummaryTitles`,
  so the failed-copy runner the conversation cases use cannot reach it (a missing seam: inject it as the parse jobs
  carry theirs, or record the gap in the header); (c) a parent unreadable in the supported format gives the
  no-longer-here banner — no case has an unreadable parent (providers seam: T16's home with the parent at user version
  2); (d) a full-text hit in undone lines inside a turn counts as that turn's — T29's undone lines precede the first
  kept question and are folded, which is the other branch (providers seam: T5 (b)'s transcript searched in full
  text); (e) a line without a step index is neither a redo nor undone — `s === null ||` in `agyKeptLines` is never
  reached, every fixture line carrying an index (unit seam, a derived line); (f) the page's byte figure is the
  database's size — `statSync(file)` rather than the source in `getSessionPage` can change unseen, T30 reading the meta
  line only up to "1 question ·" (e2e seam: read the figure and set it against the database's size, not the
  transcript's). Recommended now: add the rows and cases (or, for (b) without a seam, the header gap), then re-evidence
  the four checklist rows named under Document sync.
- **F4 — The fork-parent lookup's guard against a corrupt cache entry is reached by no test.** `agyParent` iterates
  every cache entry and relies on `isWellFormedAgg(v?.agg)` before dereferencing; before the first build the cache is
  as read from disk (`loadCache` checks only the version), so a null or agg-less entry for any other file would throw
  on a fork's page at startup without it. T31's corrupt conversation is no fork, so `agyParent` returns before the
  loop. Recommended now: in T31's describe, a fork whose parent is present beside a corrupt entry for a third
  conversation, the fork's page asked before any build (the page names its parent and does not throw).
- **F5 — The pre-review log gives no exit code for its two version commands, so its empty version manifest is not told
  apart from a failed `git status`.** `implement/full-verification-gate.md` requires an exit code taken without a pipe
  for every command, the version commands included; lines 2–5 of the log carry `git rev-parse HEAD` and
  `git status --porcelain --untracked-files=all` with their output and no `exit=` line (the #323 pre-review log has
  them). Not re-run here, as the rule forbids; this reviewer's own `git status` at the start of the check showed a clean
  tree at 05faa8a, which corroborates but does not replace the log. Recommended: record both exit codes in the full
  run's log before delivery, which re-establishes the version for the whole suite.
