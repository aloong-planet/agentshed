# Test review — #322 Antigravity side: registry, project list and activity

Ticket: [#322](https://github.com/aloong-planet/agentshed/issues/322) · feature checklist: [checklist.md](checklist.md)

## Design review

Date 2026-10-29 · implementation started from `cbe22ca` (main) · scope: every test this ticket writes or changes.
Specs read: projects-list::REQ-001, token-stats::CON-001, token-stats::CON-002, token-stats::REQ-003/AC-07 …
token-stats::REQ-003/AC-09, agents-overview::CON-004, agents-overview::REQ-003/AC-01, agents-overview::REQ-003/AC-03,
project-detail::REQ-002/AC-01, project-detail::REQ-002/AC-04, memory-view D4, and the failure-mode sections of
projects-list and token-stats that touch the side.

Real samples looked at before the fixtures were designed (read-only; databases copied into the session scratch
directory first, never opened in place): all 19 conversation databases under `~/.gemini/antigravity-cli/conversations`
(schema, `PRAGMA user_version`, the trajectory metadata blob of each, at wire level and through the descriptor-based
decoder of the research record), the settings file's key set and `trustedWorkspaces` shape, `~/.gemini/config/projects`,
and this machine's display cache (`display-cache.json`, key sets of every per-side Record only).

### Test design table

Seams: **proto** = `decodeTrajectoryMetadata` (the record reader's public function); **scan** = `scan(roots)` over a
fixture home (ADR-0002's providers seam); **walk** = `readAntigravitySessions(home, tmpParent)`; **store** =
`DisplayStore` over a written `display-cache.json`; **unit** = the pure function named; **e2e** = the built app over an
`AGENTSHED_HOME_OVERRIDE` fixture home.

Fixture shapes: **real bytes** = a trajectory metadata record copied from a real 2026-10-28 conversation, its folder
path replaced by one of the same length, and (subagent only) its two large prompt-carrying fields 4 and 10 dropped —
top-level fields are independent records, so the rest stays byte-identical; decoded by the research record's
descriptor-based decoder with 0 unknown fields. **encoder** = the test helper that writes the same field layout as the
real records (field order 1, 2, 3, 5, 6, 7, 8, 17, 18; workspaces with their four sub-fields), pinned by P9 to reproduce
a real record byte for byte. **schema** = the seven tables, two indexes, `user_version = 1`, WAL journal mode, as dumped
from a real database.

Expensive resources (≥ 1 s): only the e2e build (`electron-vite build`, once per `pnpm e2e`, by the script) and the
app launch (one per e2e case, the suite's existing rule: each case has its own userData and fixture home). Vitest cases
build SQLite fixture databases in milliseconds — not expensive.

| # | Case | Spec units | Seam | Driving input | Assertion object and expected-value source | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| P1 | the measured API-key main record decodes to its one folder and no parent marker | token-stats::REQ-003/AC-08; technical prerequisite (record reader) | proto | real bytes of a main conversation (fields 1, 2, 3, 6, 7, 18) | folders = the substituted path (literal); not a subagent | real bytes | none |
| P2 | the measured signed-in record, with its packed experiment ids (field 15), decodes the same | same | proto | real bytes with field 15 (a packed repeated varint the reader must skip by length) | same literals | real bytes | none |
| P3 | the measured subagent record is a subagent and names its parent | token-stats::REQ-003/AC-07 | proto | real bytes with fields 5, 8, 17 | subagent true; parent = the literal id from the sample | real bytes | none |
| P4 | the measured empty-conversation record (opened, nothing sent) has its folder | token-stats::REQ-003/AC-09 | proto | real bytes of the empty conversation | folder literal; not a subagent | real bytes | none |
| P5 | each subagent marker alone makes a subagent; none of them, none | token-stats::REQ-003/AC-07 | proto | encoder: parent only / nesting depth 1 only / subagent spec only / none | subagent true ×3, false ×1 (the spec's three markers) | encoder (markers' wire forms from the real subagent record) | none |
| P6 | two folders → the first; no `workspace_uris` → the workspaces' folder | token-stats::REQ-003/AC-08 | proto | encoder with two folders; encoder with field 7 omitted | first folder literal; the fallback literal | encoder | none |
| P7 | a record cut short does not decode | token-stats::REQ-004/AC-01 (the reader's half) | proto | real bytes truncated inside a length-delimited field and inside a varint | throws | real bytes, truncated | none |
| P8 | a percent-encoded folder URI decodes to its path; a non-file URI is no local folder | token-stats::REQ-003/AC-08 | unit (`folderPath`) | `file:///Users/x/My%20Project`, `vscode-remote://…` | `/Users/x/My Project`; null (literals) | mechanism (URIs percent-encode; no real sample with a space) | none |
| P10 | a nesting depth of zero is no subagent marker | token-stats::REQ-003/AC-07 (zero depth written back to the failure modes) | proto | encoder with `nestingDepth: 0` and nothing else | not a subagent; depth 0 | encoder | none |
| P9 | the fixture encoder reproduces the measured main record byte for byte | fixture guarantee for every scan/walk case | unit (test helper) | the sample's own field values | bytes equal P1's real bytes | real bytes | none |
| R1 | trusted folders become projects on this side; a missing one is stale | projects-list::REQ-001/AC-01 (A6) | scan | settings `{permissions, trustedWorkspaces: [alive, ghost]}` | sides `['antigravity']`, stale false/true; detected | settings key set measured | none |
| R2 | a folder also on Claude merges into one entry counting two sides, trailing slash ignored | projects-list::REQ-001/AC-01 (A4, A5, A8) | scan | Claude registry `[p]`, trusted `[p + '/']` | one entry, sides `['claude','antigravity']` | measured settings shape | none |
| R3 | data root missing → not detected; root with no settings / no key / an empty list → detected, no projects, no error | projects-list::REQ-001/AC-05 (A1, A2, A9) | scan | four homes | detected false; detected true + error undefined + no projects | measured layout | none |
| R4 | a corrupt settings file, or `trustedWorkspaces` not a list → this side's error, the other side normal | projects-list::REQ-001/AC-05 (A3) | scan | `{broken`, `{"trustedWorkspaces": 3}` | error codes `registryParseFailed` / `registryProjectsInvalid` (literal codes); Claude project listed | measured | none |
| R5 | a non-string entry is skipped, the others kept | projects-list::REQ-001/AC-01; CONTEXT "degradation may only hurt itself" | scan | `[alive, 7, null]` | one project, no error | derived (no sample) | none |
| R6 | agy's own project records and its cache mapping never register a folder | projects-list::REQ-001/AC-03 | scan | `~/.gemini/config/projects/p.json` with a `gitFolder.folderUri` naming R; `cache/projects.json` naming R2; trusted T | only T listed | config/projects file measured (`default-cli-project.json`), resource entry per the research §3.2 | none |
| A0 | a conversation moves its trusted folder to its database's time and counts once | projects-list::REQ-001/AC-04 | scan | one closed conversation in a trusted folder, mtime set | count 1; time = its mtime (literal) | encoder + schema | none |
| A1 | the most recent time is the log's when it is newer than the database's | projects-list::REQ-001/AC-04 | scan | conversation kept open by a writer (db, `-wal`, `-shm`), db mtime set older than the log's | `lastSessionAt` = the log's mtime the test set (literal) | schema; a writer holding the database open is agy's own state while it runs | none |
| A1b | the most recent time is the database's when it is newer than the log's | projects-list::REQ-001/AC-04 ("the later of") | scan | the A1 state with the database's mtime set after the log's (a checkpoint writes the database and leaves the log) | `lastSessionAt` = the database's mtime (literal) | schema + writer | none |
| A2 | a subagent conversation with the main conversation's trajectory source neither counts nor moves the time | projects-list::REQ-001/AC-04; token-stats::REQ-003/AC-07 | scan | main (source 17, older) + subagent (source 17, newer) in one trusted folder, both at the top of `conversations/` | count 1; time = the main one's mtime | real bytes (subagent) + schema | none |
| A3 | a conversation in a folder agy never trusted lists nothing and raises no count; a Claude-only folder's activity still includes it | projects-list::REQ-001/AC-02 (A7, A8, B9) | scan | conversation in untrusted U; conversation in T registered on Claude only | U absent; T sides `['claude']`, time = the conversation's mtime | encoder + schema | none |
| A4 | a conversation listing two folders is credited to the first only | token-stats::REQ-003/AC-08 | scan | encoder record `[F1, F2]`, both trusted | F1 count 1 + time; F2 count 0, time null | encoder | none |
| A5 | an empty conversation moves its folder's time and raises no error | token-stats::REQ-003/AC-09; projects-list::REQ-001 failure modes | scan | real empty record, zero `steps` and `gen_metadata` rows | time = its mtime; side error undefined | real bytes + schema | none |
| A6 | only `.db` files directly in `conversations/` of agy's own root are conversations | token-stats::CON-001 | scan | `.db` in a subdirectory; conversations and settings under `~/.gemini/antigravity` and `~/.gemini/antigravity-ide` | nothing from them: time null, their trusted folder absent | measured layout (CL root vs the app's and IDE's roots named in ADR-0037) | none |
| A8 | a first folder that is not a local `file:` URI credits no project, not even a trusted second folder | token-stats failure modes (written back); projects-list::REQ-001 boundary | scan | encoder `rawUris` [a `vscode-remote://` URI, the trusted folder's `file:` URI] | the trusted folder: count 0, time null | encoder (a remote first folder is a derived shape) | none |
| A7 | a conversation that cannot be read contributes nothing and does not stop the others | token-stats failure modes (zero-byte or non-SQLite `.db`); CONTEXT degradation invariant | scan | zero-byte `.db`, a text file named `.db`, a record that will not decode, beside a good one | good one attributed; no side error; no throw | derived | none |
| C1 | a read without a log writes nothing | token-stats::CON-002 | scan | a closed WAL-mode database | the conversations directory's (name, size, mtime) listing before = after; no `-wal`/`-shm` appear | schema | none |
| C2 | a read with a log writes nothing, and sees the rows only the log holds | token-stats::CON-002 | scan | a writer holds the database open; the trajectory row exists only in its log | listing before = after (db, `-wal`, `-shm`); the folder is attributed (proves the log was read) | schema + writer | none |
| C3 | the temporary copy is removed | token-stats::CON-002 | walk | the C2 state, an injected empty temporary parent | the parent is empty afterwards; the session is attributed | schema + writer | none |
| W1 | an unchanged conversation is not read again | token-stats failure modes ("not read again") | walk ×2 | a conversation with a log; first walk with a usable temporary parent, second with one that does not exist (no copy can be made) | the second walk still attributes it | schema + writer | none |
| W2 | a failed read is tried again at the next scan | token-stats failure modes ("retried at the next scan") | walk ×2 | the same state; first walk with the unusable parent, second with a usable one | first: no folder; second: attributed | schema + writer | none |
| C4 | the copy's directory is the user's alone while the read runs | token-stats failure modes (a killed read's copy readable only by the user) | unit (`readConversationDb`) | a conversation with a log, an injected temporary parent; the read callback stats the copy's directory | mode `0700` (literal) | schema + writer | none |
| M1 | a conversation is re-read when its database's time changes though its size does not | token-stats Implementation Decisions (cache key never the database's size) | scan ×2 | first record names F1; rewritten to name F2, size unchanged, mtime moved | second scan credits F2 | encoder + schema | none |
| D1 | a display cache saved before this side restores with the side filled in, not dropped | CONTEXT "page switch" invariant (fields added to a saved type are filled in on restore); ADR-0029 | store | a three-side payload: snapshot sides, tokens bySide, byDay bySide, skills symlink/pkg, saved stats, a saved project detail's stats | snapshot/stats/detail restored; antigravity = not detected / zero totals / 0 / false / null (literals) | key sets of this machine's real display cache | none |
| D2 | a present but malformed entry for the side is still dropped | same | store | `sides.antigravity = 7` | snapshot null | derived | none |
| S1 | the resume command's agy form | session-view::US-001/AC-04 (Antigravity clause; written now because the side Record forces it) | unit (`resumeCommand`) | side antigravity, a safe and an unsafe id | `cd '<dir>' && agy --conversation <id>`, quoted id (literals) | spec text | none |
| V1 | a project registered on the side passes the contract; a snapshot whose sides leave the side out is refused | ADR-0020; contract R1 | unit (`validateSnapshot`) | snapshot from `emptySnapshot` with a project on `antigravity`; the same with `sides.antigravity` deleted | ok; `{ kind: 'missing', path: 'sides.antigravity' }` (an unknown side stays refused by the existing "refuses an invalid side" case) | derived | none |
| E1 | an Antigravity project end to end: card, list, hover, filter, header chip, stale chips, Memory | projects-list::REQ-001/AC-01 (user path); agents-overview::CON-004 (names); agents-overview::REQ-003/AC-01 (detected, project count); agents-overview::REQ-003/AC-03; project-detail::REQ-002/AC-01; project-detail::REQ-002/AC-04 | e2e | home: settings trusting ag-only, tri, ghost; Claude registry tri and a live claude-only folder, tri with a memory file; one conversation in ag-only, mtime three days ago | card chip `ANTIGRAVITY`, `Detected`, `3 projects · 0 global skills · 0 subagents`; Memory section has the tri row and no AG badge; ag-only row `3 days ago`, count 1, tri count 2; hover names `Antigravity` with the Google-blue dot `rgb(66, 133, 244)`; the unfiltered list's three live rows narrow, on the fifth option `Antigravity`, to ag-only and tri; ag-only header chips = one `ANTIGRAVITY`; its Memory = D4's copy; ghost note chips `ANTIGRAVITY` ×2 (literals from the spec and dictionary) | measured settings + encoder + schema | one app launch |
| E2 | the AG badge's colours follow the appearance, not the colour scheme | agents-overview::CON-004 | e2e | appearance locked light/dark × themes purple, blue, amber through the settings page | side-card chip background/text = `rgb(221, 231, 251)`/`rgb(53, 99, 181)` light, `rgb(31, 46, 73)`/`rgb(150, 185, 243)` dark, identical across themes (spec literals) | measured settings | one app launch (`colorScheme: null`, the appearance cases' launcher) |
| E3 | cold start shows four cards; Antigravity not detected without its root | agents-overview::REQ-003/AC-01 (not detected) | e2e (changed) | the existing usage home (no agy root) | 4 cards; the ANTIGRAVITY card reads `Not detected` | existing fixture | existing launch |
| E4 | the existing count-pinned cases follow the fourth side | regressions: projects-list C5, C6; agents-overview A4; skills-view slots | e2e (changed) | existing homes | dropdown 5 options / 4 dots; 4 side cards (cold start, old cache, rescans, skeleton); 4 badge slots | existing | existing launches |
| E5 | the filter row stays inside the column with the longest side name selected, whichever side that is, in both languages | projects-list C5 | e2e (changed) | the two longest side names, Claude Code (option 1) and Antigravity (option 4), each selected in zh and in en, the stale ghost recorded by both sides so the counter is present | the trigger reads the selected name; no overflow, nothing past the column, counter present | existing home plus an agy ledger trusting the ghost | existing launch |
| X1 | existing tests whose fixtures or expectations the side Record changed | ADR-0020 (every per-side Record total) | unit / gate test (changed) | `trend.test.ts`, `usage.test.ts`: `bySide` literals gain `antigravity: 0`, and two expected slices gain it; `check-shared-ui.test.mjs`: the three side-badge plants re-anchored on the four-side Records; 14 provider suites' `ScanRoots` helpers gain `antigravityHome` at a root that does not exist | unchanged expectations otherwise; the plants still make the gate report the planted side | existing | none |

### Dimension 1 — Coverage

Every unit this ticket owns in the checklist has at least one row: projects-list::REQ-001/AC-01 (R1, R2, R5, E1),
AC-02 (A3), AC-03 (R6), AC-04 (A1, A2), AC-05 (R3, R4); token-stats::CON-001 (A6), CON-002 (C1–C3, metadata reads),
REQ-003/AC-07 (P3, P5, A2), AC-08 (P1, P6, P8, A4), AC-09 (P4, A5); agents-overview::CON-004 (E1 names, E2 colours,
typecheck over every per-side Record as the gate), REQ-003/AC-01 (E1 detected and count, E3 not detected),
REQ-003/AC-03 (E1); project-detail::REQ-002/AC-01 (E1 header and stale chips), REQ-002/AC-04 (E1 D4 state); the
technical prerequisites (P1–P9 reader; C1–C3 SQLite access; typecheck for the side set; D1, D2 for the display
data's side check).

Failure modes walked against the rows: trusting a folder then scanning (R1 — every scan reads the ledger anew);
opening agy and leaving (A5); agy writing during a scan (C2, A1); a zero-byte or non-SQLite file (A7); settings or
root missing or corrupt (R3, R4); another product's root populated (A6); the size-unchanged rewrite (M1). Two are
races with no deterministic trigger at any seam — agy exiting between the log check and the copy, and agy starting
to write a database being read in place; they are written as a gap in the test file header with the condition that
would make them testable (an injectable step between the check and the copy).

Fixture independence: P1–P4 and A2, A5 rest on real bytes; P9 ties the encoder (used by P5, P6, A3, A4, M1) to a real
record byte for byte, so encoder-built fixtures share the real layout rather than an imagined one. P5's lone markers
and P8's encoded space are derived shapes, said so in the table; no real record carries them.

### Dimension 2 — Case design

Every row asserts through a public seam: the scan's snapshot, the walk's result, the store's restored data, the built
app's DOM and computed styles. The two filesystem-level assertions (C1–C3) are the spec's own acceptance (token-stats::
CON-002 is about the files) and read the directory listing, not internal state. Every state is reachable: a database
held open by a writer is exactly agy's state while it runs; mtimes are set with `utimes`, the operation that is
agy's own effect on them; no case writes the walk's in-memory cache. No finding.

### Dimension 3 — False greens (the three checks a design can settle)

- Constant-true: no threshold assertions; every count is asserted as an exact number against a fixture holding more
  than one candidate (A2: two conversations, one excluded; A4: two folders, one credited; E1: three registered
  projects for a count of 3).
- Tautology: expected values are literals — paths, ids and colours from the samples or the spec, mtimes the test
  itself sets; none recomputed with the code under test (E1's `3 days ago` is a literal, not `relativeDays(...)`).
- Old paths: the side Records asserted (`SIDE_*`, `AGENT_SIDES`) are the live ones the renderer and contract import
  (checked with `rg` at implementation time).

### Dimension 4 — Resource reuse

Searched for existing shared setups: the vitest suites build a fresh `mkdtemp` home per case and share nothing
costly; the e2e suite launches per case with its own userData. Rows follow both. E1 and E2 each add one launch with
different parameters (E2 needs the appearance launcher, `colorScheme: null`, and its own home), so neither duplicates
another case's resource. The Antigravity reader keeps a process-level memo keyed by conversation path and signature:
no test clears it, every case uses its own temporary paths, and M1 is the one case that scans the same path twice,
relying on the signature change rather than any clearing.

### Findings

No findings.

### Increment after the post-implementation check (2026-10-29)

Rows changed by the handling of the post-implementation check's findings, reviewed before the tests were written or
changed (implementation at `1526670`):

- Rewritten to the tests as written (finding 1): V1, A6, E5; added: A0 (the base activity case), X1 (the existing
  tests the side Record changed).
- Added for coverage (findings 3–6): A1b, A8, P10, W1, W2, C4. E1 changed (finding 2): a live Claude-only folder joins
  the home, so the filter has a row to remove.

Dimension 1 — Coverage: the failure-mode sentences the specs now carry for this ticket each have a row — the later of
the two times both ways (A1, A1b), a non-local first folder (A8), a zero depth (P10), not read again and retried (W1,
W2), a killed read's copy readable only by the user (C4, by the mode of the copy's directory while the read runs). The
two windows no seam can stage — agy exiting between the log check and the copy, and between the log's copy and the
database's — are gaps named in the test file header with what would close them. A8's remote first folder and P10's
zero depth are derived shapes, said so; every scan or walk row still rests on the schema and the encoder pinned by P9.

Dimension 2 — Case design: W1 and W2 drive the memo through the walk's public signature only — the injected temporary
parent decides whether a copy can be made, which is the walk's own input; C4 observes the copy's directory from inside
the read callback the reader already hands out (`readConversationDb`'s public contract), not from internal state.
A1b's database time after the log's is what a checkpoint by a running agy leaves. No finding.

Dimension 3 — False greens (design-time): E1's narrowing now has three live rows before the filter and two after, so a
filter that does nothing fails it; A1b fails a reader that takes the log's time whenever a log exists; W1 fails without
the memo (the second walk cannot copy), W2 fails if a failure were remembered; C4 fails for a copy directory made with
the usual 0755. Expected values are literals.

Dimension 4 — Resource reuse: no new expensive resource; E1 keeps its one launch.

Findings: none.

## Post-implementation check

Date 2026-10-29 · ticket [#322](https://github.com/aloong-planet/agentshed/issues/322) (feature `antigravity-side`) ·
implementation `1526670` (range `cbe22ca..1526670`: `853f440`, `1526670`) · first round · scope: every test the range
writes or changes — `src/main/providers/agy-proto.test.ts` and `antigravity.test.ts` (new), the fixture helper
`src/main/testing/agy-fixture.ts` (new), `src/main/display-store.test.ts`, `src/shared/validate.test.ts`,
`src/shared/session-resume.test.ts`, `src/shared/trend.test.ts`, `src/shared/usage.test.ts`,
`scripts/check-shared-ui.test.mjs`, the `ScanRoots` helper of 14 provider suites, and `e2e/app.spec.ts` (two new cases,
eight changed). Specs read as they stand in the working tree at 01:07 (this ticket's uncommitted write-backs to
projects-list::REQ-001 and the token-stats Antigravity failure modes included), the units' text checked against
`cbe22ca`.

Status: this is round 1; its findings 1–6 are all resolved, as checked in "Round 2 — incremental check" at the end of
this section, which also holds the current conclusion.

### Run evidence

Source: [ticket-322-gate-prereview.log](ticket-322-gate-prereview.log) (written 01:05:55), read in full against the
log requirements of `/implement`'s full verification gate:

- Version: `git rev-parse HEAD` = `1526670fc4edf8472de0c99f2467a84c6e314c60`, the end of the handed range. The version
  list names the one file modified at the time, `docs/.workings/antigravity-side/checklist.md`, at `c3c60b35…`, which is
  still its hash (mtime 00:55:55). Every other file now modified in the worktree is a document written 01:06–01:08,
  after the log; none was part of the logged run.
- Every command is written with its exit code (`exit=0` each) and its whole output; the reviewed tests all ran:
  `vitest run` (927 passed, 1 skipped — the pre-existing `ccusage-parity` opt-in), and `e2e/app.spec.ts` whole (88
  passed, E1 and E2 among them, after one `pnpm build`).
- No required item is missing. (`pnpm smoke`, part of `pnpm verify`, is not in the log; it runs none of the reviewed
  tests, so nothing here rests on it.)

Nothing was re-run by this check: per the project's capability declaration (`capabilities.toml`, read with a TOML
parser), `mutation-testing` is not enabled (`enabled = false`), so mutation testing is skipped, and every "when does it
go red" below is answered from the code under test, the fixtures and the expected-value sources.

### Item 1 — the tests as written against the Test design table

| Row | Written test | Matches the table? |
|---|---|---|
| P1–P4 | the four "as agy wrote it" cases over `measured(...)` | Yes (P2/P3/P4 compare with the fixture constant `MEASURED_FOLDER`, which P1 pins as a literal) |
| P5, P6, P8, P9 | the four "markers and folders" cases | Yes |
| P7 | "a record cut short does not decode" | Yes; the offsets in its comments re-measured (byte 253 = `7a`, 254 = `d8`, continuation bit set) |
| R1–R6 | the six registry cases | Yes (R5 also feeds `''`) |
| A1–A5, A7, M1 | the activity cases of those names | Yes |
| A6 | "only .db files directly in agy's own conversations directory…" | **No** — the table's input includes `.db-wal`/`.db-shm` files; the written case has none (their exclusion is driven by C3, whose listing holds `busy.db`, `-shm`, `-wal` and must yield one session) — Finding 1 |
| — | "a conversation moves its trusted folder to its database's time and counts once" | **No row** — Finding 1 |
| C1–C3 | the three CON-002 cases | Yes |
| D1, D2 | the two display-store cases | Yes |
| S1 | the two `antigravity` lines added to "the resume command" | Yes |
| V1 | "admits a project registered on Antigravity CLI, and refuses a snapshot whose sides leave it out" | **No** — the table plans a project on `gemini` refused with an enum failure; the written case refuses a missing `sides.antigravity` (`kind: 'missing'`). The unknown-side refusal is the pre-existing "refuses an invalid side on a project entry" — Finding 1 |
| E1 | "an Antigravity-registered project: …" | Inputs and assertions as listed, but its "narrows to 2 rows" cannot fail — Finding 2 |
| E2 | "the Antigravity badge takes its own pair…" | Yes |
| E3, E4 | cold start, old cache, dropdown, rescans, Grok skills strip, time window, skeleton | Yes |
| E5 | "the side filter row stays inside the sidebar column in both UI languages" | **No** — the table drives "each side option selected in turn"; the written case selects options 1 and 4 (Claude Code, Antigravity) in zh and en, as the decisions record's "e2e shape" row says — Finding 1 |
| — | `trend.test.ts`, `usage.test.ts` (per-side literals and two expected `bySide` values), `check-shared-ui.test.mjs` (three plants re-anchored on the four-side source), the 14 `ScanRoots` helpers (`antigravityHome` at a missing root) | **No row**, though the table's scope is "every test this ticket writes or changes" — Finding 1 |

Seams, fixture shapes and resources match the table in every row above; no case reads internal state or builds a state
the public path cannot reach (`utimes` and a writer holding the database open are agy's own effects; the display-store
cases write `display-cache.json` because a payload saved before the side exists only on disk, and read it back through
`DisplayStore.get()`).

### Dimension 1 — Coverage

Test file headers: `antigravity.test.ts` names two gaps (agy exiting between the look for the log and its copy; agy
starting to write a database read in place), each with the condition that would close it. `agy-proto.test.ts` and the
new e2e cases drive everything they claim and need no gap note.

The failure-mode and boundary sentences in #322's scope, as the specs now read, walked against the cases:

| Spec sentence | Case or gap |
|---|---|
| projects-list REQ-001: trusting a folder then scanning adds the row; agy's empty conversation moves the time; names follow CON-004; a ledger entry that is not a path is skipped; a ledger that is not a list is corrupt | R1 (each scan reads the ledger), A5, E1, R5, R4 |
| projects-list REQ-001: a conversation that cannot be read gives no folder its activity | A7 |
| projects-list REQ-001 / token-stats: a first folder that is not a local `file:` URI credits no project | **none** — Finding 4 |
| projects-list::REQ-001/AC-04: the later of the database's and the log's times | A1 (log newer) only — Finding 3 |
| token-stats: agy writing during a scan → the copy reads the committed log | C2 |
| token-stats: agy exiting between the check and the copy | header gap 1 |
| token-stats: the log copied before the database (agy exiting between the two copies) | **not named** — Finding 6 |
| token-stats: a split pair's failed read is retried at the next scan; an unchanged conversation is not read again | **none** (M1 drives only the miss) — Finding 5 |
| token-stats: a killed read's copy is left in a temporary directory only the user can read | **none, not named** — Finding 6 |
| token-stats: credited to the workspace URIs, else the workspaces' folders | P6 |
| token-stats: a nesting depth of zero is no subagent marker | **none** — Finding 4 |
| token-stats: agy starting to write a database read in place | header gap 2 |
| token-stats: a zero-byte or non-SQLite `.db` (this ticket: contributes nothing) | A7 |
| token-stats: settings or data root missing or corrupt | R3, R4 |

### Dimension 2 — Case design

Checked within item 1: every case asserts through a public seam (the snapshot, the walk's result, the restored store,
the built app's DOM and computed styles; C1–C3 read the directory listing, which is token-stats::CON-002's own
acceptance), and every state is reachable. No finding of this dimension.

### Dimension 3 — False greens

Mutation testing skipped (see Run evidence). When each reviewed test goes red:

| Test | Goes red when |
|---|---|
| P1–P4 | the reader stops at, or throws on, a field it does not need (field 15's 472-byte packed list in P2; field 8's nested spec in P3), reads the folder from elsewhere, or misjudges a real record's markers |
| P5 | any one of the three markers stops making a subagent, or a record with none becomes one |
| P6 | the folder list is not the record's order, or the workspaces' folders are not the fallback |
| P7 | a truncated length-delimited field or varint decodes as less instead of throwing (without the bounds checks both inputs return normally) |
| P8 | percent-decoding or the non-`file:` refusal breaks |
| P9 | the encoder's layout drifts from the real record by one byte |
| R1–R6 | the ledger is not the registry, staleness or the merge or slash normalisation fails, an absent ledger reports an error or a corrupt one does not, one bad entry empties the side, or a project record or the cache mapping registers a folder |
| base activity case, A1 | the database's (A1: the log's) time is not the folder's time, or the conversation is not counted |
| A2 | the subagent is judged by its trajectory source or position, or is counted / moves the time |
| A3 | an untrusted folder enters the list or raises a count, or a Claude-only folder loses Antigravity activity (B9) |
| A4 | the second folder is credited too, or the first is not |
| A5 | the empty conversation raises a side error or is left out of activity |
| A6 | a nested database or another product's root is read |
| A7 | an unreadable conversation throws out of the scan (the catch removed) or counts |
| M1 | the memo key leaves out the database's time (a size-only or path-only key returns the old folder) |
| C1 | a read opens the database other than immutable (a plain read-only open leaves `-shm`/`-wal`, measured) or writes it |
| C2 | the database with a log is read in place (the record lives only in the log: no attribution) or anything under agy's directory changes |
| C3 | the copy's directory is left behind, a `-wal`/`-shm` is taken for a conversation, or the original log is removed |
| D1 | any per-side Record of a three-side payload is not filled (the snapshot, the saved statistics or the saved page fails the contract and is dropped) |
| D2 | the fill-in overwrites a present malformed entry |
| S1 | the agy form or its quoting changes |
| V1 | the side leaves `AGENT_SIDES` or `sides.antigravity` stops being required |
| E1 | the card's chip, detection or third line, the Memory section (a side row would carry `.badge.ag`, `MemoryView.tsx:72`; read after the Claude row has rendered), the row's time or side count, the hover names or dot colour, the fifth option's label or dot, the header or stale chips, or the D4 copy changes. **Not** when the filter stops narrowing — Finding 2 |
| E2 | a badge value leaves the spec's pair or varies with the theme (read after navigating to the page that mounts the chip; six combinations counted) |
| E3, E4 | the fourth card, option, dot or slot is missing or extra, or the undetected card reads otherwise |
| E5 | the row overflows with either long name selected; the trigger's text is asserted first, so the measurement is of the intended option |
| trend, usage, plants | the per-side shape changes; a plant fails to apply (each must occur exactly once) or the gate stops reporting the planted side |

The browser assertions were also read against the review-code false-green forms: no existence-only assertion stands in
for an effect, no synthetic event replaces the real path, the Memory "none" is read only after the list has rendered,
and the computed colours are read on elements mounted after the appearance settled. One constant-true assertion
relative to its claim: Finding 2.

### Dimension 4 — Resource reuse

Counted from the pre-review log, the one run that ran every reviewed test:

| Resource | Expected (table) | Counted |
|---|---|---|
| The e2e build | once per run | once: one `electron-vite build` (main, preload and renderer bundles, log lines 577–602) before Playwright's 88 cases |
| App launch for E1, E2 | one each | the list reporter prints no per-launch output, so the count is read off the code: E1 calls `launch` once, E2 `launchAppearance` once; their durations (994 ms, 1.2 s) are those of the suite's single-launch cases |
| Vitest fixtures (SQLite databases, payloads) | not expensive | confirmed: `antigravity.test.ts` 18 cases in 284 ms, `agy-proto.test.ts` 5 ms, `display-store.test.ts` 35 ms |

No expensive resource is shared in-process, so no case clears one; the reader's process-level memo is not expensive,
is never cleared by a test, and every case reads its own `mkdtemp` paths, so execution order cannot change a result. No
finding.

### Document sync for this check

Scope (2026-10-29, worktree at 01:10): `docs/.workings/antigravity-side/` enumerated with ignored files included
(`ls -la`; `git status --porcelain --ignored --untracked-files=all`) — read in full: this record, the gate log,
`ticket-322-decisions.md`, `ticket-322-review-code.md`, `ticket-322-doc-sync.md`, `final-regression.md`; `checklist.md`
read in its #322 mapping rows and its whole "Current verification" section; the five specs' Antigravity sections,
failure modes and Testing Decisions. Excluded: the other tickets' sync checklists (they hold other tickets' items, not
statements about these tests), the feature pages, CONTEXT.md and ADR-0037 (they state product behaviour and decisions,
which these findings do not change).

Statements these findings make untrue or unsupported, to be handled with the fixes (not edited by this check):

- This record's Test design table — Finding 1 (rows to be amended and re-reviewed as an increment).
- `checklist.md` "Current verification": projects-list::REQ-001/AC-01's evidence "the filter narrows to its folders"
  (Finding 2); projects-list::REQ-001/AC-04 "Verified" on the log-newer half only (Finding 3); token-stats::REQ-003/
  AC-07 and AC-08, whose written-back boundaries have no case (Finding 4).
- `final-regression.md`, #322 Stage 1, the projects-list row: "each has a passing case" for the added boundary
  sentence, which names the non-local first folder (Finding 4).
- `ticket-322-doc-sync.md`: the rows "The feature checklist's current verification…" and "Cross regression…" marked
  Done, and the re-check sentence "No item marked done rests on a basis that no longer holds", rest on the statements
  above; they reopen until those are corrected, and the sync items these findings add belong in that checklist.

Not affected: the decisions record (its "e2e shape" row matches E5 as written), the code review record (code-read
claims; "27 of 27" holds), the specs' Testing Decisions (their fixture lists are met).

### Findings

1. **The Test design table does not describe the tests as written.** Class: record not true (item 1). V1 plans an
   unknown side (`gemini`) refused with an enum failure, while the written case refuses a snapshot missing
   `sides.antigravity`; A6 lists `.db-wal`/`.db-shm` inputs the case does not have (C3 drives that exclusion); E5 plans
   each side option, while the case measures options 1 and 4; the case "a conversation moves its trusted folder to its
   database's time and counts once" and the changed existing tests (`trend.test.ts`, `usage.test.ts`,
   `check-shared-ui.test.mjs`'s plants, the 14 `ScanRoots` helpers) have no row. Handling: amend the rows (or the
   tests) and re-review the changed rows under the Design review's increment rule.
2. **E1's side-filter step passes with the filter doing nothing.** Class: evidence not true (false green relative to
   its claim). All three projects of `mkAntigravityHome` are registered on Antigravity and the stale one is hidden by
   default (`ProjectsPane.tsx:64`, `:69–71`), so the unfiltered list is already `['ag-only', 'ag-and-claude']`, the
   asserted result. The step does go red on a wrong option label, dot or value (the trigger's text, an empty list), so
   no side-specific regression of the generic predicate escapes it; what it does not support is the claim. Handling:
   restate the table's E1 "narrows to 2 rows" and the checklist's "the filter narrows to its folders" to what the step
   proves, or add a live project not registered on Antigravity to the home if the narrowing is to be claimed.
3. **projects-list::REQ-001/AC-04's "later of" is driven in one direction only.** Class: regression that would be
   missed. Only A1 asserts a time with a log present, and its log is the newer; C2, C3 and E1 do not assert a time with
   one. `mtimeMs: wal ? wal.mtimeMs : dbMtime` would pass every case, though agy reaches the other state (a passive
   checkpoint writes the database and leaves the log untouched until its next write). Handling: a case with a log
   older than its database expecting the database's time.
4. **Two attribution boundaries the specs now state are not driven.** Class: regression that would be missed, and
   evidence not true (`final-regression.md`). "A first folder that is not a local `file:` URI credits no project"
   (token-stats failure modes; projects-list::REQ-001's boundary): no case passes a non-local first folder through
   `firstFolder` or the scan — P8 drives `folderPath` alone and the encoder's `rawUris` option is used by no test — so
   the decisions record's rejected alternative "skip to the next folder listed" passes every case. "A nesting depth of
   zero is no subagent marker": no case encodes `nestingDepth: 0`, so the rejected alternative "any encoded depth" passes
   too. Handling: a scan or walk case with `rawUris` [a non-file URI, a trusted local folder] crediting nothing, and a
   proto case with `nestingDepth: 0` reading as a main conversation.
5. **The conversation memo's spec-stated behaviours are not driven beyond M1's miss.** Class: regression that would be
   missed. The token-stats failure modes now state that a conversation unchanged since its last successful read is not
   read again, and that a failed read is retried at the next scan. Removing the memo fails no case, nor does keeping
   failed reads in it — the change the code review's refactoring list hands to #323. Both are observable at the walk
   seam: a conversation with a log is read through a copy under the injected `tmpParent`, so a walk with an unusable
   parent (a path that does not exist) can read nothing anew. Handling: walk with a valid parent, then an unusable one
   → still attributed (not re-read); walk with an unusable parent, then a valid one → attributed (retried).
6. **`antigravity.test.ts`'s header leaves out two read boundaries the spec now states.** Class: dimension 1 gap note
   missing, and in part a regression that would be missed. The log-before-database copy order (agy exiting between
   the two copies) is unobservable after a read and is not named as a gap. A read killed mid-way "leaves its copy in a
   temporary directory only the user can read" has no case and no gap note, though its permission is drivable:
   `readConversationDb(file, read, tmpParent)` runs `read` while the copy exists, so the callback can stat the copy's
   directory under the injected parent (mode `0o700`); a predictable `mkdirSync` directory (0755 under the usual umask)
   would leave a killed read's conversation readable by other users and pass every case. Handling: drive the
   permission; name the kill and the between-copies window in the header with what would close them.

### Handling of the findings (main agent, 2026-10-29)

Read in full from this section's Findings; the hand-back listed the same six numbers and titles.

| Finding | Handling |
|---|---|
| 1 | Test design table rows V1, A6, E5 rewritten to the tests as written; rows A0 and X1 added (the base activity case; the existing tests the side Record changed). Re-reviewed under "Increment after the post-implementation check" in the Design review section |
| 2 | E1's home gains a live folder only Claude registered: the list holds three live rows before the filter and the two Antigravity registered after it (the step now asserts both). The checklist's AC-01 evidence restated to that |
| 3 | New case "while agy writes, the time is the database's when it is later than the log's …" (row A1b) |
| 4 | New cases "a first folder that is not a local file credits no project, not even a trusted folder listed after it" (A8) and "a nesting depth of zero is no subagent marker" (P10); the regression report's projects-list row corrected |
| 5 | New cases "an unchanged conversation is not read again" (W1) and "a read that failed is tried again at the next walk" (W2), at the walk seam through the temporary parent |
| 6 | New case "the copy's directory is the user's alone while the read runs…" (C4); the test file header names the window between the log's copy and the database's, and the killed read, with what would close them |

Self-check before hand-over (items 2–5; items 6 and 7 below):

- Item 2, each new or changed assertion: expected values are literals (mtimes the test sets, mode `0700`, folder paths,
  `[0, false]`, row names). Each was made to fail once by a reversible mutation of the code it guards, every file
  restored byte for byte by the runner, the failure landing on the intended case: log time whenever a log exists → A1b
  red; skip to the next local folder → A8 red; an encoded zero depth read as a marker → P10 red; no memo → W1 red;
  failures remembered → W2 red; the copy directory chmod 0755 → C4 red; the side filter made to keep every row
  (`pnpm build`, then E1 alone) → E1 red at the narrowed list ("resolved to 3 elements"). This is not the project's
  mutation testing (the capability is not enabled); it answers "when does it go red" for the new assertions.
- Item 3, functions the fixes changed: none in product code — the fixes touch tests, the e2e fixture home and records
  only.
- Item 4, data the new tests use: the remote first folder (A8) and the zero depth (P10) are derived shapes, said so in
  their rows; the rest is the schema and the encoder pinned to a real record (P9).
- Item 5, shared test helpers changed: none (`agy-fixture.ts` unchanged; `mkAntigravityHome` serves E1 alone,
  `rg -n "mkAntigravityHome" e2e src` → its definition and E1's call only).
- Item 6, evidence: the mutation runs' commands and outputs are kept with the session's working files; the targeted
  verification after the fixes is logged in [ticket-322-gate-fix1.log](ticket-322-gate-fix1.log).
- Item 7, records: this table and the Design review increment, the checklist's current verification (AC-01, AC-04,
  REQ-003/AC-07, AC-08, CON-002 evidence), the regression report's two Stage 1 rows — corrected in the same fix.

Self-check findings: none.

### Round 2 — incremental check

Date 2026-10-29 · fix range `1526670..7bff1f7` (one commit, `7bff1f7`; product code unchanged since `1526670`) · run
evidence: the targeted verification log [ticket-322-gate-fix1.log](ticket-322-gate-fix1.log) · everything outside the
objects below carries round 1's conclusions (this section, above).

Objects, with the searches that found them:

- `git diff --name-only 1526670..7bff1f7` → `e2e/app.spec.ts`, `src/main/providers/agy-proto.test.ts`,
  `src/main/providers/antigravity.test.ts`. No shared helper module changed (`agy-fixture.ts` untouched).
- Helpers changed inside those files, and the tests that use them: `grep -rn "mkAntigravityHome" e2e src` → its
  definition (`app.spec.ts:706`) and E1's call (`:737`) only; `busy`, `usable`, `unusable` are local to the new
  `describe` of `antigravity.test.ts` — `grep -n -E "busy\(\)|usable\(\)|unusable\(\)"` → W1 and W2 only (lines
  392–400). `grep -rln "agy-fixture" e2e src scripts` → the three changed files and the module itself; the module did
  not change, so no other test enters.
- Tests: P10, A1b, A8, C4, W1, W2 (new), E1 (changed), and `antigravity.test.ts`'s header (gap notes).
- Test design table rows changed in the Design review's increment: V1, A6, E5 (rewritten), A0, X1 (added), A1b, A8,
  P10, W1, W2, C4 (added), E1 (changed).

#### Run evidence

The fix log, read in full: `git rev-parse HEAD` = `7bff1f7ae8d8d14adc64340802de60653df48b90`, the end of the fix range;
the version list names the 15 modified documents with their hashes, each equal to its current hash (compared file by
file); every command has its exit code and whole output — typecheck and lint 0; `pnpm vitest run` on the two changed
unit files 0 (33 passed: `agy-proto.test.ts` 10, `antigravity.test.ts` 23); `pnpm build && npx playwright test
e2e/app.spec.ts` 0 (88 passed, E1 at `app.spec.ts:736`); `change-scope.mjs --base 1526670` 1 (`verdict: run`, a skip
judgment, not a test). No required item is missing. The build's renderer bundle (`index-CZijWfnx.js`) is the pre-review
run's, so E1 ran on restored source, not on the self-check's mutated build. Nothing re-run by this check;
`mutation-testing` is not enabled (`enabled = false`), so mutation testing is skipped.

#### Item 1 — the tests as written against the changed rows

| Row | Matches? |
|---|---|
| V1, A6, E5, A0, X1 | Yes — now the tests as written (E5's "recorded by both sides": the ghost is on Claude's registry in `mkThreeSideHome` and on agy's ledger in the case) |
| P10, A1b, A8, W1, W2 | Yes — seam, input, assertion, literal expected values and fixture as listed |
| C4 | Yes; it also asserts the stat'd directory sits under the injected parent (`db.location()`'s directory), the control that the read went through the copy |
| E1 | Yes — three live rows (`ag-only`, `ag-and-claude`, `claude-only`) asserted before the filter, the two Antigravity rows after it |

#### Dimension 1 — Coverage

The header now names four gaps, the two added being agy exiting between the log's copy and the database's (closed the
same way, an injectable step) and a read killed half-way (the kill outside the seam; the directory's permission
asserted by C4). Every sentence round 1 found uncovered now has a case or a named gap: the later of the two times both
ways (A1, A1b); a non-local first folder (A8); a zero depth (P10); not read again and retried (W1, W2); the between-copies
window and the killed read (header; C4). No finding.

#### Dimension 2 — Case design

W1 and W2 drive the memo through the walk's own `tmpParent` parameter; C4 reads the copy through the callback
`readConversationDb` hands out and `node:sqlite`'s public `location()`; A1b's database newer than its log is what a
running agy's checkpoint leaves. No internal state is read or written. No finding.

#### Dimension 3 — False greens

| Test | Goes red when |
|---|---|
| P10 | an encoded zero depth is read as a marker. The asserted depth 0 is also the absent default, so what makes field 17 present is the encoder (`agy-fixture.ts:133` writes it for any defined depth), not the assertion |
| A1b | the log's time is taken whenever a log exists |
| A8 | `firstFolder` skips to a later local folder. The record decodes (the encoder writes a valid wire form from `rawUris`; `new URL` parses the remote URI), so the no-credit outcome comes from the rule, not from an unreadable record |
| C4 | the copy's directory is not owner-only, is not under the injected parent, or the read is made in place |
| W1 | the memo is gone (the second walk cannot copy). Its premise — an unusable parent makes a fresh read fail — is asserted by W2's first walk (`[null]`) |
| W2 | a failed read is remembered |
| E1 (filter step) | the filter keeps a row it should remove |

The self-check's mutation runs agree: their output, `muts2.out` in the session scratch directory (01:28:06), has one
`KILLED` line for each case above. That directory is temporary; this check's answers rest on the reading above, not on
it. No finding.

#### Dimension 4 — Resource reuse

From the fix log: one `electron-vite build` (lines 76–101) before the 88 cases; E1 one launch (985 ms; one `launch` call
in the code); `antigravity.test.ts` 23 cases in 149 ms and `agy-proto.test.ts` 10 in 4 ms, so no new expensive
resource. W1 and W2 set and read the memo within one case each, on their own `mkdtemp` paths, so the order other cases
are collected in cannot reach it. No finding.

#### Round 1's findings

| Finding | Checked |
|---|---|
| 1 | Resolved: V1, A6, E5 rewritten; A0, X1 added (item 1 above) |
| 2 | Resolved: E1's home has a live Claude-only folder; the narrowing can fail; the checklist's AC-01 evidence restated ("the filter takes three live rows to the two the side registered") |
| 3 | Resolved: A1b |
| 4 | Resolved: A8, P10; the regression report's projects-list row corrected |
| 5 | Resolved: W1, W2 |
| 6 | Resolved: the header's two added gaps and C4 |

#### Document sync

Changed facts: seven cases added or changed at `7bff1f7`, passing in the fix log. Scope: `docs/.workings/antigravity-side/`
enumerated again with ignored files included; read: this record (in full), the fix log (in full),
`ticket-322-doc-sync.md` (in full), `checklist.md`'s "Current verification" rows (lines 150–165), and the #322 section
of `final-regression.md` (its scope line and Stage 1). The specs, features, CONTEXT.md and ADR-0037 are outside the
change (tests only). The checklist's AC-01, AC-04, CON-002, REQ-003/AC-07 and AC-08 evidence and the regression
report's two Stage 1 rows now cite the new cases truly; the version they are stated against does not — Finding 7.

#### Findings

7. **The checklist's current verification names implementation `853f440` for evidence obtained at `7bff1f7`.** Class:
   record not true (the version a conclusion applies to). Every row of `checklist.md`'s "Current verification" is
   headed "2026-10-29; spec cbe22ca; implementation 853f440 (#322's branch)", while the rows now cite cases that exist
   only from `7bff1f7` (A1b, A8, P10, C4, W1, W2, E1's narrowing), passed in the fix log at `7bff1f7`, and the product
   code they verify is `1526670`'s, which differs from `853f440` (the `COPYFILE_FICLONE` flag removed) — a mismatch
   round 1 should already have caught. The same statement recurs in `ticket-322-doc-sync.md` ("one row per unit and
   path, with the implementation commit") and in the regression report's #322 scope line ("implementation `853f440`,
   `1526670`"), whose Stage 1 rows now rest on the `7bff1f7` cases. Handling: state the commit the evidence was
   obtained at (`7bff1f7`; product code as of `1526670`) in those rows and that line.

#### Handling of finding 7 (main agent, 2026-10-29)

The checklist's current-verification rows now read "evidence at 7bff1f7 (#322's branch; product code as of 1526670)";
the sync checklist's row and the regression report's scope line say the same. Records only: no test, test data or
product code changed, so no further incremental check (`change-scope.mjs` would judge these files inert). Self-check:
items 1–6 not applicable (nothing but records changed); item 7, the three records corrected in this fix.
