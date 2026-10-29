# Code review — #323 Antigravity usage in the statistics

Ticket: [#323](https://github.com/aloong-planet/agentshed/issues/323) · feature checklist: [checklist.md](checklist.md)

Date 2026-10-29 · implementation reviewed: the working tree over `a474875` (branch `feat/antigravity-usage`, stacked on
#322's `feat/antigravity-registry`), the fixes below applied before it was committed as `fc5d0b1` · scope: every file
the change touches — the usage records reader (`agy-proto.ts`), the conversation reader (`antigravity.ts`: format
check, signature, walk, usage read), the token engine (`token-stats.ts`: the side's variant, plan, combine, cache
version), the snapshot's per-side count (`domain.ts`, `validate.ts`, `display-shape.ts`, `index.ts`), the trend mode
(`trend.ts`), the side card (`AgentsPane.tsx`, `theme.css`, both dictionaries), the fixture helper and the tests.

## UI gate (step 4, item 0)

Every user-visible point of this change is drawn in a prototype the owner confirmed on 2026-10-28: the side card's
figure following the selected window and its third line turning into the warning-coloured count of unreadable
conversations with the reason on hover (agents page, `prototype-agents.html` — the `.stat .s.side-warn` rule and the
"Antigravity unreadable" demo switch, copy `unreadableConvs` / `unreadableTip` in both languages); the trend chart's side
switch gaining Antigravity and the model rows naming agy's models as recorded (agents page and project detail,
`prototype-detail.html`); the project Overview's per-side row (project detail). `/ui-design` was loaded before the
renderer was touched. No icon, no new colour variable (the line reuses `--warn-fg`). The new class name was checked for
occupancy on the base: `git grep -n "side-warn" a474875 -- src site/src` — no hit, exit 1, with the control
`git grep -c "stat-err" a474875 -- src/renderer` hitting `AgentsPane.tsx` and `theme.css`. Rendered evidence: window
screenshots of the agents page in light and dark and of a project Overview in Antigravity mode and combined mode (built
app over a fixture home, session scratch `shots/`, 2026-10-29); computed colour of the line `rgb(179, 85, 47)` in light
(read by the e2e case "Antigravity usage: …") and `rgb(240, 168, 132)` in dark (the screenshot run) — the two
`--warn-fg` values of `theme.css`. Out-of-scope character icons: none met in the surfaces touched (the side card, the
trend heading, the model rows), enumerated by their icon slots: none of the three carries an icon slot.

## Underlying premises

Findings, each handled:

1. **The conversation's own id was taken from its file's name.** True on all 19 measured databases, but a convention,
   not a record: a renamed file would make every step look copied — every call of the conversation would vanish with
   nothing counted and nothing shown, the silent drop ADR-0037 rejected for this side. The database records its own id
   in the trajectory table's `cascade_id` (one row in each of the 19, equal to the name). Changed: the own id is that
   column; the column joins the format check, and a trajectory table with no row is unreadable. Case added: a
   conversation whose database is renamed still counts its own call; two more unreadable shapes. Written back to
   token-stats::CON-001 (the columns read).
2. **"A scan never materialises them"** (token-stats failure modes, on the prompt fields). The reader never decodes the
   prompt, but the runtime's SQLite module returns a blob whole, so one record's bytes are in memory while it is read.
   Measured (Node 24.19, 30 rows of 20 MB): iterating the rows peaks at 132 MB RSS against 713 MB for reading them all
   at once — rows are held one at a time. The comment says "never decoded … one row at a time"; the spec sentence is
   rewritten to the measured behaviour.
3. **"Higher than agy's own total by exactly the cache reads"** (token-stats::REQ-003/AC-03, ADR-0037). Holds only
   where a call reports no cache writes — every measured call; a call reporting writes (a Claude model through agy, the
   spec's own failure mode) exceeds agy's figure by the writes too. Found by the case written for it; the case now
   holds both; written back to the spec and noted on the ADR.
4. **"No content from agy's files is rendered"** (token-stats failure modes, G14). Model names are agy's strings, shown
   as text in the existing model rows like every side's model names — no new rendering point. The sentence is
   corrected in the spec.

Re-checked and holding: the triple record (step usage, the generator record naming that step with the same usage, and
that record's retry entry 0 equal to it) on all 51 steps carrying usage across the 19 databases, fork copies included;
failed calls carry no token counts (5 generator records with an error, their 6 retry entries, none with a count); in the fork `8c07e920` the 19 copied steps name the parent in their
source and its 4 own steps its own id (23 of 23); every generator record names its maker in
`custom_metadata.cascade_id` (56 of 56; the fork's eight copies name the parent); no group field reachable from the
step or generator record (descriptor walk: 27 and 249 messages). The reader over copies of all 19 conversations gives
43 calls and input 374,366 / output 8,360 / cache read 37,943 / cache write 0 — identical to the descriptor-based
decoder's figures over the same copies, deduplicated by identity. Security and Consistency were scanned again after
the fixes.

## Runnability

Findings:

1. **A corrupt cache entry was dereferenced before its shape was checked** — `cached.agg.kind` read before
   `isWellFormedAgg` in the new Antigravity plan and the new session-page guard. Within one cache version only the
   shape guard stands between a corrupt entry and the aggregation; a `null` record (or a `null` entry) threw a
   TypeError, failing the whole scan every time (upper escape) or the session page. **Class-level** ("a cached entry
   read before the shape guard"): every dereference of an entry read from `this.cache.files` in `token-stats.ts` was
   enumerated (`rowsFromCacheFile`, `plan`, `antigravityPlan`, `codexPlan`, `isFresh`, `sessionQuestions`,
   `codexShown`) — `rowsFromCacheFile`, `plan`, `isFresh` and the top of `sessionQuestions` guard first; `codexPlan`
   (the resume check) and `codexShown` (the fork-parent lookup) are existing code with the same defect. All four now
   run the guard first, over `cached?.agg`. Three cases written first and run against the unfixed code: red with
   `TypeError: Cannot read properties of null (reading 'kind')` at `antigravityPlan`, `codexPlan` and `codexShown`, and
   for a null entry `(reading 'agg')` at the same three; green after the fix. Restored byte for byte after the check
   (`cmp` against a copy).
2. Entry and exit paths of a conversation's state, walked against the implementation: never read → read (cached by
   signature); read → changed (read whole again); read → unreadable (cached as unreadable, counted on every scan,
   re-read when its signature moves); read → failing while agy writes (last readable entry kept under its old
   signature, so the next scan reads again); unreadable → failing while agy writes (the unreadable entry is not kept —
   not counted while the log is there, counted again once a read succeeds); never read → failing while agy writes
   (nothing, not counted); deleted after the walk listed it, before its read is planned (no signature: left out of
   that scan); deleted while its read is under way (`failed`, last entry kept for that one scan, gone at the next walk —
   self-harm, one scan). Each has a case; the unreadable-while-written path and the two deletion windows got theirs
   from the post-implementation check (F3, F4 in the test review record; updated 2026-10-29). The walk's own deletion
   window, between its signature and its read, has no seam and is a header gap in `antigravity.test.ts`.

Fault escape surface of each degradation path: an unreadable conversation, a failed read, a record that will not
decode — self-harm (that conversation only; others still count, U13 drives seven bad databases beside a good one). The
corrupt cache entry was an upper escape — fixed above.

Checked without finding: `node:sqlite`'s `iterate()` exists and is lazy under Node 24.19 (measured above) and runs
under Electron 43 (the e2e case reads the figures, parsed on the worker pool, with no `[parse-pool]` fallback line);
`PRAGMA table_info` of a missing table returns no rows (U13's missing table counted); the immutable open of a
zero-byte file reads as user version 0 (counted, not thrown past).

## Security

No finding. Table names in the format check come from a constant; no path is built from file contents; the copies are
the existing 0700 temporary directories, removed in a `finally`; nothing read is logged. agy's strings reach the
interface only as model names in existing text slots (React text, escaped). The side card's tooltip is dictionary copy.
Real agy data was read only from copies in the session scratch directory; `~/.gemini` was not opened in place.

## Consistency

- `checkFormat` was exported with no user outside its module — the export removed (speculative generality).
- Hand side lists: none added; the trend mode is one more entry in the two total Records (`TREND_MODE_LABEL`,
  `MODE_SIDE`), which typecheck already enumerates.
- `SideInfo.unreadable` is a generic optional field filled by one side: kept — the snapshot's per-side record is where
  a side's notice lives beside its error (ADR-0037 "a structured notice on the Antigravity side"), and its renderer and
  both validators treat it per side.
- The card's third line puts the side's error (A3) before the unreadable count: an error means the side's data is
  empty, which explains the figure more than a count does. Written into agents-overview's failure modes.

Refactor list (none executed; for the owner's decision):

| Item | Reason | Impact | Suggested handling |
|---|---|---|---|
| A changed conversation is opened twice per scan — by the walk for its folder and by the token build for its usage — so one agy is writing is copied twice (400 MB: 0.4–0.7 s each, measured for #322) | Two consumers of one read, a consequence of the walk running before the build (#160's shared walk) | Self-harm: time only, per scan, while agy writes | Not now: stated in the spec's failure modes; worth revisiting if scans with an active large conversation are measured slow |
| Each reader of a cached entry calls `isWellFormedAgg` itself (the seven Runnability 1 enumerates: six through `this.cache.files`, one over a cache file read directly); the four that read a field first were fixed site by site | Runnability 1 is class-level, but its defence is per site: a future reader that reads a field before the guard is caught only by a case its author writes (postmortem 2026-10-29) | Upper escape if it recurs: a corrupt entry fails every scan until the cache file is deleted | Another task: one accessor returning a well-formed entry or nothing, replacing the direct reads; touches the Codex and Claude paths, so outside this ticket's surface |

## Spec final check (before step 7; code read only)

2026-10-29, against the specs as this branch leaves them (`cbe22ca` with the write-backs listed in the document sync
checklist), the product code at `fc5d0b1` (unchanged by `0e8f5b9`, which adds tests), unit by unit for this ticket's
paths; evidence per unit in the checklist's current verification:

| Unit (spec text) | Implementation | Conclusion |
|---|---|---|
| token-stats::CON-001 "Only the supported format is read: user version 1, with the tables and columns usage is read from (the steps' index and metadata, the generator metadata's index and data, the trajectory metadata, and the trajectory table's cascade id …). Any other shape is unreadable" (this ticket: usage reads) | `checkFormat` (user version, `REQUIRED_COLUMNS`) before any record is decoded, in the usage read and the walk | Met for this path |
| token-stats::CON-002 "A read creates, changes or deletes no file there … no log: in place, immutable; a log: copied together with its log … and the copy is removed" (this ticket: usage reads) | `readAntigravityUsage` through `readConversationDb` | Met for this path |
| token-stats::REQ-003/AC-01 "counts once across every database … `response_id`, else its `provider_assigned_message_id`, else its `message_id` … the three count once" | `decodeUsage`'s identity; `conversationCalls` joins the three records within a database; `combine` keeps the first per identity across databases | Met |
| token-stats::REQ-003/AC-02 "only when it carries token counts and an identity different from the call it belongs to … without token counts adds nothing" | `addRetries` (tokens, an identity, not the call's own); `hasTokens` before any call is added | Met |
| token-stats::REQ-003/AC-03 "taken as recorded … The total is the four fields summed … the composition buckets keep G8's meanings" | Rows carry the four fields; total = their sum; nothing subtracted or added | Met (as written back) |
| token-stats::REQ-003/AC-04 "the generator metadata's `response_model` as agy records it, never normalised … without one … enters no model bucket" | The model joined from the generator record, kept verbatim; `''` for none | Met |
| token-stats::REQ-003/AC-05 "its step's completion time, else its creation time, in local time … a generator record with no step — is an undated row" | `completedAt ?? createdAt`; `localDay`; `null` time → undated row | Met |
| token-stats::REQ-003/AC-06 "A step whose source names another conversation, a generator record attached only to such steps, and a generator record attached to no step … whose own record names another conversation … never the fork's … one other than the conversation's own id, as its trajectory table records it" | `copied` per step against `ownConversationIds`; the two generator-record rules | Met (as written back) |
| token-stats::REQ-003/AC-07 "Its usage counts" (this ticket's path; "stays out of the session list" is #324's) | A subagent conversation's calls are read like any other's | Met for this path |
| token-stats::REQ-003/AC-08 "credited to the project of the first folder … A folder that is not registered contributes to the global figures only" (this ticket: usage) | `projectKey` = the merge key of `firstFolder`, registered or not (the Codex and Grok rule); the global figures take every row, and only a registered project's page reads its key's figures | Met for this path; the Pending note stays |
| token-stats::REQ-003/AC-09 "contributes nothing and is not unreadable" (this ticket: usage) | No steps and no records → no calls; a readable format → not unreadable | Met for this path |
| token-stats::REQ-004/AC-01 "will not open, its user version, tables or columns differ, or a usage record will not decode — is left out of every figure and every list, and counted" | The usage read's `unreadable`, counted in `combine`; the walk gives no folder; a wire-type mismatch throws | Met (the session list is #324's) |
| token-stats::REQ-004/AC-02 "reaches the Antigravity side card … a count of zero shows no notice" | `antigravityUnreadable` → `SideInfo.unreadable` only when non-zero → `SideCard` | Met |
| token-stats::REQ-004/AC-03 "A read that fails while a log is beside the database, before or after the read … not counted … keeps its last successful result … read again at the next scan. A conversation never read successfully contributes nothing" | `failedWhileWritten`; `fallback` only for a readable last entry, kept under its old signature; the walk keeps its last folder | Met |
| token-stats::REQ-004/AC-04 "Leaving a conversation out lowers the live figures: past days keep their archived figures (C10)" | Rows feed the archive's merge like every side's | Met |
| projects-list::REQ-001/AC-02 "its tokens count globally (A7)" (this ticket's path) | An untrusted folder's calls enter the global rows under its own key, which no registered project reads | Met (with #322's path, every path of the unit) |
| agents-overview::REQ-003/AC-01 "its figure is the side's usage in the selected window" (this ticket's path) | The card reads the side's figure from the windowed totals like every side's | Met for this path |
| agents-overview::REQ-003/AC-02 "the card's third line reads "N conversations couldn't be read" in the warning colour instead, with a tooltip … the figure above it stays. A count of zero shows the usual third line" | `SideCard`'s third line: the error first, then the count (`.side-warn`, `title`), else the counts | Met |
| project-detail::REQ-002/AC-04 "the Overview's per-side row, trend side switch and model rows include it" (this ticket's path) | Per-side row and model rows from the rows; `TREND_MODE_LABEL` and `MODE_SIDE` gain the side | Met for this path |

Failure modes the ticket's code settles, traced: the deletion windows (the bullet made exact after the
post-implementation check), the call without identity, the activity walk's format check, the verdict kept until the
files change, the records read one at a time — each stated in the token-stats failure modes and driven by a case or a
measurement. Scope beyond these units, each traced: the shape guard before a cached entry's kind in the Codex resume
check and fork-parent lookup (the spec's existing cache rule, C2 and Implementation Decisions "Cache"); the cache
structure version (ADR-0037's consequence). No code contradicts a spec statement; the boundaries the implementation
settled are written back (see the document sync checklist).

## Self-check before hand-over — fixes of the post-implementation check (2026-10-29)

Item 1 (product code changed by the fix, against the spec text it implements): not applicable — the fix of F1–F7
changes tests (`agy-proto.test.ts`, `antigravity.test.ts`, `e2e/app.spec.ts`), the test file header and records; no
product code, configuration or fixture helper. One spec sentence was made exact (the deletion windows, token-stats
failure modes); the implementation it describes is unchanged and is checked against it in the test review record's
increment (item 3). The incremental check's F8 (the postmortem's account of K4) was fixed in records only: item 1 not
applicable.

## Conclusion

Four premises corrected (one in code, three in the spec and ADR), one class-level runnability defect fixed in all four
of its instances with failing-first cases, no security finding, one consistency cleanup. Ready for the full gate.
