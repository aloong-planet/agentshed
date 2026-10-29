# Test review — #323 Antigravity usage in the statistics

Ticket: [#323](https://github.com/aloong-planet/agentshed/issues/323) · feature checklist: [checklist.md](checklist.md)

## Design review

Date 2026-10-29 · implementation starts from `a474875` (the head of #322's branch `feat/antigravity-registry`; this
ticket is stacked on it) · scope: every test this ticket writes or changes. Specs read: token-stats::CON-001,
token-stats::CON-002, token-stats::REQ-003, token-stats::REQ-004 with the side's failure modes and its "Antigravity
usage" implementation decision; agents-overview::REQ-003/AC-01, agents-overview::REQ-003/AC-02;
project-detail::REQ-002/AC-04; projects-list::REQ-001/AC-02; the regressions G7, G8, C10, C11, C17.

Real samples looked at before the fixtures were designed (read-only: the 19 databases copied into the session scratch
directory with `cp -p`, never opened in place; the listing of `~/.gemini/antigravity-cli/conversations` saved before):
every step metadata record and every generator metadata record of all 19 conversations, decoded through the research
record's descriptor-based decoder (`agydecode.py`, 0 unknown fields) and at wire level (field numbers, wire types,
order, nesting). What they show, and the fixtures follow:

- every model call is a `PLANNER_RESPONSE` step (type 15) whose metadata carries `created_at` (1), `completed_at` (8),
  `model_usage` (9) and `source_trajectory_step_info` (20: trajectory id 1, step index 2, cascade id 4), plus a
  generator record naming that step and the next in a packed `step_indices` (2) and holding, inside `chat_model` (1),
  the same usage (4), a retry list (17) whose first entry repeats it, and `response_model` (19); the step metadata's
  own retry list (28) was empty in every record;
- API-key calls carry `message_id` only (72 of 72), signed-in calls `response_id` with a `bot-<uuid>` `message_id`;
  `provider_assigned_message_id` never appears; `cache_write_tokens` is never non-zero; `cache_read_tokens` appears on
  later calls;
- a failed call (429, 503, timeout; 6 records) is a generator record with an `error` (5), no `step_indices`, a usage
  holding only the model, and retry entries holding an error and a reason but no tokens;
- the fork `8c07e920` holds its parent's steps with the parent's cascade and trajectory ids in field 20, the generator
  records attached to them, and its own steps with its own cascade id; a subagent's steps carry its own id;
- the four conversations opened and left have no steps and no generator records;
- field order: step metadata and usage fields ascend by number; a generator record writes `step_indices` (2), then
  scalar fields, then the `chat_model` oneof (1) last.

### Test design table

Seams: **proto** = `decodeStepMetadata` / `decodeGeneratorMetadata` (the record reader's public functions); **build**
= `TokenEngine.build(roots, [], registered, walkSessions(roots))` over a fixture home (ADR-0002's providers seam, the
composition `index.ts` runs); **scan** = `scan(roots)`; **walk** = `readAntigravitySessions(home, tmpParent)`;
**archive** = **build** followed by `UsageArchive.merge(rows, anchor)` with the stamp injected (the composition
`index.ts` runs); **unit** = the pure function named; **store** = `parseDisplayData`; **e2e** = the built app over an
`AGENTSHED_HOME_OVERRIDE` fixture home.

Fixture shapes: **real bytes** = a record copied from a real 2026-10-28 conversation (the API-key call `Aa3haqKe…` of
`06d3cae9` — step 1 and generator record 0; the signed-in call `bLzhasLy…` of `fc99511b` — step 1 and generator record
0); no personal data (ids only, checked by listing their printable strings). **encoder** = the test helper writing
step metadata, generator records and usage in the measured layout above, tied to the real bytes by P14 (decoding the
encoder's output for the measured values equals decoding the real record). **schema** = #322's seven tables, two
indexes, `user_version = 1`, WAL. **derived** = a shape no sample carries, written from the spec's rule or the protobuf
encoding rules, said so per row.

Expensive resources (≥ 1 s): the e2e build (`electron-vite build`, once per `pnpm e2e`, by the script) and each e2e
app launch (one per case, the suite's rule). Vitest cases build SQLite fixtures in milliseconds — not expensive.

| # | Case | Spec units | Seam | Driving input | Assertion object and expected-value source | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| P11 | the measured API-key step record decodes to its call | REQ-003/AC-01, AC-03, AC-05 (reader); technical prerequisite (fixtures decode to the measured figures) | proto | real bytes of step 1 | created/completed ms, identity `Aa3haqKeCoDNrfcPq8SHyAg`, four fields 6813/109/0/0, source conversation `06d3cae9-…` — literals from the decoded sample (research §10, summary of the 19 databases) | real bytes | none |
| P12 | the measured API-key generator record decodes to its step indices, model and the same call twice | REQ-003/AC-01 (triple record), AC-04 | proto | real bytes of generator record 0 | step indices [1, 2]; response model `gemini-3.6-flash`; usage = P11's call; retry list's first entry = the same call (literals) | real bytes | none |
| P13 | the measured signed-in records: identity is the response id, the model keeps its suffix | REQ-003/AC-01, AC-04 | proto | real bytes of step 1 and generator record 0 of `fc99511b` | identity `bLzhasLyEa_Z1e8P8sCAuAY` (not the `bot-…` message id); 6745/96; model `gemini-3.8-flash-n` (literals) | real bytes | none |
| P14 | the usage encoder writes what the reader reads off the measured records | fixture guarantee for every build/archive/e2e case | unit (helper) | the measured values given to the encoder | decode(encoded) deep-equals decode(real bytes), for both steps and both generator records | real bytes vs encoder | none |
| P15 | a record that will not decode throws: cut short, or a field the reader reads carrying another wire type | REQ-004/AC-01 ("a usage record will not decode") | proto | real bytes cut inside the usage; encoder bytes with field 9 written as a varint | throws (both) | real bytes (cut); derived (wire type) | none |
| P16 | `step_indices` read packed (as agy writes it) and unpacked (the other valid encoding) | REQ-003/AC-05/AC-06 (linking a generator record to its steps) | proto | encoder packed; encoder unpacked | [3, 4] both | real layout (packed); derived (unpacked, the protobuf rule) | none |
| P17 | a generator record carrying a large prompt is read past it | token-stats failure modes (prompt fields skipped by their length prefix) | proto | encoder record with a 1 MB `message_prompts` (chat_model field 2) before the usage | the usage and model still decode (literals) | derived size, real field position | none |
| U1 | the triple record of one call counts once | REQ-003/AC-01, AC-03, AC-04 | build | real-bytes step + generator record in a database named by the measured conversation id | one row; total 6922 = 6813 + 109; model `gemini-3.6-flash` (literals) | real bytes + schema | none |
| U2 | identity order: response id, then provider-assigned id, then message id, across databases | REQ-003/AC-01 | build | three independent conversations pairing calls: same message id / different response ids (2 calls); same provider id / different message ids (1); same response id / different provider ids (1) | side total = the literal sum of the calls that must remain | encoder; provider-assigned id derived (never observed) | none |
| U3 | the signed-in call reads like the API-key one | REQ-003/AC-01, AC-04 | build | real-bytes signed-in step + generator record | total 6841; model `gemini-3.8-flash-n` (literals) | real bytes | none |
| U4 | a fork and its parent: the parent's calls once, the fork's own call once, a generator record with no step copied into the fork once | REQ-003/AC-01 ("one call in a fork and its parent"), AC-06 | build | parent (3 calls, one of them a generator record with no step); fork = copies of the parent's steps (parent's cascade id) and generator records + its own call | side total = parent's 3 + fork's 1 (literal) | measured fork layout (`8c07e920`) via encoder | none |
| U5 | a fork whose parent is gone counts only its own call | REQ-003/AC-06 | build | the fork of U4 alone | total = the fork's own call (literal) — red if either the copied steps or the generator records attached only to them were counted | measured fork layout via encoder | none |
| U6 | retries: a token-less failed attempt adds nothing; an attempt with tokens and its own id is a call; one with the call's id or no id is not | REQ-003/AC-02 | build | (a) the measured failed shape (error, model-only usage, retry with error and reason); (b) a call whose retry list holds the call itself and a 503 attempt with tokens and id `retry-503`; (c) a retry with the call's identity and tokens; (d) a retry with tokens and no identity | (a) no row, not unreadable; total = the call + the 503 attempt only (literal) | (a) measured shape via encoder; (b)–(d) derived from the rule (no sample carries tokens on a failed attempt) | none |
| U7 | the four fields as recorded; thinking inside output; the total above agy's own by the cache reads | REQ-003/AC-03 | build | a call with input 1000, output 300 (thinking 250), cache read 5000, cache write 200 | row fields 1000/300/5000/200; total 6500; total − (input + output) = 5000 (literals) | encoder; a non-zero cache write derived (spec: a Claude model through agy) | none |
| U8 | a call without a model counts toward the total and enters no model bucket | REQ-003/AC-04 | build | a generator record without `response_model`; a step whose call no generator record names | both in the side total; the rows' model `''`; `byModel` without them (literals) | encoder | none |
| U9 | the day: completion, else creation; a generator record with no step is undated | REQ-003/AC-05; G7 | build | a call created 23:59:50 and completed 00:00:10 the next local day; a call with no completion; a generator record with tokens and no step | days `2026-10-28`, `2026-10-27` (built from local date parts, so zone-independent literals); the third row's day `''`, inside the side total | encoder; the undated record derived | none |
| U10 | a subagent conversation's usage counts and is credited to its folder | REQ-003/AC-07 | build | measured subagent trajectory record + one encoded call with the subagent's own cascade id | the call in the side total and in the folder's project figures (literals) | real bytes (trajectory) + encoder | none |
| U11 | credited to the first folder; an untrusted folder counts globally and in no registered project; a non-local first folder credits none | REQ-003/AC-08; projects-list::REQ-001/AC-02 | build + scan | conversations in [trusted A, B], in untrusted U, in a remote first folder | A's figures hold the first; B none; global total holds all three; the scan lists only A and B (literals) | encoder | none |
| U12 | the empty conversation contributes nothing and is not unreadable | REQ-003/AC-09 | build | real empty trajectory record, no steps or generator records | no row; unreadable 0 | real bytes + schema | none |
| U13 | each unreadable shape is left out and counted; the others still count | REQ-004/AC-01; CON-001 (format check on usage reads) | build | user version 2; `steps` without its `metadata` column; no `gen_metadata` table; a generator record cut short; a trajectory record cut short; a zero-byte `.db`; a text file named `.db`; beside one good conversation | unreadable 7; the side total = the good call only (literals) | schema altered per shape; derived (format drift has no sample) | none |
| U14 | a read that fails while a log is beside the database is not counted and keeps the last result; read again next scan; never read → nothing | REQ-004/AC-03 | build ×3 | a conversation held open by a writer: build 1; a second call written (log changes); build 2 through a runner that injects an unusable temporary parent (the copy cannot be made); build 3 with the default runner. A second conversation, never read, failing the same way | build 2: the first call only, unreadable 0; build 3: both calls; the never-read one: nothing, not counted | schema + writer (agy's state while it runs) | none |
| U15 | usage reads write nothing under agy's directories, with and without a log | CON-002 (usage reads) | build | a closed conversation and one held open whose calls live only in its log | the directory's (name, size, mtime) listing before = after; the open one's calls counted (proves the log was read) | schema + writer | none |
| U16 | a conversation whose log changed while the database's size and time did not is read again | technical prerequisite (cache key: never the database's size) | build ×2 | writer adds a call between builds; precondition asserted: database size and mtime unchanged | the second build counts the new call (literal) | schema + writer | none |
| U17 | an unchanged conversation is not parsed again; an unreadable one stays counted from the cache | Implementation Decisions ("not read again") | build ×2 | a counting parse runner | second build: no Antigravity job; unreadable still 1 | schema | none |
| U18 | the field-set fingerprint covers the new variant | technical prerequisite (cache structure version bumped with the shape) | build (changed case in `token-stats.test.ts`) | an Antigravity conversation beside the Claude and Codex files | the persisted entry's keys `calls, file, kind, projectKey, unreadable` (literal list) | encoder | none |
| U19 | the G7/G8 identities hold over every side, the Antigravity side included, with two sides on one day | REQ-003/AC-03 (G8 meanings); G7; Testing Decisions (two sides one day) | build (changed case in `token-stats.test.ts`) | the existing three-side fixture plus an Antigravity conversation with a call on the day a Claude call is on | `reconcile` (independent re-derivation) over `AGENT_SIDES`; the shared day's `bySide` holds both sides apart (literals) | encoder | none |
| U20 | an Antigravity conversation has no session page yet | boundary of this ticket (#324 lists them) | build + `sessionQuestions` | a built Antigravity conversation | rejects with `sessionNotIndexed` | encoder | none |
| W5 | the walk applies the same format check: a conversation in another format gives no folder | REQ-004/AC-01 ("left out of every figure") | walk | user version 2; a missing column; a missing table | cwd null for each; a good one keeps its folder | schema altered | none |
| W6 | a walk read failing while a log is present keeps the last folder, and is read again | REQ-004/AC-03 | walk ×3 | writer-held conversation: walk with a usable parent; log changed; walk with an unusable parent; walk with a usable one | the folder all three times; the third read really happened (a folder change written between walks 2 and 3 shows) | schema + writer | none |
| AR1 | a fork's parent deleted after a scan saw it: the past day keeps the copied calls | REQ-003/AC-06 (C10, C17) | archive | build + merge (anchor two days after the calls); delete the parent; build + merge | live rows lower; the effective rows for that (day, antigravity) keep the earlier total (literal) | measured fork layout via encoder | none |
| AR2 | a conversation turning unreadable under the same stamp: the past day keeps its figure, the count rises | REQ-004/AC-04 (C10) | archive | build + merge; rewrite the database at user version 2; build + merge | live total lower; effective rows keep the earlier total; unreadable 1 (literals) | schema | none |
| AR3 | a rewind deletes a call: the next scan lowers, the past day keeps its figure | token-stats failure modes (rewind) | archive | build + merge; delete the second call's step and generator rows (as agy's rewind does, measured); build + merge | live lower; effective unchanged (literals) | measured rewind behaviour (§10.4.2) | none |
| V2 | the snapshot contract carries the count | REQ-004/AC-02 (contract) | unit (`validateSnapshot`) | `sides.antigravity.unreadable` = 3; = `'3'`; = −1 | ok; type failure at `sides.antigravity.unreadable` ×2 | derived | none |
| DS3 | a saved snapshot with the count restores; a malformed count drops it | ADR-0029 (display copy); REQ-004/AC-02 | store | saved snapshot with `unreadable: 2`; with `unreadable: 'x'` | restored with 2; snapshot null | derived | none |
| T2 | the trend's Antigravity mode counts only that side, as one Google segment | project-detail::REQ-002/AC-04; agents-overview (trend switch, prototype) | unit (`buildTrendBars`) | a day with Claude 100 and Antigravity 40 | Antigravity mode: total 40, one `Google` segment; Claude mode: 100 (literals) | derived | none |
| I1 | the unreadable line's copy in both languages, singular and plural | agents-overview::REQ-003/AC-02 | unit (dictionaries) | n = 1, 2 | `1 conversation couldn’t be read`, `2 conversations couldn’t be read`, and the Chinese line at 1 (literals from the confirmed prototype) | prototype copy | none |
| E10 | the side's usage on the agents page and a project's Overview, the unreadable line, and its return to the usual line | agents-overview::REQ-003/AC-01 (figure), AC-02; token-stats::REQ-004/AC-02; project-detail::REQ-002/AC-04; token-stats::REQ-003 (user path) | e2e | home: folder `both` registered on Claude and trusted by agy; Claude call 1k two days ago; agy calls 3k today, 4k two days ago (with cache reads), 10k twenty days ago, 20k forty-five days ago; one conversation at user version 2 holding 50k; `AGENTSHED_RESCAN_MS` short; then the bad conversation rewritten in the supported format | ANTIGRAVITY card figure per window `37k` / `3k` / `7k` / `17k` (hand sums of the fixture); third line `1 conversation couldn’t be read`, colour `rgb(179, 85, 47)` (the light `--warn-fg`), title = the tooltip copy; Overview of `both`: per-side row CC `1k`, AG `37k`; the shared day's column has an Anthropic and a Google segment; Antigravity mode leaves one Google segment there; model rows include `gemini-3.8-flash-n` and `gemini-3.6-flash`; after the fix the usual line `1 project · 0 global skills · 0 subagents` and no warning line | encoder + schema | one app launch |
| E11 | the e2e archive cases seed rows under the new stamp | regression (C10 e2e); CACHE_VERSION bump | e2e (changed) | `+c17` → `+c18` in the two seeded archives | unchanged expectations | existing | existing launches |

### Dimension 1 — Coverage

Every unit this ticket owns in the checklist has a row: token-stats::CON-001's format check on usage reads (U13, W5),
CON-002's usage reads (U15); REQ-003/AC-01 (P11–P13, U1–U4), AC-02 (U6), AC-03 (U7, U19), AC-04 (P12, P13, U1, U3,
U8), AC-05 (U9), AC-06 (U4, U5, AR1), AC-07 (U10), AC-08 (U11), AC-09 (U12); REQ-004/AC-01 (P15, U13, W5), AC-02 (V2,
DS3, I1, E10), AC-03 (U14, W6), AC-04 (AR2); agents-overview::REQ-003/AC-01 figure and AC-02 (E10);
project-detail::REQ-002/AC-04 (T2, E10); projects-list::REQ-001/AC-02 (U11); the technical prerequisites (P11–P14 for
the fixtures; U16, U18 for the cache key and the version bump).

The side's failure modes walked against the rows: agy running while a scan reads (U15, U16, U14); an unchanged
conversation not read again (U17); a non-local first folder (U11); agy starting to write a database read in place and
failing (U14's rule; the race itself is a gap); rewind (AR3); fork then parent deleted (AR1); an agy update changing
the format (U13, AR2, E10); signed-in and API-key conversations together (U1–U3); the routing suffix (P13, U3); a
Claude model's cache writes (U7); the large prompt (P17); zero-byte and non-SQLite files (U13). Not testable here,
written as gaps in the test file header with what would close them: a checkpoint agy runs between the two copies (no
seam can stage it; written into the header with the post-implementation check's fixes, F7) and usage agy never writes
(`/btw`, the Auto-mode reviewer — nothing to read). The copy's cost is a measurement, not a behaviour: stated in the
spec's failure modes with its figures, not a header entry. The ADR's multi-folder Pending note is #322's and the
closeout's.

Fixture independence: P11–P13, U1, U3, U10 (trajectory), U12 rest on real bytes; P14 ties the encoder to them, so the
encoder-built fixtures share the measured layout. Shapes no sample carries are marked derived in the table — a
retry with tokens, the provider-assigned id, a non-zero cache write, a generator record with tokens and no step, the
unreadable shapes, unpacked indices; each comes from the spec's rule or the protobuf encoding rules, never from a
guess at agy's data.

### Dimension 2 — Case design

Every row asserts through a public seam: the build's result (rows, projections, the unreadable count), the archive's
effective rows, the walk's result, the scan's snapshot, the decoders' output, the contract and store functions, the
built app's DOM. The filesystem assertion in U15 is the spec's own acceptance. States are reachable: a writer holding
the database open is agy running; deleting step and generator rows is what agy's rewind does (measured); a database
at another user version is what an agy update would leave; the unusable temporary parent in U14 and W6 is a failing
copy — the walk already takes the parent as its input (#322), and the build's parse runner is the engine's existing
injection point for where parses run. No case writes the engine's cache or the walk's memo directly. No finding.

### Dimension 3 — False greens (the three checks a design can settle)

- Constant-true: no thresholds; every figure is an exact literal over fixtures with more than one candidate (U2
  three pairs, U4/U5 copied and own calls, U6 four retry shapes, U13 seven bad databases beside a good one).
- Tautology: expected values are literals — sums written out by hand, model names and ids from the samples, days
  built from local date parts; U19's re-derivation is written independently of the production derivation (its own
  comment); E10's figures are hand sums of the fixture.
- Old paths: the trend modes, `SIDE_ORDER`, `AGENT_SIDES` and the dictionaries asserted are the live ones the
  renderer and contract import.

### Dimension 4 — Resource reuse

Searched the existing shared setups: the provider suites build a fresh `mkdtemp` home per case and share nothing
costly; the e2e suite launches per case. E10 adds one launch with a fixture home no other case has (agy usage across
four windows and an unreadable conversation), so it duplicates no resource. Process-level state: the walk's memo
(module level, keyed by path and signature) and the engine's cache (per instance); no test clears either, each case
uses its own temporary paths, and the repeated builds (U14, U16, U17, AR1–AR3) and walks (W6) rely on the signature
changing rather than on clearing.

### Findings

No findings.

### Increment during the TDD loop (2026-10-29, before the build cases were written)

A second enumeration of the 19 databases (every generator record's `chat_model.custom_metadata`) showed that all 56
records, failed calls included, carry a `cascade_id` naming the conversation that made the call, and that the eight
records the fork `8c07e920` copied name the parent `06d3cae9`. The reader now takes it as the generator record's
conversation, and uses it only for a record attached to no step present in the database: such a record is the fork's
copy when it names another conversation (decision recorded in `ticket-323-decisions.md`; written back to
token-stats::REQ-003/AC-06). Rows changed and re-reviewed:

| # | Change |
|---|---|
| P12, P13 | The expected generator record also carries its conversation id (`06d3cae9-…`, `fc99511b-…`, literals from the samples) |
| P14 | The encoder writes the conversation id as agy does (a `custom_metadata` entry after the response model); the measured comparison covers it |
| U4 | The parent's generator record with no step, copied into the fork, names the parent as its conversation (the measured copy's layout): with the parent present it counts once by identity |
| U5 | The same copy with the parent gone counts nowhere: the fork's total is its own call only — red if the step rule, the attached-record rule or the no-step record rule were missing |

Dimension 1: U5 now drives all three copy rules with the parent absent, the case where identity cannot hide a
missing rule. Dimension 2: the copied no-step record is the layout agy writes (measured), reachable. Dimension 3: U5's
expected total is the literal own call; each rule's removal adds a distinct literal amount. Dimension 4: unchanged.
Findings: none.

### Increment during the TDD loop (2026-10-29, second)

Rows changed while the cases were written, each re-reviewed before the change was made:

| # | Change and reason |
|---|---|
| U7 | Running the case showed the design's own expectation wrong: with a cache write present, the four-field total exceeds agy's own (input + output) by the cache reads **and** the cache write, not by the reads alone. The case now holds two calls: a Gemini call with cache reads and no write, as measured (9015, of which 6183 above agy's own — exactly the reads), and the derived Claude-model call with both (6500, the four summed). The spec sentence "higher than agy's own total by exactly the cache reads" holds only where no write is reported; written back to token-stats::REQ-003/AC-03 (decision recorded) |
| I1 | Chinese dropped from the case: `counted-nouns.test.ts` excludes Chinese by construction (a single plural category, its header says why), so only English is checked at 1 and 2 |
| DS3 | Seam: `DisplayStore` over a written `display-cache.json`, as the neighbouring restore cases use, rather than `parseDisplayData` alone — the same validation plus the store's file handling |
| T2 | Also asserts the mode's label `Antigravity` (agents-overview::CON-004's full name, a literal from the spec) — the label the switch renders |

Dimension 3 for U7: the Gemini call's 6183 difference is a literal from the measured call (06d3cae9 step 10); the
Claude call's 6500 is the hand sum. Findings: none.

### Increment from the code review (2026-10-29)

Rows added or changed by the code review's findings (`ticket-323-review-code.md`), reviewed before the cases were
written:

| # | Case | Spec units | Seam | Driving input | Assertion object and expected-value source | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| K1 | a corrupt cache entry for a conversation (an entry without its record, or no entry at all) is read again rather than failing the build or the session page | token-stats C2 (garbage cache content does not crash); CONTEXT "degradation may only hurt itself" | build ×3 + `sessionQuestions` | after a build, the conversation's cache entry rewritten as `{ sig, agg: null }`, then as `null` | each build counts the call (110, literal); the session page rejects with an app error, not a TypeError | derived (corruption has no sample; the cache's own rule names it) | none |
| K2 | the same for a Codex rollout, through the resume check | the same | build | a Codex rollout whose entry is `{ sig, agg: null }`, then `null` | codex total 110 (literal) | derived | none |
| K3 | the same elsewhere in the cache before the first build, through a Codex fork's session page | the same | `sessionQuestions` on a fresh engine | a built fork and parent, then a corrupt entry for another path | the page names the parent's file (literal path) | derived | none |
| U13 | two more unreadable shapes: a trajectory table without its `cascade_id` column, and one with no row | REQ-004/AC-01; CON-001 | build | as named | unreadable 9; the good call only | schema altered | none |
| U21 | a conversation's own id is the one its database records, not its file's name | REQ-003/AC-06 (what "another conversation" is measured against) | build | a conversation written as `conv-x`, its database renamed `renamed.db` | its own call counts (literal) | schema (measured: `trajectory_meta.cascade_id` names the conversation, 19 of 19) | none |

K1–K3 were run against the code before its fix and went red with `TypeError: Cannot read properties of null` at the
dereference each names (recorded in the code review). Dimension 1: the class "a cached entry dereferenced before the
shape guard" has every instance driven (two in the new code, two in the existing Codex code). Dimension 2: the corrupt
cache is written through the file the engine reads at startup — the state a disk corruption leaves. Dimension 3:
literals. Dimension 4: none. Findings: none.

### Increment from the post-implementation check (2026-10-29)

Rows added or changed by the post-implementation check's findings F1–F7 (below, "Post-implementation check"),
reviewed before the cases were written. Implementation version: `fc5d0b1`; no product code changes with them.

| # | Case | Spec units | Seam | Driving input | Assertion object and expected-value source | Fixture shape source | Expensive resource |
|---|---|---|---|---|---|---|---|
| P15 (F1) | adds: a token count arriving length-delimited, and one arriving fixed-width, does not decode | REQ-004/AC-01; Implementation Decisions (a field read in another wire type throws) | proto | step metadata whose `model_usage` (9) holds `input_tokens` (2) as a one-byte length-delimited field (`4a 03 12 01 05`), and as a fixed32 (`4a 05 15 01 00 00 00`) | throws (both) | derived (protobuf wire types; no sample carries another wire type) | none |
| U6 (F7a) | the failed attempt's "no row" asserted | REQ-003/AC-02 | build | unchanged | the side's rows are exactly `[['2026-10-26', 'gemini-3.6-flash', 1170]]` (day, model, total — the call and the 503 attempt share one row key); a zero row for the failed attempt would be a second row (undated, no model) | unchanged | none |
| U22 (F2) | calls carrying no identity: each counts once in its database, its model joined through the step its generator record names, never matched across databases | REQ-003/AC-01 (no fourth key); failure mode "A call carrying no identity"; decisions row of that name | build | `conv-a`: two calls with no id (100/10 and 200/20, models `gemini-3.6-flash` and `gemini-3.8-flash-n`), each a step and a generator record naming it; `conv-b`: one call equal in every field to `conv-a`'s first | side total 440 (110 + 220 + 110, hand sum); `byModel` `[['gemini-3.6-flash', 220], ['gemini-3.8-flash-n', 220]]` — every call carries its model, so no unidentified call stayed unjoined (literals) | encoder (the measured layout without ids; no sample lacks an id: derived) | none |
| U23 (F3) | a conversation deleted between the scan's walk and its read is not unreadable and leaves the figures | failure mode "A conversation deleted between the scan's listing and its read" | build with a walk taken before the deletion | `stays` (110) and `goes` (1100); build; walk; `goes` deleted; build over that walk | 110, unreadable 0 (literals) | schema | none |
| U24 (F3) | a conversation deleted while its read is under way keeps its last result for that scan, is not unreadable, and leaves the figures at the next | the same; decisions rows "When a failed read is agy writing" and "What a failed read keeps" | build ×3 | as U23; `goes`'s time moved (so a read is planned); build through a runner deleting `goes` before running its job; build | build 2: 1210, unreadable 0; build 3: 110, unreadable 0 (literals) | schema; the runner is the parse seam's injection point (`token-stats.test.ts`'s `removing` runner is the precedent) | none |
| U25 (F4) | an unreadable conversation that agy then writes is not counted while its read fails, and counted again once agy closes it | REQ-004/AC-03 ("is not counted"); decisions row "What a failed read keeps" | build ×3 | `good` (110) and `version-2` at user version 2 with no log; build; a writer opens `version-2` and inserts a step (a log appears); build; the writer closes (its last connection merges and removes the log); build | `[unreadable, total]`: `[1, 110]`, `[0, 110]`, `[1, 110]`; the log's presence asserted at each stage (literals) | schema + writer (agy's state while it runs) | none |
| K4 (F6) | a same-version Antigravity entry missing `projectKey`, `unreadable` or `calls`, or holding a call one element short, is read again, not reused | token-stats C2 (garbage cache content does not crash and is recomputed); the cache shape guard | build ×3 per row | after a build, the conversation's entry replaced, under its current signature (read back from the persisted cache), by a well-formed entry holding a sentinel call of 999000 input — the control; then by the same entry with one field removed | control build: 999000 (the entry is reused, so the signature matches); corrupt build: 110, the real call (literals) | derived (corruption has no sample; the guard's own fields) | none |
| E12 (F5) | the side's error comes before its unreadable count on the card; the count shows once the error is gone | agents-overview::REQ-003/AC-02; agents-overview failure mode "The side's settings file is corrupt (A3) while conversations were left unread" | e2e | home: agy's `settings.json` not JSON; a conversation with a 3k call and one at user version 2; `AGENTSHED_RESCAN_MS` short; then the settings rewritten valid | once the card's figure reads `3k` (the build that carries the count has arrived): the third line is the error (`Failed to parse the registry: SyntaxError…`, the dictionary's copy) and there is no `.side-warn`; after the repair: no error line, `.side-warn` reads `1 conversation couldn’t be read`, the figure stays `3k` (literals) | encoder + schema; settings shape from #322's fixture (`settingsJson`) | one app launch |

Header (F7b, F3): `antigravity.test.ts` gains the checkpoint race between the two copies (what would close it: an
injectable step between the copies) and the walk's own deletion window (between its signature and its read — no seam
there; the shared clause is driven through the usage read, U24). The Design review's Dimension 1 sentence on the copy's
cost is corrected in place: it is a measurement stated in the spec, not a header entry.

Dimension 1: each finding's undriven detail now has a case that goes red without it — F1 `varintValue`'s throw (the
length-delimited input) and the fixed-width `yield` (the fixed32 input, skipped as absent without it); F2 the step
join (a second unjoined call with no model: 880 and a `''` bucket), `add`'s null bypass and `combine`'s null guard
(identical unidentified calls merged: below 440); F3 the null-signature skip (a TypeError rejects the build) and
`failedWhileWritten`'s `!existsSync(file)` (unreadable 1 in build 2); F4 the fallback's readable-only condition
(unreadable 1 in build 2); F5 the branch order (error and warn swapped: `.side-warn` shows while the error is there);
F6 each of the guard's three Antigravity checks and the arity (the sentinel 999000, or a TypeError for `calls`).

Dimension 2: every row asserts through the build, the decoder or the built app's DOM. Reachability: a deletion between
the walk and the read is a user or agy removing a conversation mid-scan; the runner deleting before the job is the
parse seam's own injection point; a writer opening an unreadable database is agy (updated) writing in its new format;
the corrupt cache entry is written through the file the engine reads at startup (C2's disk corruption), under the
signature the engine itself persisted; the corrupt settings file is A3's state. No finding.

Dimension 3: no thresholds; expected values are literals and hand sums. K4's control build makes each row self-proving:
without it, a written signature that did not match would make every corrupt entry re-read for the wrong reason. E12
asserts the absence of `.side-warn` only after the figure shows the build that carries the count, so the absence
cannot pass before the count exists. U25 asserts the log's presence and absence, so each stage's state is the one
named. No finding.

Dimension 4: Vitest cases build SQLite fixtures in milliseconds; E12 adds one launch with a fixture home no other case
has (a corrupt settings file). Folding it into E10 was considered: E10's first assertions read the count line at
first render, which a corrupt-settings start would put behind a repair; separate launches per case is the suite's
rule. No process-level state is cleared. No finding.

Findings: none.

Self-check before hand-over (items 2–5; items 6 and 7 below; item 1 in the code review record):

- Item 2, each assertion the fix writes or changes, against Dimension 3's forms: no thresholds or `toBeTruthy`; every
  expected value is a literal or a hand sum (no production constant imported, no recomputation); the objects asserted
  are the live build, decoder and card. No conditional skip: U25's `writers.pop()?.close()` leaving the writer open
  would keep the log, and the stage's `existsSync` literal `false` would go red. Every build is awaited; K4's four rows
  ran (four listed). Each new or changed assertion was made to go red by a mutant of the detail it guards, restored byte
  for byte after each run, the failing line being the assertion's own: P15's two lines (220 for `varintValue`'s throw,
  221 for the fixed-width `yield`), U6's row assertion (a token-less usage counted: an `['', '', 0]` row), U22 (step
  join dropped: 880; null identities matched in a database: 220, across databases: 110; joined to any unidentified
  call: the second model's bucket missing), U23 (null-signature skip removed: TypeError at the build), U24 (database-gone
  clause removed: `[110, 1]`), U25 (readable-only fallback removed: `[true, 1, 110]`), K4 (each guard check removed:
  its own row only — 999000, or a TypeError for `calls`), E12 (count before error: the error line missing at 957; both
  lines rendered: the absence assertion at 958). E12 against `false-greens.md`: form 1, effects (the error's text, the
  count's text, the figure); form 5, the figure and the third line come from the same snapshot in one render of the
  card, so the absence read after the figure shows `3k` reads the render that carries the count; form 2, the real
  rescan timer and a real file write. No finding.
- Item 3, functions the fix changes: none in product code (test-only fix). The spec clause it adds — the two deletion
  windows of token-stats' failure modes — is driven by U23 (deleted before the read: gone that scan) and U24 (deleted
  while read: kept that scan, gone the next). No finding.
- Item 4, data of the new tests: shapes derived from the spec's rules and the protobuf wire rules, said so per row
  (no id, other wire types, corrupt cache entries, a corrupt settings file); the call layout comes from the encoder,
  tied to the real records by P14. No finding.
- Item 5, shared test helpers: none changed (`git diff --stat` over the fix: the three test files only; the fixture
  helper and the e2e helpers untouched). Not applicable.
- Item 6, evidence: the mutation runs — the script, each mutant's search and replacement, its command and its full
  output — are kept in [ticket-323-fix-mutants.log](ticket-323-fix-mutants.log) (16 runs, each `mutant command
  exit=1` and restored byte-exact); m15 and m16 rebuilt the app inside the mutant, and the targeted verification
  rebuilds from the restored source. The targeted verification's first run,
  [ticket-323-fix-targeted-run1.log](ticket-323-fix-targeted-run1.log), went red at `check:lang` alone: Chinese quoted
  in this ticket's records (the cross regression's README quotation, the decisions file's and this record's copy of
  the zh line), which no rule permits under `docs/.workings`. The three lines now describe the copy instead of quoting
  it, every record of this ticket was rescanned with the gate's own character class (none left), and the whole run was
  repeated: [ticket-323-fix-targeted.log](ticket-323-fix-targeted.log). Found by the gate, so not a self-check finding.
- Item 7, records: this increment's table; the test file header (checkpoint race, the walk's deletion window); the
  code review record's Runnability 2 (it said the deletion had no case and that every path had one); the cross
  regression's two rows naming the deletion "a named gap" and the error-first order as evidenced by the implementation
  alone; the decisions file (the deletion windows, the e2e homes); the token-stats spec's deletion bullet made exact.
  The feature checklist's current-verification rows for #323 and the ticket's sync checklist are written after this
  fix and cite the cases above. No finding.

Self-check findings: none.

## Post-implementation check

Date 2026-10-29 · ticket #323 · implementation checked: `fc5d0b1` (range `a474875..fc5d0b1`, branch
`feat/antigravity-usage`, one commit). The worktree's uncommitted changes at the time of the check are documents only
(CONTEXT.md, ADR-0037, four feature pages, three specs, `final-regression.md`) — no code, test or fixture. Scope: every
test the range writes or changes — 25 new cases in `antigravity.test.ts` (23 → 48), 7 in `agy-proto.test.ts` (10 → 17),
two new (K2, K3) and two changed (U18, U19) in `token-stats.test.ts`, one new each in `display-store.test.ts`,
`validate.test.ts` and `trend.test.ts`, one changed in `counted-nouns.test.ts`, E10 new in `e2e/app.spec.ts` and E11's
two changed cases (`app.spec.ts`, `token-span.spec.ts`); the fixture helper `src/main/testing/agy-fixture.ts`. Specs
read: as the Design review, plus the failure modes and Implementation Decisions written back in the worktree
(token-stats, agents-overview, projects-list; uncommitted at the time of the check). First round, not an increment.

### Run evidence

From the handed-over pre-review run log (`ticket-323-gate-prereview.log`), not rerun. Against
`implement/full-verification-gate.md`'s requirements: `git rev-parse HEAD` = `fc5d0b1…`, the end of the handed-over
range; `git status --porcelain --untracked-files=all` printed nothing, so the version list is empty and no
`hash-object` line follows; every command carries its full output and its exit code (all 0, `OVERALL exit=0`). The
range changes test files, so no command may be skipped: typecheck, lint, unit, scripts, site, check:ui, check:lang,
check:i18n, check:nul, the e2e build, e2e and smoke all ran — `pnpm verify`'s list; e2e ran the two e2e files this
change touches (98 cases, all passed). The reviewed unit files ran in full with nothing skipped (`antigravity.test.ts`
48, `agy-proto.test.ts` 17, `token-stats.test.ts` 107, `display-store.test.ts` 12, `validate.test.ts` 47,
`trend.test.ts` 14, `counted-nouns.test.ts` 5 — the only skip in the run is the pre-existing ccusage parity file);
E10 is e2e #11, E11 is #35 and token-span #97. Three tracked documents changed during the run (the agents-overview
spec at 02:41:41, CONTEXT.md and ADR-0037 at 02:42:12; by the run's own durations, inside the e2e window); none of the
reviewed tests reads documents, so the recorded version holds for every result used here. The ignored working records
in the log's directory are outside `git status`'s listing by definition; no reviewed test reads them. No finding on
the log.

### Written tests against the Test design table, and when each goes red

Mutation testing: per the project capability declaration (`capabilities.toml`, read with a TOML parser),
mutation-testing is not enabled; skipped. Each case's "goes red when" below is answered against the code under test
and the expected-value source instead.

| # | Against the table | Goes red when |
|---|---|---|
| P11 | Matches | a step field read at another number or wire, the timestamp's ms conversion wrong, or the identity not falling back to `message_id`; literals are the research decoder's reading of the real record |
| P12 | Matches (with the first increment's conversation id) | the packed indices, the usage, the retry list, the response model or the `custom_metadata` cascade id read wrong; literals from the sample |
| P13 | Matches | `response_id` not preferred over the `bot-` message id, or the model's suffix normalised |
| P14 | Matches | the encoder's output decodes differently from the real record. Both sides run the same decoder, so this pins the encoder to the sample, not the reader (P11–P13 pin the reader) |
| P15 | Agrees in substance; the wire-type input is a two-byte literal (field 9 as a varint), not encoder output as the row says — same shape | a length-delimited field's length check or `lengthDelimited`'s throw removed. It stays green with `varintValue`'s throw or the fixed-width `yield` removed (F1) |
| P16 | Matches | either encoding's branch removed (an unpacked index then throws in `lengthDelimited`) |
| P17 | Matches | a multi-byte length prefix mis-skipped so the fields after the prompt are lost; whether the prompt is decoded is a cost (measured), not asserted — as the row says |
| U1 | Matches | a second or third copy of the call counted (more rows or 2×/3× the total), the model not joined from the generator record, or the project key wrong; 6813/109/6922 from the sample |
| U2 | Matches in substance (two databases holding the three pairs; the row says "three independent conversations") | any other identity order (message id first drops r-2's 1100; provider before response id adds r-3's 440 again; message before provider id adds p-1's 220 again) or no matching across databases |
| U3 | Matches | the suffix normalised or the call lost; 6841 literal |
| U4 | Matches (first increment) | matching across databases broken, the fork's own call or the parent's no-step record lost. Identity hides a missing copy rule here by design; U5 sees them |
| U5 | Matches (first increment) | any of the three copy rules missing (+3300 for the steps, the attached records' calls, +330 for the no-step record) or the own call's day wrong |
| U6 | Differs: the row's "(a) no row" is not asserted (F7) | the 503 attempt with an id of its own not counted, a retry with tokens and no identity counted (+5000), or the failed shape counted unreadable. A retry carrying the call's own id is also stopped by `add`'s identity match, so the `!== own.identity` guard is not seen on its own (it differs only for a token-less own usage carrying an id — not measured) |
| U7 | Matches (second increment) | thinking added to output, cache reads taken out of input, or the cache write left out of the total. Its last line, `expect(9015 - (2534 + 298)).toBe(6183)`, is arithmetic on literals and cannot go red; the relation it states is already pinned by the row tuple above it |
| U8 | Matches | a call without a model dropped, given a bucket, or a step-only call lost |
| U9 | Matches | creation preferred over completion, or the step-less record dated or dropped; days built from local date parts |
| U10 | Matches | a subagent's usage left out or not credited to its folder |
| U11 | Matches | the credit going to a later folder, the untrusted folder listed as a project, or the remote first folder falling through to the trusted folder after it |
| U12 | Matches | the empty database counted unreadable or producing rows |
| U13 | Matches (code-review increment: 9) | the user-version check removed (version-2's 5000 counted, count 8). The column checks fail alike through the later queries here; W5 is where they are seen on their own |
| U14 | Matches | a failed read counted unreadable, its last result dropped, the fallback stored under the new signature (build 3 stays at 1210), or the never-read conversation counted |
| U15 | Matches | an in-place open that is not immutable (the `-shm`/`-wal` listing moves) or the log not read (110) |
| U16 | Matches | the signature built from the database's size and time only |
| U17 | Matches | an unreadable verdict not cached (a job on the second build) or not counted from the cache |
| U18 | Matches | a key added to or removed from the variant |
| U19 | Matches | an Antigravity row keyed to another side on the shared day, a projection disagreeing with the rows for any side (`reconcile` over `AGENT_SIDES`), or a side producing no row |
| U20 | Matches | an Antigravity file given a session page |
| U21 | Matches (code-review increment) | the own id taken from the file's name (every step copied, total 0) |
| W5 | Matches | the walk's format check removed (each of the three gives its folder) |
| W6 | Matches | a failed walk read giving no folder, or kept under the new signature (the third walk would name the first folder) |
| AR1–AR3 | Match | this side's rows not dated or not archived, or the past day not retained (the archive's own rule, fed this side's rows) |
| V2 | Matches (adds 1.5 to the row's bad values) | the contract check missing or too strict |
| DS3 | Matches (second increment) | the display shape rejecting a valid count or accepting a non-count |
| T2 | Matches (second increment) | the mode reading another side, the wrong primary provider, or the label changed |
| I1 | Matches (second increment) | the copy or its plural rule changed; literals from the confirmed prototype |
| E10 | Matches | any of: the card's figure per window, the line's text, title or colour, the Overview's per-side row, the shared day's two segments, the Antigravity mode's single Google segment and its 4k, the model rows, the return to the usual line, a main-process error or a `[parse-pool]` fallback line |
| E11 | Matches | the stamp literal not following `CACHE_VERSION` (the cases' own design) |
| K1–K3 | Match (code-review increment) | a cached entry dereferenced before the shape guard (shown red before the fix, code review record) |

No case is written that the table lacks.

### Dimension 1 — Coverage

The side's failure modes (token-stats, as now written), walked against the cases:

| Failure mode | Covered by |
|---|---|
| agy running while a scan reads: the committed log read; a failing read retried | U15, U16 (calls only the log holds count); U14 |
| — exiting between the look for the log and the copy, between the two copies; starting to write while read in place | Header gaps (#322) |
| — a checkpoint agy runs while it keeps writing, splitting the pair | Neither a case nor a header gap, though the Design review says it is in the header (F7) |
| Copied in full while a log exists; read twice per scan | Costs, measured; not behaviours |
| Not read again unchanged; an unreadable verdict kept until the files change | U17; E10 (re-read once rewritten) |
| A read killed half-way | Header gap and #322's directory-mode case |
| First workspace URI or folder; a non-local first folder; nesting depth zero | U11; #322's cases |
| Rewind | AR3 |
| Fork, then the parent deleted | U5, AR1 |
| An agy update changing the format; unchanged conversations keep their results | U13, AR2, E10; U17 |
| Signed-in and API-key conversations together; the routing suffix | U2, U1, U3; P13, U3, E10 |
| A Claude model's cache writes | U7 |
| Usage agy never writes | Header gap |
| The large prompt; records read one at a time | P17; the memory figure is a measurement |
| Zero-byte and non-SQLite files | U13 |
| Settings or data root missing or corrupt | #322's cases |
| Another format gives no activity; a usage record that will not decode leaves the folder its time; a failing read keeps the last folder | W5; header note with its reason (the walk reads no usage record, by construction — accepted); W6 |
| A call carrying no identity | No case, no header note (F2) |
| A conversation deleted between the listing and its read | No case, no header note (F3) |
| External content | No new rendering point; E10 reads the model names as text |

Implementation details guarding a spec behaviour, found undriven: the wire-type guard on varint-read fields (F1), the
unreadable last entry not kept on a failed read (F4), the Antigravity variant's cache shape guard (F6). agents-overview's
added failure modes: the error before the count on the card (F5, undriven); the count saved with the display copy —
DS3 (the store keeps it through validation), V2 and E10 (the card draws whatever snapshot it is given) compose it, the
restore path being the one every snapshot field takes (agents-overview::REQ-001's cases) — accepted. projects-list's
rewritten boundary: W5, #322's "a conversation that cannot be read contributes nothing", W6.

Test file headers: `antigravity.test.ts` lists the gaps above except the checkpoint race (F7); `agy-proto.test.ts`
states where its real records come from; `e2e/app.spec.ts` adds nothing (F5 is a case to write, not a gap).
Fixture independence: as designed — real bytes for P11–P13, U1, U3, U10's trajectory record and U12; the encoder,
tied to them by P14, elsewhere; the derived shapes marked in the table.

### Dimension 2 — Case design

Every case asserts through a public seam (the build's result, the archive's effective rows, the walk, the scan, the
decoders, the contract and store functions, the built app's DOM). K1–K3 write the cache file the engine reads at
startup (C2's disk corruption, reachable); U14 and W6 inject an unusable temporary parent (a failing copy, reachable);
U18 reads the persisted cache because the persisted shape is the object under test (the existing fingerprint case).
Each case builds its own temporary home. No finding.

### Dimension 3 — False greens

Per case above. Constant-true: U7's literal arithmetic line (harmless, the tuple above it carries the relation);
U19's `toBeGreaterThan(0)` for Claude on the shared day is paired with Antigravity's literal 1230 and `reconcile`'s
per-day equality, so a keying mistake either way goes red. Tautology: none — P14 compares two decodings by design and
is read as the encoder's pin only. Old paths: `AGENT_SIDES`, `TREND_MODE_LABEL`, the dictionaries and `.side-warn` are
what the renderer and contract use. Conditional skips and unexecuted assertions: none (no `skip`, `only`, `todo` or
early `return` in the changed files; every awaited build and expectation is awaited).

E10 against `review-code/false-greens.md`: form 1 — it asserts effects (texts, the title's text, the computed colour
`rgb(179, 85, 47)` = the light `--warn-fg` `#b3552f`, segment classes and the tooltip's `Google 4k`), not existence;
form 2 — real clicks, the real rescan timer through the spec's E5 seam, a real file rewrite; form 5 — every read but the
colour is an auto-retrying `expect`, and the colour is read after its element's text was polled in the same render
with no transition on `.stat .s` (theme.css has none on colour); form 4 — no new gate (E11's literal is the existing
one, red by construction on a bump); form 8 — no geometry. No finding beyond F1–F6, which are guards a deletion would
pass through unseen.

### Dimension 4 — Resource reuse

Counted from the run: one `electron-vite build` (the log's e2e-build section; `playwright.config.ts`'s global setup
builds nothing — it loads electron and runs the quiet-copy script). E10 launches once (`launch(...)` and `close(l)`
once in the case; the list reporter prints no line per launch, so the count is read from the case). The Vitest fixtures
stay below 1 s: `antigravity.test.ts`'s 48 cases took 1077 ms with none listed as slow (Vitest lists cases over
300 ms), `agy-proto.test.ts`'s 17 took 88 ms. No case clears process-level state (the walk's memo, the engine's
per-instance cache), and no expensive resource is shared in process, so collection order does not apply. As designed;
no finding.

### Document sync

None of F1–F7 changes a requirement, a feature statement, a decision or a term, so none adds an item to
[ticket-323-doc-sync.md](ticket-323-doc-sync.md). Statements outside this record that this round found untrue at
`fc5d0b1`, to be corrected as the findings are resolved: `ticket-323-review-code.md` Runnability 2, "Each has a case
except the last (a race; noted)" (F3, F4); the in-progress #323 section of `final-regression.md`, rows "token-stats
spec ↔ implementation" (a passing case for the call without identity; the listing/read race "a named gap": F2, F3)
and "agents-overview spec ↔ implementation" (the error-first order evidenced by the implementation alone: F5); the
feature checklist's current-verification rows for #323, not yet written, may cite only what a case drives. Scope
searched: the handed-over files (four specs, the ticket, `checklist.md`, this record, the run log), `docs/specs`,
`docs/features`, `docs/adr`, `docs/postmortems`, `docs/.workings/antigravity-side` (ignored files included),
`CONTEXT.md`, `AGENTS.md`, `README.md`, `README.en.md`, with `grep -rnE -i` (which honours no ignore file) for the
statements the findings touch ("wire type", "no identity", "deleted between", "error first", "shape guard", "each has
a case", "last entry"): 41 lines; those concerning this ticket are in the token-stats spec, `ticket-323-decisions.md`,
`ticket-323-review-code.md`, `final-regression.md` and this record. Other features' working directories are excluded:
their hits concern their own features.

Negative conclusions above rest on whole-repo searches, not samples: the files using the agy fixture (`agy-fixture`
imported by `antigravity.test.ts`, `token-stats.test.ts`, `agy-proto.test.ts`, `e2e/app.spec.ts` only); every agy
usage fixture of a call carries an id (the only ones without: U6's retry entry and the failed call's model-only
usage); the only hand-built wire in any test is `Uint8Array.from([0x48, 0x05])` (`agy-proto.test.ts:217`); no test
writes an Antigravity cache entry (`kind: 'antigravity'` occurs in `token-stats.ts` only); the custom parse runners
(every `concurrency:` in a test) are `copyFails`, `counting` and two in `token-stats.test.ts` (one removing a Codex
file after its parse, one reordering Claude, Codex and Grok jobs); no e2e or unit test reads `.stat-err`.

### Findings

**F1 — The wire-type guard is driven in one direction only.** A regression that would be missed. P15 drives a varint
arriving where a message is read (`lengthDelimited`'s throw). Not driven: `varintValue`'s throw, through which every
token count (usage fields 2–5) and timestamp part is read, and `fieldsOf`'s new `yield` of a fixed-width field (before
this change a fixed-width field was skipped as if absent; the yield is what lets either guard see it). Removing either
leaves every test green, while a record whose token count arrives in another wire type reads as fewer tokens instead
of a counted, unreadable conversation — the silent drop token-stats::REQ-004/AC-01 and the Implementation Decisions
sentence on wire types rule out. Required: P15 gains a usage whose input (field 2) is length-delimited and one whose
input is fixed32 (wire type 5), each throwing.

**F2 — A call carrying no identity is driven by no case.** A regression that would be missed. Spec failure mode
(written back): it "counts where it is — within its database its step and its generator record are joined through the
step the record names — and is never matched across databases"; decisions row "A call carrying no identity". Undriven
code: the join of an unidentified generator record to its step's unidentified call (`stepCall` in
`conversationCalls`), `add`'s bypass of identity matching for a null identity, and `combine`'s `identity !== null`
guard. Dropping the join counts each such call twice in its database; matching null identities merges distinct calls;
every test stays green. Not in the header either. Required: a providers case — a conversation holding two unidentified
calls (step and a generator record naming it, with a model), and a second conversation holding a call equal in every
field — asserting each call once per database, its model joined (literals).

**F3 — A conversation deleted between the listing and its read is driven by no case.** A regression that would be
missed. Spec failure mode (written back): it "is not unreadable: it leaves the figures at the next scan"; decisions row
"When a failed read is agy writing … or the database gone". Undriven: `failedWhileWritten`'s `!existsSync(file)` (usage
read and walk) and `antigravityPlan`'s null-signature skip. Without the clause a conversation deleted mid-scan counts
as unreadable for that scan — the card reads "1 conversation couldn’t be read" for a conversation that no longer
exists — and every test stays green. Not a header gap either, though the code review record says "noted" and
`final-regression.md` calls it "a named gap"; it is reachable through seams the suite already uses: a parse runner
that deletes the file before running the job (`token-stats.test.ts`'s `removing` runner is the precedent) and a walk
taken before the deletion passed to `build()`. Required: a case per window asserting the unreadable count 0 and the
calls gone by the next build (kept from the last entry for that one build, as the decision states).

**F4 — An unreadable last entry kept on a failed read is driven by no case.** A regression that would be missed.
`antigravityPlan` offers a fallback only for a readable last entry (`!cached.agg.unreadable`); decisions row "What a
failed read keeps"; token-stats::REQ-004/AC-03 ("is not counted"). U14 drives a readable last entry and a never-read
conversation only. Removing the condition keeps an unreadable verdict counted while agy writes the conversation; no
test goes red. The code review record lists this path among those that "each has a case". Reachable without a failing
copy: a conversation at user version 2 read with no log (counted), then held open by a writer so a log appears — its
read now fails the format check with a log present. Required: that case — unreadable 1, then 0 while the log is there.

**F5 — The side card's error before its unreadable count is driven by no case.** A regression that would be missed.
agents-overview failure mode (written back): with the side's settings corrupt and conversations left unread, "the
third line explains the error, and the count shows once the error is gone" — the order of `SideCard`'s branches. No
test renders a side's error line at all, so reversing the order, or losing the error for a side with a count, stays
green. No renderer seam mounts the card, so it is an e2e case: a home with a corrupt agy settings file and a
conversation in another format — the third line is the error and there is no `.side-warn`; the settings repaired, the
count shows at the next scan. One launch for a fixture no other case has.

**F6 — The Antigravity variant's cache shape guard is driven by no case.** A regression that would be missed (C2:
garbage cache content does not crash and is recomputed). `isWellFormedAgg`'s branch checks `projectKey` (string),
`unreadable` (boolean) and `calls` (an array of 7-element records); K1 drives only `agg: null` and a null entry, which
fail the generic object check above it. The suite pins every other variant's fields this way (the Claude
"an entry missing %s in a same-version cache" rows, the Grok "missing subagent" case). Without the `unreadable` check an
entry lacking it stands and the conversation drops out of the count; without `Array.isArray` a non-array becomes a
TypeError (in the guard's own `every`, or in `combine`) — the whole scan fails, the upper escape the code review fixed
for `null`; without the arity
check a short record's fields are misread. Required: rows over a same-version entry carrying the conversation's
current signature, each missing one field (and one with a 6-element call), each recomputed — a sentinel figure in the
corrupt entry tells recomputation from reuse, as the Claude rows' sentinel title does.

**F7 — Two statements of this record do not match the tests.** Inaccurate record. (a) Test design table U6 states
"(a) no row"; the written case asserts the side total and the unreadable count only, so a zero-token row for the
failed attempt would pass. Required: add the assertion (the side's rows hold no zero-total row), or correct the row and
re-review it. (b) The Design review's Dimension 1 says the checkpoint agy runs between the two copies and the copy's
cost are "written as gaps in the test file header"; the header holds neither. Required: the checkpoint race (an
untestable failure mode of token-stats' first bullet) goes into the header with what would close it; the copy's cost
is a measurement, and the sentence is corrected to say so rather than claim a header entry.

Conclusion: seven findings (F1–F7). The written tests agree with the Test design table except U6's "(a) no row"; every
case answers "when does it go red"; no false green hides a defect in what the cases drive; resource use as designed.
Status at `0e8f5b9`: F1–F7 resolved by the fix commit, checked in Round 2 below.

### Round 2 — incremental check

Date 2026-10-29 · ticket #323 · fix range `fc5d0b1..0e8f5b9` (one commit, `0e8f5b9`; product code unchanged:
`git diff --name-only fc5d0b1..0e8f5b9` lists three test files only) · run evidence: the targeted verification log
[ticket-323-fix-targeted.log](ticket-323-fix-targeted.log) · everything outside the objects below carries round 1's
conclusions (the Post-implementation check above, at `fc5d0b1`). Specs read for the objects: token-stats (the side's
REQ-003, REQ-004, failure modes and the "Antigravity usage" Implementation Decision, as the worktree leaves them, the
deletion bullet made exact), agents-overview (A3, REQ-003/AC-02, the side's failure modes).

Objects, with the searches that found them:

- `git diff --name-only fc5d0b1..0e8f5b9` → `e2e/app.spec.ts`, `src/main/providers/agy-proto.test.ts`,
  `src/main/providers/antigravity.test.ts`; `git diff --numstat` → 34, 4 and 106 lines added, none removed, so no
  existing line of those files — no shared setup or helper in them — changed.
- Helper modules: none in the range (`agy-fixture.ts` and the e2e helpers untouched). Nothing imports the changed files:
  `grep -rn -E "from .*(antigravity\.test|agy-proto\.test|app\.spec)" e2e src scripts site` (`*.ts`, `*.tsx`, `*.mjs`,
  `*.js`) → no hit, exit 1; the same search for `agy-fixture` lists its four importers (the control that it reads
  these trees).
- Helpers the range adds, and their users: `grep -n -E "two\(|sentinel|deleting"` → `two()` and the `deleting` runner
  in U23/U24 only (lines 790–818), `sentinel` in K4 only (941–957); E12's `conversation` closure is local to E12.
- Tests: P15 (two expectations added), U6 (one added), U22, U23, U24, U25, K4 (four rows), E12; the header of
  `antigravity.test.ts` (two gap entries).
- Test design table rows changed for the range: the Design review's "Increment from the post-implementation check" —
  P15, U6, U22, U23, U24, U25, K4, E12 — and its header note.

#### Run evidence

The targeted log, read in full. Version: `git rev-parse HEAD` = `fc5d0b1…`, the range's start, and `git status
--porcelain --untracked-files=all` lists ten documents and the three test files; the test files' `git hash-object`
values (`6e2e360…`, `7e6b489…`, `ee9b0aa…`) equal the blobs `0e8f5b9` commits (`git rev-parse 0e8f5b9:<path>`), and the
range changes no other file, so the run tested `0e8f5b9`'s code; the ten documents' hashes equal their current ones.
Every command carries its whole output and an `exit=` line: typecheck, lint, check:lang, check:nul 0; `vitest run` over
the two changed unit files 0 (73 passed, none skipped: `agy-proto.test.ts` 17, `antigravity.test.ts` 56 = round 1's 48
plus U22, U23, U24, U25 and K4's four rows); `electron-vite build` 0; `playwright test e2e/app.spec.ts` 0 (90 passed;
E12 is #12 at `app.spec.ts:938`); `OVERALL exit=0`. The renderer bundle it built (`index-3h2_hY_y.js`) is the
pre-review run's and neither mutant build's (`index-DbezoJQf.js`, `index-DYNdej2q.js` in
[ticket-323-fix-mutants.log](ticket-323-fix-mutants.log)), so E12 ran on restored source. The `git hash-object` step is
written in summary form (`<each file listed above>`, no `exit=` line), as in this feature's earlier logs; every listed
file carries a 40-hex hash, which the command prints only on success, and each was compared above, so the version list
holds and no conclusion rests on the missing line — no finding. The ignored working records are outside `git status`'s
listing; none of the reviewed tests reads a document. Nothing re-run by this check.

#### Item 1 — the tests as written against the changed rows

| Row | Matches? |
|---|---|
| P15 (F1) | Yes — the row's two byte strings (`4a 03 12 01 05`, `4a 05 15 01 00 00 00`), each `toThrow()`, in the existing case (lines 220–221) |
| U6 (F7a) | Yes — the side's rows as `[day, model, total]` equal `[['2026-10-26', 'gemini-3.6-flash', 1170]]` (line 638) |
| U22 (F2) | Yes — `conv-a`: two calls without any id (100/10 `gemini-3.6-flash`, 200/20 `gemini-3.8-flash-n`, each a step and the generator record naming it, through `callRecord`); `conv-b`: one call equal to the first; total `110 + 220 + 110`; `byModel` the two literal pairs |
| U23 (F3) | Yes — the walk taken before `rmSync`, a fresh engine building over it; `[110, 0]`, after the first build's 1210 as the precondition |
| U24 (F3) | Yes — `utimesSync` moves the time, the `deleting` runner removes the file before `runParseJob`; `[1210, 0]`, then `[110, 0]` |
| U25 (F4) | Yes — `[log present, unreadable, total]`: `[false, 1, 110]`, `[true, 0, 110]`, `[false, 1, 110]` |
| K4 (F6) | Yes — four rows (`projectKey`, `unreadable`, `calls`, a six-element call); per row the first build 110, the control under the persisted signature 999000, the corrupt entry 110 |
| E12 (F5) | Yes — `settings.json` `{ not json`, a 2800 + 200 call and a 50000 call at user version 2, `AGENTSHED_RESCAN_MS` 250; `.v` `3k`, `.stat-err` `/^Failed to parse the registry: SyntaxError/`, no `.side-warn`; after `settingsJson([])`: no `.stat-err`, `.side-warn` `1 conversation couldn’t be read`, `.v` `3k`; no main-process error; one launch |

Test file headers: `antigravity.test.ts` now names the checkpoint between the two copies (closed by an injectable step
between them; the failing read that follows is driven by U14's `copyFails`) and the walk's own deletion window — true:
`readAntigravitySessions` takes no runner, and nothing can act between its `conversationSignature` and
`readAttribution`; the clause it shares with the usage read, `failedWhileWritten`'s `!existsSync(file)`, is U24's. The
headers of `agy-proto.test.ts` and `e2e/app.spec.ts` are unchanged, and none of the new cases is a gap.

#### Dimension 1 — Coverage

Each round-1 finding's undriven detail now has a case, its input reaching the branch the case's name claims:
`varintValue`'s throw (P15's length-delimited `input_tokens`) and the fixed-width `yield` (P15's fixed32); the failed
call's "no row" (U6's row assertion); the step join, `add`'s null bypass and `combine`'s null guard (U22: two
unidentified calls in one database, an equal one in another); the null-signature skip (U23: the walk lists a file the
plan finds gone) and the database-gone clause with the fallback (U24: the read runs after the file is removed); the
fallback's readable-only condition (U25: an unreadable last entry, then a log); `SideCard`'s branch order (E12: an
error and a count in one snapshot); each of the variant's guard checks (K4). Round 1's coverage rows now read: "A call
carrying no identity" — U22; "A conversation deleted between the listing and its read" — U23 (before its read starts:
gone that scan) and U24 (while it is read: kept that scan, gone the next), the token-stats bullet as written; the walk's
own window and the checkpoint between the two copies — header gaps. Fixture independence: the derived shapes (no id,
other wire types, corrupt cache entries, a corrupt settings file) are marked so in their rows; the call layout comes
from the encoder pinned by P14. No finding.

#### Dimension 2 — Case design

Every object asserts through a public seam: the decoder (P15), the build's rows, totals, models and count (U6, U22–U25,
K4), the built app's DOM (E12). Reachable states: a walk taken before a deletion is production's order (`doScan` walks,
scans, then builds over that walk); a deletion inside the parse runner is the user or agy removing a conversation while
the scan reads it, through the runner seam the suite already uses; a writer opening a database at another user version
is an updated agy writing on; K4's entries are written through the cache file the engine loads, under the signature the
engine itself persisted (C2's disk corruption); the corrupt settings file is A3. No finding.

#### Dimension 3 — False greens

Mutation testing: per the project capability declaration (`capabilities.toml`, read with a TOML parser),
mutation-testing is not enabled (`enabled = false`); skipped. Each object's "goes red when", against the code under test
and the expected-value source:

| # | Goes red when |
|---|---|
| P15 (two lines) | Line 220: `varintValue`'s throw removed, or field 2 read only when it is a varint. Line 221: the fixed-width `yield` removed (the field skipped as absent), or the same throw removed. Both strings are well formed at every level (field 9's length 3 and 5 fit, the inner field's length or width fits), so no other throw can stand in for the guard; expected value from the Implementation Decision on wire types |
| U6 (row) | A token-less usage counted (the failed call's model-only usage or its retry: an undated, model-less row), the 503 attempt given another day or model (a second row), or either call lost |
| U22 | The step join dropped (each call twice in `conv-a`: 880), null identities matched within a database (220) or across databases (110), or a record joined to an unidentified call other than the step it names (the second model's bucket lost); hand sums and the fixture's model names |
| U23 | The null-signature skip removed (a TypeError rejects the build), or the vanished file kept from its last entry (1210) or counted unreadable |
| U24 | `!existsSync(file)` removed (`[110, 1]`), the fallback not applied (`[110, 0]`), or the file still counted next scan; a deletion that never reached the read shows at the third build (1210), so the second build's figure cannot pass on a read that succeeded |
| U25 | The readable-only condition removed, or a failed read with a log counted unreadable (`[true, 1, 110]`); the verdict not restored once the log is gone (`[false, 0, 110]`); each stage's log state is asserted, so a writer that made no log or never closed shows |
| K4 | Per row, its own check removed: `projectKey`, `unreadable`, the arity → 999000 (the corrupt entry reused); `Array.isArray` → a TypeError in the guard's own `every`. The control's 999000 shows the written signature is the one the engine matches, so the corrupt build's 110 is a recomputation, not a signature miss |
| E12 | The branch order reversed (the `.stat-err` expectation times out), both lines rendered (the `.side-warn` absence times out), the error kept or the count lost after the repair, or another figure |

Constant-true, tautology, old paths: no thresholds or `toBeTruthy`; expected values are literals and hand sums, none
imported from production; the paths asserted are live (`isWellFormedAgg`, `failedWhileWritten`, `antigravityPlan`,
`conversationCalls`, `SideCard`). Skips and unexecuted assertions: the added lines hold no `skip`, `only`, `todo` or
early `return` (the one `if` deletes a file in U24's runner, and a path that never matches shows at the third build);
every build is awaited (12 in the added lines); `it.each`'s four rows ran (56 = 48 + 8).

E12 against `review-code/false-greens.md`: form 1 — effects (the error's text, the count's text, the figure); form 2 —
real file writes and the real rescan timer (the E5 seam); form 5 — the absence of `.side-warn` is read after the figure
shows `3k`, and the two come from one snapshot (`doScan` writes `sides.antigravity.unreadable` from the same build whose
rows give the figure, beside the scan's `error`) drawn by one `SideCard` render, so nothing propagates between the
polled and the asserted expression; the absence was made to fail once (the fix's m16, both lines rendered: red at line
958); forms 4, 7, 8 — no gate, no exemption, no geometry. No finding.

#### Dimension 4 — Resource reuse

Counted from the targeted log: one `electron-vite build` (its e2e-build section; `playwright.config.ts` and
`e2e/global-setup.ts` unchanged since round 1, which found the global setup builds nothing); E12 launches once (one
`launch(` and one `close(l)` in the case; the list reporter prints no line per launch). The Vitest fixtures stay below
1 s: `antigravity.test.ts`'s 56 cases took 622 ms, `agy-proto.test.ts`'s 17 took 88 ms. No object clears process-level
state (K4 rewrites the cache file in its own temporary home; U23 and U24 build fresh engines), and no expensive resource
is shared in process, so collection order does not apply. As designed; no finding.

#### Document sync

Facts from the range: the cases above drive F1–F6's details and U6's "no row"; two header gaps; no product code, no
behaviour, requirement, decision or term changes. Scope: the handed-over files (four specs, this record, the two logs),
`docs/specs`, `docs/features`, `docs/adr`, `docs/postmortems` (its new, untracked file included),
`docs/.workings/antigravity-side` (ignored files included), `CONTEXT.md`, `AGENTS.md`, `README.md`, `README.en.md`, and
ticket #323's body (`gh issue view`, read only). Excluded: `docs/agents`, `docs/ops` and `docs/prototypes` (conventions,
signing, designs — the range changes no design or user-visible behaviour), other features' working directories (their
own features). Search: `grep -rn -i -E` (no ignore file honoured; hits in ignored files confirm it read them) for
"named gap", "each has a case", "implementation alone", "no case", "undriven", "deleted between", "deletion", "no
identity", "wire type", "fixed32", "fixed-width", "shape guard", "error first", "error before", "checkpoint" → 174
lines; those on this ticket's facts are in the token-stats spec, `ticket-323-decisions.md`, `ticket-323-review-code.md`,
`final-regression.md`, `checklist.md`, `ticket-323-doc-sync.md`, the new postmortem and this record. Checked and true at
`0e8f5b9`: the code review record's Runnability 2; `final-regression.md`'s token-stats and agents-overview
spec-implementation rows and its F1–F7 row; the checklist's current-verification rows naming the new cases (each name as
written in the tests); the decisions rows on calls without identity, wire types, the deletion windows, the error's
precedence and the e2e homes; the token-stats deletion bullet; the ticket body (nothing in it states what these cases
settle). Not true: the new postmortem's account of K4, and the two `final-regression.md` rows that vouch for it (F8;
checked versions: the postmortem `4808c38`, `final-regression.md` `b09dec5`, both being edited during this check).

#### Findings

**F8 — The postmortem says the K4 cases went red against the unfixed code with a TypeError.** Inaccurate record.
`docs/postmortems/2026-10-29-a-guard-read-after-the-value-it-guards.md`, "What it settled", lists among its cases "a
same-version Antigravity entry missing each checked field, each after a control build …" and closes "Red against the
unfixed code with a TypeError at each site." K4 was written in `0e8f5b9`, after the code review's fix; the code review
record's Runnability 1 names the three cases run against the unfixed code (K1–K3). Nor would K4 throw there: its
entries are objects carrying `kind`, so reading `cached.agg.kind` before `isWellFormedAgg` (the unfixed order)
throws nothing, and the guard then rejects them. K4's evidence is the fix's mutation runs (m11, m12, m14: 999000 where
110 was expected; m13: a TypeError inside the guard's own `every`): it pins the variant's field checks, not the
guard-before-read order the postmortem is about. As written, a reader counts K4 among the cases that would catch that
defect again, and it would not. `final-regression.md` repeats the claim: the row "Postmortem ↔ implementation and
records" ("True against … the cases K1–K4") and the row "New general rules this round" ("its statements agree with …
the cases K1–K4"). Required: the postmortem attributes "red against the unfixed code with a TypeError" to K1–K3 only
and states what K4 pins (each of the variant's checks, red when that check is removed); the two rows are re-checked
against the corrected file, and the document sync checklist's postmortem row, marked done, is re-checked with them.

Conclusion: one finding (F8). The objects agree with their rows in the Test design table; each answers "when does it go
red"; the run evidence covers every object at `0e8f5b9`; resource use as designed.

#### Disposition of F8 (2026-10-29)

Fixed as required: the postmortem's "What it settled" now credits the red against the unfixed code to the cases on
the null entries (K1–K3) alone, and says what K4 pins — each of the variant's checks, red when that check is removed,
none red against the unfixed order, since its entries carry a `kind` to read; the cross regression's two rows were
re-checked against the corrected file and rewritten (K1–K3 for the order, K4 for the variant's checks); the document
sync checklist's postmortem row, re-checked with them, stays done with the correction noted. Self-check: items 1–6 not
applicable (nothing but records changed); item 7, the three records corrected in this fix. No further incremental
check: `change-scope.mjs --base 0e8f5b9` judges every changed file inert, exit 0
([ticket-323-fix2-change-scope.log](ticket-323-fix2-change-scope.log)) — no test, test data or product code changed.
