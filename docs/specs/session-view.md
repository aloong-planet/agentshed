# Session view

> Related: ADR-0038 (test layers) · ADR-0001 (the IPC contract, structured errors) · ADR-0027 (Codex usage records and paginated rollouts) · ADR-0028 (query layer) · ADR-0053 (saved display pages, and the turns they keep) · ADR-0018 (icons) · ADR-0037 (Antigravity CLI side) · ADR-0043 (a scan runs on a worker thread) · ADR-0045 (the token engine as one Rust module) · ADR-0054 (the turn read and its assembly in the engine module) · ADR-0052 (a project's search in the engine module)

## Problem Statement

Session records sit in the agent sides' data directories, with no way for a user to look back at
"what did I ask before and what answer did I get".

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
  time is **the largest timestamp inside the file**, taken over **all lines**, user messages included.
  With no timestamp, Claude falls back to mtime and Codex has no fallback.
  The project list's activity sort takes another time, the file mtime (CONTEXT: Activity); its session
  count, once the token statistics are built, is the number of listed sessions.
- A2 **Unregistered projects' sessions are not listed**.
- A3 Subagent sessions do not get their own rows (unchanged) but can be expanded inside the main
  session (see C3).
- A3a **A session containing no real human question is likewise not listed, and its tokens still
  count** — structurally identical to A3's rule for subagents. A warmup session Claude Code opens by
  itself is one.
  ⚠️ As a result **the session count and the token card's denominator do not match**, which must be
  stated in the UI (alongside the subagent note).
- A4 Title: after stripping known noise, take **the first real user message**; Codex prefers
  `thread_name`, falling back to the first `user_message` the same way. If stripping leaves nothing
  real → fall back to the filename (such a session is not listed anyway, per A3a).
  **Noise shapes follow real sampling** (297 sessions, 2026-08-02):
  | Shape | Handling |
  |---|---|
  | `Warmup` (the whole message is that one word) | Discard the whole message (**only on exact equality**, so a real question containing the word is not caught) |
  | `[cron:<uuid> <name>] <the actual instruction>` | **Strip only the bracket, keep the instruction after it** — that is a real question |
  | `<local-command-*>…` (the caveat disclaimer / stdout command output) | Discard the whole message (**match by family prefix**, since the same mechanism produces sibling tags) |
  | `<command-message>…</command-message><command-name>/x</command-name><command-args>real content</command-args>` | **Take the contents of `command-args`**; if empty (e.g. `/clear`), discard the whole message |
  | `Base directory for this skill: …` | Discard the whole message (injected skill body) |
  The "Conversation info" and OpenClaw-transcript injections are not stripped: they occur only in
  unregistered projects, which A2 never lists, and no injected shape joins the list (ADR-0036).
  ⚠️ Noise is not confined to the first message: a caveat is often followed by
  `<command-name>/clear</command-name>`, with the real question third. **You have to walk forward
  entry by entry, not just look at the first one.**
  ⚠️ Noise is **layered**: `<local-command-stdout>` only surfaces as a second layer after the first
  few are stripped.
  ⚠️ `[Image #N] <real question>` **is not noise**: the whole message is the question.
- A5 A project with no sessions → an empty state.
- A6 A session row shows the side badge, title, question count, token consumption and last activity
  as a relative time.

**Sequence B: the question list (opening a session)**
- B1 The trunk lists **human questions only**: Claude takes `type=user` where content is a string or an
  array containing a `text` segment; Codex takes the human's message event — `event_msg/user_message`
  in a legacy rollout and, in a paginated rollout, its replacement: the completed-item event whose
  item is a user message (`event_msg/item_completed` with item type `UserMessage`). Its
  harness-injected shapes (full enumeration, 2026-09-11; none mixed with a human sentence) are three
  prefix families the shared stripping removes, beside the Claude shapes: the guardian's transcript
  preamble, a task notification, a delegation block. Any other injected shape is a question
  (ADR-0036). `response_item/message` is **never** a question source: it mixes in
  `<environment_context>` / AGENTS.md injected content, so a paginated rollout without a user-message
  item has no question (A3a).
  Three further rules hold:
  1. Tool results are excluded by taking only `text` segments: **`tool_result` never co-occurs with
     `text`** in one content array (full enumeration), and a `tool_result` segment has no `text` field
     of its own.
  2. **Lines with `isSidechain` do not count as human questions** — that is a subagent's own
     transcript, whose "user message" is the prompt the parent session dispatched to it.
  3. Question identification and title stripping **must share a source**: one indexer decides "which
     line is the first real question".
- B2 **Codex replay prefix stripping**: show only what is new since this fork, with a note at the top
  saying "forked from X · earlier history is in that session". The stripping rule depends on the
  parent file being in the scan set; when it is not, degrade to a heuristic and **label the
  uncertainty explicitly** (a wrong strip is never silent).
  **Paginated children carry no replayed events**: Codex copies neither usage records nor
  completed-item events into a fork or subagent thread in paginated mode, so such a child's question
  set is entirely its own and the fingerprint check is not run for it. Such a session has fork state
  none: no stripping, no uncertainty warning, and no fork banner and no parent link either, although
  it is a fork. The replayed `response_item` messages it does inherit are not questions under B1.
  Legacy children keep the rules below unchanged.
  - **Identify the replayed span by content fingerprint, not by timestamp** — a replay **rewrites
    the timestamps**. Each question in the index carries a 32-bit fingerprint (see D2a).
  - **Do not strip if the entry-by-entry fingerprint check does not pass**; when the parent is
    missing, use the burst heuristic (a replay is written by a program in one go with near-zero
    inter-line gaps, computed independently of the token side's), and **never strip it empty** (if
    the whole span looks like a burst, keep the last entry). The burst judgement **stops at a negative
    (out-of-order) timestamp difference**, as the token side's does.
  - **A fork verified to have been stripped empty is not listed, and its tokens still count** (A3a):
    a session whose parent is in the scan set, every one of whose questions is fingerprint-verified as
    a replay, and which has no new question after the fork, including the "uncertain" empty strip
    where the child's whole span matches but is shorter than the parent's replayed span. The read
    allow-list still follows the pre-strip rule.
  - **Re-deriving the title after stripping applies only to sessions whose title comes from the
    first question**: `thread_name`'s priority (A4) is not invalidated by stripping, and the cache
    entry records the title's origin for this purpose. The re-derived title is the session's title
    wherever the session is named — the list and global search, its session page, a project's own
    session search, and the parent title on the banner of a fork of it — so they agree. The line it
    is re-derived from is read back each time one of them is built; where that read fails (the file
    deleted or compressed since the scan), that surface keeps the title the session was parsed with,
    and nothing else is affected.
  - **The display-side stripping does not reuse the token side's replay start**: the metering rule
    is deduplication, the display rule is "what this conversation looks like".
  - **The three states are distinguishable in the data**: `none` (not a fork) / `stripped` (verified
    and stripped) / `uncertain` (parent missing or the check did not match), and they enter the IPC
    contract.
- B3 **Claude branch resolution walks back from the last leaf**: follow the parent chain from the last
  entry back to the root and render only that chain (i.e. "what this conversation finally became"),
  without showing abandoned branches.
  Two rules hold:
  1. **The starting point is not "the file's last entry" but the last non-`isSidechain` line.** A file
     often ends on a sidechain line, whose `parentUuid` is always null and whose children point only
     within the sidechain.
  2. **The parent pointer is `parentUuid ?? logicalParentUuid`.** Context compaction inserts a
     `type=system` / `subtype=compact_boundary` line whose `parentUuid` is broken, and
     `logicalParentUuid` is the bridge to the pre-compaction history.
  **Questions with no uuid are kept**: when it cannot be told whether one is on the chain, it is not
  lost.
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
  **A cold rollout** (a `.jsonl.zst` file) has no byte-addressable ranges: its offsets
  are offsets in the decompressed stream, and every range read of it is one streaming decompression
  from the start, through every frame, by the reader the scan reads it with (token-stats B12), that
  serves the requested ranges in order and stops at the last one — opening the session is one pass
  for all its question texts, expanding a turn is one pass to that turn, a question search is one pass
  per file, and a full-text search adds one to the stream's end (D2, D3). Memory follows the bytes in flight, never the
  file. The decompression holds neither the main process nor the thread pool its plain file reads
  share, and four reads at most decompress at once for the main process,
  D2b's cap, whichever surface asks them, a full-text search of a cold rollout taking a place as a read
  does: every expanded turn reads its own, all of them again on a revisit, and a search goes on after
  the next one starts; the others wait their turn in the order asked. The scan worker, which reads a
  cold rollout only for a stripped fork's title (B2), counts four of its own. A truncated cold rollout never reaches the session
  page: the scan skips it (token-stats B12).
  **Expanding a turn**, plain or cold, reads its question's range and its body's in one pass that
  stops at the turn's end, the body a line at a time, so that no copy of the whole turn is held: at its peak the read
  holds the turn's text twice, as the lines read and as the strings shown, and never more than one line of it in one
  piece. A plain file's turn read is one of D2b's four plain reads; a cold rollout's takes one of the four places above.
  **The turn limit**: a turn whose body, everything after its question up to the next one (C1), is longer
  than 64 MiB (67,108,864 bytes) by these offsets is never read; a body of exactly the limit is read. Its row takes the
  in-turn failure state with a reason of its own, the body's size and the limit, never "the file can no longer be read".
  The size is known from the index before anything is read, so the session's other turns, its questions and its
  figures are as they were, and clicking the row again gets the same reason. A kept turn that grows past the limit under
  the same question is drawn from what was kept when next opened, then refreshed to the reason, which replaces what was
  kept, and from then on is kept nowhere.
  **The keep size** (ADR-0053): a turn whose body by these offsets is longer than 8 MiB (8,388,608 bytes)
  is shown whole when fetched, but kept neither in the saved display copy (REQ-001) nor in memory once its row closes:
  opening it again fetches it again, with the fetching notice, and after a relaunch it is fetched as one never read. A
  body of exactly the size is kept. A turn kept while within the size that grows past it under the same question is
  drawn from what was kept when next opened, then refreshed, and from that fetch on is kept nowhere.
  **The total** (ADR-0053): the turns kept, in the display copy and in memory, together stay within
  128 Mi (134,217,728) UTF-16 units of their serialised form. When a newly fetched turn does not fit beside them, the
  earliest fetched leave first until it does, and one that leaves is fetched again, with the fetching notice, when next
  opened; a turn over the total alone is not kept. Fetching a kept turn again makes it the latest fetched. A saved copy
  is cut to the total in effect when it is restored, the earliest fetched leaving first.
- C3 Subagents **expand in place inside the turn**: Claude's `subagents/` subfiles and inline sidechain
  records, and Codex's subagent threads, all sit under the step that dispatched them.
  **"Sitting under the dispatching step" cannot be reliably achieved on either side** — every
  candidate join key was measured and fails: `toolUseResult.agentId` and sidechain `agentId` are
  different namespaces; dispatch lines have no `promptId`; `outputFile` points at a background task's
  output file rather than the transcript; a sidechain's first-line text does not equal the dispatch
  prompt; and Codex's `spawn_agent` output has no thread id. The sub block on every side is unified
  as **the dispatch arguments + the return + an unattributed warning**, with sidechain lines not
  rendered (a known type whose full transcript is in the source or nested file).
- C4 An invalid index (the file was appended to or rewritten, so the signature does not match) →
  **rebuild the index for that file only**, without a full rescan; verify once before fetching. The
  signature is compared on every fetch and, on a mismatch, that one file is re-parsed and **its
  entry is written back to the token store** (so it is not rebuilt again next time; a failed write is
  not the fetch's failure: the page is served from the rebuilt index, the store still lacks it, and
  the next fetch and the next scan parse the file again until a write of it lands —
  [token-stats](token-stats.md) C3); the display-side stripping for a Codex fork shares
  its source with the list (the same replay-prefix stripping and parent lookup, B2).
  An entry that is not well formed ([token-stats](token-stats.md) C2) is rebuilt the same way, with
  one difference for a Claude Code session: its index is served and **not kept**, so each fetch
  rebuilds it until a scan parses the file. The project a Claude Code session is credited to is known
  only to a scan: the rebuild keeps the project its entry held, and with no well-formed entry there is
  none to keep. The fetch of a file the store holds nothing for is refused like that of a session the
  scan never indexed. With no store to read — one that cannot be opened or made, or a read of it that
  fails ([token-stats](token-stats.md) C2, C3) — nothing tells such a session, the read allow-list
  having admitted the file: the page rebuilds its index and serves it, as for an entry that is not
  well formed, and with no store keeps it nowhere.
  A session page left open while Codex compresses its file: the plain path is gone, so
  the next fetch fails for that turn only (the in-turn error state, retry on click), and the session
  reappears under its compressed identity after the next scan — a new path, an index built once.
- C5 In the expanded contents, tool calls are collapsed by default (name + a one-line summary) and can
  be expanded to see the full arguments and return.
- C6 **The sides' completeness is unequal and must be labelled explicitly**: Codex's reasoning body
  is `encrypted_content` (**never obtainable**), with only plaintext sub-headings
  (`response_item/reasoning.summary`, a mirror of `event_msg/agent_reasoning`, taking the former to
  avoid double counting). **Every thinking segment on Claude's main chain has an empty body** (only a
  signature placeholder, measured) and no sub-heading, so a Claude turn shows no think block; an
  Antigravity turn's thinking has content (session-view::REQ-004/AC-04).
- C7 A Claude tool result whose body was too large is truncated with a sidecar `tool-results/*.txt`
  → display the truncated version with a label, without pretending it is complete. A sidecar
  reference **carries a full path** ("output saved to: …/tool-results/x"). The truncation criterion =
  the return text contains a `tool-results/` path (mechanism-based: the harness's sidecar directory;
  the word "truncated" is too generic to be a criterion). **The sidecar file is not read** (it does
  not enter the read allow-list) — only the truncated version is shown, with a label.
- C8 Harness noise is not rendered: this needs a display allow-list. `task_reminder` /
  `file-history-snapshot` / `token_count` / `thread_settings_applied` and the like are never
  displayed. **The full spectrum, enumerated**: of Claude's top-level types only assistant/user
  carry content and the others are known noise (attachment **needs no inner-type allow-list** — the
  whole thing is noise); Codex has three layers, top-level, event_msg and response_item types (prose
  comes from event_msg/agent_message, while tools and reasoning come down the response_item path,
  and the response_item paths for `message` / `agent_message` are double-write mirrors that are not
  rendered). **Unknown types outside the allow-list leave a
  trace** (an unknown block placed at the end of the block order, aggregating the count and the type
  names, with the three layers distinguished by `event_msg/` and `response_item/` prefixes; a type
  that is not a string is named by its JSON, never as `[object Object]`) — allow-list failures are
  invisible, so nothing is ever silently dropped (an AGENTS.md invariant).
  **Paginated rollouts** (full enumeration, 2026-09-10): the completed-item event
  carries a typed item in place of the legacy events — `AgentMessage` is the prose carrier (the
  legacy `event_msg/agent_message` is absent from paginated rollouts), `UserMessage` is the question
  (B1), and `Reasoning`, `FileChange`, `McpToolCall`, `CommandExecution`, `WebSearch`,
  `DynamicToolCall`, `CollabAgentToolCall`, `ImageView`, `Extension`, `SubAgentActivity` and
  `ContextCompaction` are never rendered: `Reasoning`, `CommandExecution`, `DynamicToolCall` and
  `FileChange` accompany `response_item` records that are rendered already, while `McpToolCall` and
  `WebSearch` carry calls whose legacy records (the MCP and web-search end events) were never
  rendered either. **MCP tool calls and web searches are therefore invisible inside a turn on both
  formats** (Out of Scope).
  The usage record, the compacted checkpoint, the world state, the thread settings event and the
  compaction marker on the response path (`response_item/compaction`, an encrypted body and nothing
  else) are noise inside a turn. An item type outside this enumeration leaves the unknown trace.
- C9 A tool return that was never fed back within its turn (an asynchronous tool spanning turns)
  shows as having no return record; the real return stays in the range of the later turn it
  physically belongs to.
- C10 Clicking an expanded question collapses its turn.

**Sequence G: the Grok side** (full enumeration of its update types, 2026-08-16)
- G1 A question = the run of user_message_chunk records sharing one promptIndex; chunks concatenate
  **raw**, and a prompt opening with an injected `<system-reminder>` notice starts no question (A3a).
- G2 The title takes summary.json's own name first, falling back to the first indexed question — the
  same source as the question set.
- G3 One assistant message can split across agent_message_chunk records mid-word with state records
  between the fragments, so prose and thought chunks merge raw and the ten enumerated state types
  neither render nor break the merge; anything outside the enumeration leaves the unknown trace.
- G4 Tool calls pair with their updates by toolCallId. A spawn_subagent dispatch is a sub block:
  name from the paired subagent_spawned, result from the in-turn subagent_finished output, or that
  record's error when the output is not a non-empty string — never the "started in background" echo —
  and its internal steps stay unattributed (the child stream is not read; the read allow-list admits
  listed streams only, so a subagent stream is refused).
- G5 No fork mechanism exists on this side: nothing is stripped and forkState is always none.

**Sequence D: search**
- D1 **Questions are searched by default** (small, clean, precise hits), with full-text search as an
  optional toggle.
- D2 No inverted index is built. Searching questions reads each question's range by the offset index
  and matches its text (D4); full-text search reads the file's stream a line at a time, a plain file and
  a cold rollout alike, and matches bytes, holding only the line in flight, so a file's size no longer
  bounds what can be searched. Both run in the engine module, so a search neither ends nor holds the
  main process (C2, ADR-0052). A line longer than the line limit ([token-stats](token-stats.md) A10)
  is not held whole: it fails the search of its file (D3). Full-text search **parses nothing** but the
  line of each turn's first body hit, for its snippet (D5).
- D2a **The question index stores offsets and one content fingerprint, and no question text at
  all — not even a truncated preview.** Each file's entry in the token store, which carries that
  index, also holds the session's title, the fallback title its first question gives, or both (A4,
  session-view::REQ-003/AC-03); a title taken from the first question is that question, clipped.
  **The fingerprint** (B2) is four bytes per entry, not reversible into text, and unusable for search.
  Question text is read from its range on demand (the live question list and search share that
  path). The startup display copy is the explicit exception in session-view::REQ-001; it is
  not searched or used as an offset index.
  The ellipsis on a list row is **display-layer truncation**, not data-layer: the full text is laid
  out when it expands.
- D2b **File reads go through bounded concurrency of 4.** The range-read paths (question
  list, search) and the turn read (on-demand fetch, C2) all go through it; the token scan is not bound by it, its files being parsed
  on a pool of worker threads ([token-stats](token-stats.md), Implementation Decisions, Where parsing runs).
  Four is Node's default libuv thread pool size, so a larger cap for the reads of plain files needs
  `UV_THREADPOOL_SIZE` raised with it (a cold rollout's decompression runs on threads of its own, C2).
- D3 Full-text search must **deduplicate**: without it, the same sentence in a fork's replay copy is
  reported once per generation of a fork chain.
  A cold rollout is searched in question mode and full-text mode alike, by the passes C2 counts.
  A session whose file cannot be read is left out, in either mode, and the other sessions' hits stay.
  In full-text mode a file that cannot be read to its stream's end after its questions were read —
  a cold rollout cut short (token-stats B12), one that is not zstd, one gone or unreadable since, one
  with a line longer than the line limit (token-stats A10) —
  loses its full-text part alone: nothing its search found counts, neither body hits nor folded
  ones, and its question hits stay.
  The match is case-insensitive.
- D4 A hit locates "which question in which session", clickable to go straight there. **The locating
  highlight for a hit**: on arrival a yellow background pulse **holds for 10 s** (8 s steady, fading
  over the last 2 s; in the same colour family as mark, distinct from hover's purple), after which a
  **3px accent bar stays at the left edge**, cleared by clicking any question row; a remount such as
  changing the sort does not replay the pulse (the played state is remembered). Its colours are
  appearance-varying (CONTEXT: Theme variable classes).
  **The page scrolls to the row once**, when the row arrives: on opening, or on the background refresh that brings it in
  when a saved page predates the question (P4). The position is then the reader's: nothing that re-renders the page —
  the display clock, a rescan, a row click, the sort, folding a day — moves it back.
  The needle is at most 200 characters, and the session set is taken by the main process from its
  own per-project statistics, since the renderer cannot supply file paths; question mode = a question
  hits when its text, as the question list shows it (session-view::REQ-002), holds the needle once both
  are lowered by the platform's lowercase mapping: every letter's other case matches, not only ASCII's,
  quotes and backslashes match as written, and the words either side of a line break match with a space
  between them; full-text mode = question mode's hits, plus a body hit wherever a line of the stream holds
  the needle's UTF-8 bytes with ASCII letters' case folded (a needle holding a line feed matches across
  lines; a non-ASCII letter's other case, and a quote, backslash or line break in its JSON-escaped form,
  are not found), each mapped to the turn its offset falls in: one inside a question's own range is
  question mode's, and those outside the displayed range (an already-stripped fork prefix / an abandoned
  branch / the noise before the first question) count as `folded`, reported in the results header;
  question mode has no replay copies by construction, since the question list is already stripped. The
  search term is not preserved across sections.
- D5 In full-text mode a hit in a turn's body carries a "body" marker and a context snippet: one per
  turn, from its first body hit, the first string in that line's JSON whose lower-cased text holds
  the lower-cased needle, cut 20 characters before the hit and 60 after the needle, with an ellipsis
  on each side cut; none when the line is not JSON or no string of it holds the needle.
- D6 A search with no hits says "questions only by default — try switching to full text" instead of
  showing a blank.

**Sequence P: opening, jumping and returning** (ADR-0028; a valid saved page also qualifies
as a cached visit under session-view::REQ-001)
- P1 Opening a session (from the sessions section, the overview card or a search hit) for the first
  time without a saved page: the project page stays whole — list, search box, everything — until the session
  page is ready, then the stage switches in one frame. The row's press feedback is the only
  immediate response (a pending indicator is Out of Scope).
- P2 Jumping from a session page to its parent through the fork banner: the current page stays until
  the parent's page is ready.
- P3 Returning to the project: a cached visit of the project page (at once), its detail revalidating by
  transfusion (project-detail T8); leaving a session for a project, by returning or by selecting one in the list,
  lands on Sessions as [project-detail::REQ-004/AC-02](project-detail.md) says.
- P4 Reopening a session with a saved successful page: its page is drawn at once from what was last shown
  and revalidated in the background; page-local state (expanded turns, sort, folded days, the
  locating focus) starts fresh, keyed by the session file, and a search hit's focus still
  applies.
- P5 Snapshot update while a session page is on screen: the page is stale and refetches by
  transfusion — the question list follows the file (a live session gains its new questions) while
  the expanded turns, the sort and the folded days survive, the index being the original turn
  number.
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
- P9 Turn contents and their freshness check use the query layer (ADR-0028), retaining the
  existing in-turn states; a turn C2 does not keep leaves it once no row shows it, its fetch returning before or after
  its row closed. Session search also uses the query layer, but its results are not persisted across restarts.
- P10 A session opened directly from a global search hit has the two exits global-search::US-003
  defines ([global-search](global-search.md)) in place of the single back control; a fork parent
  reached from it keeps the single back control of P2/P3. The rest of this sequence applies, with the
  global search page in the project page's place in P1 and P8.
- P11 Turns already read stay available: expanding one again shows its saved content at once, an
  unread one waits for a read, and a failed refresh keeps the last successful content — except the turns C2 does not
  keep, and a kept turn grown past the turn limit (C2).

**Cross-cutting regression points**
- R1 Session file paths must enter the on-demand read allow-list (the same invariant as memory files
  and skill files). The application's own scan produces **an exact path set**, which the main process
  takes from the scan's result and holds (ADR-0043), and the allow-list check is the first thing done
  on a read, before any file-system call. **The rule = listed
  sessions + subagent and nested transcripts** — the latter are not in the list (A3/A3a) but
  expanding them inside a turn needs them. The Antigravity CLI side's rule is session-view::REQ-004/AC-09. Under exact
  matching, traversal, prefix lookalikes, encoding variants and NFD variants are all rejected
  because the strings are not equal, which is fail-closed (the worst case is refusing another
  spelling of the same file). A cold rollout's `.jsonl.zst` path enters the allow-list exactly like
  a plain path, and its plain twin is not on it once the plain file is gone.
- R2 This feature rides the token statistics' scan pass and leaves its figures as token-stats defines
  them (a Codex day's components measured, not apportioned, token-stats B8); its display rules are its
  own (B2).
- R3 The IPC contract validates the new fields (ADR-0001).

## UI decisions

- **Container structure = two-screen navigation + in-place expansion**: project detail gains a
  "Sessions" section (list + search) → clicking a session row replaces the whole block with the
  **session page** (an independent view with a back button) → inside the session page, clicking a
  question **expands the whole turn in place**.
- **The question list = single-line index style**: a row = index + question (single-line
  truncation) + that turn's volume (tool count / subagent count) + time. **Listed all at once, with
  no pagination and no "scroll to load more"** (B4).
- **0 turns expanded by default**: everything is collapsed on entry, and clicking a turn fetches it.
- **The expanded state**: the question row **unfolds its own full text** (multi-line paste expanded as
  written), with the whole turn's contents directly below — no separate block restating the question.
- **Grouping across days**: when a session spans days, group by day, with the group row clickable to
  collapse; plus "collapse all / expand all".
- **Sorting**:
  - The question list `ascending | descending`, **descending by default** (newest question first).
    The index is **always the original turn number** and is never renumbered by the sort; **turns
    already expanded stay expanded across a sort change**. "The original turn number" means the turn
    number **within the displayed set** (1..N). Claude's abandoned branches and Codex's
    already-stripped replay prefix take no number.
  - The session list's sort (A1) applies to **the list and the search hit groups at the same time**.
- **The overview's recent session rows carry no question count**, unlike the Sessions list's rows (A6).
- **Search hits = grouped by session**: the group header is the session (with side badge and states such
  as fork), and inside it are the matching questions + highlighted snippets; the results header shows
  the hit count, the session count and **the folded count** (D4). Answer "in which
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
  is invented. When the same day is separated by out-of-order
  timestamps, group by adjacency (two groups with the same label, whose collapsing does not cross
  over).
- **In-turn blocks**: the tool / thinking / reasoning / subagent collapsed blocks and the
  unknown-trace block; a block's expanded state resets when the turn re-renders
  (on a sort change or collapsing a day). The blocks' default copy is: no return record / no return
  / an unattributed warning.
- **In-turn fetch states**: fetching = a momentary notice on the first fetch, with an
  already-fetched turn re-expanding instantly, except one C2 does not keep; a single turn's failure = that turn gives
  the reason in a sentence in the current UI language, never the raw IPC error, without affecting the others,
  and clicking again retries; a turn over the turn limit is such a failure (C2); an empty turn (no prose reply) shows
  only the fetch footnote and invents no placeholder; the footnote includes the actual bytes read. Visually all of
  them are small, faint in-turn text.
- **The overview section**: the overview's session card is clickable. It lists **only the 5 most
  recent + a total count at the bottom**, and the click goes **straight to the session page**, with
  the back button landing on the "Sessions" section.
- **Paginated and cold rollouts change no interface point**: the question list, the turn blocks, the
  banners and the search results keep their forms; what changes is where the data comes from and how
  a compressed file is read.
- **The sessions section's sort choice survives switching sections** and switching projects; it is
  not persisted to disk.

## Search hit rows

### session-view::REQ-002 A hit row keeps its keyword in view

Applies to: the question hit rows that a project's session search and global search share
([global-search::US-001/AC-06](global-search.md)). A full-text hit's snippet is already cut around its
keyword (D5) and is drawn as it is. Characters are counted on the question as
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
  answer read in the preceding run can be opened from saved content, except one C2 does not keep, and
  one a version saved before kept turns carried their body's length, which is not restored and is
  fetched again while the rest of that copy restores. Never fetch unread turns merely to fill a persistence file. Expanded/collapsed state still resets under
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

Every session belongs to exactly one agent side, the side whose data directory holds its record; its
session ID (CONTEXT) is not its identity here, which stays its source file path.

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

Applies to: session pages in the saved display copy (session-view::REQ-001, ADR-0053). A page saved by
a version that did not keep the session ID restores rather than being dropped: a Claude Code or Grok
page gets its ID from its file path by the same rule as a live page, and a Codex page gets none, so it
shows session-view::US-001/AC-09's form until the live page replaces it.

### Failure modes and boundaries: session ID and resume

Each side's ID source (session-view::US-001/AC-01) holds for every session on this machine (full
enumeration, 2026-10-28): a Claude Code session file named by a UUID carries that UUID as its only
session ID (an `agent-*` file is a subagent, and a file with no session ID has no question; neither is
listed), and a Codex thread segment, named `<thread>_<segment>`, carries the thread's ID.

**Opening the page**
- First open, cached revisit, restore before the first scan (P1, P4, session-view::REQ-001): the ID and
  the buttons come with the page; a restored page's buttons act on its saved data. A transfusion while a
  tooltip is open (P5) redraws the tooltip from the refreshed page.
- Opened from the Sessions tab, the overview card, a global search hit or a fork banner: the same
  header (session-view::US-001/AC-08 for a stale project).
- The UI language switches while a tooltip is open: the tooltip follows.
- Jumping to the fork parent within 1.5 seconds of a copy, or with a tooltip open: the check and the
  tooltip belong to the page they were made on and do not follow to the parent's page.

**Copying**
- The clipboard refuses: the error toast (session-view::US-001/AC-10); the button shows no check.

**Showing the record file**
- The file is gone (deleted, or compressed by Codex since the page was drawn — C4, P7): the error
  toast; the page itself follows C4/P7 on its next refresh.

**Pasting the command — the agent side's own behaviour, which the product does not check**
- The tool is not installed or not on the path: the shell says so.
- A Codex thread written in segments (several sessions here with one ID, CONTEXT: Session ID): resuming
  any of them resumes the whole thread.
- An archived Codex session: Codex asks to unarchive it, or says to run its unarchive command first —
  both appear in its program (which one the interactive resume shows was not tried).
- A Codex session begun in Codex's app or editor extension sits in the same store and is resumed the
  same way (not tried from the command line).
- Resuming a Claude Code session from another directory makes Claude Code itself print the same
  `cd … && claude --resume …` line; Codex otherwise asks whether to use the session's directory, and
  Grok keeps its sessions by directory.
- agy resumes a conversation by ID with `--conversation` (its help, agy 1.4.9); what it does when the
  conversation is resumed from a directory other than the one it ran in was not tried.
- A session still open in another terminal: the agent side decides what a second resume does.

**What agent data can do on the page**
- The ID and the project path are drawn as text in the meta line and the tooltip; nothing in them is
  interpreted as markup. Their only way out of the page is the copied command, bounded by
  session-view::CON-002.

### UI decisions: the session page header

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
- **The no-ID form and the failure toasts** as session-view::US-001/AC-09 and AC-10; the no-ID form's
  wording is true both when the record has no ID and while a restored page waits for its live
  replacement.

## The Antigravity CLI side

An Antigravity CLI session is one conversation (ADR-0037): its database holds the usage
([token-stats::REQ-003](token-stats.md)), and its full transcript — `transcript_full.jsonl` in agy's
per-conversation directory, a JSON line per step — holds the questions and turns and is never used
for tokens. The transcript facts below come from every transcript on this machine (full enumeration,
2026-10-28).

### session-view::REQ-003 Antigravity sessions in the list

Applies to: Antigravity conversations in a project's Sessions tab, its overview card and global search.

- session-view::REQ-003/AC-01: A session is one conversation database, identified by its path, in the
  project [token-stats::REQ-003/AC-08](token-stats.md) credits it to. A subagent conversation
  ([token-stats::REQ-003/AC-07](token-stats.md)) gets no row of its own.
- session-view::REQ-003/AC-02: A conversation with no question (session-view::REQ-004/AC-01) falls
  under A3a, the empty conversation agy creates each time its interface is opened and nothing is sent
  and a fork that has asked nothing of its own included.
- session-view::REQ-003/AC-03: The title is agy's own title for the conversation, from its
  conversation summaries, falling back to the first indexed question when agy has none or its
  summaries cannot be read — the priority rule the Codex and Grok sides follow (A4, G2). The
  summaries are read under [token-stats::CON-002](token-stats.md).
- session-view::REQ-003/AC-04: Last activity is the largest step timestamp in the conversation's database
  (A1's "largest timestamp inside the file").
- session-view::REQ-003/AC-05: The row's token figure is the conversation's own usage under
  [token-stats::REQ-003](token-stats.md), a fork's copied calls excluded.
- session-view::REQ-003/AC-06: A row carries the Antigravity side badge
  ([agents-overview::CON-004](agents-overview.md)), and a fork's row the fork marker
  (session-view::REQ-005/AC-05).

### session-view::REQ-004 Antigravity questions and turns

Applies to: opening an Antigravity session, expanding its turns and searching it.

- session-view::REQ-004/AC-01: A question is a user-input line, and its text is the body of the line's
  user-request block, normalised as every side's question text is (session-view::REQ-002), with no
  other side's noise shapes stripped from it; the blocks agy appends after it (additional metadata, a
  settings change) are not part of the question. A user-input line without a request block (none
  measured) is listed whole, so that nothing is lost (ADR-0036's rule); one whose request is empty is
  not a question. A system-message line — agy's notices, a timer firing, a subagent's message — is
  never a question.
- session-view::REQ-004/AC-02: A turn runs from its question's line to the next question's line (C1)
  and is read by byte range (C2); opening a session reads only the questions' ranges (B4).
- session-view::REQ-004/AC-03: A rewind leaves the undone lines in the transcript and writes the redo
  under the same step indices (measured). A line is undone exactly when a later line's step index is
  not greater than its own; a line without a step index is neither a redo nor undone. An undone
  question takes no number, is not listed, opens nothing and is not searched — the page shows what the
  conversation finally became (B3). A turn runs to the next kept question, less a trailing run of
  undone lines; undone lines inside it are dropped when the turn is read.
- session-view::REQ-004/AC-04: Inside a turn, an assistant-response line's text is prose and its
  thinking renders as a thinking block: agy's thinking is plain text (measured), so this side's
  thinking block has content (C6). Each tool call — its name and arguments — pairs with the result line
  that follows it, in order. A result line's text is the call's return, a failed or still-running call's
  included.
- session-view::REQ-004/AC-05: A tool call named `invoke_subagent` is a subagent block (C3). Its
  arguments are the dispatch; its return is the message the dispatched conversation sends back — the
  system-message line whose sender is the conversation id the dispatch's result names — and never the
  dispatch's own result, which only echoes that the subagent was created. The subagent's own steps
  stay unattributed: its transcript is not read (session-view::REQ-004/AC-09). A dispatch whose
  subagent sent nothing back (cancelled, measured) shows no return.
- session-view::REQ-004/AC-06: A failed model call's error line renders as prose, as a failed call
  does on the Claude side, where Claude Code writes it as assistant text. Every other system-message
  line is harness noise and is not rendered (C8). A line of any type outside user input, assistant
  response, tool result, system message and error leaves the unknown trace (C8).
- session-view::REQ-004/AC-07: The turn volume counts tool calls other than `invoke_subagent`, and
  subagent dispatches as `invoke_subagent` calls, on kept lines only (session-view::REQ-004/AC-03).
- session-view::REQ-004/AC-08: A conversation whose transcript is missing — the empty conversation agy
  creates has none (measured) — has no question, and so does one whose transcript cannot be read to its
  end, a line of it longer than the line limit ([token-stats](token-stats.md) A10) included; its figures
  are its database's either way. A line that will not parse is skipped without discarding the rest of the
  file.
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

- A session open while agy is still working in it: P5 and C4 apply, a changed transcript changing the
  entry's signature (Implementation Decisions).
- agy rewrites a transcript when it compacts the context (its documented behaviour, not observed here):
  the index is rebuilt (C4) and session-view::REQ-001/AC-04 holds.
- A rewind while the session page is open: the next snapshot drops the undone question
  (session-view::REQ-004/AC-03), and session-view::REQ-001/AC-04 holds for an expanded turn.
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
- Introduced content: agy's prose holds markdown links to workspace files (`file://…`, measured).
  Prose renders as text on every side, so they show as written and nothing in them can be clicked; no
  navigation surface is added. Titles from agy's summaries render as text.
- A rewind back to a step inside a turn rather than to a question (not observed; the measured rewind
  went back to a question): the undone lines stay inside that turn's byte range and are not shown
  when it opens. A project's full-text search still counts a hit in them as a hit of that turn — the
  one place an undone line can be found.
- A subagent that sends more than one message back within its dispatch's turn: the return shows them
  in order.
- agy's summaries not there, or not in the shape titles are read from: every title falls back to the
  first question. A read that fails while agy writes them keeps the titles last read. agy titles a
  conversation after its first reply, without the conversation's own files changing: the title
  appears at the next scan (Implementation Decisions).
- The fork pill on an Antigravity row says the copied history was stripped, rather than a replayed
  prefix — a copy variant of the drawn pill.
- A fork's parent that cannot be read in the supported format is left out like any such conversation
  (token-stats::REQ-004/AC-01), so the fork's banner takes the no-longer-here form — inexact in that
  case, which needs the parent rewritten in a new format while the fork itself still reads.

## Implementation Decisions

- **Judging a hit row** (session-view::REQ-002): by laying the row out before it is painted — the
  whole question first, then the 20-character window, then the keyword, each step after the previous
  one is laid out — and from the beginning again when the row's width, text or keyword changes.
- **Restored answer identity** (ADR-0053): each displayed question carries a fingerprint of its
  source file identity, byte position and raw question record. Turn queries key by that fingerprint
  as well as path and ordinal. A read validates the selected question and its answer in one range
  operation (one streaming pass for compressed files), checks that the source stayed unchanged,
  and refuses a mismatching fingerprint. Appending later questions preserves unchanged identities.
- **Offset index**: the scan records `{question offset, turn start and end offsets, time, that turn's
  tool and subagent counts}` — **with no question text** (see D2a). Stored in the existing cache keyed
  by a `path + mtime + size` signature, versioned and checked as token-stats' Implementation Decisions
  say (Cache version bumps, Cache). Fetching streams the byte range.
  **A turn's end point is "the end of the last parseable line", not the file's byte size** — for Codex,
  of the last such line a newline ends ([token-stats](token-stats.md), Implementation Decisions,
  Cache): an active session may be mid-line, and that half line neither parses nor should be sliced into
  a range.
  **Per-side "turn volume" criteria (full enumeration, not sampling)**:
  - Claude tools = `tool_use` segments (the only call segment type in the whole repository); a
    subagent dispatch = the tool name `Agent` or `Task`, two generations of the same tool's name,
    both taking `description` + `prompt` + `subagent_type`. **"The arguments contain
    `subagent_type`" is not a usable criterion**: a `TaskCreate` call can carry it and an `Agent` call
    can omit this optional parameter. Tools on sidechain lines count toward the subagent number
    and are not counted again in the parent turn.
  - Codex tools = `response_item`'s `custom_tool_call` + `function_call` + **`tool_search_call`**; a
    subagent dispatch = a `function_call` named `spawn_agent`. Only the `response_item` path is taken;
    the `event_msg` path is a UI event mirror of the same calls (and has only `*_end`, no `*_begin`),
    so counting both would double it.
  - Grok tools = tool_call records except spawn_subagent; a subagent dispatch = a tool_call named
    spawn_subagent (the subagent_spawned/finished records are its typed mirror and are not counted
    again — the same double-write rule as the Codex event_msg path).
- **Normalising the sides**: the common model = `{time, role, text, tool call (name/args/result),
  reasoning block?}`. The Codex side needs two things Claude does not: choosing one of the two
  written streams (take `event_msg`) and stripping the fork replay prefix. Each block has a kind, and
  the IPC boundary rejects a kind outside its allow-list. The prose carrier follows from full
  enumeration: the entire spectrum of assistant
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
  bytes read as evidence of "nothing was read whole". The engine module (ADR-0054) reads the turn — the question's
  bytes, and the body's lines with the lines REQ-004/AC-03 drops left out — and assembles the body's blocks
  (Normalising the sides). The turn
  limit (C2) is decided from that range before the turn's body is read. A turn refused under it retires a copy saved
  or retained under its key, in both processes. The keep size (C2) is decided from the
  same range: a turn over it is not saved, and retires a copy saved under its key; its payload carries a mark by which
  the renderer neither retains it (retiring a copy it held) nor leaves it in the query cache once no row shows it.
  A saved turn carries its body's length, and one saved without it is dropped when the copy is restored. The total
  (C2) is decided in both processes by one rule over the turns kept in fetch order, the renderer taking the main
  process's total as a launch argument; it applies to the copy as it is restored. A read-only freshness predicate lets the
  renderer decide whether to show the interim "rebuilding the index for this file only" state, while
  the rebuild itself is still triggered by the fetch call (idempotent, and the file changing between
  the two steps is harmless).
- **The query layer** (ADR-0028): every mount revalidates; window focus does not refetch; nothing is
  retried.
- **The session ID** (session-view::US-001): the session page payload gains the session ID, a
  non-empty string or null, and the contract (R3) admits exactly those two. The main process
  produces it: for Claude Code, Grok and Antigravity from the file path alone
  (session-view::US-001/AC-01), and the display copy's restore applies the same rule
  (session-view::CON-003); for Codex from the session-metadata ID the scan already reads into its
  cached per-file record, null where that record has none. Only an absent field is filled in on
  restore; a present but malformed one is still dropped by validation, as for the project memory's
  main file.
- **Showing the record file** takes the session's file path and asks Finder to show it. Admission is
  R1's exact-path allow-list first, before any file system call; then the path must
  still exist — and, for an entry restored before the first scan, be a regular file — because
  Finder's own call reports no failure. A refusal or a missing file is a structured error
  (ADR-0001).
- **The resume command** is built from the agent side, the session ID and the project directory,
  carrying session-view::CON-002's quoting; copying goes through the clipboard channel. The session
  page is given its project's directory and stale flag from the project entry it opened in, on every
  route.
- **The tooltip** is a floating layer under the AGENTS.md floating-layer invariant, so no ancestor
  clips it, and it closes on scroll and on resize. Its warning line takes a colour of the static class
  (CONTEXT: Theme variable classes), since the tooltip's dark ground does not change with light or
  dark.
- **Icons and copy**: the labels, tooltips, the no-ID form and the two failure messages exist in both
  languages; "Copied" reuses the stale note's wording, a synonymous action.
- **The Antigravity CLI side** (session-view::REQ-003 to REQ-005): the per-file aggregate of a
  conversation carries, beside its calls, what its database says of it as a session — its own id as
  its trajectory table records it, whether it is a subagent, its largest step time, and for a fork
  the source of its last copied step — and its transcript's question index, built in the same parse.
  The entry's signature adds the transcript's modification time and size to the database's, so a
  transcript agy appended to is indexed again (C4). agy's titles are read from its summaries database
  once per scan, keyed by the conversation's own id, not kept in the per-file entry. The page's byte
  figure is the database's size, the record file's.

## Out of Scope

- agy's truncated transcript (`transcript.jsonl`) and the step payloads in its databases as sources of
  turn contents (ADR-0037 option 7).
- Rendering a subagent's own steps inside the dispatching turn: its transcript is not read
  (session-view::REQ-004/AC-05).
- Searching across projects — that is global search, a feature of its own ([global-search](global-search.md));
  this spec's search is within one project.
- Editing or deleting session contents, and resuming a session from inside the product: it hands over a
  command to copy (session-view::US-001) and runs none (session-view::CON-001).
- The session ID or its buttons on the Sessions tab's rows, the overview card or global search hits
  (the page header only).
- Resuming in an agent's own app or editor extension.
- The real times in a Codex replayed span (which would require cross-file alignment).
- **The export feature entirely**, including a Markdown export and a fidelity-preserving backup
  export.
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
- A pending indicator on the clicked row while a first open is in flight: a new visible state that
  needs a prototype.
- Stripping injected user entries beyond the shapes A4 and B1 name (ADR-0036).
