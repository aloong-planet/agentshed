
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
a second copy within 1.5 s (E1); a vanished file and a refused path (E1, U10); the restored-entry check (U10 for the judge, E2 for its wiring — the increment below);
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
the spec's words, from the fixture's own literal, or from the confirmed prototype (the check glyph, the copy, the copied
button's border — the increments below), never recomputed by the code under test (the file name, the directory name, the record's id), never recomputed
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

### Test design table — increment after the post-implementation check (2026-10-28)

Rows changed by the post-implementation check's findings F1, F2, F3 and F5 below, reviewed here before the tests were
changed. The E1 row stands as written above, with these assertions changed or added:

| # | Spec item | Seam | Input that drives the target branch | Assertion object and where its expected value comes from | Fixture shape source | Expensive resource and how provided |
|---|---|---|---|---|---|---|
| E1 (changed) | US-001/AC-01 "at the end of its meta line" | as E1 | the Claude Code page | the meta line's text ends with "· Session ID <the UUID>" — anchored at the end, from AC-01's words | as E1 | the same launch |
| E1 (changed) | US-001/AC-02 "appears at once" | as E1 | hover and keyboard focus on each button | the tooltip names the action within 500 ms of the hover or focus — a bound well under the native title's delay of about a second, which the spec's "at once" rules out | as E1 | the same launch |
| E1 (changed) | US-001/AC-06 "its icon becomes a check" | as E1 | a copy of the ID | while copied, the button's icon is the check glyph (its path `M20 6 9 17l-5-5`, Lucide's check) and not the copy glyph (no `rect`); once the check has gone, the copy glyph's `rect` is back — the glyphs are the icon library's, not recomputed by the code under test | as E1 | the same launch |
| E1 (added in 99d96c1, recorded here) | US-001/AC-06, the prototype's state rule for a copied button | as E1 | a copy of the ID, then the pointer moved away | the copied button's border colour equals a resting sibling's — the expected value comes from the prototype's state rules (a copied button recolours its icon only), which the spec's UI decisions state after this round's write-back | as E1 | the same launch |
| E1 (added in 99d96c1, recorded here) | US-001/AC-06 (the check is this page's) | as E1 | a copy on the stale child page, then the fork banner's jump to the parent | the parent page's resume button carries no `done` class, read once, guarded to fall inside the 1.5 s (a retried negative would pass once the check had gone by itself) | as E1 | the same launch |
| E1 (changed) | US-001/AC-10 "the button shows no check" | as E1 | a copy the clipboard refuses | the button's class read once right after the error toast is visible, guarded to fall inside the 1.5 s, holds no `done` | as E1 | the same launch |
| E2 | the failure mode "a restored allow-list entry is shown only while it is a regular file" (R1) and its wiring in the reveal channel (US-001/AC-07) | e2e: startup-restore.spec.ts's second launch, whose first scan is held off for 20 s — the app's own restart, so the allow-list is the restored one | before the first scan completes (the startup hint not yet ready, read before and after), the restored session file `saved.jsonl` swapped for a symlink to a copy, then `revealSessionFile` called through the preload API; the regular file put back and called again | the first call rejects and Finder's recorder stays empty; the second hands Finder the session file's path — from the spec's admission rule | the case's own saved session | no new launch: inside the case's existing second launch; Finder's call recorded through `app.evaluate` as in E1 |

Review of the changed rows. Coverage: each row names the input that reaches its branch; E2 reaches the restored branch
only through a real restart with the scan held, and reads the startup state to prove it. Case design: E2 calls the
preload API as the case already does for `readArtifact`, and replaces only Finder's call at the process boundary.
False greens: one read is a retried negative — AC-06's "no rect", which can pass only while the check shows, since the
copy glyph's rect goes only with the swap and the next read needs it back; the 500 ms bound fails a tooltip that waits
for a native-title delay; the
glyph assertions are on the icon's own markup, so dropping the swap fails them; E2's empty recorder is read after the
call's rejection has arrived, and its second call proves the recorder records. Resource reuse: no new launch. The
design review's Coverage now reads "the restored-entry check (U10 for the judge, E2 for its wiring)", and its False
greens holds with the border's expected value taken from the prototype, as the row says. No finding.

### Test design table — second increment, after the incremental check's F7-F9 (2026-10-28)

| # | Spec item | Seam | Input that drives the target branch | Assertion object and where its expected value comes from | Fixture shape source | Expensive resource and how provided |
|---|---|---|---|---|---|---|
| E2 (changed) | as E2, and keeping session-view::REQ-001/AC-04's rewrite in place | as E2 | the restored `saved.jsonl` moved aside with a rename and a symlink put at its path; then the symlink removed and the file renamed back | as E2, plus the file's inode after the swap back equals the one read before it — so the case's later rewrite is in place, as it was before E2 | as E2 | as E2 |
| E1 (changed) US-001/AC-02 | "appears at once" | as E1 | hover on each of the three buttons; keyboard focus on the reveal button | the tooltip names the action within 500 ms of each hover and of the focus. Focus is driven on one button only: the three buttons are drawn by one map with the same focus and hover handlers, so a second focus read would test the same code | as E1 | the same launch |

Review of the changed rows. Coverage: E2's inode read proves the swap left the rest of the case where it was, its later
rewrite in place as before E2 (whether that rewrite pins the page handler's arguments is settled in the self-check
below: it does not, and never did). AC-02's row now says what E1 reads, and the reason the other two focus reads would add nothing. Case design and
resource reuse unchanged. False greens: the inode equality and the 500 ms bounds are reads that go red on the
regression they name. No finding.

F9's corrections, in place above: the design review's False greens and the first increment's review now say the
expected values come from the spec's words, the fixtures' literals and the confirmed prototype (the check glyph, the
copy, the copied button's border), none from the code under test; and that AC-06's "no rect" is a retried negative,
which can pass only while the check shows — the copy glyph's rect goes only with the swap, and the next read needs it
back.

### Self-check before the second fixes were handed back (F7-F9; items 2-5)

- Item 2, the assertions changed: E2's inode equality (red if the swap back gives a new file); the resume button's
  500 ms bound (red for a delayed tooltip). F9 changes no assertion. No finding.
- F7's premise was put to a mutation and did not hold: with the inode kept, both of the page handler's
  `questionRevision` calls given a constant byte range and text, built (the bundle holds the two mutated calls and
  none of the originals), leave the restart case green ([script](evidence/session-id/f7-mutation.mjs),
  [result](evidence/session-id/f7-mutation.json), [reach](evidence/session-id/f7-mutation-reach.json)). When the held
  scan completes, its snapshot invalidates every turn query and the refetch returns the rewritten turn, whatever the
  revision holds; nothing in the case reads the answer between the new page and that refetch, so the later rewrite
  never pinned those arguments, before E2 or since. (The cause first given here, the turn's freshness check, was wrong:
  that check only reports staleness — corrected after the second incremental check's F10.) The mutation sits on both sides of the comparison,
  so its survival alone would not condemn the case; with the reach shown, the conclusion is that nothing here pins the
  handler's arguments to `questionRevision`. That gap predates this change (it concerns session-view::REQ-001/AC-04,
  not US-001) and is left to the owner. E2 keeps the inode all the same, which returns the case's later steps to the
  setup they had before E2.
- Item 3: no product function changed. Item 4: E2 still uses the case's own saved session. Item 5: no shared helper
  changed. No finding.

### Self-check before the fixes were handed back (items 2-5)

- Item 2, each assertion the fixes wrote or changed, against False greens' forms: the meta line's end is anchored
  (red if the ID moves); the tooltip's 500 ms bound (red for a delayed tooltip); the check glyph's path and the copy
  glyph's rect (red if the swap is dropped — shown by a mutation removing it: "M4 16c…" received for "M20 6 9 17l-5-5");
  the refused copy's single read (red if the check is set before the copy resolves — shown by a mutation:
  "sact done" received); E2's "refused" and empty recorder (red if the handler stops passing the restored state —
  shown by a mutation passing `false`: "shown" received for "refused"), its second call proving the recorder records.
  Each mutation was restored byte for byte and the app rebuilt
  ([script](evidence/session-id/post-check-mutations.mjs), [results](evidence/session-id/post-check-mutations.json)).
  No finding.
- Item 3, each function the fixes changed: no product function; the fixes' own test helpers (`reveal`, `revealed` in
  E2) have two outcomes each, both driven by E2's two calls. No finding.
- Item 4, the data the fixes' tests use: E2 uses the restart case's own saved session and a copy of it — the shape
  that case already takes from a real Claude Code session. No finding.
- Item 5, shared test helpers: none changed (E1's and E2's helpers are local to their cases). Not applicable.

## Post-implementation check

Checked 2026-10-28 by a sub-agent independent of the implementation (it wrote neither the tests nor the code). No
ticket: this record, as for the design review. Implementation version: 99d96c1 (range 03ff1a2..99d96c1 — 080218a the
slices and their tests, 99d96c1 the code review's two fixes and the shared tooltip look); HEAD 466d1c0 adds only the
pre-review run's log (`git show --stat 466d1c0`). Scope: the six test files the range writes or changes —
`e2e/app.spec.ts` (E1), `src/main/providers/token-stats.test.ts` (U1-U6), `src/shared/validate.test.ts` (U7),
`src/main/display-store.test.ts` (U8), `src/shared/session-resume.test.ts` (U9), `src/main/security.test.ts` (U10) —
against the test design table above, session-view::US-001, session-view::CON-001 to session-view::CON-003, their
failure modes and the spec's testing decisions.

Inputs, and how each was checked:

- Run evidence: [pre-review-run.log](evidence/session-id/pre-review-run.log). Version: `git rev-parse HEAD` is
  99d96c1, the range's end; the status list is empty (a clean tree; the log was written outside the worktree).
  Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e e2e/app.spec.ts`, each with its full output and
  `exit=0`, then `overall=0`; how the codes were taken is not shown, and no output carries failure text. Every
  reviewed file ran and passed: validate (45 tests, line 32), security (26, line 41), display-store (9, line 53),
  token-stats (105, line 114), session-resume (3, line 119), E1 (line 257, 5.2 s). The e2e list: `app.spec.ts` is
  the only e2e file the range touches, and no e2e file imports a module the range changes (their imports are
  `../src/shared/errors`, the type-only `../src/renderer/src/env` and `./close-app`, none changed), so one file is
  what the import rule yields on 99d96c1; the log does not record that retrieval, and `affected-tests.txt` predates
  99d96c1 and lists no e2e file. The run's command set falls short of the gate's: F6.
- Capability declaration, read with Python's `tomllib`: `[mutation-testing] enabled = false`; `lint` and `e2e-suite`
  enabled.
- One re-run, of a reviewed test only: after `pnpm exec electron-vite build` (exit 0), E1 alone with `DEBUG=pw:api`
  (exit 0, passed), to time AC-06's two clicks (False greens). `git status --porcelain --untracked-files=all` was
  empty before; no source, test or data file was changed.
- Real data, read only, for the fixture shapes: the 7 Codex thread segments under `~/.codex/sessions` and
  `~/.codex/archived_sessions` (3 plain, 4 compressed), and this machine's display cache
  (`~/Library/Application Support/agentshed/display-cache.json`).

### Per-case consistency with the test design table

| # | Written test | Seam · input · assertion and expected value · fixture · resources | Conclusion |
|---|---|---|---|
| U1 | `token-stats.test.ts:2446` | `sessionQuestions` after `build` · `mkClaudeFile('<uuid>.jsonl')` · `sessionId` is the UUID literal the file is named with · `userLine` · none | Matches |
| U2 | `token-stats.test.ts:2454` | the same · `mkCodexRollout('rollout-main-019f071.jsonl', …, { id })`, a legacy rollout whose name holds no UUID · the id literal · the suite's rollout builder · none | Matches |
| U3 | `token-stats.test.ts:2463` | the same · `rollout-<ts>-<thread>_<segment>.jsonl`, its first line `ordinal` + `session_meta` with `id` and `session_id` the thread and a `history_base` · `THREAD`, not `SEGMENT` · the real segment (re-checked under Coverage) · none | Matches |
| U4 | `token-stats.test.ts:2486` | the same · zstd of a plain rollout's bytes as `rollout-cold-….jsonl.zst`, the plain removed · the plain's id literal · the compressed-twin pattern · none | Matches |
| U5 | `token-stats.test.ts:2498` | the same · a rollout built without `ids` (`session_meta` holds `cwd` only) · `null` · the rollout builder · none | Matches |
| U6 | `token-stats.test.ts:2506` | the same · `mkGrokSession(proj, id, …)` · the directory name literal · the Grok layout builder · none | Matches |
| U7 | `validate.test.ts:323` | `validateSessionPage` · a UUID, null, `''`, `7`, the field removed · ok, ok, then `failure.path` `'page.sessionId'` three times · `okPage`, now with `sessionId: 'a'` · none | Matches |
| U8 | `display-store.test.ts:116` | `new DisplayStore(root).get()` over a written `display-cache.json` · Claude Code, Grok and Codex pages without the field, and a Claude Code page with `sessionId: 7` · `[[claude, uuid], [grok, uuid], [codex, null]]`, the malformed page dropped · the real saved pages' key set (re-checked under Coverage) · none | Matches |
| U9 | `session-resume.test.ts:10, 19, 25` | `resumeCommand` · the three sides; directories with a quote and a space, and non-ASCII; UUIDs; IDs `a;rm -rf ~`, `$(touch x)`, `it's` · whole lines spelled out · strings · none | Matches; adds a `$HOME` and backtick directory and a bare `thread_1.v2-a` beyond the row |
| U10 | `security.test.ts:192-230` | `sessionRevealTarget` with the handler's probes on temp files and a symlink · listed present (live, restored), gone, symlink (restored, live), nine unlisted raws · ok, `sessionFileUnreadable`, `sessionNotWhitelisted`; no probe touched for an unlisted raw · temp files · none | Matches; adds a non-string, null, `''`, a child path and an unlisted existing file beyond the row |
| E1 | `app.spec.ts:5534` | the built app · the row's home and stale project, recorders installed by `app.evaluate` before the first click · as the row lists, plus a tooltip hit-test (5672-5680) · the existing e2e fixture shapes · one `launch` (5582) | Does not match: two assertions 99d96c1 added are in neither the row nor its order paragraph (F5). The rest — the order of the negative reads, the focus emulation, the restart timed in the page — is as designed |

### Coverage

- Inputs against the boundaries the cases claim — each input enters its branch: U2's file name holds no UUID, so
  only the record can supply the id; U3's name ends with the segment, so the thread can come only from the metadata;
  U4's plain twin is removed, so the id is read from the compressed record; U5's metadata has no id; U8's three
  pages lack the field (the upgrade branch) and the fourth carries a number (validation); U10's restored symlink
  takes the `restored && !regular` branch; E1 reaches the no-ID form through a record without an id, the refused
  clipboard through the recorder's switch, the vanished file through `rmSync` before the click, and the stale warning
  through a project registered and never created, opened from global search and then from the fork banner.
- Fixture shapes, re-checked against real data on 2026-10-28. U3: all three plain segments on this machine have the
  fixture's first-line structure — top-level `ordinal`, `type` `session_meta`, `payload.id` and `payload.session_id`
  equal to the name's first UUID and not its second, `history_base` with `thread_id`, `end_ordinal_exclusive` and
  `end_byte_offset`; the other four segments are compressed. U8: the display cache holds 7 session pages (all
  Claude Code), each with exactly the fixture's page keys (`at bytes file forkParentFile forkParentTitle forkPoints
  forkState questions revision side title tokens`) and question keys (`at i revision subagents text tools`), none
  with `sessionId`, in a `{ version: 1, data }` envelope. E1's homes follow `app.spec.ts`'s Grok homes and
  `global-search.spec.ts`'s Codex fork pair, as the row says.
- Test file headers: E1's note (5531-5533) states four of the five gaps the design review listed, and none with the
  condition under which a case becomes due (F4). The reveal handler's restored flag is neither driven nor stated as
  a gap (F3). The other files claim no gap and need none.
- AC-07's cold-rollout form (Finder given the compressed file) is not driven. It has no branch of its own: the button
  sends the page's own `file`, which for a cold rollout is the compressed path the allow-list holds (session-view::R1).
  Noted, no finding.

### Case design

Every case goes through the seam its row names. E1 replaces only `clipboard.writeText` and `shell.showItemInFolder`
in the main process, the boundary the spec's testing decisions name; its `__refuse` switch is the recorder's own
state. U8's display cache is written in the previous version's shape — the state that version leaves on disk, as
the spec requires — and read back through the store's `get()`. U10 calls the exported judge on real files. No case
writes internal state for its setup or reads around a public interface. No finding.

### False greens

Mutation testing: per the project's capability declaration, mutation-testing is not enabled, so it is skipped. Each
test's "when does it go red", answered against the code under test and its expected value's source:

- U1: the Claude Code ID is not the file name's stem (the extension kept, another path part, null), or the engine's
  Claude branch drops it.
- U2: the Codex ID comes from anywhere but `session_meta.payload.id` (`codex.ts:119`) — the name has no UUID to fall
  back on — or the Codex branch of `sessionQuestions` drops `agg.sessionId`.
- U3: the ID is read from the file name's last UUID, the segment.
- U4: the compressed record's metadata is not read for the id.
- U5: a Codex page gets an ID its record does not carry, such as one from its file name.
- U6: the Grok ID is not the directory name (the stem `updates`, the encoded cwd). It cannot tell the directory name
  from `summary.json`'s `info.id`, which the builder sets to the same value; U8's restore has only the path, so it
  pins the path rule.
- U7: the contract admits `''`, a number or a missing field, refuses a UUID or null, or names another path.
- U8: an absent field is not filled in (the three pages are dropped: `[]`), a Codex page takes an ID from its path, or
  a malformed field is upgraded rather than dropped (four entries).
- U9: any change to the quoting of the directory or the ID, or to a side's tool or resume syntax; every expected line
  is a literal.
- U10: the judge touches the disk before the allow-list (`touched` above 0), admits any unlisted spelling, shows a
  gone file, or admits a restored symlink. It cannot go red for what the handler passes as `restored` (F3).
- E1, part by part: the meta line on a missing ID or label (AC-01); the aria labels' order, and the 1 px right-edge
  check if the group leaves the row's end (AC-02); the tooltip by hover and by focus, each read after `toHaveCount(0)`
  proved the previous one gone; the copied texts and Finder paths on any difference, as the recorders' whole arrays
  are compared (AC-03, AC-04, AC-07); the no-ID clicks, as the copy count is read once after the later Finder call
  from the same renderer (AC-09); the vanished file, as the Finder count is read after the toast (AC-10); the fork
  parent's button, by a single read guarded to fall inside the 1.5 s (AC-06); any third handler error.
  - AC-06's restart (5654-5664) goes red for a timer that is not restarted only if the second click lands while the
    first check still shows, which the case does not assert. Measured in the re-run: the second click's target
    resolved as `<button type="button" data-act="id" class="sact done" …>`, and the steps besides the 1 s wait took
    about 74 ms (the `pw:api` deltas), leaving about 430 ms. No finding; the margin is recorded here.
  - The copied button's border (5649-5652) is read about 2 ms after `away()`; the next hover's target still resolved
    as `class="sact done"`, so the read fell inside the check.
  - AC-10's "the button shows no check" is a retrying negative that a check shown for its 1.5 s passes (F1).
  - AC-06's check icon, AC-02's "at once" and AC-01's "at the end of its meta line" are asserted through proxies that
    a regression in that phrase passes (F2).
- The browser assertions were also read against review-code's false-greens list: form one (presence for effect) is
  met by the tooltip's hit-test; form five (reading too early or too late) is F1. The range adds no gate and no
  command-line acceptance.

### Resource reuse

- Expensive resources (1 s or more): the e2e build and the Electron app. The build: one `electron-vite build` in the
  run's e2e command (log lines 146-168: main, preload, renderer, once) for its 86 cases — once, as designed. The app:
  the log has no per-launch output (the list reporter prints cases only), so the count is taken from the code: E1
  calls `launch` once (5582) and `close` once (5770), with its own userData from `launch`.
- Unit cases: none takes 1 s. Vitest lists every test over 300 ms (log lines 51, 82, 115-117), and none of U1-U10 is
  among them; the files' totals are 55 ms (display-store), 5 ms (security), 2 ms (session-resume) and 9 ms
  (validate).
- Clearing: no reviewed case clears or releases a process-wide resource — each unit case has its own temp directory
  (U10's is made once for its describe and removed in `afterAll`), and E1 closes only its own app — so execution
  order bears on no count. As the design review concluded; no finding.

### Findings

| # | Where | Dimension | Finding | Evidence | Handling |
|---|---|---|---|---|---|
| F1 | `app.spec.ts:5733` | False greens | AC-10's "the button shows no check" is asserted by `expect(btn('id')).not.toHaveClass(/\bdone\b/)`, a retrying negative with the default 5000 ms (`playwright.config.ts` sets none). A check shown for its 1.5 s after a refused copy — the likely regression, such as setting the copied state before the copy resolves — goes before the 5 s run out, and the assertion passes; it goes red only for a check held over 5 s. The case's own fork-parent read (5750-5760) names this trap and avoids it | `SessionActions.tsx:57-66` (the state is set only on success); `with timeout 5000ms` in the `pw:api` log | Read the class once, right after the toast is visible, as the parent read does. The design review's Coverage on "a refused clipboard (E1)" and `session-id-tasks.md`'s AC-10 row then hold as written |
| F2 | `app.spec.ts:5618-5619, 5629-5641, 5647`; `SessionActions.tsx:89` | Coverage | Three phrases of the spec are asserted through proxies: AC-06 "the icon becomes a check" by the `done` class, while the icon is chosen by its own expression (`copied === a ? Check : ICON[a]`), so dropping the swap, or its return, leaves E1 green; AC-02 "appears at once" by `toHaveText`, which waits up to 5 s, so a delayed tooltip passes; AC-01 "at the end of its meta line" by `toContainText`, so the ID anywhere in the line passes | the lines named | Assert each against its words: the button's icon markup becomes the check's while copied and returns after; the tooltip read once right after hover and focus, or within a bound well under any tooltip delay; the meta line ending with "Session ID" and the ID. Add them to E1's row (reviewed with F5) |
| F3 | `index.ts:437`; `security.test.ts:186-230` | Coverage | The reveal handler's `restored: !firstScanComplete` decides whether the restored-entry rule applies, and nothing drives it: U10 passes `restored` itself, and E1 reveals regular files after the first scan only. Passing `false`, or the flag inverted, would show a restored allow-list entry swapped for a symlink before the first scan — against "a restored allow-list entry is shown only while it is a regular file" — with every test green; nor is it stated as a gap. The seam exists: `startup-restore.spec.ts`'s second launch holds the first scan off for 20 s and already swaps a restored artifact for a symlink through the real channel | `revealSessionFile` and `sessionRevealTarget` appear in no test but U10 and E1 (`grep -rn` over `src e2e scripts build`) | Recommended: in that case, record `shell.showItemInFolder` as E1 does, swap the restored `saved.jsonl` for a symlink and call `revealSessionFile` (refused, no Finder call), put it back and call again (Finder called) — red if the handler stops passing the restored state; a test design table row reviewed first, and the spec's Testing Decisions naming the seam. Otherwise a gap note with its condition in `security.test.ts`, and the design review's "the restored-entry check (U10)" corrected |
| F4 | `app.spec.ts:5531-5533` | Coverage | E1's gap note omits "agent text drawn as text", which the design review said the headers would state, and gives no listed gap the condition under which a case becomes due; "a transfusion or a language switch while a tooltip is open" carries no reason either (the design review's reason for the language switch — it changes only on the settings page, which no session page survives — is not in the header) | the header; the design review's Coverage paragraph | Complete the note: each gap with its reason and its condition, as `token-stats.test.ts`'s header does ("A case is due if …") — for instance, the restored page's header is due if it stops sharing the first open's render, and a tooltip across a transfusion if the tooltip stops being drawn from the current page |
| F5 | the test design table's E1 row and its order paragraph | Case design | 99d96c1 added two assertions to E1 that the row does not describe: the fork parent's resume button, read once inside the 1.5 s behind a time guard (5750-5760), and a copied, unhovered button's border compared with a resting button's (5649-5652), whose expected value comes from the prototype, not the spec — while the row, and this design review's False greens, say every expected value is written from the spec | `git show 99d96c1 -- e2e/app.spec.ts` | Amend the row and the order paragraph and review them as the design review does. Both assertions look sound to this check: the parent read does not retry and is guarded; the border comparison differs under any border rule on `.sact.done`, its sibling being at rest |
| F6 | `evidence/session-id/pre-review-run.log` | Run evidence | The run is not the gate's pre-review run: the gate document runs the project's whole command set and, as this change alters test files, skips none of it; the log runs 4 of `pnpm verify`'s 11 commands (lint, typecheck, test, e2e on one file) and lacks `test:scripts`, `test:site`, `check:ui`, `check:lang`, `check:i18n`, `check:nul` and `smoke`. `capabilities.toml` names `check:i18n`, `check:ui` and `test:site` as what enforces i18n, theming and the enumeration gate, which this change touches (both dictionaries, `theme.css`); 99d96c1 changed `theme.css`, `FloatingBox.tsx` and `UpdateSlot.tsx` after the targeted run in which `check:ui`, `check:i18n` and `check:lang` passed (`session-id-tasks.md`, T6), so they never ran on 99d96c1. 466d1c0's message calls the log "the pre-review gate run" | the log's command headings (lines 10, 17, 24, 141); `package.json`'s `verify`; the earlier rounds' gate logs (`evidence/ticket-278/verify-*.log`) | Run the missing commands on the head the round continues from and log them as the gate document requires, before the round goes on; where T8 is recorded, describe the run as what it was. None of the missing commands runs a test this change wrote or changed, so this check's conclusions do not wait on them |

### Document sync this check creates

Scope, enumerated with `find` (no ignore rules apply): the repository root's Markdown and TOML files, `docs/specs`,
`docs/features`, `docs/adr`, and `docs/.workings/session-view` with its evidence — 124 files — plus the six reviewed
test files' headers. Left out: other features' working directories (no statement about this round), `docs/prototypes`
(no finding concerns the interface's form) and `site/` (it states no test coverage). Searched for the session ID, the
resume command, US-001, reveal, pre-review and the restored-entry wording. Statements the findings make untrue or
incomplete:

| Statement | Where | Findings |
|---|---|---|
| Coverage: "a refused clipboard … (E1)" and "the restored-entry check (U10)"; False greens: "every expected value is written from the spec or from the fixture's own literal"; the E1 row | this record, Design review | F1, F3, F5 |
| Success criteria AC-01, AC-02 and AC-06 ("e2e"), AC-10 ("e2e … for the clipboard refusal"), R1 ("unit (pure judge)") | `session-id-tasks.md` | F1, F2, F3 |
| T8, the gate's pre-review run, unchecked: its record is to say what ran | `session-id-tasks.md` | F6 |
| E1's gap note | `e2e/app.spec.ts` | F4 |
| The testing decisions' seams for session-view::US-001, only if F3 adds the restart e2e | `docs/specs/session-view.md` | F3 |

No statement in the spec's requirements, `docs/features`, the ADRs or `CONTEXT.md` is affected: no finding is a
product defect. This check changed nothing outside this section.

### Increment: the fixes 466d1c0..3c37a76 (2026-10-28)

Checked 2026-10-28 by a sub-agent independent of the implementation and of the fixes. No ticket: this record.
Implementation version: 3c37a76 (the fixes, 466d1c0..3c37a76, one commit; the whole change 03ff1a2..3c37a76).

Scope, retrieved as the incremental check prescribes:

- Tests the range changes: `git diff --name-only 466d1c0..3c37a76` lists two test files besides ten files under
  `docs/`. Every hunk in `e2e/app.spec.ts` lies inside E1 (5525-5788); the one hunk in `e2e/startup-restore.spec.ts`
  (128-158) lies inside "restart restores viewed project, questions and read answer before a new scan finishes",
  where E2 now sits. Objects: E1 and that restart case.
- Tests that depend on test helper code the range changes: the range changes no helper outside those two files, and
  neither exports anything (`git grep -nE "^export" -- e2e/app.spec.ts e2e/startup-restore.spec.ts`: no hit, exit 1).
  Every tracked file naming either one (`git ls-files -z | xargs -0 grep -lE "(app|startup-restore)\.spec"`) was read
  at its hits: outside `docs/`, `e2e/app-update.spec.ts:40` and `e2e/global-search.spec.ts:39, 57, 126` mention
  `app.spec.ts` in comments, and `scripts/check-lang.mjs:238` and `scripts/check-lang.test.mjs:27` hold it as a path
  string; none imports it (control: the same search for `./close-app` finds its 9 importers). No further test.
- Test design table rows the range changes: the seven rows of "Test design table — increment after the
  post-implementation check" (E1 changed: AC-01, AC-02, AC-06, AC-10; E1 added in 99d96c1: the border, the parent;
  E2).

Carried over: U1-U10 (four unit test files the range does not touch) keep every Dimension's conclusion of the
post-implementation check above (2026-10-28, on 99d96c1).

Inputs, and how each was checked:

- Run evidence: [post-check-fix-targeted.log](evidence/session-id/post-check-fix-targeted.log). Version: HEAD 466d1c0
  and six modified files with their hash-object values. Both test files, the spec, review-code.md and review-tests.md
  hash to 3c37a76's blobs (`git rev-parse 3c37a76:<file>`); session-id-tasks.md was edited after the run (6bb46bf
  logged, 14c6e95 committed). That file and the six evidence files the range adds (absent from the list because
  `.gitignore:4` ignores `docs/.workings/`) are inert, ESLint ignores `docs/`, and no reviewed test reads them, so
  the log stands for 3c37a76's executable files. Commands: `pnpm lint`, `pnpm typecheck`,
  `pnpm e2e e2e/app.spec.ts e2e/startup-restore.spec.ts`, `pnpm check:lang`, each with its output and `exit=0`, then
  `overall=0`; the hash-object step is described rather than spelled out, and how the codes were taken is not shown.
  E1 passed (line 152, 4.9 s), the restart case passed (line 153, 26.9 s).
- The F6 fix: [pre-review-run-rest.log](evidence/session-id/pre-review-run-rest.log), on 466d1c0 (99d96c1's code plus
  the first log) with only review-tests.md modified: test:scripts, test:site, check:ui, check:lang, check:i18n,
  check:nul and smoke, each `exit=0`, then `overall=0`, no failing output. With pre-review-run.log, all eleven
  commands of `pnpm verify` ran on 99d96c1's code, and T8 in session-id-tasks.md describes the two parts as they ran.
  F6 is resolved.
- Capability declaration, read with Python's `tomllib`: `[mutation-testing] enabled = false`.
- One re-run of a reviewed test: after `pnpm exec electron-vite build` (exit 0), E1 alone with `DEBUG=pw:api`
  (exit 0, passed), to time the reads the fixes moved or added (False greens). The output stays in the session's
  scratch directory; the lines that carry conclusions are quoted below. One replay outside the repository of E2's
  file steps (write, copy elsewhere, unlink, symlink, unlink, write, rewrite) on a file in the OS temp directory, for
  its inode (Coverage): `{"before":3847566505,"afterSwapBack":3847566508,"afterInPlaceRewrite":3847566508,
  "sameAsSaved":false}`. `git status --porcelain --untracked-files=all` was empty before and after; no source, test or
  data file was changed.
- The fixes' own evidence: the [mutation script](evidence/session-id/post-check-mutations.mjs) makes each mutation as
  a unique one-line replacement, builds, runs the case, restores the file byte for byte in `finally` and rebuilds; the
  [results](evidence/session-id/post-check-mutations.json) show each restore `identical: true`, the rebuild exit 0,
  and each failure on the assertion it was written for (startup-restore.spec.ts:152, app.spec.ts:5659, 5750).

#### Per-case consistency with the test design table

| Row | Written test | Conclusion |
|---|---|---|
| E1 (changed) AC-01 | `app.spec.ts:5627`, `toHaveText(new RegExp(`· Session ID ${CLAUDE_ID}$`))` | Matches |
| E1 (changed) AC-02 | hover on the copy-ID and reveal buttons, each read with `{ timeout: 500 }` (5638-5643); focus on the reveal button (5647-5648); the resume button's tooltip read with the default 5 s (5682-5683) | Does not match: the row says hover and keyboard focus on each button (F8) |
| E1 (changed) AC-06 | 5659-5660 while copied; 5675 once the check has gone | Matches |
| E1 (added) the border | 5661-5664 | Matches |
| E1 (added) the parent | 5767-5777 | Matches |
| E1 (changed) AC-10 | 5744-5750 | Matches |
| E2 | `startup-restore.spec.ts:128-158` | Matches the row, which does not say that putting the file back gives it a new inode — a change to the state the rest of the case starts from (F7) |

Test file headers: E1's note (5531-5541) gives the five gaps the design review listed, each with its reason and the
condition for a case, and each reason holds in the code: the language changes only through `onLanguage` from the
settings page (App.tsx:292-301; the startup prefs echo sets the preference, not the language, 166-176); the overview
card's rows call the same `onOpenSession` the Sessions tab does, from the same project entry (DetailPane.tsx:147, 257,
386-387, 417, into App.tsx:417); the tooltip's state holds only the action and position, its text drawn from the
props on every render (SessionActions.tsx:40, 75-84); the ID and the command are React text (SessionPane.tsx's
`sid-v` span, SessionActions.tsx:80). F4 is resolved. startup-restore.spec.ts's header claims no gap; E2's comment
(128-131) says what it drives.

#### Coverage

- E2 reaches the restored branch: the second launch holds its first scan 20 s, the hint's `data-state` is read once
  before and once after the two calls (135, 158), and `firstScanComplete` turns true in the same synchronous block
  that sends `ready` (index.ts:244-249), so "not ready" after the second call means both calls met
  `restored: true` (index.ts:437). The calls differ only in the file's type, and `existsSync` follows the symlink to
  `elsewhere.jsonl`, so the refusal can come only from `restored && !regular` (security.ts:204-206). F3 is resolved;
  the spec's testing decisions name the seam (session-view.md:1019-1022).
- E2 changes the state the rest of the case starts from (F7). Its `unlinkSync` and `writeFileSync` (154-155) put back
  a new file, so `saved.jsonl` no longer has the inode the saved page and its read turn were revisioned on (the
  replay above); the case's later rewrite (160) keeps the new one. A question's revision is the file's `dev:ino` plus
  the question's byte range and text (source-identity.ts:24-25), and a saved or cached turn is kept while its revision
  matches (index.ts:136; turn-content-query.ts:16-17). Before the range the rewrite at 160 kept the inode, so only the
  range and text the page handler passes (index.ts:328, 380) told "Rewritten question" from "Saved question", and 164
  would have gone red without them (session-view::REQ-001/AC-04). Now the inode alone changes every revision, and 164 passes
  either way. source-identity.test.ts:33 pins the function (same file, same inode, other text), not the handler's
  arguments; no other e2e case was found rewriting a read session in place (e2e/ searched for replace-based rewrites,
  appends, truncation and renames: the other hits are appends, app.spec.ts:1294, 5130, 5412 and
  global-search.spec.ts:82).
- E1's changed reads each enter what they claim: the meta line's end (AC-01), the bound after hover and focus (AC-02,
  on the buttons F8 names), the check glyph while copied and the copy glyph after (AC-06), the class inside the 1.5 s
  after a refusal (AC-10).
- Fixture shapes: E2 adds no data another program writes; its inputs are the app's own saved display from the first
  launch and a change of file type, and the reveal channel reads no content. Nothing beyond F7.

#### Case design

E2 calls `revealSessionFile` through the preload API, as the case already calls `readArtifact`, under an allow-list
the app restored itself across a real restart, and replaces only `shell.showItemInFolder` in the main process, the
boundary the spec's testing decisions name. The symlink swap is a file-system event a user or another program can
cause. E1's changes read rendered markup and classes, no internal state. No finding.

#### False greens

Per the project's capability declaration, mutation-testing is not enabled, so mutation testing is skipped. When each
changed assertion goes red, against the code under test and its expected value's source:

- AC-01 (5627): the ID not at the line's end, the label not "Session ID" right before it, or the " · " before the
  label gone.
- AC-02 (5640, 5648): a tooltip that names its action 500 ms or more after the hover or focus — the native title's
  delay, or a hover delay of that order; not a shorter one. In the re-run the three bounded reads passed 8, 1 and
  2 ms after they started (the `pw:api` deltas from `expect.toHaveText started` to `succeeded`). The resume button's
  first read waits 5 s (F8).
- AC-06 (5659-5660, 5675): the icon not swapped (the copy glyph's path, as the fixes' mutation received), both glyphs
  drawn (two paths: a strict-mode failure), or the copy glyph not back once the check has gone. The "no rect" read is
  a retried `toHaveCount(0)`; it can pass only while the check shows, since the rect goes only with the swap and 5675
  needs it back — but the increment's review says no row retries a negative (F9).
- AC-10 (5744-5750): a check present at the single read, which in the re-run came about 31 ms after the click (the
  `pw:api` deltas from the click to `locator.getAttribute succeeded`, the button resolved as `class="sact"`), inside any
  1.5 s check set at or after the click; the guard throws rather than skips if the read falls later. The fixes'
  mutation set the check before the copy and never cleared it on the failure path, so the old retried form would also
  have failed it; F1's case, a check that clears itself after 1.5 s, is answered by the read's timing. F1 is resolved.
- E2 (135-158): the handler passing anything but the restored state before the first scan ("shown" for "refused", as
  the fixes' `restored: false` mutation received; an inverted flag likewise, `firstScanComplete` being false there);
  Finder called on the refused path (the recorder read after the rejection has arrived, from a synchronous handler);
  a regular restored entry refused, or Finder given another path; the scan done at either hint read. `if (!app)` and
  the guards throw, never return. Its blind spot is the one F7 opens later in the case, not in E2's own reads.
- E1's unchanged reads, re-timed since the fixes added reads between the two copies: at the second click the button
  resolved as `<button type="button" data-act="id" class="sact done" …>`, so the second copy still landed inside the
  first check, which the restart check needs; the steps besides the 1 s wait took about 68 ms (the wait itself shows
  only as `+1s`). The border read came about 20 ms after the first click, the next hover's target still
  `class="sact done"`. The rest as in the post-implementation check above.
- Against review-code's false-greens list: form one — the glyph is read from the icon's markup, not inferred from the
  class; form five — the AC-10 and parent reads are single reads under time guards. The range adds no gate and no
  command-line acceptance.

#### Resource reuse

From the targeted log: one `electron-vite build` (main, preload, renderer; lines 41-63) for its 88 cases. The list
reporter prints no launches, so the count is from the code: E1 launches once (5590) and closes once (5787); the
restart case launches twice (55, 95), as before the range, and E2 runs inside the second launch — no new launch, as
its row says. No reviewed case clears or releases a process-wide resource (E2's recorder lives in the case's own app
process), so execution order bears on no count. No finding.

#### Findings

| # | Where | Dimension | Finding | Evidence | Handling |
|---|---|---|---|---|---|
| F7 | `startup-restore.spec.ts:150-155, 160-164`; `index.ts:328, 380` | Coverage | E2 puts the session file back as a new file, so the case's later rewrite is no longer in place under the saved page's `dev:ino`. Before the range only the byte range and text the page handler passes to `questionRevision` told the rewritten question from the saved one, and 164 would have gone red without them (session-view::REQ-001/AC-04: no old answer under a new question after a rewrite); now the new inode alone changes every revision, and 164 stays green if the handler stops passing them. source-identity.test.ts:33 pins the function, not the handler's call | the inode replay under Inputs; `source-identity.ts:24-25`; `index.ts:136` | Keep the inode: move the file aside with `renameSync`, symlink to it, then remove the symlink and rename the file back, asserting its `ino` equals the one read before E2. Amend E2's row and review it first. The spec's testing decisions stay true as written |
| F8 | the increment's row "E1 (changed) US-001/AC-02"; `app.spec.ts:5638-5648, 5682-5683` | Coverage | The row says the tooltip is read within 500 ms after hover and keyboard focus on each button; E1 bounds hover on the copy-ID and reveal buttons and focus on the reveal button, and reads the resume button's tooltip with the default 5 s | the lines named | Amend the row to the reads E1 makes, with the reason the others need none of their own: one map renders the three buttons with the same handlers (`SessionActions.tsx:88-103`). Or bound the resume button's first read at 500 ms too, and still narrow "focus" to the reveal button |
| F9 | this record: the design review's False greens (line 80) and the increment's review (line 116) | False greens | Two statements the range wrote do not match the tests: "one" expected value, the copied button's border, is said to come from the prototype, while the check glyph the range added (`M20 6 9 17l-5-5`, in `docs/prototypes/_shared/icons.js`) and E1's button labels, tooltip texts, stale warning and failure toasts (in `prototype-session.html`, not in the spec) come from it too; and "no row retries a negative", while the AC-06 row's "no rect" is a retried `toHaveCount(0)` | `git grep -l -F` of each string over `docs/specs`, `docs/prototypes` and the dictionaries | Correct both: the expected values come from the spec's words, the fixtures' literals and the confirmed prototype, none from the code under test, so False greens' conclusion stands; the "no rect" read is a retried negative that can pass only while the check shows. No test change |

F1 to F6 of the post-implementation check above are resolved, each as its paragraph here says (F2's AC-02 part with
F8's correction to its row, F3's with F7's side effect).

#### Document sync this check creates

Scope, enumerated with `find` (no ignore rules apply; hidden and ignored files included): the root's Markdown and
TOML files, `docs/specs`, `docs/features`, `docs/adr`, and `docs/.workings/session-view` with its evidence — 130
files (the previous check's 124 and the six evidence files the range adds; five PNGs, the rest text) — plus the two
reviewed test files' headers. Left out, as before: other features' working directories, `docs/prototypes` (read
only for F9's sources; no finding changes them) and `site/`. Searched for "each button", "at once", "500 ms",
"expected value", "retries a negative", "retried", "restored allow-list", "restored-entry", "startup-restore",
"check glyph", "session ID", "rewrit", "inode", "dev:ino", "questionRevision" and "in place".

The previous check's sync rows are done and were read against the tests: the design review's Coverage and False
greens and the E1 rows (lines 60, 80, 98-120), session-id-tasks.md's success criteria and T8, E1's gap note, and the
spec's testing decisions (session-view.md:1019-1022) — true, except as F8 and F9 say.

Statements the findings make untrue or incomplete:

| Statement | Where | Findings |
|---|---|---|
| The E2 row (the file put back) and the increment's review of it, once F7 is fixed | this record, Test design table increment | F7 |
| The row "E1 (changed) US-001/AC-02" | this record, Test design table increment | F8 |
| "one, the copied button's border, from the prototype"; "no row retries a negative" | this record, Design review and its increment's review | F9 |

ADR-0029 says the restart scenario "verifies source rewrite" (line 65), and the spec asks the cross-process scenario
to cover source rewrite (session-view.md:685-687): both stay true as written, and F7's fix gives them back the
in-place rewrite. session-id-tasks.md's AC-02 and R1 rows, `docs/features`, the other ADRs and `CONTEXT.md` (its
retried-negative rule, 706-713, agrees with F9's correction) are unaffected: no finding is a product defect. This
check changed nothing outside this section.

### Increment: the fixes 3c37a76..d71833f (2026-10-28)

Checked 2026-10-28 by a sub-agent independent of the implementation and of the fixes. No ticket: this record.
Implementation version: d71833f (the fixes, 3c37a76..d71833f, one commit; the whole change 03ff1a2..d71833f).

Scope, retrieved as the incremental check prescribes:

- Tests the range changes: `git diff --name-only 3c37a76..d71833f` lists two test files besides eight files under
  `docs/.workings/`. `git diff -U0 3c37a76..d71833f -- e2e/` gives four hunks: `app.spec.ts` 5682, inside E1
  (5542-5788); `startup-restore.spec.ts` 3 (the `node:fs` import, adding `renameSync` and `statSync`), 147-152 and
  156-157, inside "restart restores viewed project, questions and read answer before a new scan finishes" (9-184),
  where E2 sits. `git grep -nE "\b(renameSync|statSync)\b" d71833f -- e2e/startup-restore.spec.ts` finds the two
  names, besides the import (3), only at 150, 151, 156 and 157, so the file's other case (186) uses nothing the
  import hunk adds. Objects: E1
  and the restart case.
- Tests that depend on test helper code the range changes: the range changes no helper; neither file exports
  anything (`git grep -nE "^export" d71833f -- e2e/app.spec.ts e2e/startup-restore.spec.ts`: no hit, exit 1;
  control, the same search over `e2e/close-app.ts`: three hits). No file imports either one
  (`git grep -nE "from ['\"]\./(app|startup-restore)\.spec" d71833f`: no hit, exit 1; control,
  `git grep -lF "from './close-app'" d71833f`: its eight importers in `e2e/`); outside `docs/` the two names occur
  only in comments (`e2e/app-update.spec.ts:40`, `e2e/global-search.spec.ts:39, 57, 126`) and as path strings
  (`scripts/check-lang.mjs:238`, `scripts/check-lang.test.mjs:27`). No further test.
- Test design table rows the range changes: the two rows of "Test design table — second increment" (E2 changed;
  E1 changed, US-001/AC-02), and F9's corrections to the design review's False greens (79-81) and to the first
  increment's review (117-119).

Carried over: U1-U10 keep the post-implementation check's conclusions (2026-10-28, on 99d96c1); E1's reads and E2's
reads that the range does not change keep the first incremental check's conclusions (2026-10-28, on 3c37a76).

Inputs, and how each was checked:

- Run evidence: [f7-f9-targeted.log](evidence/session-id/f7-f9-targeted.log). Version: HEAD 3c37a76 and three
  modified files, whose hash-object values equal d71833f's blobs (`git rev-parse d71833f:<file>`: review-tests.md
  a584307, app.spec.ts a1c32f0, startup-restore.spec.ts f1298a5). d71833f also changes session-id-tasks.md, which
  records this run and so was edited after it, and adds six evidence files, absent from the list because
  `.gitignore:4` ignores `docs/.workings/` (`git check-ignore -v --no-index`); they were written at 10:45:24Z, before
  the run's 10:45:39Z. All seven are inert, ESLint ignores `docs/` (eslint.config.js:39), and no reviewed test reads
  them, so the log stands for d71833f's executable files and the two reviewed cases. check:lang enumerates
  `git ls-files --cached --others --exclude-standard` (check-lang.mjs:284), so it read none of the six ignored files
  that d71833f force-adds; that is the full gate's to cover before delivery, and no test result here depends on it.
  Commands: `pnpm lint`, `pnpm typecheck`, `pnpm e2e e2e/app.spec.ts e2e/startup-restore.spec.ts` (88 passed),
  `pnpm check:lang`, each with its output and `exit=0`, then `overall=0`; as in the earlier logs, the hash-object step
  is described rather than spelled out and how the codes were taken is not shown. E1 passed (line 146, 4.9 s), the
  restart case passed (line 147, 26.8 s).
- Capability declaration, parsed with smol-toml (the worktree's own dependency): `[mutation-testing] enabled = false`,
  a shape the registry admits; `lint` and `e2e-suite` enabled.
- No test was re-run: every question below is answered from the code, the log and the fixes' own evidence.
  `git status --porcelain --untracked-files=all` was empty before this section was written; no source, test or data
  file was changed.
- The fixes' own evidence: [f7-mutation.mjs](evidence/session-id/f7-mutation.mjs) replaces both `questionRevision`
  calls in `index.ts` (each a unique match) with a constant range and text, builds, runs the restart case, restores
  the file in `finally` and rebuilds; [the result](evidence/session-id/f7-mutation.json): build 0, the case passed,
  `identical: true`, rebuild 0; [the reach](evidence/session-id/f7-mutation-reach.json), from a separate build of the
  same mutation: two mutated calls and no original in the bundle. Neither file records which version of the restart
  case ran; the code reading under Coverage reaches the same conclusion with the inode kept, independently of it.
  The two short e2e logs (f7-fix, f8-fix) carry no version and are superseded by the targeted log.

#### Per-case consistency with the test design table

| Row | Written test | Conclusion |
|---|---|---|
| E2 (changed) | `startup-restore.spec.ts:149-157`: the inode read (150), the file renamed aside (151) and a symlink to it put at its path (152), refused with an empty recorder (153-154), the symlink removed (155) and the file renamed back (156), its inode equal to the one read before (157); the second call, its recorder and the hint as before (158-160) | Matches. The comment over it (147-148): F10 |
| E1 (changed) US-001/AC-02 | hover on the copy-ID and reveal buttons, each name read with `{ timeout: 500 }` (5638-5643); focus on the reveal button, read with `{ timeout: 500 }` (5647-5648); hover on the resume button, its command line read with `{ timeout: 500 }` (5681-5682), its name with the default (5683) | Matches: the resume tooltip's name and command come from one `tipBody` render (`SessionActions.tsx:75-83`), so the bounded command read bounds the tooltip that names the action; the three buttons are one map with the same hover and focus handlers (88-103), as the row says |

Test file headers: E1's note (5525-5541) is unchanged by the range; startup-restore.spec.ts's header (2) and E2's
comment (128-131) are unchanged and claim no gap. The comment the range adds (147-148) states a reason the evidence
refutes: F10.

#### Coverage

- E2's inputs reach their branches as before: the symlink now points at the original file moved aside, which exists,
  so `existsSync` still passes and the refusal can come only from the file's type under the restored allow-list
  (security.ts:204-206); the file renamed back is the same regular file, and it is shown.
- The inode: the rename stays inside the case's temp home and 157 asserts the inode, so the later rewrite (162) is
  in place under the saved page's `dev:ino`, as before E2. F7 is resolved as to its handling: the row was amended and
  reviewed first, and the case's later steps are back on the setup they had. F7's further claim, that 164 would go
  red without the byte ranges and text the page handler passes, did not hold, and the code says why: with those
  arguments constant the new page's question keeps its revision, so `TurnContent` stays mounted under the same key
  (`SessionPane.tsx:336`) and its old answer stays on screen until something refetches it; when the held scan
  completes, its snapshot invalidates every turn query (`App.tsx:184-188`, `query-client.ts:28-31`) and the refetch
  returns the rewritten turn, which 166's retried read accepts. Nothing in the case reads the answer between the new
  page and that refetch. That the case does not pin the handler's arguments predates this change and concerns
  session-view::REQ-001/AC-04, outside this check's spec items; the second self-check leaves it to the owner.
- F8 is resolved: the resume button's first read is bounded at 500 ms, and the row says what E1 reads.
- Fixture shapes: the range adds no data another program writes. Nothing beyond F10.

#### Case design

E2's rename and symlink are file-system events a user or another program can cause; no internal state is written,
and only `shell.showItemInFolder` is replaced, at the process boundary. E1's change bounds one read. No finding.

#### False greens

Per the project's capability declaration, mutation-testing is not enabled, so mutation testing is skipped. When each
changed assertion goes red, against the code under test and its expected value's source:

- 157 (the inode): when the case puts back a different file — a copy or a rewrite, as 3c37a76's version did. It
  guards the case's own setup, not the product, and stops the case before its later steps can run on a changed setup.
- 153-154 and 158-160: as the first incremental check answered. The symlink's target is now the original moved aside
  rather than a copy, which changes nothing these reads depend on.
- 5682: when the resume tooltip, read through its command line, comes 500 ms or more after the hover. It can pass
  only on the resume tooltip: the copy-ID tooltip on screen before it (5676) has no `.stip-cmd`.
- 162-166, unchanged, on the setup E2 now restores: red for a page that never shows the rewritten question, or for
  any answer but the rewritten one once it does; not for the page handler's arguments to `questionRevision`
  (Coverage above).
- Against review-code's false-greens list: form five — the 500 ms read polls the expression it asserts; the inode
  read is synchronous. The range adds no gate and no command-line acceptance.

F9 is resolved: the design review's False greens (79-81) and the first increment's review (117-119) now match the
tests — the expected values come from the spec's words, the fixtures' literals and the confirmed prototype, and
AC-06's "no rect" is named as a retried negative that can pass only while the check shows.

#### Resource reuse

From the targeted log: one `electron-vite build` (main, preload, renderer; lines 35-57) for its 88 cases. The list
reporter prints no launches, so the count is from the code: E1 launches once (5590) and closes once (5787); the
restart case launches twice (55, 95), and E2 runs inside the second launch. The range adds no launch and no build. No
reviewed case clears or releases a process-wide resource, so execution order bears on no count. No finding.

#### Findings

| # | Where | Dimension | Finding | Evidence | Handling |
|---|---|---|---|---|---|
| F10 | `startup-restore.spec.ts:147-148`; this record's second self-check, its F7 bullet (152-153) | Coverage | The comment d71833f put over E2 gives, as the reason for keeping the inode, that "only the byte ranges and text the page handler passes tell the rewritten question from the saved one" — saying the later rewrite pins those arguments, the premise the second self-check's mutation refuted. The self-check, for its part, names the wrong cause for the case staying green: "the turn's freshness check refetches it" on the size and mtime change, while the freshness check only reports staleness (`turn-content-query.ts:37-38`) and the refetch is the held scan's snapshot invalidating every turn query. Either statement misleads a later reader about what the case covers, or about what a case that pins the arguments has to get around | [f7-mutation.json](evidence/session-id/f7-mutation.json), [f7-mutation-reach.json](evidence/session-id/f7-mutation-reach.json); `SessionPane.tsx:336`, `App.tsx:184-188`, `query-client.ts:28-31` | Reword the comment to what the rename holds: the file keeps its inode, so the case's later steps run on the setup they had before E2 (and, if wanted, that the case does not pin the handler's arguments). Correct the self-check's cause to the snapshot's invalidation. No assertion changes |

F7 to F9 are resolved, each as its paragraph above says (F7 as to its handling; its claim about 164 did not hold).

#### Document sync this check creates

Scope, enumerated with `find` (no ignore rules apply; hidden and ignored files included): the root's Markdown and
TOML files, `docs/specs`, `docs/features`, `docs/adr`, and `docs/.workings/session-view` with its evidence — 136
files (the previous check's 130 and the six evidence files this range adds; five PNGs, the rest text) — plus the two
reviewed test files' headers and E2's comments. Left out, as before: other features' working directories,
`docs/prototypes` (no finding concerns them) and `site/`. Searched the 131 text files with `grep -a` for "inode",
"renam", "put back", "swapped for a symlink", "freshness check", "questionRevision", "byte range", "source rewrite",
"left to the owner", "never pinned", "pins the" and "in place": 205 hits, read where they fall in the spec, the
ADRs, `docs/features`, `CONTEXT.md` and this feature's working records; the rest are other subjects (test names
saying "in place" in run logs, the byte ranges of turns, other features' in-place fills).

The previous check's sync rows are done and were read against the tests: the E2 row and its review, the AC-02 row,
and F9's two statements — true, except as F10 says of the self-check's cause.

Statements the finding makes untrue:

| Statement | Where | Findings |
|---|---|---|
| The comment over E2's swap | `e2e/startup-restore.spec.ts:147-148` | F10 |
| "The rewrite changes the file's size and mtime, so the turn's freshness check refetches it whatever the revision holds" | this record, the second self-check | F10 |

Unaffected: the spec's testing decisions (session-view.md:1019-1022 — "put back as a regular file, it is shown" holds
for the file renamed back); the restart-scenario line (session-view.md:685-687) and ADR-0029's "verifies source
rewrite" (line 65), as true as at 03ff1a2, since the case's rewrite steps are as they were before E2;
session-id-tasks.md's new section, whose F7 bullet (95-98) agrees with the mutation and names no cause, and its AC-02 and R1
rows (13, 25); `docs/features`, the other ADRs and `CONTEXT.md`, which state nothing the range changed. No finding is
a product defect. This check changed nothing outside this section.

## Owner-requested increment: the page handler's question identity (2026-10-28)

After delivery the owner asked for the gap the F7 mutation showed to be closed in this change (no test pinned the
byte range and text the page handler passes to the question identity, session-view::REQ-001/AC-04). Implementation
version at the start of this increment: 7ff103f.

### Test design table — the restart case, changed

| # | Spec item | Seam | Input that drives the target branch | Assertion object and where its expected value comes from | Fixture shape source | Expensive resource and how provided |
|---|---|---|---|---|---|---|
| R-text (changed restart case) | session-view::REQ-001/AC-04 ("never show an old question with a new answer selected only by its former ordinal after the source has been rewritten") | the cross-process restart e2e the spec names for REQ-001 ("including … source rewrite") | in the second launch, its first scan held, the expanded saved question rewritten in place with text of the same byte length (`Saved question` → `Fresh question`, `Saved answer` → `Fresh answer`): the question line's start and end are unchanged, so only its text tells it from the saved one. The held scan's snapshot then refetches the expanded turn with the saved page's question identity while the page itself waits out the 1 s fetch delay | an in-page observer, installed while the scan is still held, records every pair of a question row's text and its open turn's answer text the list shows. The record holds `Saved question → Saved answer` (the state at install) and `Fresh question → Fresh answer` (the end state, so the observer ran through the change) and never `Saved question → Fresh answer`. Expected values: AC-04's words and the fixture's literals | the case's existing Claude lines | the case's second launch; nothing added |
| R-range (added to the restart case) | session-view::REQ-001, "Failure modes and boundaries: opening restored content", first item ("invalidate saved turn identities if the underlying question mapping changed"); AC-04 | the turn channel, as the renderer calls it (the case already reads `readArtifact` and `revealSessionFile` this way) | after the rewritten page is current, the question's identity is read from the page channel; then one line is put before the question, so the question moves while its line stays the same byte for byte. The line is a `permission-mode` record, a shape a real Claude Code file on this machine has before its first question (one file read, 2026-10-28) | the turn channel refuses the identity read before the move with `session-not-indexed`; the page re-read after the move lists the same question texts, and its identity fetches the turn with `Fresh answer`, so the refusal is the identity's and not the call's. Expected values: the boundary's words and the fixture's literals | a real file's first-line shape, as above | the same launch; nothing added |

### Design review of the two rows

- Coverage: AC-04's rewrite is now pinned by its text alone (R-text keeps the range) and the changed mapping by its
  range alone (R-range keeps the text). Dropping either argument at both call sites turns one of them red; dropping
  both turns both red. The append case (an identity that survives appended questions) stays with
  `source-identity.test.ts`, at the function, since appends do not change either argument.
- Case design: R-text reads what the user sees, through a real snapshot and a real refetch; nothing is built by hand.
  R-range reads the channel, because on screen a moved, unchanged question would show its own current answer either
  way: the identity's refusal has no display of its own to assert.
- False greens: R-text's negative assertion cannot pass on a silent observer, because the two positive pairs require
  it to have read the list at install and after the change. R-range's refusal is paired with a positive control on
  the same channel, in the same state.
- Resource reuse: no launch and no build are added; both rows run inside the case's second launch.

Mutation testing: by the project's capability declaration, mutation testing is not enabled, so it is skipped as a
review dimension. The gap itself was found by a mutation, though, so the same mutation, and one for each argument
alone, is run once as the gap's own evidence (below, after the implementation).

No finding.
