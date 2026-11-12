# Session view

> Related: ADR-0038 (test layers) · ADR-0001 (single type source) · ADR-0027 (Codex usage records and paginated rollouts) · ADR-0028 (query layer) · ADR-0029 (saved display pages) · ADR-0015, ADR-0016 (structured errors) · ADR-0018 (icons) · ADR-0037 (Antigravity CLI side) · ADR-0040 (rendering branch tests) · ADR-0043 (a scan runs on a worker thread)

> Successful display payloads persist independently of the accounting index (ADR-0029).

## Problem Statement

Session records sit in the agent sides' data directories, with no way for a user to look back at
"what did I ask before and what answer did I get". The current product shows only session metadata
(title / time / tokens) and explicitly does not render contents.

But the real user need is not "read the whole conversation" — **it is "find that question I asked,
then see its answer"**. More than nine tenths of a full transcript is tool returns and harness
noise, and the questions people actually care about are a small fraction of it.

Having found the conversation, the next step is often to carry on with it. Each agent side reopens a
session by its own ID, from its own command-line tool, and expects to be in the project's directory —
but the page shows neither the ID nor where the session's record lives, and the user has to remember
which tool a session belongs to and how that tool spells resume.

## Solution

**Questions are the primary index, answers are fetched on demand**: project detail gains a
"Sessions" section listing sessions → opening a session shows the **question list** (the trunk) →
clicking a question fetches that turn's full contents on demand (including tool calls and
subagents). Search looks at questions by default. Everything is read-only.

The session page's header carries the session's own ID and three buttons: copy the ID, show the
session's record file in Finder, and copy a resume command — one shell line that changes into the
project's directory and resumes the session in the tool of the agent side it belongs to. The product
hands the command over; it never runs it.

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
- A1 Sorted by **most recent activity time, descending** (switchable to oldest first). A session's
  time is **the largest timestamp inside the file**, taken over **all lines** on both sides (user
  messages have no `usage` field, so a measure over usage lines alone would miss the last thing the
  user asked). With no timestamp, Claude falls back to mtime and Codex has no fallback — that is an
  unreachable branch (`session_meta` always carries a top-level timestamp, and a file whose first
  line will not parse never enters the scan set).
  The project activity sort is not affected by this: it takes **the file mtime** on both sides, a
  different pipeline from a session's time. The resulting divergence is **deliberately kept**: the
  sessions section sorts by the largest timestamp inside the file, project activity sorts by mtime —
  so the two disagree when a file is touched without its contents changing. The reason for not
  unifying them: mtime is a cheap approximation across all files, and reading contents instead would
  push the project list's first-paint cost up to the level of a full scan.
  **The session *count* shares its source in both places**: once the token statistics are built, the
  project list's session count is the number of listed sessions (the data is already computed in
  that same pass, at zero extra cost). Time still uses mtime.
- A2 **Unregistered projects' sessions are not listed** (keeping the existing `listed && projectKey`
  rule).
- A3 Subagent sessions do not get their own rows (unchanged) but can be expanded inside the main
  session (see C3).
- A3a **A session containing no real human question is likewise not listed, and its tokens still
  count** — structurally identical to A3's rule for subagents.
  Claude Code opens warmup sessions by itself (a session containing a single `Warmup` message): they
  consume tokens but contain nothing anyone asked. Listing them would make most of a project's rows
  uuid filenames, while this feature's whole reason for existing is "find that question I asked" —
  and a warmup session has no question to find.
  ⚠️ As a result **the session count and the token card's denominator do not match**, which must be
  stated in the UI (alongside the subagent note).
- A4 Title: after stripping known noise, take **the first real user message**; Codex prefers
  `thread_name`, falling back to the first `user_message` the same way. If stripping leaves nothing
  real → fall back to the filename (such a session is not listed anyway, per A3a).
  **Noise shapes follow real sampling** (297 sessions measured 2026-08-02):
  | Shape | Sample share | Handling |
  |---|---|---|
  | `Warmup` (the whole message is that one word) | 188/297 | Discard the whole message (**only on exact equality**, so a real question containing the word is not caught) |
  | `[cron:<uuid> <name>] <the actual instruction>` | 92/297 | **Strip only the bracket, keep the instruction after it** — that is a real question |
  | `<local-command-*>…` (the caveat disclaimer / stdout command output) | caveat 13/297; stdout 7/144 | Discard the whole message (**match by family prefix**, since the same mechanism produces sibling tags) |
  | `<command-message>…</command-message><command-name>/x</command-name><command-args>real content</command-args>` | 2/297 | **Take the contents of `command-args`**; if empty (e.g. `/clear`), discard the whole message |
  | `Base directory for this skill: …` | Common after a slash command | Discard the whole message (injected skill body) |
  ⚠️ The "Conversation info" shape exists in 6 files, in the form `Conversation info (untrusted
  metadata):` + a ```json metadata block + **the human's actual words after that** — the same class
  as cron, so discarding the whole message would discard a real question. The same family also
  includes `Continue this conversation using the OpenClaw transcript…` (19 files), where the human's
  sentence is nested inside `<next_user_message>` behind several machine prefix blocks
  (`[Inter-session message]` / `Untrusted context` / a `System:` line).
  **Neither is stripped**: they only occur in **unregistered projects** under `.openclaw/workspace`,
  which per A2 never enter any sessions section — writing stripping logic for sessions that are
  never displayed is dead code, and it would rot along with OpenClaw's format. If OpenClaw ever
  leaves the same injection in a registered project, implement it from the shapes recorded above.
  ⚠️ Noise is not confined to the first message: a caveat is often followed by
  `<command-name>/clear</command-name>`, with the real question third. **You have to walk forward
  entry by entry, not just look at the first one.**
  ⚠️ Noise is **layered**: `<local-command-stdout>` only surfaces as a second layer after the first
  few are stripped.
  ⚠️ `[Image #N] <real question>` **is not noise** (1 instance in the sample): what follows the bracket
  is a real question and the whole thing is readable, and we do not write rules for shapes seen once.
- A5 A project with no sessions → an empty state.
- A6 A session row shows the side badge, title, question count, token consumption and last activity
  as a relative time.

**Sequence B: the question list (opening a session)**
- B1 The trunk lists **human questions only**: Claude takes `type=user` where content is a string or an
  array containing a `text` segment; Codex takes the human's message event — `event_msg/user_message`
  in a legacy rollout and, in a paginated rollout, its replacement: the completed-item event whose
  item is a user message (`event_msg/item_completed` with item type `UserMessage`). Measured
  2026-09-10 over every rollout: 1317 of 1367 paginated rollouts carry it. Its harness-injected
  shapes were enumerated on 2026-09-11 (330 of 8285 items, all pure, none mixed with a human
  sentence): the guardian's transcript preamble, a task notification, a delegation block — three
  prefix families the shared stripping removes, beside the Claude shapes. Text a tool injects as a user
  entry in any other shape is listed as a question (ADR-0036). `response_item/message` is
  **never** a question source: it mixes in `<environment_context>` / AGENTS.md injected content, and
  every paginated rollout without a user-message item holds exactly one such message made of
  injected parts only (29 of 29, 2026-09-11) — such a session has no question, is not listed (A3a)
  and its tokens count.
  Three further rules hold:
  1. Tool results are excluded by taking only `text` segments: enumerating all 37,604 array contents
     in the repository, the segment type combinations are only `(tool_result)` 12541 / `(text)` 194
     / `(image,text)` 51 — **`tool_result` never co-occurs with `text`**, and a `tool_result`
     segment has no `text` field of its own.
  2. **Lines with `isSidechain` do not count as human questions** — that is a subagent's own
     transcript, whose "user message" is the prompt the parent session dispatched to it.
  3. Question identification and title stripping **must share a source**: one indexer decides "which
     line is the first real question". Two separate judgements would inevitably drift, producing
     "the title has a value but the question count is 0" — the same concept with two numbers.
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
  consequence — no fork banner and no parent link either, although it is a fork; a truthful
  informational banner for it would be a new copy variant and is not invented here. The replayed
  `response_item` messages it does inherit are not questions under B1. Legacy children keep the
  rules below unchanged.
  - **Identify the replayed span by content fingerprint, not by timestamp** — a replay **rewrites
    the timestamps** (confirmed on 4 of 4 real parent-child pairs), so timestamps cannot recognise
    it. Each question in the index carries a 32-bit fingerprint (see D2a).
  - **The direction of failure decides the conservative choice**: stripping too much → a real
    question silently disappears; too little → duplicates, visibly, with a marker explaining them.
    So **do not strip if the entry-by-entry fingerprint check does not pass**; when the parent is
    missing, use the burst heuristic (a replay is written by a program in one go with near-zero
    inter-line gaps, the same mechanism as the token side but computed independently), and **never
    strip it empty** (if the whole span looks like a burst, keep the last entry — that could be
    either "this fork has nothing new" or a heuristic misjudgement, and stripping empty on the
    latter would make an entire session vanish). The burst judgement **stops at a negative
    (out-of-order) timestamp difference**, the same rule as the token side — a single write's
    timestamps are monotonic, and out-of-order ones are not evidence of a burst.
  - **A fork verified to have been stripped empty is not listed, and its tokens still count**: a
    session whose parent is in the scan set, every one of whose questions is fingerprint-verified as
    a replay, and which has no new question after the fork, has no question to find — structurally
    identical to A3a (including the "uncertain" empty strip where the child's whole span matches but
    is shorter than the parent's replayed span — each entry there is verified too). Stripping empty
    can only come from the fingerprint path (the heuristic never strips empty; a session that never
    had questions was already unlisted at parse time). The read allow-list still follows the
    pre-strip rule — its contents are entirely replays of an already-readable parent session, so it
    does not widen the read exposure surface.
  - **Re-deriving the title after stripping applies only to sessions whose title comes from the
    first question**: `thread_name`'s priority (A4) is not invalidated by stripping, and the cache
    entry records the title's origin for this purpose. The re-derived title is the session's title
    wherever the session is named — the list and global search, its session page, a project's own
    session search, and the parent title on the banner of a fork of it — so they agree. The line it
    is re-derived from is read back each time one of them is built; where that read fails (the file
    deleted or compressed since the scan), that surface keeps the title the session was parsed with,
    and nothing else is affected.
  - **The display-side stripping needs the parent session's index**, and the cache is per file, so
    it is computed after the per-file parse, not within it. It also does **not** reuse the token
    side's replay start — the metering rule is deduplication, the display rule is "what this
    conversation looks like".
  - **The three states are distinguishable in the data**: `none` (not a fork) / `stripped` (verified
    and stripped) / `uncertain` (parent missing or the check did not match), and they enter the IPC
    contract.
- B3 **Claude branch resolution walks back from the last leaf**: follow the parent chain from the last
  entry back to the root and render only that chain (i.e. "what this conversation finally became"),
  without showing abandoned branches.
  The literal algorithm is wrong on real data, in two places:
  1. **The starting point is not "the file's last entry" but the last non-`isSidechain` line.** Of the
     1481 files with a uuid chain, **1015 (69%) end on a sidechain line**, whose `parentUuid` is always
     null and whose children point only within the sidechain; walking back from it falls into the
     subagent's own chain and retrieves not a single question from the main session.
  2. **The parent pointer is `parentUuid ?? logicalParentUuid`.** Context compaction inserts a
     `type=system` / `subtype=compact_boundary` line whose `parentUuid` is broken, and
     `logicalParentUuid` is the bridge to the pre-compaction history. Honouring only `parentUuid`
     misjudges all pre-compaction history as "abandoned branches".
  Branching itself is not common in real data: 27 of 1481 files have a branch point and 29 have
  several leaves. **Questions with no uuid are kept on the do-not-lose principle** — when we cannot
  tell whether it is on the chain, losing a real question is a worse violation of this feature's
  reason for existing than keeping one extra abandoned entry.
- B4 A very large session is **never read whole**: the question list needs only the question text
  and offsets, a payload in the tens of kilobytes.
- B5 The session page's header carries the back control (on one line, a long project name cut
  short), the side badge, the title and the volume information: question count, tokens, file size
  and last activity.
- B6 A day group's row shows the date and that day's question count; collapsing a day only hides it,
  so a turn already expanded is still expanded when the day is reopened.

**Sequence C: fetching answers on demand (the core experience)**
- C1 The fetch granularity = **a whole turn**: everything from that question up to the next one
  (assistant replies, tool calls and returns, subagent dispatches). Taking only the last text segment
  loses the context.
- C2 **Offset index**: during the scan (riding along with the token statistics), record each
  question's and its turn's start and end byte offsets; on a click, **read only that byte range**,
  independent of total file size → milliseconds.
  **A cold rollout** (a `.jsonl.zst` file, 2026-09-10) has no byte-addressable ranges: its offsets
  are offsets in the decompressed stream, and every range read of it is one streaming decompression
  from the start that serves the requested ranges in order and stops at the last one — opening the
  session is one pass for all its question texts, expanding a turn is one pass to that turn, a
  search is one pass per file. Memory follows the bytes in flight, never the file. A truncated cold
  rollout never reaches the session page: the scan skips it (token-stats B12).
- C3 Subagents **expand in place inside the turn**: Claude's `subagents/` subfiles and inline sidechain
  records, and Codex's subagent threads, all sit under the step that dispatched them.
  **"Sitting under the dispatching step" cannot be reliably achieved on either side** — all four
  candidate join keys were measured and excluded: `toolUseResult.agentId` (7 digits) and sidechain
  `agentId` (17 digits) are different namespaces (0/225); dispatch lines have no `promptId` (0/202);
  `outputFile` points at a background task's output file rather than the transcript; a sidechain's
  first-line text equals the dispatch prompt in 0/1299 cases; and Codex's `spawn_agent` output has
  no thread id. Per "no rule without a sample" and "no speculative pairing", the sub block on every
  side is unified as **the dispatch arguments + the return + an unattributed warning**, with
  sidechain lines not rendered (a known type whose full transcript is in the source or nested file).
- C4 An invalid index (the file was appended to or rewritten, so the signature does not match) →
  **rebuild the index for that file only**, without a full rescan; verify once before fetching. The
  signature is compared on every fetch and, on a mismatch, that one file is re-parsed and **the
  cache is written back to disk** (so it is not rebuilt again next time; a failed write is not the
  fetch's failure, since the new index is in memory and the page is served from it, and only the
  next launch rebuilds again, unless a later scan's write of the file succeeds first —
  [token-stats::QR-002/AC-02](token-stats.md)); the display-side stripping for a Codex fork shares
  its source with the list (the same replay-prefix stripping and parent lookup), rather than reusing
  the token metering side's conclusions.
  A session page left open while Codex compresses its file (2026-09-10): the plain path is gone, so
  the next fetch fails for that turn only (the in-turn error state, retry on click), and the session
  reappears under its compressed identity after the next scan — a new path, an index built once.
- C5 In the expanded contents, tool calls are collapsed by default (name + a one-line summary) and can
  be expanded to see the full arguments and return.
- C6 **The sides' completeness is unequal and must be labelled explicitly**: Codex's reasoning body
  is `encrypted_content` (**never obtainable**, with only plaintext sub-headings). We must not
  pretend the sides are the same. **All 3312 thinking segments on Claude's main chain have an empty
  body** (only a signature placeholder) — measured, **neither side's thinking or reasoning body is
  obtainable**; Codex at least has plaintext sub-headings (`response_item/reasoning.summary`, a
  mirror of `event_msg/agent_reasoning`, taking the former to avoid double counting), while Claude
  has not even a sub-heading. The think block mechanism is retained but the current data produces
  none.
- C7 A Claude tool result whose body was too large is truncated with a sidecar `tool-results/*.txt`
  → display the truncated version with a label, without pretending it is complete. All 49 sidecar
  references **carry a full path** ("output saved to: …/tool-results/x"). The truncation criterion =
  the return text contains a `tool-results/` path (mechanism-based: the harness's sidecar directory;
  the word "truncated" is too generic to be a criterion). **The sidecar file is not read** (it does
  not enter the read allow-list, since widening it is scope creep and the files may be enormous) —
  only the truncated version is shown, with a label.
- C8 Harness noise is not rendered: this needs a display allow-list. `task_reminder` /
  `file-history-snapshot` / `token_count` / `thread_settings_applied` and the like are never
  displayed. **The full spectrum measured**: Claude has 18 top-level types (only assistant/user
  carry content, the other 16 are known noise; attachment **needs no inner-type allow-list** — the
  whole thing is noise); Codex has three layers: 7 top-level types, 15 event_msg types, 9
  response_item types (prose comes from event_msg/agent_message, while tools and reasoning come down
  the response_item path, and the response_item paths for `message` / `agent_message` are
  double-write mirrors that are not rendered). **Unknown types outside the allow-list leave a
  trace** (an unknown block placed at the end of the block order, aggregating the count and the type
  names, with the three layers distinguished by `event_msg/` and `response_item/` prefixes; a type
  that is not a string is named by its JSON, never as `[object Object]`) — allow-list failures are
  invisible, so nothing is ever silently dropped (an AGENTS.md invariant). Probes over the whole
  repository's real data: the unknown trace set is empty, and the tool pairing rate is 99.94%.
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
  paginated format; rendering them from the items is a new capability, listed under Out of Scope.
  The usage record, the compacted checkpoint, the world state, the thread settings event and the
  compaction marker on the response path (`response_item/compaction`, an encrypted body and nothing
  else; 78 records, found by probing every paginated rollout on 2026-09-11 rather than by the item
  enumeration) are noise inside a turn. An item type outside this enumeration leaves the unknown
  trace; the probe over every paginated rollout is the evidence that the set is complete today.
- C9 A tool return that was never fed back within its turn (an asynchronous tool spanning turns)
  shows as having no return record; the real return stays in the range of the later turn it
  physically belongs to.
- C10 Clicking an expanded question collapses its turn.

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
- D2 No inverted index is built. Searching questions reads each range by the offset index and
  matches bytes; full-text search reads the file whole and matches bytes. The key is **not
  parsing**: it is a pure byte scan, and **only matching ranges get decoded and parsed.**
  ⚠️ **Case insensitivity must not decode + lower-case the whole thing** — generate case variants of
  an ASCII needle and do several byte matches instead; a Chinese needle has no such problem.
  Corollary: **full-text search is a toggle because of hit quality (full text hits tool output
  noise), not because of performance.**
- D2a **The accounting/question-index cache stores offsets and one content fingerprint, and no
  question text at all — not even a truncated preview.** The separate saved-page display copy in
  session-view::REQ-001 may contain question text; it is not an index or a search corpus.
  **The fingerprint is the one necessary relaxation**: a Codex replay rewrites the timestamps, so
  storing nothing derived from the content would leave only blind stripping by count, and blind
  stripping is exactly the silent mis-strip B2 exists to prevent. Four bytes per entry, not
  reversible into text, and unusable for search — so neither of D2a's reasons (size, and not
  degenerating into a second search corpus) is affected.
  Question text is read from its range on demand (the live question list and search share that
  path): stored in full it would be a megabyte-scale burden on `token-cache.json`, which is read on
  every startup. The startup display copy is the explicit exception in session-view::REQ-001; it is
  not searched or used as an offset index.
  Corollary: the ellipsis on a list row is **display-layer truncation** (CSS), not data-layer — the
  full text can be laid out when it expands.
- D2b **File reads go through bounded concurrency, defaulting to 4.** The range-read paths (question
  list, search, on-demand fetch) all go through it; the existing token scan stays serial.
  🔬 **4 is a provisional value, not a conclusion.** It equals Node's default libuv thread pool size,
  and going beyond 4 requires raising `UV_THREADPOOL_SIZE` at the same time to be realised; raising
  it to 16 measured **no faster and slightly slower** on a warm cache (the bottleneck is memory
  bandwidth, not the thread pool).
  ⚠️ The real benefit lies in **cold-disk queue depth**, which has not been measured. Do not touch
  this 4 until cold-disk data exists.
- D3 Full-text search must **deduplicate**: 54.7% of Codex's bytes are fork replay copies, and without
  deduplication the same sentence is reported once per generation of a fork chain.
  A cold rollout is searched in one streaming pass (C2), in question mode and full-text mode alike.
  A session whose file cannot be read is left out, in either mode, and the other sessions' hits stay.
  The match is case-insensitive.
- D4 A hit locates "which question in which session", clickable to go straight there. **The locating
  highlight for a hit**: on arrival a yellow background pulse **holds for 10 s** (8 s steady, fading
  over the last 2 s; in the same colour family as mark, distinct from hover's purple), after which a
  **3px accent bar stays at the left edge**, cleared by clicking any question row; a remount such as
  changing the sort does not replay the pulse (the played state is remembered). The functional
  colours are written per rule — a default plus a dark media query — and do not change with the
  theme.
  **The page scrolls to the row once**, when the row arrives: on opening, or on the background refresh that brings it in
  when a saved page predates the question (P4). The position is then the reader's: nothing that re-renders the page —
  the display clock, a rescan, a row click, the sort, folding a day — moves it back.
  The needle is at most 200 characters, and the session set is taken by the main process from its
  own per-project statistics, since the renderer cannot supply file paths; question mode = a coarse
  pass over raw byte ranges (case folding: a non-alphabetic segment as the match anchor / for an
  all-alphabetic needle, two variants of the first letter — never decode + lower-case the whole
  thing), decoding and parsing only the matching ranges and **re-verifying with the parsed text** to
  eliminate byte-level false hits from JSON escaping (the converse miss is a known boundary: a
  needle containing a quote, backslash or newline will not be found in its JSON-escaped form — such
  keywords are rare and no escape-variant scan is done for them); full-text mode = read whole +
  binary search of the hit offset back to its turn, counting hits outside the displayed range (an
  already-stripped fork prefix / an abandoned branch / the noise before the first question) as
  `folded` and reporting that in the results header; question mode has no replay copies by
  construction, since the question list is already stripped. Going straight there is a scroll to the
  question's row, with no new visual element. The search term is not preserved across sections (the
  spec does not require it).
- D5 In full-text mode a hit in a turn's body carries a "body" marker and a context snippet.
- D6 A search with no hits says "questions only by default — try switching to full text" instead of
  showing a blank.

**Sequence P: opening, jumping and returning** (ADR-0028; a valid saved page also qualifies
as a cached visit under session-view::REQ-001)
- P1 Opening a session (from the sessions section, the overview card or a search hit) for the first
  time without a saved page: the project page stays whole — list, search box, everything — until the session
  page is ready, then the stage switches in one frame. The row's press feedback is the only
  immediate response; no indicator is added.
- P2 Jumping from a session page to its parent through the fork banner: the current page stays until
  the parent's page is ready.
- P3 Returning to the project: a cached visit of the project page (at once), landing on the Sessions
  section, once ([project-detail::REQ-004/AC-02](project-detail.md)); its detail revalidates by transfusion
  (project-detail T8). Selecting a project in the list from the session page lands on Sessions the same way,
  another project or the session's own. Either holds whichever way the session was entered, the overview's session card
  included; with a stale project's note page or the not-in-snapshot state on the way, the next page with tabs opens on
  Sessions.
- P4 Reopening a session with a saved successful page: its page is drawn at once from what was last shown
  and revalidated in the background; page-local state (expanded turns, sort, folded days, the
  locating focus) starts fresh, keyed by the session as today, and a search hit's focus still
  applies.
- P5 Snapshot update while a session page is on screen: the page is stale and refetches by
  transfusion — the question list follows the file (a live session gains its new questions) while
  the expanded turns, the sort and the folded days survive, the index being the original turn
  number. New with this rule: before it the page was static until reopened.
- P6 Failure on a first open (the file is gone, it exists and cannot be read, the allow-list refuses
  it, an Antigravity conversation cannot be read in the supported format): the switch completes to the
  page's existing error state — an error result is a ready page. The state gives the reason in a sentence
  in the current UI language, never the raw IPC error. A file that cannot be read says so whether or not
  its index has to be rebuilt, on the page and in a turn. A failed revalidation of a cached page leaves
  the shown page as it is.
- P7 A file Codex compressed while its page was cached: the plain path's page stays a cached visit
  until the next snapshot marks it stale; from then on opening it is P6, and the session reappears
  under its compressed identity (C4).
- P8 Opening a session and going back before its page has arrived: the pending switch is
  interrupted, the project page stays, and the session page is kept when it arrives (a later open
  is P4).
- P9 Turn contents and their freshness check use the query layer (ADR-0028/0029), retaining the
  existing in-turn states. Session search also uses the query layer, but its results are not
  persisted across restarts.
- P10 A session opened directly from a global search hit has the two exits global-search::US-003
  defines ([global-search](global-search.md)) in place of the single back control; a fork parent
  reached from it keeps the single back control of P2/P3. The rest of this sequence applies, with the
  global search page in the project page's place in P1 and P8.
- P11 Turns already read stay available: expanding one again shows its saved content at once, an
  unread one waits for a read, and a failed refresh keeps the last successful content.

**Sequence E: export (dropped entirely by the user's ruling 2026-08-06, never implemented; the entries
below are archived as a decision record and are no longer requirements)**
- E1 By default export **the questions plus the answers already expanded** (matching the browsing
  mental model), with everything as an option.
- E2 Format Markdown: a metadata header + questions/answers + collapsed tool call blocks; inline images
  as data: URIs (which the CSP's `img-src 'self' data:` happens to allow).
- E3 Explicitly label anything unrecoverable (Codex's encrypted reasoning, Claude's truncated tool
  results, the real times in a Codex replayed span).

**Cross-cutting regression points**
- R1 Session file paths must enter the on-demand read allow-list (the same invariant as artifacts
  and memory). The application's own scan produces **an exact path set**, which the main process
  takes from the scan's result and holds (ADR-0043), and the allow-list check is the first thing done
  on a read, before any file-system call. **The rule = listed
  sessions + subagent and nested transcripts** — the latter are not in the list (A3/A3a) but
  expanding them inside a turn needs them, so writing it as "only what is already listed" would
  block ourselves. The Antigravity CLI side admits its listed conversations' databases only, and no
  subagent conversation, since no turn expands one (session-view::REQ-004/AC-09). Under exact
  matching, traversal, prefix lookalikes, encoding variants and NFD variants are all rejected
  because the strings are not equal, which is fail-closed (the worst case is refusing another
  spelling of the same file). A cold rollout's `.jsonl.zst` path enters the allow-list exactly like
  a plain path (2026-09-10), and its plain twin is not on it once the plain file is gone.
- R2 The existing token statistics parsing and caching **must not be broken** — this feature rides the
  same scan pass, but the rules are independent (token deduplication is a metering rule and means
  something different from display deduplication).
  The four component fields of a Codex archive row (input/output/cacheRead/cacheWrite) are
  apportioned by the ratio `that day's volume / that session's total` and then rounded, so a session
  **still being appended to today** enlarges the denominator and makes its **historical days'**
  components drift — while that day's `total` does not change. Excluding the current day does not
  stop this, because the row belongs to a past day while the denominator includes today; the
  component fields are therefore not a stable quantity to compare, whereas `byDay` and
  `day | side | project | model | total` are.
- R3 The IPC contract (`validate`) is extended along with the new fields.

## UI decisions (prototype confirmed, 2026-08-02)

- **Container structure = two-screen navigation + in-place expansion**: project detail gains a
  "Sessions" section (list + search) → clicking a session row replaces the whole block with the
  **session page** (an independent view with a back button) → inside the session page, clicking a
  question **expands the whole turn in place**.
- **The question list = single-line index style**: a row = index + question (single-line
  truncation) + that turn's volume (tool count / subagent count) + time. **Listed all at once, with
  no pagination and no "scroll to load more"** — "never read whole" refers to not reading the jsonl
  body whole; the question text plus offsets are only tens of kilobytes.
- **0 turns expanded by default**: everything is collapsed on entry, and clicking a turn fetches it.
  Pre-expanding would defeat "fetch on demand".
- **The expanded state**: the question row **unfolds its own full text** (multi-line paste expanded as
  written), with the whole turn's contents directly below — no separate block restating the question.
- **Grouping across days**: when a session spans days, a single-line index with only `HH:MM` distorts →
  group by day, with the group row clickable to collapse; plus "collapse all / expand all".
- **Sorting**:
  - The question list `ascending | descending`, **descending by default** (newest question first).
    The index is **always the original turn number** and is never renumbered by the sort; **turns
    already expanded stay expanded across a sort change**. "The original turn number" means the turn
    number **within the displayed set** (1..N). Claude's abandoned branches and Codex's
    already-stripped replay prefix take no number — they are not part of "what this conversation
    finally became" in the first place; that follows from filtering happening before numbering.
  - The session list `newest first | oldest first`, **newest first by default** (see A1). The sort
    applies to **the list and the search hit groups at the same time**.
- **Session list rows carry a question count**: a row = side badge + title + `N questions` +
  tokens + last activity. The overview's recent session rows do **not** carry this number (the
  overview wants a coarser glance).
- **Search hits = grouped by session**: the group header is the session (with side badge and states such
  as fork), and inside it are the matching questions + highlighted snippets; the results header shows
  the hit count, the session count and **the number of folded replay copies**. Answer "in which
  conversation" first, "which line" second.
- **Three tiers of presenting uncertainty**: session-level banners come in two levels (info =
  branches resolved / fork prefix stripped; risk = the parent session is not in the scan set, the
  strip is uncertain), and in-turn uncertainty uses warn blocks (a truncated tool result, Codex's
  encrypted reasoning). **None of them are silent.** The branch banner's criterion and number = the
  count of branch points on the main chain (the number of parent nodes referenced by ≥2 main-chain
  nodes; a banner appears only when > 0); the stripped banner carries the parent session's title and
  is **clickable to go straight to the parent's page** (if the parent will not open, this page
  enters an error state, hurting only itself); the risk banner's reason phrase follows the facts —
  parent missing = heuristic only; parent present but the fingerprints did not match entry by entry
  = only the part that passed the check was stripped (copy variants of the same risk shape).
- **When day grouping applies**: grouping happens only when **every question has a timestamp**; if
  any is missing, the whole page is flat (degrading to the ungrouped form) — no "unknown date" group
  is invented, since that form does not exist in the prototype and a missing timestamp is a rare bad
  line where degrading merely has to be usable. When the same day is separated by out-of-order
  timestamps, group by adjacency (two groups with the same label, whose collapsing does not cross
  over). The question sort is page-local state and resets to its default (descending) when leaving
  the session page (the spec does not require it to survive unmounting).
- **In-turn blocks**: the tool / thinking / reasoning / subagent collapsed blocks and the
  unknown-trace block follow the prototype; a block's expanded state resets when the turn re-renders
  (on a sort change or collapsing a day). The blocks' default copy is: no return record / no return
  / an unattributed warning.
- **In-turn fetch states**: fetching = a momentary notice on the first fetch, with an
  already-fetched turn re-expanding instantly; a single turn's failure = that turn gives the reason
  in a sentence in the current UI language, never the raw IPC error, without affecting the others,
  and clicking again retries; an empty turn (no prose reply) shows only the fetch footnote and
  invents no placeholder; the footnote includes the actual bytes read. Visually all of them are
  small, faint in-turn text (the prototype's `.rebuild` style).
- **The overview section**: the overview's session card is clickable. It lists **only the 5 most
  recent + a total count at the bottom**, and the click goes **straight to the session page**, with
  the back button landing on the "Sessions" section.
- **Opening a session is atomic** (an AGENTS.md invariant): the page on screen stays until the
  session page can be drawn whole, then the stage switches in one frame; a session with a saved
  successful page comes back at once, including after restarting. No pending indicator is added —
  the row's press feedback is the only immediate response. The in-turn fetch notice is a different
  state and stays.
- **Paginated and cold rollouts change no interface point**: the question list, the turn blocks, the
  banners and the search results keep their forms; what changes is where the data comes from and how
  a compressed file is read.
- **The sessions section's sort choice survives switching sections**: it is not persisted to disk
  (it is a browsing habit, not a setting). It survives switching projects too — the sort is a way of
  looking, not a property of a project.

## Search hit rows

### session-view::REQ-002 A hit row keeps its keyword in view

Applies to: the question hit rows that a project's session search and global search share
([global-search::US-001/AC-06](global-search.md)). A full-text hit's snippet is already cut around its
keyword (20 characters before it, 60 after) and is drawn as it is. Characters are counted on the question as
the row shows it, where its line breaks and runs of spaces already read as one space (a question's text is
normalised so whenever it is read, by the same function the index uses), each as one: one outside the basic plane, such as an emoji, too.

- session-view::REQ-002/AC-01: A hit row draws its question on one line from the beginning, cut with an
  ellipsis where it overflows, with every occurrence of the keyword highlighted. A row whose first occurrence
  is wholly in view is drawn so.
- session-view::REQ-002/AC-02: When the first occurrence would not be wholly in view — past the cut, or under
  the ellipsis — the row starts 20 characters before it, after a leading ellipsis.
- session-view::REQ-002/AC-03: When even that does not show the first occurrence whole (a long keyword in a
  narrow row), the row starts at the occurrence itself, after the leading ellipsis.
- session-view::REQ-002/AC-04: Whether the occurrence is in view is judged at the row's width, and judged
  again, from the question's beginning, whenever that width changes or the rows are drawn anew.

### Failure modes and boundaries: hit rows

- The keyword opens the question: the row is drawn from the beginning, whatever its width.
- Several occurrences: the first decides where the row starts; every occurrence in view is highlighted.
- The window is resized, or the results are drawn anew (another keystroke, the sort switched, a rescan's
  results): every row is judged again (session-view::REQ-002/AC-04), so a row widened enough to show its
  keyword returns to the question's beginning.
- A row with no width yet is judged once it has one. The search page and the Sessions tab are drawn only
  while shown; left and shown again, they draw their rows anew, and the rows are judged anew.
- The question holds markup or markdown: the row shows its characters, as before; moving the start never
  cuts a character in two.

## Cross-restart page restoration

### session-view::REQ-001 Restore successful session pages

- session-view::REQ-001/AC-01: After a full quit and relaunch, opening a previously viewed session
  with a valid saved page displays its header, fork information and question texts before the first
  scan completes, even when the accounting/question-index cache has been invalidated.
- session-view::REQ-001/AC-02: Without a saved session page, keep the existing first-open path;
  no claim of immediate opening applies to never-viewed content.
- session-view::REQ-001/AC-03: Keep the saved question list until a successful current page can
  replace it. Index-unavailable or background-read errors must not erase the saved page.
- session-view::REQ-001/AC-04: The new page and turn contents must refer to the same question
  identity. Never show an old question with a new answer selected only by its former ordinal
  after the source has been rewritten, branched, compacted or compressed.

- session-view::REQ-001/AC-05: Persist already fetched answers with their originating page, so an
  answer read in the preceding run can be opened from saved content. Never fetch unread turns
  merely to fill a persistence file. Expanded/collapsed state still resets under
  [agents-overview::CON-003](agents-overview.md).

### Failure modes and boundaries: opening restored content

- The source is appended to while scanning: retain the saved page until a consistent new page
  arrives; invalidate saved turn identities if the underlying question mapping changed.
- The source is missing, becomes a symlink or changes from plain to compressed: the saved page is
  historical display data, not permission to read the replacement. Fresh authoritative absence
  retires the obsolete path; its new identity follows C4/P7. A failed scan alone is not absence.
- Expand a not-yet-fetched answer while its index is unavailable: wait for a validated current
  index/page, with the existing in-turn loading form; never use offsets from incompatible data.
- Rapidly jump to a parent or return to a project during revalidation: the visible target follows
  the latest selection; a late response may update only its own cache entry (P2/P8).
- Cached text/tool output uses the existing block renderers and incompleteness labels. No new
  markup execution, sidecar reads or full-transcript preloading is introduced.

## Session ID and resume

Every session belongs to exactly one agent side — the side whose data directory holds its record — and
that side gives it an ID its own command-line tool resumes it by (CONTEXT: session ID).
The session ID is not the session's identity here, which stays its source file path (A, B).

### session-view::US-001 Pick a session back up in the tool it belongs to

As a user whose sessions come from different agent sides, I want each session page to show the
session's own ID, hand me the command that reopens it in its own side's tool, and show me its record
file, so that I can carry on with a conversation in a terminal, or find its file, without remembering
which tool it belongs to or how that tool spells resume.

- session-view::US-001/AC-01: The session page's header shows the session ID at the end of its meta
  line, after a "Session ID" label: for Claude Code the session file's name without its extension,
  for Codex the ID its record's opening session-metadata entry carries, for Grok the name of the
  session's directory, for Antigravity CLI the conversation ID, which is the name of the
  conversation's database without its extension.
- session-view::US-001/AC-02: The right end of the title row holds three buttons, in this order: copy
  the session ID, show the record file in Finder, copy the resume command. Each one's tooltip names its
  action, appears at once on pointer hover and on keyboard focus, and goes when the pointer or the focus
  leaves.
- session-view::US-001/AC-03: Copying the session ID puts the session ID on the clipboard, and nothing
  else.
- session-view::US-001/AC-04: Copying the resume command puts one line on the clipboard:
  `cd <project directory> && <resume>`, where `<resume>` is `claude --resume <id>` for a Claude Code
  session, `codex resume <id>` for a Codex session, `grok --resume <id>` for a Grok session and
  `agy --conversation <id>` for an Antigravity session, and the project directory is the path of the
  project the page belongs to, quoted under
  session-view::CON-002.
- session-view::US-001/AC-05: The resume button's tooltip shows, below its name, the whole command it
  copies.
- session-view::US-001/AC-06: After a copy succeeds, that button's icon becomes a check and its tooltip
  reads "Copied" for 1.5 seconds, then both return; a second copy within that time starts the 1.5
  seconds again.
- session-view::US-001/AC-07: Showing the record file opens Finder with the session's source file
  selected: the Claude Code session file, the Codex rollout (its compressed file, for a cold rollout),
  the Grok session's update stream inside its directory, the Antigravity conversation's database
  (session-view::REQ-003/AC-01), never its transcript.
- session-view::US-001/AC-08: For a stale project the resume command is still copied, and its tooltip
  adds a line saying the project directory no longer exists, so the command's cd will fail. This holds
  on every route to such a page: a global search hit, and the fork parent reached from it.
- session-view::US-001/AC-09: When the session ID cannot be read — the record carries none, or the page
  was restored from a copy saved before session IDs were kept and has not been replaced by a live page
  yet (session-view::CON-003) — the meta line says "Session ID unavailable", the copy-ID and resume
  buttons are disabled, their tooltip says the session's ID could not be read, and clicking them does
  nothing. Showing the record file still works.
- session-view::US-001/AC-10: When the record file is no longer there as Finder is asked to show it, or
  the clipboard refuses a copy, the error toast says so; nothing else on the page changes.

### session-view::CON-001 The product hands a command over and never runs one (direct acceptance)

Applies to: everything in session-view::US-001. The product writes text to the clipboard and asks
Finder to show a file; it does not start an agent side's tool, open a terminal, or write to any agent's
data or configuration. The resume command names each tool by its bare command name; the product does
not look for where a tool is installed or whether it is on the user's path.

### session-view::CON-002 Agent data enters the command only quoted (direct acceptance)

Applies to: the resume command (session-view::US-001/AC-04). The project directory is always written in
single quotes, a single quote inside it written as `'\''`. The session ID is written as it is when every
character in it is a letter, a digit, `-`, `_` or `.`, and in single quotes by the same rule otherwise.
Pasting the command therefore runs the change of directory and the resume and nothing else, whatever
characters the path or the agent's record holds.

### session-view::CON-003 Pages saved before the session ID restore with it filled in (direct acceptance)

Applies to: session pages in the saved display copy (session-view::REQ-001, ADR-0029). A page saved by
a version that did not keep the session ID restores rather than being dropped: a Claude Code or Grok
page gets its ID from its file path by the same rule as a live page, and a Codex page gets none, so it
shows session-view::US-001/AC-09's form until the live page replaces it.

### Failure modes and boundaries: session ID and resume

Measured 2026-10-28 over every session on this machine: 1048 of 1048 Claude Code session files named by
a UUID carry that UUID as their only session ID (the 1471 `agent-*` files are subagents and the 75 files
with no session ID at all have no question; neither is listed). All 2525 non-empty Codex rollouts carry
a session-metadata ID; 7 are thread segments named `<thread>_<segment>`, whose ID is the thread's. All
14 Grok sessions are directories named by a UUID. All 19 Antigravity conversations (agy 1.4.9) are
databases named by a UUID, the conversation ID agy's own summary index records for each, forks and
subagents included.

**Opening the page**
- First open, cached revisit, restore before the first scan (P1, P4, session-view::REQ-001): the ID and
  the buttons come with the page; a restored page's buttons act on its saved data. A transfusion while a
  tooltip is open (P5) redraws the tooltip from the refreshed page.
- Opened from the Sessions tab, the overview card, a global search hit or a fork banner: the same
  header. Whether the project is stale comes from the project the page belongs to, not from the route
  (session-view::US-001/AC-08).
- The UI language switches while a tooltip is open: the tooltip follows.
- Jumping to the fork parent within 1.5 seconds of a copy, or with a tooltip open: the check and the
  tooltip belong to the page they were made on and do not follow to the parent's page.

**Copying**
- The session ID: exactly the ID, no label, no line break.
- The resume command: a directory with spaces, non-ASCII characters or a single quote is quoted per
  session-view::CON-002; an ID with any character outside letters, digits, `-`, `_` and `.` is quoted
  too, so a malformed record cannot turn the pasted line into a different command.
- The clipboard refuses: the error toast (session-view::US-001/AC-10); the button shows no check.
- Copying twice quickly: the second copy restarts the check's 1.5 seconds.

**Showing the record file**
- The file is gone (deleted, or compressed by Codex since the page was drawn — C4, P7): the error
  toast; the page itself follows C4/P7 on its next refresh.
- A path that is not a listed session file is refused before it is touched (session-view::R1's
  allow-list); a restored allow-list entry is shown only while it is a regular file, as a restored
  artifact is opened.

**Pasting the command — the agent side's own behaviour, which the product does not check**
- The tool is not installed or not on the path: the shell says so. On this machine the Codex command
  line is bundled inside the editor extension and is not on the path (2026-10-28).
- A Codex thread written in segments is several sessions here with one ID; resuming any of them resumes
  the whole thread.
- An archived Codex session: Codex asks to unarchive it, or says to run its unarchive command first —
  both appear in its program; which one the interactive resume shows was not tried, because trying it
  can change Codex's data.
- A Codex session begun in Codex's app or editor extension sits in the same store and is resumed the
  same way; resuming one from the command line was not tried here.
- Resuming a Claude Code session from another directory makes Claude Code itself print the same
  `cd … && claude --resume …` line, which is why the command changes directory first; Codex otherwise
  asks whether to use the session's directory, and Grok keeps its sessions by directory.
- agy resumes a conversation by ID with `--conversation` (its help, agy 1.4.9). What it does when the
  conversation is resumed from a directory other than the one it ran in was not tried, because trying
  it writes to agy's data.
- A session still open in another terminal: the agent side decides what a second resume does.

**Where the ID does not appear**
- The Sessions tab's rows, the overview card's rows and global search hits are unchanged: the page
  header only.

**What agent data can do on the page**
- The ID and the project path are drawn as text in the meta line and the tooltip; nothing in them is
  interpreted as markup. Their only way out of the page is the copied command, bounded by
  session-view::CON-002.

### UI decisions: the session page header (prototype confirmed 2026-10-28)

- **Layout**: the ID at the end of the meta line, as one unbreakable run (a narrow window wraps
  before it, never inside it); the three buttons at the right end of the title row, after the title
  and the startup hint. The meta line is set at 12px.
- **The buttons**: the stale note's copy-button geometry — a fixed 22px box with a 12px icon
  centred, the line colour as border, the secondary text colour as icon, the accent colour and the
  stronger line colour on hover. A copy's check recolours the icon in the accent colour and leaves
  the border at rest. A disabled button is dimmed and does not change on hover. Icons (Lucide): copy
  the ID = Copy, the product's settled copy icon; show in Finder = FolderOpen; copy the resume
  command = SquareTerminal — boxed, so it stays distinct from the Terminal icon on the question
  rows' tool counts.
- **The tooltip**: the product's shared tooltip form — the chart tooltip's fixed dark ground, instant —
  below its button and right-aligned to it, kept
  inside the window, at most 440px wide, the command in the monospaced face wrapping anywhere; the stale
  warning in a warm colour on the next line.
- **The no-ID form and the failure toasts** as session-view::US-001/AC-09 and AC-10; the wording of
  the no-ID form is neutral on purpose, true both when the record has no ID and while a restored
  page waits for its live replacement.

## The Antigravity CLI side

An Antigravity CLI session is one conversation (ADR-0037): its database holds the usage
([token-stats::REQ-003](token-stats.md)), and its full transcript — `transcript_full.jsonl` in agy's
per-conversation directory, a JSON line per step — holds the questions and turns, read by byte range
and never used for tokens. The transcript facts below come from every transcript on this machine on
2026-10-28: 104 lines in 15 conversations.

### session-view::REQ-003 Antigravity sessions in the list

Applies to: Antigravity conversations in a project's Sessions tab, its overview card and global search.

- session-view::REQ-003/AC-01: A session is one conversation database, identified by its path, in the
  project [token-stats::REQ-003/AC-08](token-stats.md) credits it to. A subagent conversation
  ([token-stats::REQ-003/AC-07](token-stats.md)) gets no row of its own.
- session-view::REQ-003/AC-02: A conversation with no question (session-view::REQ-004/AC-01) is not
  listed and its tokens count (A3a). This covers the empty conversation agy creates each time its
  interface is opened and nothing is sent, and a fork that has asked nothing of its own.
- session-view::REQ-003/AC-03: The title is agy's own title for the conversation, from its
  conversation summaries, falling back to the first indexed question when agy has none or its
  summaries cannot be read — the priority rule the Codex and Grok sides follow (A4, G2). The
  summaries are read under [token-stats::CON-002](token-stats.md).
- session-view::REQ-003/AC-04: Last activity is the largest step timestamp in the conversation's database
  (A1's "largest timestamp inside the file").
- session-view::REQ-003/AC-05: The row's token figure is the conversation's own usage under
  [token-stats::REQ-003](token-stats.md), a fork's copied calls excluded.
- session-view::REQ-003/AC-06: A row carries the Antigravity side badge
  ([agents-overview::CON-004](agents-overview.md)), and a fork's row carries the fork marker, as a
  stripped Codex fork's does (session-view::REQ-005/AC-05).

### session-view::REQ-004 Antigravity questions and turns

Applies to: opening an Antigravity session, expanding its turns and searching it.

- session-view::REQ-004/AC-01: A question is a user-input line, and its text is the body of the line's
  user-request block; the blocks agy appends after it (additional metadata, a settings change) are not
  part of the question. Every user-input line measured (24) carries the request block, followed by the
  additional-metadata block and, in 13 of them, a settings change. A user-input line without a request block is listed whole, so that
  nothing is lost (ADR-0036's rule); one whose request is empty is not a question. A system-message
  line — agy's notices, a timer firing, a subagent's message — is never a question.
- session-view::REQ-004/AC-02: A turn runs from its question's line to the next question's line (C1)
  and is read by byte range (C2); opening a session reads only the questions' ranges, never the whole
  transcript.
- session-view::REQ-004/AC-03: A rewind leaves the undone lines in the transcript and writes the redo
  under the same step indices (measured). A line whose step index is not greater than an earlier line's
  starts a redo: every line from the first one carrying that index up to the redo is abandoned. An
  abandoned question takes no number, is not listed, opens nothing and is not searched — the page shows
  what the conversation finally became (B3).
- session-view::REQ-004/AC-04: Inside a turn, an assistant-response line's text is prose and its
  thinking renders as a thinking block: agy's thinking is plain text (19 of 44 assistant lines carry it,
  measured), so this side is the first whose thinking block has content (C6). Each tool call — its name
  and arguments — pairs with the result line that follows it, in order: the format carries no call id,
  and each of the 24 measured calls is followed by exactly one result line. A result line's text is the
  call's return, a failed or still-running call's included.
- session-view::REQ-004/AC-05: A tool call named `invoke_subagent` is a subagent block (C3). Its
  arguments are the dispatch; its return is the message the dispatched conversation sends back — the
  system-message line whose sender is the conversation id the dispatch's result names — and never the
  dispatch's own result, which only echoes that the subagent was created. The subagent's own steps
  stay unattributed: its transcript is not read, since the read allow-list admits listed sessions only
  (R1). A dispatch whose subagent sent nothing back (cancelled, measured) shows no return.
- session-view::REQ-004/AC-06: A failed model call's error line renders as prose, as a failed call
  does on the Claude side, where Claude Code writes it as assistant text. Every other system-message
  line is harness noise and is not rendered (C8). A line of any type outside user input, assistant
  response, tool result, system message and error leaves the unknown trace (C8).
- session-view::REQ-004/AC-07: The turn volume counts tool calls other than `invoke_subagent`, and
  subagent dispatches as `invoke_subagent` calls.
- session-view::REQ-004/AC-08: A conversation whose transcript is missing — the empty conversation agy
  creates has none (measured) — has no question. A line that will not parse is skipped without
  discarding the rest of the file.
- session-view::REQ-004/AC-09: A listed session enters the read allow-list (R1) by its database's
  path, the session's identity, and its transcript is read only through that entry: the main process
  derives the transcript's path from the admitted database path and never takes one from the
  renderer. A subagent conversation's database is not on the list, so neither it nor its transcript
  can be read or shown. The list holds the identities every channel is given, which is also what
  keeps Finder from ever being handed a transcript (session-view::US-001/AC-07).

### session-view::REQ-005 Antigravity forks

Applies to: a conversation made by agy's `/fork`, or by switching the custom agent, which forks.

- session-view::REQ-005/AC-01: A fork is marked as one: its page opens with the stripped-fork banner
  (B2's info level), saying it was forked from «parent title», that the copied history was stripped
  and that only what follows the fork is shown, the parent's title linking to the parent's page
  (P2).
- session-view::REQ-005/AC-02: The parent is the conversation the fork's copied steps came from, named by
  the source of the last copied step in the fork's database: copied steps keep the parent's
  conversation id as their source, while the fork's own metadata names no parent (measured). The
  parent's title follows session-view::REQ-003/AC-03.
- session-view::REQ-005/AC-03: The question list holds only the fork's own questions. agy writes no
  copied history into a fork's transcript (measured), so nothing is stripped from it and no fingerprint
  check runs, unlike a Codex replay (B2).
- session-view::REQ-005/AC-04: When the parent's database is no longer on this machine, the banner says
  the session was forked from a session that is no longer on this machine, with no link; the rest of
  the page is unchanged.
- session-view::REQ-005/AC-05: The fork state reaches the session list, the hit groups and global search
  as a stripped Codex fork's does; the uncertain state never arises on this side.

### Failure modes and boundaries: Antigravity sessions

- A session open while agy is still working in it: a snapshot update refetches the page by transfusion
  (P5), and a changed transcript has its index rebuilt for that file only (C4).
- agy rewrites a transcript when it compacts the context (its documented behaviour, not observed here):
  the signature changes, the index is rebuilt (C4), and turn identities that no longer match are
  refused rather than answered from the old offsets (session-view::REQ-001/AC-04).
- A rewind while the session page is open: the next snapshot drops the abandoned question
  (session-view::REQ-004/AC-03); an expanded turn whose identity no longer matches is not answered from
  the old range (session-view::REQ-001/AC-04).
- The parent of an open fork is deleted: after the next scan the banner switches to the no-longer-here
  form (session-view::REQ-005/AC-04).
- A fork of a fork (not observed): the parent named is the source of the last copied step, the
  conversation the nearest copied content came from.
- A subagent dispatched and later messaged again: its second message is a system-message line with the
  same sender, inside whichever turn it arrives in; only a dispatch's own turn shows a return.
- The header's ID and resume command (session-view::US-001): a fork has its own conversation ID, so its
  command resumes the fork, never its parent; a subagent conversation has no page and so no command. No
  saved Antigravity page predates the session ID, so session-view::CON-003's restore never applies to
  one.
- Introduced content: agy's prose holds markdown links to workspace files (`file://…`, in 10 of the 44
  assistant lines measured). Prose renders as text on every side, so they show as written and nothing
  in them can be clicked; no navigation surface is added. Titles from agy's summaries render as text.
- A rewind back to a step inside a turn rather than to a question (not observed; the measured rewind
  went back to a question): the undone lines stay inside that turn's byte range and are not shown
  when it opens. A project's full-text search still counts a hit in them as a hit of that turn — the
  one place an undone line can be found.
- A subagent that sends more than one message back within its dispatch's turn: the return shows them
  in order.
- agy's summaries not there, or not in the shape titles are read from: every title falls back to the
  first question. A read that fails while agy writes them keeps the titles last read. agy titles a
  conversation after its first reply, without the conversation's own files changing: the title
  appears at the next scan, the summaries being read at every one.
- The fork pill on an Antigravity row says the copied history was stripped, rather than a replayed
  prefix — a copy variant of the drawn pill.
- A fork's parent that cannot be read in the supported format is left out like any such conversation
  (token-stats::REQ-004/AC-01), so the fork's banner takes the no-longer-here form — inexact in that
  case, which needs the parent rewritten in a new format while the fork itself still reads.

## Implementation Decisions

- **Judging a hit row** (session-view::REQ-002): by laying the row out before it is painted — the
  whole question first, then the 20-character window, then the keyword, each step after the previous
  one is laid out — and from the beginning again when the row's width, text or keyword changes. The
  ellipsis's width is measured on a hidden probe in the row, once per font: the computed `font`
  shorthand cannot serve, since the row's tabular figures leave it empty.
- **Restored answer identity** (ADR-0029): each displayed question carries a fingerprint of its
  source file identity, byte position and raw question record. Turn queries key by that fingerprint
  as well as path and ordinal. A read validates the selected question and its answer in one range
  operation (one streaming pass for compressed files), checks that the source stayed unchanged,
  and refuses a mismatching fingerprint. Appending later questions preserves unchanged identities.
- **Offset index**: the scan records `{question offset, turn start and end offsets, time, that turn's
  tool and subagent counts}` — **with no question text** (see D2a). Stored in the existing cache keyed
  by a `path + mtime + size` signature. Fetching streams the byte range.
  Scan timings must be taken under Electron, in the main process or one of its worker threads, not
  under Node: the same reader over the same bytes ran about twelve times slower under Electron at the
  stream's default chunk size, which is what made startup take minutes once the data grew to gigabytes
  (see the AGENTS.md invariant on main-process measurements).
  **A turn's end point is "the end of the last parseable line", not the file's byte size**: an active
  session may be mid-line, and that half line neither parses nor should be sliced into a range.
  **Per-side "turn volume" criteria (full enumeration, not sampling)**:
  - Claude tools = `tool_use` segments (the only call segment type in the whole repository); a
    subagent dispatch = the tool name `Agent` (152 occurrences) or `Task` (4), two generations of
    the same tool's name, both taking `description` + `prompt` + `subagent_type`. **"The arguments
    contain `subagent_type`" is not a usable criterion**: one `TaskCreate` carries it and 5 `Agent`
    calls omit this optional parameter. Tools on sidechain lines count toward the subagent number
    and are not counted again in the parent turn.
  - Codex tools = `response_item`'s `custom_tool_call` + `function_call` + **`tool_search_call`**; a
    subagent dispatch = a `function_call` named `spawn_agent`. Only the `response_item` path is taken;
    the `event_msg` path is a UI event mirror of the same calls (and has only `*_end`, no `*_begin`),
    so counting both would double it.
  - Grok tools = tool_call records except spawn_subagent; a subagent dispatch = a tool_call named
    spawn_subagent (the subagent_spawned/finished records are its typed mirror and are not counted
    again — the same double-write rule as the Codex event_msg path).
  **When `CACHE_VERSION` must be bumped** (the current value and the per-version change log are
  maintained **only** in the CACHE_VERSION comment in token-stats.ts and are not duplicated here):
  1. Changing `FileAgg`'s **shape** — without a bump an old cache crashes on a missing field. A
     shape change is caught by a test over the field set; nothing automated catches a changed
     computation, so every change to how a field is computed counts as a trigger of its own.
  2. Changing **how a field in `FileAgg` is computed**: the signature still hits and the shape is
     still valid, so without a bump existing files return the old value forever.
  **Also**: a cached entry is checked for every required field when it is read, and a newly
  required field joins that check at the same time. The version number
  only catches across versions, and manual corruption or drift within a version is caught only by
  that guard — a missing field would otherwise flow all the way to the contract layer and throw away
  the whole detail payload (upward escape).
- **Normalising the sides**: the common model = `{time, role, text, tool call (name/args/result),
  reasoning block?}`. The Codex side needs two things Claude does not: choosing one of the two
  written streams (take `event_msg`) and stripping the fork replay prefix. The model is a
  discriminated union on `kind`; the IPC boundary validates against a kind allow-list and rejects
  unknown kinds. The prose carrier follows from full enumeration: the entire spectrum of assistant
  segment types on Claude's main chain is only tool_use / text / thinking, so prose = the `text`
  segment; Codex prose = `event_msg/agent_message` (whose message is always a string), taking the
  same event_msg path as the question side. In a paginated rollout the prose carrier is the
  completed-item event's `AgentMessage` item and the question its `UserMessage` item (C8, B1) — the
  same event path, one generation on. Every type with no block of its own leaves the "unknown types
  are discoverable" trace and is never silently dropped (the AGENTS.md allow-list invariant).
- **Cold rollouts**: the index signature and the cache key use the compressed path, as does the read
  allow-list (R1).
- **IPC**: the session list rides on the project detail, and on the project figures every scan sends
  beside the snapshot, which a project's page draws in preference
  ([project-detail::REQ-005](project-detail.md)). The session page payload is self-contained
  (title / volume / fork state / question text), with the text read live by the main process by byte
  range.
  **On-demand answer fetching**: a turn's range can only come from the application's own index, held
  where the scan runs (ADR-0043; the renderer cannot supply byte ranges), with the same allow-list
  check first; the payload carries the
  bytes read as evidence of "nothing was read whole". A read-only freshness predicate lets the
  renderer decide whether to show the interim "rebuilding the index for this file only" state, while
  the rebuild itself is still triggered by the fetch call (idempotent, and the file changing between
  the two steps is harmless).
- **The query layer** (ADR-0028): opening, jumping and returning run inside a transition held by the
  same detail-slot Suspense boundary as project detail, whose fallback draws nothing. A snapshot
  arrival invalidates the page's query (P5); every mount
  revalidates; window focus does not refetch; nothing is retried; the query resolves to a result
  value (the page, or the failure) and never throws, so the page's error state stays a branch of the
  page. Page-local state is keyed by the session file.
- **Prefetching** (an optional optimisation): prefetch a few adjacent turns as the question list moves,
  turning "there when you click" into "there before you click".
- **The session ID** (session-view::US-001): the session page payload gains the session ID, a
  non-empty string or null, and the contract (R3) admits exactly those two. The main process
  produces it: for Claude Code, Grok and Antigravity from the file path alone (the file name without
  its extension; the session directory's name; the conversation database's name without its
  extension), and the display copy's restore applies the same rule (session-view::CON-003); for
  Codex from the session-metadata ID the scan already reads into its cached per-file record, null
  where that record has none. Only an absent field is filled in on restore; a present but malformed
  one is still dropped by validation, as for the project memory's main file.
- **Showing the record file** takes the session's file path and asks Finder to show it. Admission is
  session-view::R1's exact-path allow-list first, before any file system call; then the path must
  still exist — and, for an entry restored before the first scan, be a regular file — because
  Finder's own call reports no failure. A refusal or a missing file is a structured error
  (ADR-0015).
- **The resume command** is built from the agent side, the session ID and the project directory,
  carrying session-view::CON-002's quoting; copying goes through the clipboard channel. The session
  page is given its project's directory and stale flag from the project entry it opened in, on every
  route. The header's buttons are keyed by the session file, as the page body is, so their state does
  not follow a jump to the fork parent.
- **The tooltip** is a viewport-positioned layer, so no ancestor clips it, and it closes on scroll
  and on resize (the AGENTS.md floating-layer invariant: a layer that is glanced at is dismissed).
  Its warning line takes a colour of the static class, declared for light and for dark alike, since
  the tooltip's dark ground does not change with either.
- **Icons and copy**: the labels, tooltips, the no-ID form and the two failure messages exist in both
  languages; "Copied" reuses the stale note's wording, a synonymous action.
- **The Antigravity CLI side** (session-view::REQ-003 to REQ-005): the per-file aggregate of a
  conversation carries, beside its calls, what its database says of it as a session — its own id as
  its trajectory table records it, whether it is a subagent, its largest step time, and for a fork
  the source of its last copied step — and its transcript's question index, built in the same parse
  (on the parse workers).
  The entry's signature adds the transcript's modification time and size to the database's, so a
  transcript agy appended to is indexed again (C4); the cache structure version moves with the
  shape. agy's titles are read from its summaries database once per scan under token-stats::CON-002,
  keyed by the conversation's own id, not kept in the per-file entry. The page's byte figure is the
  database's size, the record file's. The rewind rule is read as: a line is undone exactly when a
  later line's step index is not greater than its own (equivalent to session-view::REQ-004/AC-03
  whenever an earlier line carries the redo's index; a line without a step index is neither a redo
  nor undone). A turn runs to the next kept question, less a trailing run of undone lines; undone
  lines inside it — always followed by their redo within the same range — are dropped by applying
  the same rule to the range, and the turn's call counts include kept lines only. A question's text
  is the request body normalised as every side's questions are; the other harnesses' noise shapes
  are not stripped from it.

## Out of Scope

- agy's truncated transcript (`transcript.jsonl`) and the step payloads in its databases as sources of
  turn contents (ADR-0037 option 10).
- Rendering a subagent's own steps inside the dispatching turn: its transcript is not read
  (session-view::REQ-004/AC-05).
- Searching across projects — that is global search, a feature of its own ([global-search](global-search.md));
  this spec's search is within one project.
- Unregistered projects' sessions.
- Editing or deleting session contents, and resuming a session from inside the product: it hands over a
  command to copy (session-view::US-001) and runs none (session-view::CON-001).
- The session ID or its buttons on the Sessions tab's rows, the overview card or global search hits
  (the page header only).
- Finding where an agent side's tool is installed, opening a terminal, or resuming in an agent's own app
  or editor extension.
- Codex's reasoning body (encrypted, impossible), Claude's truncated tool result originals (the sidecar
  files have no reference chain), and the real times in a Codex replayed span (which would require
  cross-file alignment).
- **The export feature entirely**, including a Markdown export and a fidelity-preserving backup
  export (sequence E is archived only).
- Sessions the agent had already cleaned up before this app first ran.
- Rendering MCP tool calls and web searches inside a turn. The legacy format records them only as
  end events (classified as noise) and the paginated format as completed items (`McpToolCall`,
  `WebSearch`) that carry the arguments and results; showing them is a new block source with its own
  pairing and copy questions.
- Questions inside a compacted window: only the compacted checkpoint's replacement history holds
  them, once per window, so a thread with many windows repeats them many times over. They have no
  turn to fetch, only a summary, and showing that is a session page design question that needs a
  prototype. A compacted session therefore lists fewer questions than it did before the compaction,
  and nothing marks it.
- Persisting session search results or search state across restarts (P9).
- A pending indicator on the clicked row while a first open is in flight: a new visible state that
  needs a prototype.
- Stripping text the agent tools write into a session as user entries beyond the shapes A4 and B1 name:
  a compaction summary, a message from a subagent or another session, Codex's ambient UI state, its
  file lists and its question replies are titled, counted, listed and searched as questions (ADR-0036).

## Further Notes

- Performance is not the threshold; the real constraints are memory and render volume, both dissolved by the "question trunk + fetch
  on demand" design; and the two sides' data structures differ greatly, with inherently unequal
  completeness.
