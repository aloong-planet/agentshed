
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

---

# Review — tests: the session ID and resume (2026-10-28)

No ticket: a direct implementation of session-view::US-001, session-view::CON-001, session-view::CON-002 and
session-view::CON-003 ([spec](../../specs/session-view.md), a443fb3). Both times are recorded in this section.

## Design review

Date 2026-10-28; implementation starting from 5f61f3b (branch feat/session-resume). Scope: every test planned
for this round.

### Test design table

| # | Spec item | Seam | Input that drives the target branch | Assertion object and where its expected value comes from | Fixture shape source | Expensive resource and how provided |
|---|---|---|---|---|---|---|
| U1 | US-001/AC-01 (Claude) | providers: `TokenEngine.sessionQuestions`, the call the page handler makes | a Claude session file named by a UUID, built and opened | the result's session ID equals the file name's stem, written in the test as the UUID it named the file with | the suite's measured Claude line builder; the UUID file name as every listed real file has (1048 of 1048, 2026-10-28) | none (an engine on a temp dir, milliseconds) |
| U2 | US-001/AC-01 (Codex, from the record) | the same | a legacy rollout whose name holds no UUID and whose session metadata carries an id | the session ID equals that id, which the name cannot supply — so a name-based reading fails | the suite's measured rollout builder | none |
| U3 | US-001/AC-01 (Codex thread segment) | the same | a paginated segment named `rollout-<ts>-<thread>_<segment>.jsonl` whose metadata id is the thread | the session ID equals the thread, not the segment (the name's last UUID) | the real segment inspected 2026-10-28 (ordinal on the first line, the id equal to the name's first UUID, a history base naming the previous segment) | none |
| U4 | US-001/AC-01 (Codex cold rollout) | the same | a `.jsonl.zst` twin of a rollout with an id | the cold page's session ID equals the plain twin's id | the suite's compressed-twin pattern (zstd of the plain bytes) | none |
| U5 | US-001/AC-09 (a Codex record without an id) | the same | a rollout whose metadata has no id | the session ID is null | the suite's rollout builder without ids (a shape the e2e fixtures already use) | none |
| U6 | US-001/AC-01 (Grok) | the same | a Grok session directory named by a UUID | the session ID equals the directory name written in the test | the suite's measured Grok layout builder | none |
| U7 | R3, the contract (US-001/AC-01, AC-09) | shared: `validateSessionPage` | a page with a UUID, with null, with an empty string, with a number, and without the field | the first two pass, the other three fail naming `sessionId` — from the spec's "a non-empty string or null" | the suite's existing session page object | none |
| U8 | CON-003 | main: `DisplayStore` constructed over a written display cache, read back with `get()` | a display cache holding Claude, Grok and Codex session pages without the field, plus one whose field is malformed | the Claude and Grok pages restore with the ID their paths name (written in the test), the Codex page with null, the malformed one is dropped | the key set of the seven real saved session pages in this machine's display cache (2026-10-28), never written by the current code | none |
| U9 | US-001/AC-04, CON-001, CON-002 | shared: the resume command builder | each side; a directory with a space, with a single quote, non-ASCII; an ID that is a UUID; IDs holding `;`, `$(`, a space and a single quote | the whole command line, written literally in the test from the spec's rule (not computed by the builder's own quoting) | n/a (strings) | none |
| U10 | R1 with the reveal channel (US-001/AC-07, AC-10) | main: the reveal channel's pure judge in security.ts | a listed path that exists; one that is gone; a restored entry that is a regular file and one that is a symlink; unlisted paths with R1's bypass vectors (a prefix lookalike, a traversal, another case, an encoded spelling) | the decision — reveal, gone, or refused — from the spec's admission rule | temp files and a symlink built in the test | none |
| E1 | US-001/AC-01 to AC-10, CON-002 end to end, and AC-08's two routes | e2e: the built app in Electron, as a user reaches the page | one home: a project whose directory name holds a space and a single quote, with a Claude session named by a UUID, a Codex rollout with an id, a Codex rollout without one and a Grok session; plus a stale project (registered in Codex's config, never created) holding a Codex parent and its fork. The main process's clipboard write and Finder call are replaced through `app.evaluate` with recorders before the first click | the recorded clipboard texts and Finder paths, the meta line, the buttons' order and states, the tooltip's text and warning line, the toasts — each expected value written in the test from the spec (the commands literally) | the existing e2e fixture shapes (app.spec.ts's Claude and Grok homes, global-search.spec.ts's Codex fork pair) | one Electron launch for the whole case, through the file's `launch` helper; the build is the one `pnpm e2e` makes for every case |

Order inside E1, so each negative reads against a later event: copying the ID on the Claude page (proves the recorder)
before the disabled buttons are clicked on the page without an ID, and that page's later Finder click (the same
renderer, in order) before reading that no clipboard write came; the Codex file is deleted last, before its Finder
click. AC-02's keyboard focus is driven with focus emulation on through the window's DevTools protocol session,
since the case's window is not shown (the file's note on focus); if that does not reach the handler the focus half
becomes a stated gap. AC-06's restart is timed in the page: the time after the second click and the time the check
disappears, the gap required to exceed 1000 ms with the clicks 1000 ms apart (without a restart it is about 500 ms).

### Coverage

Each item of "Failure modes and boundaries: session ID and resume" and US-001's criteria was checked against the
table. Driven: first open (E1); the global search route and the fork parent from it (E1); copying both texts, a
directory with a space and a quote (E1, U9), non-ASCII and IDs with shell characters (U9), a refused clipboard and
a second copy within 1.5 s (E1); a vanished file and a refused path (E1, U10); the restored-entry check (U10);
CON-003 (U8); the contract (U7); each side's ID source including the segment and the cold rollout (U1–U6). Not
driven, to be stated in the test files' headers: the header on a cached revisit and the restored page (the same
render path as a first open; the data is U8's), a transfusion while a tooltip is open and a language switch with
one open (the language changes only on the settings page, which no session page survives), the overview card's
route (the same shell call as the Sessions tab's, from the same project entry), and agent text drawn as text
(React text nodes; no markup path is added). The behaviours under "Pasting the command" are the agent sides' and
are not the product's to test. Every fixture of data another program writes takes its shape from a real sample,
as the table says.

### Case design

Every case goes through a public seam: the engine's page call, the contract's validator, the store's constructor
and reader, the builder, the judge, the built app. The e2e recorders replace only the operating system's two
calls at the process boundary, which the spec's testing decisions name; no internal state is written to set up a
case, and the state each case needs is one the app builds itself (files on disk, a scan, clicks).

### False greens

Design-time checks: no threshold assertions (always-true does not arise); every expected value is written from
the spec or from the fixture's own literal (the file name, the directory name, the record's id), never recomputed
by the code under test — U9's commands are spelled out, not produced by the quoting function; every assertion is
on the new live path (the session page's header, the new field, the new channel). The negative reads in E1 are
placed after a later event of the same order. Mutation testing: per the project's capability declaration,
mutation-testing is not enabled, so it is skipped; each test's "when does it go red" is answered in the
post-implementation check.

### Resource reuse

The one expensive resource is the Electron app: E1 launches it once, through the existing `launch` helper,
matching every other e2e case (one launch per case, its own home and userData); folding the stale project into
the same home saves a second launch. The build is made once by `pnpm e2e`. Unit cases build engines and stores
on temp directories in milliseconds and are not expensive. No case clears a process-wide resource.

### Findings

No findings.
