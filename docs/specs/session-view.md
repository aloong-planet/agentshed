# Session view

> Related: [features](../features/session-view.md) · ADR-0002 (dual seam) · ADR-0001 (single type source) · ADR-0027 (Codex usage records and paginated rollouts) · ADR-0028 (query layer)
> Status: shipped 2026-08-06 (prototype gate passed 2026-08-02); amended 2026-09-10 for Codex paginated and cold rollouts (B1, B2, C2, C4, C8, D3, R1); amended 2026-09-12 for atomic opening and cached revisits (P, UI decisions).

## Problem Statement

Session records sit in the agent sides' data directories (1948 files / 689 MB on this machine),
with no way for a user to look back at "what did I ask before and what answer did I get". The current
product shows only session metadata (title / time / tokens) and explicitly does not render contents.

But the real user need is not "read the whole conversation" — **it is "find that question I asked,
then see its answer"**. More than nine tenths of a full transcript is tool returns and harness noise,
and the questions people actually care about are a small fraction of it (re-measured 2026-08-02:
human question lines account for **9.5%** of the bytes in the largest project; the 3.8% figure
recorded during step 1 research had no stated basis, so this number is authoritative).

## Solution

**Questions are the primary index, answers are fetched on demand**: project detail gains a "Sessions"
section listing sessions → opening a session shows the **question list** (the trunk) → clicking a
question fetches that turn's full contents on demand (including tool calls and subagents). Search
looks at questions by default. Everything is read-only (~~export to Markdown~~ dropped by the user's
ruling on 2026-08-06, see Out of Scope).

## User Stories

1. As a user, I want to see this project's session list in project detail (most recent activity
   first), so that I can locate a particular conversation.
2. As a user, I want to see **the list of questions I asked** first when I open a session, so that I
   can scan for my target without being drowned in tool output.
3. As a user, I want clicking a question to show its answer, and to be **fast enough not to notice**,
   so that looking back is fluid browsing rather than waiting.
4. As a user, I want the expanded contents to include the full process of tool calls and subagent
   dispatches, so that I can investigate "what did it actually do back then".
5. As a user, I want to search across all of this project's sessions, so that I can find "I discussed
   X in this project before".
6. ~~As a user, I want to export to Markdown, so that I can archive or share.~~ (dropped by the user's
   ruling, 2026-08-06)
7. As a user, I want a Codex session in the paginated format to list my questions the way it did
   before the format changed, so that the session list does not empty out after an agent update.
8. As a user, I want a session Codex has compressed to open and search like any other, so that
   looking back is not cut off at the agent's seven-day line.
9. As a user, I want opening a session, jumping to its parent and coming back to feel like turning
   pages — the page I am on stays until the next is ready, and a session I opened earlier comes back
   at once — so that looking back is not punctuated by blank frames.

## Failure modes and boundaries

**Sequence A: the session list**
- A1 Sorted by **most recent activity time, descending** (switchable to oldest first). ⚠️ An existing
  defect has to be fixed first: `SessionMeta.at` means different things on the two sides.
  **Unified to "the largest timestamp inside the file".**
  **Correction during implementation (2026-08-02)**: research recorded the Claude side as
  "the largest timestamp among usage lines = last activity", and that equation does not hold —
  **both sides were wrong, not just Codex**.
  - Codex: took the first timestamp = the session's start; in a forked session that is in fact **the
    replay moment**, neither the start nor the end.
  - Claude: took the largest timestamp among lines that have usage. **User messages have no `usage`
    field**, so the last thing the user asked is invisible to that measure. Sampling 118 real
    sessions, **53 (45%) have a last-line timestamp later than the last usage line**, with a maximum
    gap of 203 seconds; and some sessions have no usage line at all, leaving only mtime.
  Both sides now take the largest timestamp over **all lines**. With no timestamp, Claude falls back to
  mtime and Codex has no fallback — that is an unreachable branch (`session_meta` always carries a
  top-level timestamp, and a file whose first line will not parse never enters the scan set), so no
  code is written for it.
  **Correction (verified in code 2026-08-02)**: this change does **not** affect the project activity
  sort as a side effect. `ProjectEntry.lastSessionAt` goes down a different pipeline, taking **the
  file mtime** on both sides, unrelated to `SessionMeta.at`. So A1's blast radius is confined to the
  session list itself.
  The resulting divergence is **deliberately kept**: the sessions section sorts by the largest
  timestamp inside the file, project activity sorts by mtime — so the two disagree when a file is
  touched without its contents changing. The reason for not unifying them: mtime is a cheap
  approximation over 1948 files, and reading contents instead would push the project list's
  first-paint cost up to the level of a full scan.
  **Time only** (added 2026-08-02): **the session *count* must share its source in both
  places**. Once A3a landed, a project list still showing a file count would give the same concept two
  different numbers (measured: 1511 vs 507). So after the token build, `perProjectStats` backfills
  `ProjectEntry.sessionCount` — the data is already computed in that same pass, at zero extra cost;
  when the engine is absent the file count is kept so the column does not go to zero. Time still uses
  mtime, unchanged.
- A2 **Unregistered projects' sessions are not listed** (keeping the existing `listed && projectKey`
  rule).
- A3 Subagent sessions do not get their own rows (unchanged) but can be expanded inside the main
  session (see C3).
- A3a **A session containing no real human question is likewise not listed, and its tokens still
  count** (added after measurement 2026-08-02, by the user's ruling) — structurally
  identical to A3's rule for subagents.
  The measurement behind it: in the project with the most sessions, **1004 of 1511 (66%) contain a
  single `Warmup`** — warmup sessions Claude Code opened by itself, which consume tokens (678 usage
  lines) but contain nothing anyone asked. Listing them would make 66% of that project's rows uuid
  filenames, while this feature's whole reason for existing is "find that question I asked" — and a
  warmup session has no question to find.
  ⚠️ As a result **the session count and the token card's denominator do not match**, which must be
  stated in the UI (alongside the subagent note).
- A4 Title: after stripping known noise, take **the first real user message**; Codex prefers
  `thread_name`, falling back to the first `user_message` the same way. If stripping leaves nothing
  real → fall back to the filename (such a session is not listed anyway, per A3a).
  **Noise shapes follow real sampling** (297 sessions measured 2026-08-02; the
  research-phase list was incomplete):
  | Shape | Sample share | Handling |
  |---|---|---|
  | `Warmup` (the whole message is that one word) | 188/297 | Discard the whole message (**only on exact equality**, so a real question containing the word is not caught) |
  | `[cron:<uuid> <name>] <the actual instruction>` | 92/297 | **Strip only the bracket, keep the instruction after it** — that is a real question |
  | `<local-command-*>…` (the caveat disclaimer / stdout command output) | caveat 13/297; stdout 7/144 | Discard the whole message (**match by family prefix**, since the same mechanism produces sibling tags) |
  | `<command-message>…</command-message><command-name>/x</command-name><command-args>real content</command-args>` | 2/297 | **Take the contents of `command-args`**; if empty (e.g. `/clear`), discard the whole message |
  | `Base directory for this skill: …` | Common after a slash command | Discard the whole message (injected skill body) |
  ⚠️ **The "Conversation info" on the research list is real; I missed it the first time** (corrected on
  recheck 2026-08-03): it exists in 6 files, in the form
  `Conversation info (untrusted metadata):` + a ```json metadata block + **the human's actual words
  after that** — the same class as cron, so discarding the whole message would discard a real question.
  The same family also includes `Continue this conversation using the OpenClaw transcript…` (19
  files), where the human's sentence is nested inside `<next_user_message>` behind several machine
  prefix blocks (`[Inter-session message]` / `Untrusted context` / a `System:` line).
  **Neither is implemented**, and the reason is not "never seen it" but that they only occur in
  **unregistered projects** under `.openclaw/workspace`, which per A2 never enter any sessions section
  — writing stripping logic for sessions that are never displayed is dead code, and it would rot along
  with OpenClaw's format.
  If OpenClaw ever leaves the same injection in a registered project, implement it from the shapes
  recorded above (the samples are on file; no fresh research needed).
  🔬 Why it was missed the first time: the sample took the most recent 300 files by descending mtime,
  and these were old files from 15 July — **the sample was biased toward the recent**. That was the
  second time in one round of being caught by the sampling method (the other was forgetting to sort
  when scanning back).
  ⚠️ Noise is not confined to the first message: a caveat is often followed by
  `<command-name>/clear</command-name>`, with the real question third. **You have to walk forward
  entry by entry, not just look at the first one.**
  ⚠️ Noise is **layered**: `<local-command-stdout>` only surfaces as a second layer after the first few
  are stripped — sampling "each session's first message" cannot see it, and it was only found by
  running the finished stripping function back over real data and inspecting **the titles produced**.
  Scan again after adding a stripping rule.
  ⚠️ `[Image #N] <real question>` **is not noise** (1 instance in the sample): what follows the bracket
  is a real question and the whole thing is readable, and we do not write rules for shapes seen once.
- A5 A project with no sessions → an empty state.

**Sequence B: the question list (opening a session)**
- B1 The trunk lists **human questions only**: Claude takes `type=user` where content is a string or an
  array containing a `text` segment; Codex takes the human's message event — `event_msg/user_message`
  in a legacy rollout and, in a paginated rollout, its replacement: the completed-item event whose
  item is a user message (`event_msg/item_completed` with item type `UserMessage`). Measured
  2026-09-10 over every rollout: 1317 of 1367 paginated rollouts carry it. Its harness-injected
  shapes were enumerated on 2026-09-11 (330 of 8285 items, all pure, none mixed with a human
  sentence): the guardian's transcript preamble, a task notification, a delegation block — three
  prefix families the shared stripping removes, beside the Claude shapes. `response_item/message` is
  **never** a question source: it mixes in `<environment_context>` / AGENTS.md injected content, and
  every paginated rollout without a user-message item holds exactly one such message made of
  injected parts only (29 of 29, 2026-09-11) — such a session has no question, is not listed (A3a)
  and its tokens count. A fallback to it was considered and dropped on that measurement (ruled
  2026-09-11): a rule with no positive sample cannot be verified against real data.
  **Corrections during implementation (2026-08-03)**, three of them:
  1. "Exclude `[{type:tool_result}]`" **needs no separate guard**; the rule "take only text segments"
     achieves it. Enumerating all 37,604 array contents in the repository, the segment type
     combinations are only `(tool_result)` 12541 / `(text)` 194 / `(image,text)` 51 — **`tool_result`
     never co-occurs with `text`**, and a `tool_result` segment has no `text` field of its own. An
     additional `some(type===tool_result)` is an unreachable branch and has been deleted.
  2. **Added: lines with `isSidechain` do not count as human questions** — that is a subagent's own
     transcript, whose "user message" is the prompt the parent session dispatched to it. Measured
     across 1545 files, this rule changes the judgement for only 3 (all under `.openclaw/workspace`,
     a project not registered on the Claude side and therefore not listed per A2), so it has no
     visible effect on current data — but the rule has to be right first.
  3. Question identification and title stripping **must share a source**: both use `realUserText`, and
     one indexer decides "which line is the first real question". Two separate judgements would
     inevitably drift, producing "the title has a value but the question count is 0" — the same
     concept with two numbers (the same lesson as A1).
- B2 **Codex replay prefix stripping**: show only what is new since this fork, with a note at the top
  saying "forked from X · earlier history is in that session". The stripping rule depends on the
  parent file being in the scan set; when it is not, degrade to a heuristic and **label the
  uncertainty explicitly** (a wrong strip must never be silent — stripping too much or too little both
  show up as visible lost or duplicated messages).
  **Paginated children carry no replayed events** (2026-09-10): Codex copies neither usage records
  nor completed-item events into a fork or subagent thread in paginated mode, so such a child's
  question set is entirely its own and the fingerprint check is not run for it — run, it would
  misread the child's own first question as an unmatched replay and flag the session uncertain. Such
  a session therefore has fork state none: no stripping, no uncertainty warning, and — the accepted
  consequence, found in review 2026-09-11 — no fork banner and no parent link either, although it is
  a fork; a truthful informational banner for it would be a new copy variant and is not invented
  here. The replayed `response_item` messages it does inherit are not questions under B1. Legacy
  children keep the rules below unchanged.
  **Landed during implementation (2026-08-04)**:
  - **Identify the replayed span by content fingerprint, not by timestamp** — a replay **rewrites the
    timestamps** (confirmed on 4 of 4 real parent-child pairs), so timestamps cannot recognise it.
    Each question in the index carries a 32-bit fingerprint (see the relaxation of D2a in the
    Implementation Decisions).
  - **The direction of failure decides the conservative choice**: stripping too much → a real question
    silently disappears; too little → duplicates, visibly, with a marker explaining them. So
    **do not strip if the entry-by-entry fingerprint check does not pass**; when the parent is missing,
    use the burst heuristic (a replay is written by a program in one go with near-zero inter-line
    gaps, the same mechanism as the token side but computed independently), and **never strip it
    empty** (if the whole span looks like a burst, keep the last entry — that could be either "this
    fork has nothing new" or a heuristic misjudgement, and stripping empty on the latter would make an
    entire session vanish). The burst judgement **stops at a negative (out-of-order) timestamp
    difference**, the same rule as the token side — a single write's timestamps are monotonic, and
    out-of-order ones are not evidence of a burst (added 2026-08-05, from a retrospective review).
  - **A fork verified to have been stripped empty is not listed, and its tokens still count** (the
    user's ruling 2026-08-05, from a retrospective review): a session whose parent is in
    the scan set, every one of whose questions is fingerprint-verified as a replay, and which has no
    new question after the fork, has no question to find — structurally identical to A3a (including
    the "uncertain" empty strip where the child's whole span matches but is shorter than the parent's
    replayed span — each entry there is verified too). Stripping empty can only come from the
    fingerprint path (the heuristic never strips empty; a session that never had questions was already
    unlisted at parse time). The read allow-list still follows the pre-strip rule — its contents are
    entirely replays of an already-readable parent session, so it does not widen the read exposure
    surface, and narrowing it would mean moving the allow-list decision after `combine`, a bigger
    change than the benefit.
  - **Re-deriving the title after stripping applies only to sessions whose title comes from the first
    question** (fixed 2026-08-05, from a retrospective review): `thread_name`'s priority
    (A4) is not invalidated by stripping, and the cache entry records the title's origin for this
    purpose (CACHE_VERSION v9).
  - **The display-side stripping happens in `combine`**, not in the parser: it needs the parent
    session's index, and the cache is per file, so the parser cannot reach the parent. It also does
    **not** reuse the token side's `start` — the metering rule is deduplication, the display rule is
    "what this conversation looks like".
  - **The three states are distinguishable in the data**: `none` (not a fork) / `stripped` (verified
    and stripped) / `uncertain` (parent missing or the check did not match), and they enter the IPC
    contract.
  - **Verified against real data**: the two real forks on this machine stripped 100/181 and 18/100
    entries respectively; the last stripped entry was byte-identical on both sides, and the first
    retained one was a genuinely new question.
- B3 **Claude branch resolution walks back from the last leaf**: follow the parent chain from the last
  entry back to the root and render only that chain (i.e. "what this conversation finally became"),
  without showing abandoned branches.
  **Corrections during implementation (2026-08-04): the literal algorithm is wrong on real
  data, in two places** —
  1. **The starting point is not "the file's last entry" but the last non-`isSidechain` line.** Of the
     1481 files with a uuid chain, **1015 (69%) end on a sidechain line**, whose `parentUuid` is always
     null and whose children point only within the sidechain; walking back from it falls into the
     subagent's own chain and retrieves not a single question from the main session.
  2. **The parent pointer is `parentUuid ?? logicalParentUuid`.** Context compaction inserts a
     `type=system` / `subtype=compact_boundary` line whose `parentUuid` is broken, and
     `logicalParentUuid` is the bridge to the pre-compaction history. Honouring only `parentUuid`
     misjudges all pre-compaction history as "abandoned branches" — measured worst case, **346
     questions collapsed to 44**. After bridging, none of the 466 files containing questions collapse,
     and that case went 346 → 279.
  Branching itself is not common in real data: 27 of 1481 files have a branch point and 29 have
  several leaves. **Questions with no uuid are kept on the do-not-lose principle** — when we cannot
  tell whether it is on the chain, losing a real question is a worse violation of this feature's
  reason for existing than keeping one extra abandoned entry.
- B4 A very large session (measured maximum 133 MB / 19,060 lines) is **never read whole**: the question
  list needs only the question text and offsets, a payload in the tens of kilobytes.

**Sequence C: fetching answers on demand (the core experience)**
- C1 The fetch granularity = **a whole turn**: everything from that question up to the next one
  (assistant replies, tool calls and returns, subagent dispatches). Taking only the last text segment
  loses the context.
- C2 **Offset index**: during the scan (riding along with the token statistics), record each question's
  and its turn's start and end byte offsets; on a click, `createReadStream(file, {start, end})`
  **reads only that range**, independent of total file size → milliseconds.
  **A cold rollout** (a `.jsonl.zst` file, 2026-09-10) has no byte-addressable ranges: its offsets
  are offsets in the decompressed stream, and every range read of it is one streaming decompression
  from the start that serves the requested ranges in order and stops at the last one — opening the
  session is one pass for all its question texts, expanding a turn is one pass to that turn, a search
  is one pass per file. Memory follows the bytes in flight, never the file: measured 2026-09-11 on a
  compressed copy of the largest cold rollout on this machine (206 MB decompressed, 126 MB
  compressed), a range near its end serves 100 KB, traverses the stream in about 0.25 s and holds
  about 13 MB of live buffers at peak — a dozen 1 MB chunks between the file stream and the decoder
  — with the heap under 5 MB, against a 206 MB buffer for decompressing the file whole; the
  process's resident size also carries chunks the collector has not reclaimed yet and is not the
  bound. The whole-file design was rejected on that measurement. A truncated cold rollout never
  reaches the session page: the scan skips it (token-stats B12).
- C3 Subagents **expand in place inside the turn**: Claude's `subagents/` subfiles and inline sidechain
  records, and Codex's subagent threads, all sit under the step that dispatched them.
  **Correction from measurement (2026-08-06): "sitting under the dispatching step" cannot
  be reliably achieved on either side** — all four candidate join keys were measured and excluded:
  `toolUseResult.agentId` (7 digits) and sidechain `agentId` (17 digits) are different namespaces
  (0/225); dispatch lines have no `promptId` (0/202); `outputFile` points at a background task's
  output file rather than the transcript; a sidechain's first-line text equals the dispatch prompt in
  0/1299 cases; and Codex's `spawn_agent` output has no thread id. Per "no rule without a sample" and
  "no speculative pairing", the sub block on every side is unified as **the dispatch arguments + the
  return + an unattributed warning**, with sidechain lines not rendered (a known type whose full
  transcript is in the source or nested file). The model's `steps` field and the rendering path are
  retained — they can be attributed if the harness ever provides a join key.
- C4 An invalid index (the file was appended to or rewritten, so the signature does not match) →
  **rebuild the index for that file only**, without a full rescan; verify once before fetching.
  **Landed (2026-08-04)**: `engine.sessionQuestions` compares the signature on every fetch
  and, on a mismatch, re-parses that one file and **writes the cache back to disk** (so it is not
  rebuilt again next time); the display-side stripping for a Codex fork shares its source with the
  list (the same `stripReplayPrefix` and parent lookup), rather than reusing the token metering side's
  conclusions.
  A session page left open while Codex compresses its file (2026-09-10): the plain path is gone, so
  the next fetch fails for that turn only (the in-turn error state, retry on click), and the session
  reappears under its compressed identity after the next scan — a new path, an index built once.
- C5 In the expanded contents, tool calls are collapsed by default (name + a one-line summary) and can
  be expanded to see the full arguments and return.
- C6 **The sides' completeness is unequal and must be labelled explicitly**: Codex's reasoning body
  is `encrypted_content` (**never obtainable**, with only plaintext sub-headings);
  ~~Claude has plaintext `thinking`~~. We must not pretend they are the same.
  **Correction from measurement (2026-08-06): all 3312 thinking segments on Claude's main
  chain have an empty body** (only a signature placeholder) — measured, **neither side's thinking or
  reasoning body is obtainable**; Codex at least has plaintext sub-headings
  (`response_item/reasoning.summary`, a mirror of `event_msg/agent_reasoning`, taking the former to
  avoid double counting), while Claude has not even a sub-heading. The think block mechanism is
  retained (contract and rendering ready) but the current data produces none.
- C7 A Claude tool result whose body was too large is truncated with a sidecar `tool-results/*.txt` →
  display the truncated version with a label, without pretending it is complete.
  **Correction from measurement (2026-08-06)**: the research-phase note "there is no
  reference chain inside the transcript" is false — all 49 sidecar references **carry a full path**
  ("output saved to: …/tool-results/x"). The truncation criterion = the return text contains a
  `tool-results/` path (mechanism-based: the harness's sidecar directory; the word "truncated" is too
  generic to be a criterion). **The sidecar file is not read** (the user's ruling 2026-08-06: it does
  not enter the read allow-list, since widening it is scope creep and the files may be enormous) —
  only the truncated version is shown, with a label.
- C8 Harness noise is not rendered: this needs a display allow-list. `task_reminder` /
  `file-history-snapshot` / `token_count` / `thread_settings_applied` and the like are never displayed.
  **Landed 2026-08-06, with the full spectrum measured**: Claude has 18 top-level types
  (only assistant/user carry content, the other 16 are known noise; attachment **needs no inner-type
  allow-list** — the whole thing is noise); Codex has three layers: 7 top-level types, 15 event_msg
  types, 9 response_item types (prose comes from event_msg/agent_message, while tools and reasoning
  come down the response_item path, and the response_item paths for `message` / `agent_message` are
  double-write mirrors that are not rendered). **Unknown types outside the allow-list leave a trace**
  (an unknown block placed at the end of the block order, aggregating the count and the type names,
  with the three layers distinguished by `event_msg/` and `response_item/` prefixes) — allow-list
  failures are invisible, so nothing is ever silently dropped (a CONTEXT invariant). Probes over the
  whole repository's real data: the unknown trace set is empty, and the tool pairing rate is 99.94%.
  **Paginated rollouts** (2026-09-10, full enumeration of 1391 rollouts): the completed-item event
  carries a typed item in place of the legacy events — `AgentMessage` is the prose carrier (the
  legacy `event_msg/agent_message` is absent from paginated rollouts), `UserMessage` is the question
  (B1), and `Reasoning`, `FileChange`, `McpToolCall`, `CommandExecution`, `WebSearch`,
  `DynamicToolCall`, `CollabAgentToolCall`, `ImageView`, `Extension`, `SubAgentActivity` and
  `ContextCompaction` are never rendered: `Reasoning`, `CommandExecution`, `DynamicToolCall` and
  `FileChange` accompany `response_item` records that are rendered already, while `McpToolCall` and
  `WebSearch` carry calls whose legacy records (the MCP and web-search end events) were never
  rendered either — measured 2026-09-11, in 31 of 1367 paginated rollouts the tool-like items
  outnumber the `response_item` calls, so they are not mirrors of anything shown. **MCP tool calls
  and web searches are therefore invisible inside a turn on both formats**, a gap that predates the
  paginated format and is stated in the features page; rendering them from the items is a new
  capability, listed under Out of Scope. The usage
  record, the compacted checkpoint, the world state, the thread settings event and the compaction
  marker on the response path (`response_item/compaction`, an encrypted body and nothing else; 78
  records, found by probing every paginated rollout on 2026-09-11 rather than by the item
  enumeration) are noise inside a turn. An item type outside this enumeration leaves the unknown
  trace; the probe over every paginated rollout is the evidence that the set is complete today.

**Sequence G: the Grok side** (grounded in a full enumeration of 17 update types, measured
2026-08-16)
- G1 A question = the run of user_message_chunk records sharing one promptIndex; chunks concatenate
  **raw** (a long question splits mid-word, measured), and a prompt opening with an injected
  `<system-reminder>` notice is the harness speaking — it starts no question, so a session with
  nothing else stays unlisted while its tokens count (the A3a rule).
- G2 The title takes summary.json's own name first (the Codex thread_name priority rule), falling
  back to the first indexed question — the same source as the question set.
- G3 One assistant message can split across agent_message_chunk records mid-word with state records
  between the fragments, so prose and thought chunks merge raw and the ten enumerated state types
  neither render nor break the merge; anything outside the enumeration leaves the unknown trace.
- G4 Tool calls pair with their updates by toolCallId. A spawn_subagent dispatch is a sub block:
  name from the paired subagent_spawned, result from the in-turn subagent_finished output — never
  the "started in background" echo — and its internal steps stay unattributed (the child stream is
  not read; the read allow-list admits listed streams only, so a subagent stream is refused).
- G5 No fork mechanism exists on this side: nothing is stripped and forkState is always none.

**Sequence D: search**
- D1 **Questions are searched by default** (small, clean, precise hits), with full-text search as an
  optional toggle.
- D2 No inverted index is built. **Cost measured (2026-08-02, the largest project, 92.5 MB / 16 files,
  warm cache)**:
  searching questions = `pread` per range by the offset index + `Buffer.indexOf` byte matching =
  **23 ms**; full-text search = read whole + byte matching = **49 ms**; the p50 project is only
  0.6 MB, sub-millisecond.
  The key is **not parsing**: over the same 92.5 MB, `JSON.parse` per line takes 501 ms while a pure
  byte scan takes 27 ms. **Only matching ranges get decoded and parsed.**
  ⚠️ **Case insensitivity must not decode + `toLowerCase` the whole thing** (measured 391 ms, 17× the
  cost of the search itself) — generate case variants of an ASCII needle and do several byte matches
  instead; a Chinese needle has no such problem.
  ⚠️ The numbers above are warm-cache; a cold-start first search is disk-IO bound and was not measured.
  Corollary: **full-text search is a toggle because of hit quality (full text hits tool output noise),
  not because of performance.**
- D2a **The cache stores offsets and one content fingerprint, and no question text at all — not even a
  truncated preview.**
  **The fingerprint is one necessary relaxation added on 2026-08-04**: a Codex replay
  rewrites the timestamps, so storing nothing derived from the content would leave only blind
  stripping by count, and blind stripping is exactly the silent mis-strip B2 exists to prevent. Four
  bytes per entry, not reversible into text, and unusable for search — so neither of D2a's original
  reasons (size, and not degenerating into a second search corpus) is affected.
  The original reasoning still holds: question text is always read from its range on demand (the
  question list and search go down the same read path).
  The decision was made only because neither alternative holds up: storing the full text → questions
  are about 9.5% of the whole (measured on the largest project), and repository-wide that is a
  megabyte-scale burden on `token-cache.json`, which is read on every startup; storing a truncated
  preview → measured, **39.7% of questions exceed 60 characters** (>200 characters 17%, >500
  characters 10.4%), so a preview both loses the body and degenerates into a second corpus at search
  time. And reading on demand takes 23 ms, which is not worth keeping a lossy copy for.
  Corollary: the ellipsis on a list row is **display-layer truncation** (CSS), not data-layer — the
  full text can be laid out when it expands.
- D2b **File reads go through bounded concurrency, defaulting to 4.** Extracted as a shared concurrent
  read utility, and the new range-read paths (question list, search, on-demand fetch) all go through it.
  🔬 **4 is a to-be-confirmed value, not a conclusion.** Warm-cache measurement (671.6 MB / 1950 files,
  10 cores): the pure read path at concurrency 1 → 310 ms, 2 → 153 ms, **4 → 107 ms**, 8 → 88 ms,
  16 → 79 ms — 4 captures 74% of the benefit and 8 captures 89%, with the knee at 8. The reason for
  taking 4 for now is that it equals Node's default libuv thread pool size, and going beyond 4 requires
  raising `UV_THREADPOOL_SIZE` at the same time to be realised; and `UV_THREADPOOL_SIZE=16` measured
  **no faster and slightly slower** on a warm cache (the bottleneck is memory bandwidth, not the thread
  pool).
  ⚠️ The real benefit lies in **cold-disk queue depth**, and the cold path was not measured (it needs a
  reboot or `sudo purge` to clear the page cache). Do not touch this 4 until cold-disk data exists.
  Destination: `.scratch/scan-cold-start/`.
- D3 Full-text search must **deduplicate**: 54.7% of Codex's bytes are fork replay copies, and without
  deduplication the same sentence is reported once per generation of a fork chain.
  A cold rollout is searched in one streaming pass (C2), in question mode and full-text mode alike.
- D4 A hit locates "which question in which session", clickable to go straight there.
  **The locating highlight for a hit (finalised after three rounds of prototype confirmation
  2026-08-06)**: on arrival a yellow background pulse **holds for 10 s** (8 s steady, fading over the
  last 2 s; in the same colour family as mark, distinct from hover's purple), after which a **3px
  accent bar stays at the left edge**, cleared by clicking any question row; a remount such as changing
  the sort does not replay the pulse (the played state is remembered). The functional colours are written per rule — a default plus a dark media query — and do not
  change with the theme.
  **Landed (2026-08-06)**: `searchSessions(path, needle≤200, fullText)` — the session set is
  taken by the main process from its own per-project statistics, since the renderer cannot supply file
  paths; question mode = a coarse pass over raw byte ranges from `readRangeBuffers` (`searchBytes` case
  folding: a non-alphabetic segment as an `indexOf` anchor / for an all-alphabetic needle, two variants
  of the first letter — never decode + `toLowerCase` the whole thing), decoding and parsing only the
  matching ranges and **re-verifying with the parsed text** to eliminate byte-level false hits from
  JSON escaping (the converse miss is a known boundary: a needle containing a quote, backslash or
  newline will not be found in its JSON-escaped form — such keywords are rare and no escape-variant
  scan is done for them); full-text mode = read whole + binary search of the hit offset back to its
  turn, counting hits outside the displayed range (an already-stripped fork prefix / an abandoned
  branch / the noise before the first question) as `folded` and reporting that in the results header;
  question mode has no replay copies by construction, thanks to 03b's stripping. Going straight there =
  `SessionPane focusQ` scroll positioning, with no new visual element. The search term is not preserved
  across sections (the spec does not require it).

**Sequence P: opening, jumping and returning** (ADR-0028; the cache is memory-only and empty at
every start, so "earlier" always means earlier in this run)
- P1 Opening a session (from the sessions section, the overview card or a search hit) for the first
  time in the run: the project page stays whole — list, search box, everything — until the session
  page is ready, then the stage switches in one frame. The row's press feedback is the only
  immediate response; no indicator is added.
- P2 Jumping from a session page to its parent through the fork banner: the current page stays until
  the parent's page is ready.
- P3 Returning to the project: a cached visit of the project page (at once), landing on the Sessions
  section; its detail revalidates by transfusion (project-detail T8).
- P4 Reopening a session seen earlier in the run: its page is drawn at once from what was last shown
  and revalidated in the background; page-local state (expanded turns, sort, folded days, the
  locating focus) starts fresh, keyed by the session as today, and a search hit's focus still
  applies.
- P5 Snapshot update while a session page is on screen: the page is stale and refetches by
  transfusion — the question list follows the file (a live session gains its new questions) while
  the expanded turns, the sort and the folded days survive, the index being the original turn
  number. New with this rule: before it the page was static until reopened.
- P6 Failure on a first open (the file is gone, the allow-list refuses it, the parse fails): the
  switch completes to the page's existing error state — an error result is a ready page. A failed
  revalidation of a cached page leaves the shown page as it is.
- P7 A file Codex compressed while its page was cached: the plain path's page stays a cached visit
  until the next snapshot marks it stale; from then on opening it is P6, and the session reappears
  under its compressed identity (C4).
- P8 Opening a session and going back before its page has arrived: the pending switch is
  interrupted, the project page stays, and the session page is kept when it arrives (a later open
  is P4).
- P9 A turn's contents, the freshness check and the search stay on their effects and handlers (Out
  of Scope): expanding a turn is unchanged, in-turn states included.

**Sequence E: export (dropped entirely by the user's ruling 2026-08-06, never implemented; the entries
below are archived as a decision record and are no longer requirements)**
- E1 By default export **the questions plus the answers already expanded** (matching the browsing
  mental model), with everything as an option.
- E2 Format Markdown: a metadata header + questions/answers + collapsed tool call blocks; inline images
  as data: URIs (which the CSP's `img-src 'self' data:` happens to allow).
- E3 Explicitly label anything unrecoverable (Codex's encrypted reasoning, Claude's truncated tool
  results, the real times in a Codex replayed span).

**Cross-cutting regression points**
- R1 Session file paths must enter the on-demand read allow-list (the same invariant as artifacts and
  memory).
  **Landed (2026-08-04)**: the main process produces **an exact path Set** during the scan
  (with the pure judging function `sessionReadTarget` in security.ts), and the allow-list check is the
  first thing in the handler, before `stat`. **The rule = listed sessions + subagent and nested
  transcripts** — the latter are not in the list (A3/A3a) but expanding them inside a turn needs them, so
  writing it as "only what is already listed" would block ourselves. Under exact matching, traversal,
  prefix lookalikes, encoding variants and NFD variants are all rejected because the strings are not
  equal, which is fail-closed (the worst case is refusing another spelling of the same file).
  A cold rollout's `.jsonl.zst` path enters the allow-list exactly like a plain path (2026-09-10),
  and its plain twin is not on it once the plain file is gone.
- R2 The existing token statistics parsing and caching **must not be broken** — this feature rides the
  same scan pass, but the rules are independent (token deduplication is a metering rule and means
  something different from display deduplication).
  ⚠️ **Do not treat `ccusage-parity` as a guard rail** (corrected 2026-08-02): it is a
  reconciliation tool enabled only with `PARITY=1` and dependent on an external baseline file, and it
  **never runs in `pnpm verify`**.
  A workable verification: run master and this branch against **real data** and compare `byDay` /
  `bySide` / archive row counts. Note that the current day's data grows monotonically because it is
  being written — only a comparison excluding the current day is meaningful (measured 2026-08-02:
  three samples grew monotonically for the current day, and the three were identical once it was
  excluded).
  ⚠️ **The four component fields of an archive row are not a stable comparison quantity** (measured
  2026-08-04): a Codex archive row's input/output/cacheRead/cacheWrite are apportioned by
  the ratio `that day's volume / that session's total` and then rounded, so a session **still being
  appended to today** enlarges the denominator and makes its **historical days'** components drift —
  while that day's `total` does not change. "Exclude the current day" does not stop it, because the row
  belongs to the past while the denominator includes today. **Running the same code back to back twice
  will surface this drift.** The stable comparison quantities are `byDay` and
  `day | side | project | model | total`; before comparing with them, run a same-code self-comparison
  once to confirm stability.
- R3 The IPC contract (`validate`) is extended along with the new fields.

## UI decisions (prototype confirmed, 2026-08-02)

- **Container structure = two-screen navigation + in-place expansion**: project detail gains a
  "Sessions" section (list + search) → clicking a session row replaces the whole block with the
  **session page** (an independent view with a back button) → inside the session page, clicking a
  question **expands the whole turn in place**.
  Rejected: a second-level two-column layout (rail 48 + project sidebar 230 + session list 240 leaves
  about 760px for the body, not enough for tool arguments and returns); and an answer drawer (which
  severs the answer from the question's context, so reading several turns means opening and closing
  repeatedly).
- **The question list = single-line index style**: a row = index + question (single-line truncation) +
  that turn's volume (tool count / subagent count) + time.
  **Listed all at once, with no pagination and no "scroll to load more"** — "never read whole" refers to
  not reading the jsonl body whole; the question text plus offsets are only tens of kilobytes. Any
  pagination semantics would be mistaking a mock's gap for a design.
- **0 turns expanded by default**: everything is collapsed on entry, and clicking a turn fetches it.
  Pre-expanding would defeat "fetch on demand".
- **The expanded state**: the question row **unfolds its own full text** (multi-line paste expanded as
  written), with the whole turn's contents directly below — no separate block restating the question.
- **Grouping across days**: when a session spans days, a single-line index with only `HH:MM` distorts →
  group by day, with the group row clickable to collapse; plus "collapse all / expand all".
- **Sorting**:
  - The question list `ascending | descending`, **descending by default** (changed by the user's ruling
    2026-08-06, originally ascending; newest question first). The index is **always the original turn
    number** and is never renumbered by the sort; **turns already expanded stay expanded across a sort
    change**.
    **Rule clarification (2026-08-04)**: "the original turn number" means the turn number
    **within the displayed set** (1..N). Claude's abandoned branches and Codex's already-stripped
    replay prefix take no number — they are not part of "what this conversation finally became" in the
    first place; that semantics follows from 03b's filtering happening before numbering.
  - The session list `newest first | oldest first`, **newest first by default** (see A1). The sort
    applies to **the list and the search hit groups at the same time**.
- **Session list rows carry a question count** (the prototype's `.sess .n`): a row
  = side badge + title + `N questions` + tokens + last activity. The overview's recent session rows do
  **not** carry this number (as in the prototype — the overview wants a coarser glance).
  ~~⚠️ This number is too high for forked and branched sessions: questions in the replay prefix are not
  yet stripped~~ (the stripping and the branch walk-back landed, and this interim note was cleared on
  2026-08-06).
- **Search hits = grouped by session**: the group header is the session (with side badge and states such
  as fork), and inside it are the matching questions + highlighted snippets; the results header shows
  the hit count, the session count and **the number of folded replay copies**. Answer "in which
  conversation" first, "which line" second.
- ~~**The export entry point**~~ (removed along with the export feature on 2026-08-06; the prototype's
  button and menu were removed to match).
- **Three tiers of presenting uncertainty**: session-level banners come in two levels (info = branches
  resolved / fork prefix stripped; risk = the parent session is not in the scan set, the strip is
  uncertain), and in-turn uncertainty uses warn blocks (a truncated tool result, Codex's encrypted
  reasoning). **None of them are silent.**
  **Landed (2026-08-06)**: the branch banner's criterion and number = the count of branch
  points on the main chain (`forkPoints`, the number of parent nodes referenced by ≥2 main-chain nodes;
  a banner appears only when > 0); the stripped banner carries the parent session's title and is
  **clickable to go straight to the parent's page** (if the parent will not open, this page enters an
  error state, hurting only itself); the risk banner's reason phrase follows the facts — parent missing
  = heuristic only; parent present but the fingerprints did not match entry by entry = only the part
  that passed the check was stripped (copy variants of the same risk shape). Data side: SessionPage
  gains forkPoints / forkParentTitle / forkParentFile, and ClaudeFileAgg gains forkPoints
  (CACHE_VERSION bumped).
- **When day grouping applies (2026-08-06)**: grouping happens only when **every question has
  a timestamp**; if any is missing, the whole page is flat (degrading to the ungrouped form) — no
  "unknown date" group is invented, since that form does not exist in the prototype and a missing
  timestamp is a rare bad line where degrading merely has to be usable. When the same day is separated
  by out-of-order timestamps, group by adjacency (two groups with the same label, whose collapsing does
  not cross over). The question sort is page-local state and resets to its default (descending) when leaving the
  session page (the spec does not require it to survive unmounting).
- **In-turn blocks (2026-08-06)**: the tool / thinking / reasoning / subagent collapsed
  blocks and the unknown-trace block follow the 2026-08-02 prototype (the unknown form was
  retro-added on 2026-08-06 with the user's confirmation); a block's expanded state resets when the
  turn re-renders (on a sort change or collapsing a day), as in the prototype. The blocks' default copy
  (no return record / no return / an unattributed warning) is exempted from the prototype gate as
  pure-copy.
- **In-turn fetch states (retro-added to the prototype 2026-08-06, confirmed by the user)**:
  fetching = a momentary notice on the first fetch, with an already-fetched turn re-expanding
  instantly; a single turn's failure = that turn shows an error without affecting the others, and
  clicking again retries; an empty turn (no prose reply) shows only the fetch footnote and invents no
  placeholder; the footnote includes the actual bytes read. Visually all of them are small, faint
  in-turn text (the prototype's `.rebuild` style).
- **A knock-on change to the overview section**: the overview's session card becomes clickable, and its
  old "metadata and no further" rule is overturned by this feature. It first landed as **listing
  only the 5 most recent + a total count at the bottom**; the click target then **changed to go
  straight to the session page** (closing that interim state), with the back button landing on the
  "Sessions" section.
- **Opening a session is atomic** (ruled 2026-09-12, superseding the 2026-09-11 empty-pane rule; the
  CONTEXT.md invariant of that date): the page on screen stays until the session page can be drawn
  whole, then the stage switches in one frame; a session opened earlier in the run comes back at
  once. No pending indicator is added — the row's press feedback is the only immediate response —
  declared here as the prototype-gate exemption: no visible state is added, and the end state is the
  absence of an intermediate frame. The in-turn fetch notice below is a different state and stays.
- **Paginated and cold rollouts change no interface point** (2026-09-10): the question list, the
  turn blocks, the banners and the search results keep their forms; what changes is where the data
  comes from and how a compressed file is read — declared here as the prototype-gate exemption for
  data-source changes rather than assumed.
- **The sessions section's sort choice survives switching sections** (added 2026-08-02;
  not demonstrated in the prototype): the tabs are conditionally rendered, so switching away unmounts
  and component state cannot hold it. It lives in a module-level variable — not lifted to the parent
  (which would start it collecting every section's internal state), not persisted to disk (it is a
  browsing habit, not a setting), and no store (the repository has no store and no Context, and one
  boolean with one consumer is premature abstraction). If a second view preference needs to survive
  unmounting, promote it to a view-prefs module. **The cost**: it survives switching projects too — the
  sort is a way of looking, not a property of a project.

## Implementation Decisions

- **Offset index**: the scan records `{question offset, turn start and end offsets, time, that turn's
  tool and subagent counts}` — **with no question text** (see D2a). Stored in the existing cache keyed
  by a `path + mtime + size` signature. Fetching streams the byte range.
  **Measured after landing (2026-08-03, real data 1823 files / 287.8 MB)**: the cache went
  4.87 MB → 5.08 MB (**+207 KB / +4.3%**); a full cold scan went 3537 ms → **2916 ms** and a warm cache
  174 ms → **99 ms** — not a regression but an improvement, because line reading switched from
  `readline` to splitting a Buffer on `0x0A` (which is incidentally what makes the byte offsets
  available), and the decoding overhead saved outweighs the added per-line classification.
  ⚠️ **Those scan timings were taken under Node, not in the Electron main process** (noted
  2026-09-09): the same reader over the same bytes ran about twelve times slower in the main
  process at the stream's default chunk size, which is what made startup take minutes once the
  data grew to gigabytes. Main-process figures come from `pnpm bench:scan`; see the CONTEXT.md
  invariant "Main-process file I/O is measured under Electron, never under Node".
  **A turn's end point is "the end of the last parseable line", not the file's byte size**: an active
  session may be mid-line, and that half line neither parses nor should be sliced into a range.
  **Per-side "turn volume" criteria (full enumeration, not sampling)**:
  - Claude tools = `tool_use` segments (the only call segment type in the whole repository); a subagent
    dispatch = the tool name `Agent` (152 occurrences) or `Task` (4), two generations of the same
    tool's name, both taking `description` + `prompt` + `subagent_type`. **The seemingly more
    mechanism-based criterion "the arguments contain `subagent_type`" is not used** — checking it back
    across the repository wrongly admits one `TaskCreate` and misses 5 `Agent` calls that omitted the
    optional parameter. Tools on sidechain lines count toward the subagent number and are not counted
    again in the parent turn.
  - Codex tools = `response_item`'s `custom_tool_call` + `function_call` + **`tool_search_call`**; a
    subagent dispatch = a `function_call` named `spawn_agent`. Only the `response_item` path is taken;
    the `event_msg` path is a UI event mirror of the same calls (and has only `*_end`, no `*_begin`),
    so counting both would double it.
    ⚠️ **`tool_search_call` was only found at review**: it never appeared once in a 120-file sample and
    only became visible in a full enumeration of 278 files / 62,912 lines. The lesson is in CONTEXT.md's
    invariants.
  - Grok tools = tool_call records except spawn_subagent; a subagent dispatch = a tool_call named
    spawn_subagent (the subagent_spawned/finished records are its typed mirror and are not counted
    again — the same double-write rule as the Codex event_msg path).
  **When `CACHE_VERSION` must be bumped** (the current value and the per-version change log are
  maintained **only** in the CACHE_VERSION comment in token-stats.ts and are not duplicated here —
  hard-coding it rots, and it already did once: the spec said 7 when the code was at 10):
  1. Changing `FileAgg`'s **shape** — there is a precedent from 2026-07-30 where not bumping the
     version made an old cache crash on a missing field.
  2. Changing **how a field in `FileAgg` is computed** (added 2026-08-02): the signature still hits
     and the shape is still valid, so without a bump existing files return the old value forever;
     fixtures using a fresh cache always pass, real users never see the fix, and that is a textbook
     false green.
  **What can catch a missed bump** (clarified by measurement 2026-08-03):
  - A shape change → the `FileAgg` **field set fingerprint test** (adding or removing a field goes red,
    forcing the author to think about the version number).
  - An algorithm change → **no automated defence**. It leaves no trace in the code and no unit test can
    notice it (not even a fixture relative to the version number: it is always one notch below the
    current one and will never match whatever the version is). The only thing available is asking
    yourself "is this a shape or a value" when changing this kind of code.
  **Also**: when adding a required field to `FileAgg`, add a line to `isWellFormedAgg` at the same time.
  The version number only catches across versions, and manual corruption or drift within a version is
  caught only by that guard — missing it lets a missing field flow all the way to the contract layer
  and throw away the whole detail payload (upward escape).
- **Concurrent reads**: a shared bounded-concurrency read utility, defaulting to 4; the range-read paths
  all go through it (see D2b). The existing token scan stays serial and is untouched this round.
- **Normalising the sides**: the common model = `{time, role, text, tool call (name/args/result),
  reasoning block?}`. The Codex side needs two things Claude does not: choosing one of the two written
  streams (take `event_msg`) and stripping the fork replay prefix.
  **The landed form (2026-08-05)**: the model is a discriminated union on `kind`
  (`TurnBlock`); 05 landed `text` first (prose: time / role / text), with tool calls, reasoning blocks
  and other kinds extended by 07; the IPC boundary validates against a kind allow-list and rejects
  unknown kinds. The prose carrier follows from full enumeration: the entire spectrum of assistant
  segment types on Claude's main chain is only tool_use / text / thinking, so prose = the `text`
  segment; Codex prose = `event_msg/agent_message` (whose message is always a string), taking the same
  event_msg path as the question side. In a paginated rollout the prose carrier is the completed-item
  event's `AgentMessage` item and the question its `UserMessage` item (C8, B1) — the same event path,
  one generation on. Every type this ticket does not emit a block for has been
  enumerated and assigned to 07; **when 07 lands C8's display allow-list it must carry the "unknown
  types are discoverable" trace** and never silently drop (the CONTEXT allow-list invariant).
- **Cold rollouts**: the range reader gains a streaming implementation for `.jsonl.zst` files — one
  decompression pass per call, serving the requested ranges in ascending order and stopping after the
  last — behind the same interface as the byte-addressed reader, so the question list, the turn fetch
  and the search change nothing above it. The read allow-list, the index signature and the cache key
  all use the compressed path.
- **IPC**: the session list rides on `getProjectDetail`; **`getSessionPage`**
  returns a self-contained session page payload (title / volume / forkState / question text), with the
  text read live by the main process by byte range — `readArtifact`'s read-whole 500 KB path is not
  reused.
  **On-demand answer fetching**: `getSessionTurn(file, i)` — the range can only
  come from the main process's own index (the renderer cannot supply byte ranges), with the same
  `sessionReadTarget` allow-list first; the payload carries `bytesRead` as evidence of "nothing was read
  whole". The companion `sessionFresh(file)` is a read-only predicate: the renderer uses it to decide
  whether to show the interim "rebuilding the index for this file only" state, while the rebuild itself
  is still triggered by the fetch call (idempotent, and the file changing between the two steps is
  harmless).
- **The query layer** (ADR-0028): the session page is a suspense query keyed by the session file;
  opening, jumping and returning run inside a Transition, held by the same detail-slot Suspense
  boundary as project detail (its fallback draws nothing and is reachable only outside a
  Transition). A snapshot arrival invalidates the page's query (P5); every mount revalidates; window
  focus does not refetch; nothing is retried; the query function resolves to a result value (the
  page, or the failure) and never throws, so the page's error state stays a branch of the page.
  Page-local state is keyed by the session file, as before.
- **Prefetching** (an optional optimisation): prefetch a few adjacent turns as the question list moves,
  turning "there when you click" into "there before you click".

## Testing Decisions

Following ADR-0002's dual seam: (1) fixture unit tests at the providers layer — question extraction
(excluding tool_result), the Codex double-write choice, fork prefix stripping, Claude's last-leaf walk
back, title cleaning, and the offset index's fetch correctness (what is read by offset = the
corresponding turn from a full parse); (2) the contract validation round trip; (3) e2e covering the
whole chain of "open a session → click a question → the answer appears". **At least one fixture takes
its shape from a real sample** (the sides' data structures are complex, and a constructed fixture
would inevitably inherit the blind spots of my imagination). The paginated Codex question source
(B1) and the cold-rollout reads (C2) are tested at the same providers seam: a fixture shaped from a
real paginated rollout (completed-item user messages, the three harness shapes among them, no legacy
user-message event), one with neither event and only injected response-item parts (no question,
not listed), and a cold rollout whose question list, turn fetch and search results equal its plain
twin's byte for byte, with the decompressed length a range read traverses asserted against the last
range's end as the evidence of one pass per call.

The atomic open and the cached revisit (sequence P) are asserted at the e2e seam under the same
injected fetch delay as project detail's (one knob family, read by the session-page IPC handler
too): with the delay in force, clicking a session row leaves the sessions list on screen (sampled
inside the delay window) and then shows the session page; back returns the project page at once;
reopening the session shows its questions before the delay could have elapsed. The turn fetch cases
are untouched and must stay green.

## Out of Scope

- Global (cross-project) session search — this round is within one project only.
- Unregistered projects' sessions.
- Editing, deleting or resuming session contents.
- Codex's reasoning body (encrypted, impossible), Claude's truncated tool result originals (the sidecar
  files have no reference chain), and the real times in a Codex replayed span (which would require
  cross-file alignment).
- **The export feature entirely** (dropped by the user's ruling 2026-08-06, including the planned
  Markdown export and a fidelity-preserving backup export; sequence E is archived only).
- Sessions the agent had already cleaned up before this app first ran.
- Rendering MCP tool calls and web searches inside a turn. The legacy format records them only as
  end events (classified as noise since 2026-08-06) and the paginated format as completed items
  (`McpToolCall`, `WebSearch`) that carry the arguments and results; showing them is a new block
  source with its own pairing and copy questions, found 2026-09-11 and not taken up.
- Questions inside a compacted window (ruled 2026-09-10): only the compacted checkpoint's replacement
  history holds them, once per window, so a thread with many windows repeats them many times over.
  They have no turn to fetch, only a summary, and showing that is a session page design question
  that needs a prototype. A compacted session therefore lists fewer questions than it did before
  the compaction, and nothing marks it.
- Moving a turn's contents, the freshness check and the search onto the query layer (P9): they keep
  their effects and handlers, tracked as a follow-up.
- A pending indicator on the clicked row while a first open is in flight: a new visible state that
  needs a prototype.

## Further Notes

- **Prototype gate: passed** (2026-08-02). All five UI points (session list / question list / expanded
  state / search and hits / ~~export entry point~~) were prototyped and confirmed by the user, and the
  conclusions are inlined into the "UI decisions" section above; the export entry point was removed
  from the prototype along with the feature (2026-08-06).
- **Existing constraints that had to be rewritten** — all done (cleared 2026-08-06):
  `CONTEXT.md`'s "session" term has had its final rewrite and "turn" was added; the Out of Scope
  sections of `docs/specs/token-stats.md` and `docs/specs/project-detail.md` and the boundary entries
  of `docs/features/project-detail.md` have all been updated (features/token-stats was checked and
  needed no change).
- **The key conclusions of the factual research** (measured 2026-08-02): performance is not the
  threshold (a full scan of 689 MB takes 4.8 s); the real constraints are memory and render volume,
  both dissolved by the "question trunk + fetch on demand" design; and the two sides' data structures
  differ greatly with inherently unequal completeness.
