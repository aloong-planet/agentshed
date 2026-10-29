# Code review — #322 Antigravity side: registry, project list and activity

Ticket: [#322](https://github.com/aloong-planet/agentshed/issues/322) · feature checklist: [checklist.md](checklist.md)

Date 2026-10-29 · implementation reviewed: `853f440` (branch `feat/antigravity-registry`, from `cbe22ca`), the
fixes below on top of it · scope: every file the ticket's change touches — the Antigravity reader
(`src/main/providers/antigravity.ts`, `agy-proto.ts`, `sqlite.ts`), its wiring into the scan and the scan roots, the
side set's per-side Records (`domain.ts`, `validate.ts`, `usage.ts`, `trend.ts`, `session-resume.ts`, `global.ts`,
`types.ts`), the display-cache upgrade (`display-data.ts`), the archive-restore and bench scripts, the renderer's side
records, theme tokens and side card, and the tests and fixture helper.

## UI gate (step 4, item 0)

Every user-visible point of this change has a prototype the owner confirmed on 2026-10-28 (the checklist's prototype
gate row): the ANTIGRAVITY side card, chip and Google-blue badge pair (agents page, shared `theme.css` `--ag-bg` /
`--ag-fg`); the side named in the project list's dropdown and hover layer with its dot (`_shared/project-side.js` /
`.css`, `.dot.antigravity` on `--p-google`); the project header's ANTIGRAVITY chip (project detail); the stale note's
chips (stale note, CC+CX+GK+AG option); the fourth badge slot in the Skills list and the fourth side card in the
startup skeleton (agents page). The Memory section's "nothing for the side" and the D4 empty state reuse existing
forms. `/ui-design` was loaded before the renderer was touched. New class names checked for occupancy before use:
`rg -n "[.-]ag\b" src/renderer/src/theme.css site/src` and `rg -n "\.antigravity\b|--ag-" src/renderer site/src` —
no hit, with the control `rg -n "\.gk\b|\.grok\b" src/renderer --glob '*.css'` hitting `.badge.gk` and `.dot.grok`.
Theme variables measured with `theme-vars.mjs` over 6 states (3 themes × 2 appearances): `--ag-bg` and `--ag-fg` vary
with the appearance only, every variable resolves in every state, and the appearance-varying class now holds 30.
Rendered evidence: window screenshots of the agents page, the list's hover layer and dropdown, the project header and
the stale note in light and dark (session scratch, 2026-10-29), and the computed colours read by the e2e case "the
Antigravity badge takes its own pair in light and in dark, the same under every theme".

## Underlying premises

Findings (all in comments this change wrote; each re-measured, then corrected):

1. The reader's header said the log is copied first "so that agy merging it into the database between the two copies
   leaves a database copy that already holds everything". True for agy **exiting** (its last connection checkpoints
   and then deletes the log — SQLite's documented close behaviour, and agy's measured one), not for a checkpoint agy
   runs while it keeps writing, which can still split the pair. Rewritten to state both; the second is marked as
   allowed by the mechanism, not observed.
2. "Only a writable connection can rebuild the log's index" — measured false: a read-only open of a copied database
   and log without `-shm` read the log-only row (node:sqlite, 2026-10-29). The copy is still opened read-write (it is
   ours); the comment now says only what was measured.
3. `COPYFILE_FICLONE` with "a clone …: no data is copied, and the snapshot is atomic" — measured false here: a
   400 MB copy took 767 ms with the flag and 698 ms without under Node, 377 ms and 436 ms under Electron, so no clone
   is made through Node on this machine. The flag and the claim are removed; the full-copy cost is now a stated
   boundary in the token-stats spec (see Consistency).
4. "Groups are … absent from agy's descriptors" — false: one group field exists among the 375 descriptors
   (ThrowableBlockProto). None of the 196 messages reachable from CortexTrajectoryMetadata declares one (descriptor
   walk, 2026-10-29); the comment now says that.
5. "Exact up to 2^53, which every field read here stays far below" — a negative int32 nesting depth is a ten-byte
   varint. The comment now says the one varint read is judged only as zero or not, which precision cannot change.

Re-checked and holding: the immutable open creates nothing (measured: no `-shm`/`-wal` appear, while a plain read-only
open leaves both); the settings shape `{permissions, trustedWorkspaces}` and the trusted entries as absolute paths
(this machine's file); both folder fields carrying one folder, subagents carrying all three markers and main
conversations none (19 of 19 real records, by the descriptor-based decoder and by this reader — identical); the
database size unchanged by a checkpoint (research §10.5.6); subagent databases at the top of `conversations/`
(research §10.4). After the fixes Security and Consistency were scanned again.

## Runnability

- `node:sqlite` under Electron 43 (Node 24.18) and Vitest (Node 24.19): loaded with `process.getBuiltinModule`. The
  first form, a static import, failed under Vitest (Vite 5 resolved it as a package named `sqlite`); the second,
  `createRequire(import.meta.url)`, broke `pnpm bench:scan` and `pnpm restore:archive`, whose bundles are CommonJS —
  found by running both scripts, fixed, and both now run (`restore:archive` prints the four sides; `bench:scan` over a
  fixture home of the 19 real conversations: `antigravity=19` in 7 ms under Electron).
- `new DatabaseSync(URL)` with `?immutable=1` reads a path holding a space, `#` and `?` (measured; `pathToFileURL`
  percent-encodes them, so no file name can add a URI parameter).
- Error paths, by escape surface: a conversation that will not open, has no record, or whose record will not decode →
  that conversation contributes nothing (self only); a failed copy, `mkdtemp` or removal → the same (self only); a
  conversation deleted between the listing and its stat → skipped (self only); a corrupt settings file or a ledger
  that is not a list → this side's error, the other sides untouched (the A3 rule); an entry that is not a path →
  that entry only. No path escapes sideways or upward.
- The memo keeps only successful reads, keyed by the database's mtime and the log's presence, mtime and size, and
  only for the conversations the last walk saw.

Findings: the five above (fixed). No bug found in behaviour.

## Security

- No new IPC channel and no path from the renderer into the reader. The reader writes only under a `mkdtemp`
  directory (owner-only) of the system temporary directory and removes it in a `finally`.
- `globalSkillsRoots` now names `~/.gemini/antigravity-cli/skills` for the side, so the skill-file reader's container
  check admits that directory for a request naming the side. It is agy's own skills library (skills-view::REQ-001/
  AC-01 lists it), read-only; no surface of this ticket sends such a request. Recorded as a decision.
- Install and uninstall accept the side (the guard reads `AGENT_SIDES`); `PROJECT_SKILLS_DIR` sends it to
  `.agents/skills`, the shared directory skill-install::REQ-001 makes the one target. No surface of this ticket offers
  it (no global skill carries the side yet).

No finding.

## Consistency

- Invariants: the agent-side set now has a fourth member everywhere typecheck reaches; the hand-written side lists
  typecheck could not see (`AGENT_SIDES`, the display data's skill-files check, the archive-restore script) now read
  one Record total over AgentSide. Class-level check — every non-test site naming `grok` enumerated with `rg -n
  "'grok'|\"grok\"|grok:|\bgrok\b" src scripts`: the side lists all include the new side; what remains are the
  per-side parsers and the Grok-specific borrow hint, owned by later tickets (session ID from path #324, skills merge
  #325, trend modes #323) or not side lists at all.
- The display cache: a payload saved before the side would have failed the contract and been dropped (CONTEXT's
  page-switch invariant); filled in on restore now (measured over a copy of this machine's cache: snapshot, 515 of
  515 statistics and 68 of 68 pages kept; without the fill-in, 0, 0 and 41).
- Smell baseline over the new code: names fit; no duplicated logic beyond the registry readers' shared shape, which
  mirrors Grok's on purpose; `readConversationDb` is generic for one caller today, kept because the ticket lays it
  for #323's and #324's reads; `tmpParent` is the test seam; no other finding.
- Documents this change makes untrue: CONTEXT's text-case invariant names the CLAUDE CODE / CODEX / GROK chips and
  the theme-variable count (28) — both updated in this PR; the copy cost while agy writes and a copy left by a killed
  read — written into the token-stats spec's failure modes.

## Refactoring list (not executed)

| Item | Reason | Escape surface | Suggested handling |
|---|---|---|---|
| A conversation that cannot be read is read again at every scan (the memo keeps successes only) | Cost of a failed open per scan | Self only (time) | Do not do here: #323 gives unreadable conversations their cache entry and count (token-stats::REQ-004) |
| `pnpm bench:scan` and `pnpm restore:archive` bundle the scan as CommonJS and run in no gate: this change's first SQLite loader (`createRequire(import.meta.url)`) broke both, and only running them by hand found it | A module-level construct valid in the ESM app and tests can break the scripts silently | None at run time (developer scripts); a broken restore would be found when it is needed most | Another task: run each script's usage path (`restore:archive` exits 2 with its usage; `bench:scan` over an empty fixture home) in `pnpm test:scripts`. No durable home yet — needs the owner's decision |
| Pre-existing: the agents page's comment on `notDetectedHint` still speaks of passing a button label, and the cold-start e2e case's title says "both summary cards" | Stale comment and title, not this change's | None (text) | Do not do: outside the change; recorded only |

## Conclusion

No behavioural bug. Five comment claims this change wrote were not what measurement shows; all five were corrected,
one with a code change (the clone flag removed). Verification after the fixes: `pnpm typecheck` exit 0; ESLint over
the touched directories exit 0; the Antigravity provider suites 27 of 27.

## Spec final check (before step 7; code read only)

Against the specs at `cbe22ca`, unit by unit for this ticket's paths (evidence per unit in the checklist's current
verification):

| Unit (spec text) | Implementation | Conclusion |
|---|---|---|
| projects-list::REQ-001/AC-01 "The side's registry is `trustedWorkspaces` in agy's settings file … union, merge, count and staleness rules (A4–A6, A8, A9) apply unchanged" | `readAntigravityRegistry` feeds the same `add()` union as the other sides | Met |
| projects-list::REQ-001/AC-02 "A folder agy has run in only headless, never trusted, is not a project … does not raise an entry's count" | Sessions never create entries; only registered entries are enriched | Met (the global token count is #323's) |
| projects-list::REQ-001/AC-03 "agy's own project records … are never read as registrations" | Nothing under `~/.gemini/config` or `cache/` is read | Met |
| projects-list::REQ-001/AC-04 "attributed … by token-stats::REQ-003/AC-08, and a subagent conversation neither counts nor moves the time … the later of the conversation database's and its write-ahead log's modification times" | `firstFolder`, `isSubagent`, `max(db, wal)` mtimes | Met |
| projects-list::REQ-001/AC-05 "root missing → not detected; … no trusted folder → detected with no projects; … settings file corrupt → this side degrades with an error explanation" | Registry reader's four outcomes | Met |
| token-stats::CON-001 "read only from agy's own data root … never read … a `.db` file directly in the conversations directory" (this ticket: discovery and settings) | Only `antigravityHome`; non-recursive listing of `.db` files | Met for this path |
| token-stats::CON-002 "creates, changes or deletes no file there … no log: in place, immutable; a log: copied together with its log … read there, and the copy is removed" (this ticket: the metadata reads) | `readConversationDb` | Met for this path |
| token-stats::REQ-003/AC-07 "names a parent conversation, or carries a nesting depth or a subagent spec … never recognised by where its file sits, nor by its trajectory source" | `isSubagent` on the record alone; depth 0 read as no marker (written back) | Met for this path |
| token-stats::REQ-003/AC-08 "credited to the project of the first folder its trajectory metadata lists … a folder that is not registered contributes to the global figures only" | `firstFolder`; field 1.1 fallback (written back) | Met for this path; the Pending note stays |
| token-stats::REQ-003/AC-09 "contributes nothing and is not unreadable" (this ticket: no activity error) | An empty conversation reads like any other; no side error | Met for this path |
| agents-overview::CON-004 "called Antigravity … AG … ANTIGRAVITY … Google provider colour … #dde7fb / #3563b5 … #1f2e49 / #96b9f3" | `side-badge.ts`, the project list's names, `theme.css` | Met |
| agents-overview::REQ-003/AC-01 "detected when agy's data root exists … project count" (this ticket's part) | The side card from `SIDE_ORDER` | Met for this path |
| agents-overview::REQ-003/AC-03 "the Memory section shows nothing for it" | The memory summary reads Claude and Codex only | Met |
| project-detail::REQ-002/AC-01 "The header's side chips include ANTIGRAVITY … the stale note's chips follow by construction" | Header and stale note map `SIDE_ORDER` | Met |
| project-detail::REQ-002/AC-04 "a project registered only on Antigravity gets the memory-view D4 empty state" (this ticket's part) | `hasClaudeSide` false → D4 copy | Met for this path |

Scope beyond these units, each traced: the resume command's agy form (session-view::US-001/AC-04's text; forced by the
side Record, unreachable until #324), the side's global skills root and project skills directory (skills-view::REQ-001/
AC-01's first directory and the shared directory of skill-install::REQ-001; unreachable from this ticket's surfaces),
the display cache's fill-in (this ticket's technical prerequisite and CONTEXT's page-switch invariant). No code
contradicts a spec statement; the boundaries the implementation settled are written back (see the document sync
checklist).

## Self-check of the test review's fixes (item 1)

Not applicable: the fixes for the post-implementation check's six findings change no product code — tests, the e2e
fixture home and the records only.
