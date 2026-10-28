
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
the spec or from the fixture's own literal (one, the copied button's border, from the prototype — the increment below) (the file name, the directory name, the record's id), never recomputed
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
False greens: no row retries a negative; the 500 ms bound fails a tooltip that waits for a native-title delay; the
glyph assertions are on the icon's own markup, so dropping the swap fails them; E2's empty recorder is read after the
call's rejection has arrived, and its second call proves the recorder records. Resource reuse: no new launch. The
design review's Coverage now reads "the restored-entry check (U10 for the judge, E2 for its wiring)", and its False
greens holds with the border's expected value taken from the prototype, as the row says. No finding.

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
