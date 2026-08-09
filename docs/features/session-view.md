# Session view

## Overview
Session records sit in the two agent sides' data directories, with no way for a user to look back at
"what did I ask in this project". Project detail gains a "Sessions" section listing that project's
sessions, one per row, with "how many questions I asked in this conversation".

## Capabilities
- **Session page**: opened by clicking a session row (in the section or on the overview card) — at
  the top are the back button, side badge, title and volume information (question count / tokens /
  file size / last activity), and the body is **every real question** of that conversation, one per
  row (index + question + that turn's tool and subagent counts + time). Every question is listed at
  once, with no pagination; a long question is ellipsised on its row, but that is display truncation
  only — the data is the full text
- **Clicking a question expands that turn in place**: the question row itself unfolds to full text
  (multi-line as written), and below it is that turn's complete process — assistant prose, tool
  calls, subagent dispatches, reasoning blocks; click again to collapse. Everything is collapsed on
  entry, and clicking a turn fetches only that turn — each one reads precisely the byte range it
  occupies (the footnote in the expanded area says how much was read), so opening a 133 MB session is
  as fast as a 3 MB one
- **Tool calls collapse to a single line by default** (name + argument summary), and click to see the
  full arguments and return. Where the agent truncated the return, it is stated explicitly that the
  transcript only holds the truncated version (this product does not read the sidecar file), rather
  than pretending it is complete
- **Subagent dispatches are visible in place**: both the dispatch prompt and the result returned to
  the main session are there; neither side's records contain a stable reference chain that would
  attribute the internal steps to a specific dispatch — so we say they are not shown rather than
  guessing at a pairing
- **Reasoning and thinking are presented honestly**: Codex has only plaintext sub-headings, and the
  body is encrypted content that can never be obtained — the UI says so rather than blurring it with
  full reasoning; Claude's thinking is likewise only a placeholder in the records, with no body
- **Record types we have not seen are never silently swallowed**: when an agent update introduces a
  new type, a line appears in that turn saying "this turn has N unrecognised records (types: …)" —
  the content stays as it is in the source file, and you at least know something is not shown
- If the session file is appended to or rewritten while the page is open, clicking a question first
  shows a "rebuilding the index for this file only" notice and then the content; the rebuild affects
  only that one session
- **Sessions spanning several days are grouped by day**: the group row shows the date and that day's
  count, and clicking it collapses or expands the day; there is also "collapse all / expand all".
  Collapsing only hides — a turn already expanded is still expanded when the day is reopened
- **Questions sort ascending or descending** (descending by default, newest first): the index is
  always the original turn number and is never renumbered by the sort; turns already expanded stay
  expanded across a sort change. A session where individual questions lack timestamps is not grouped
  and is shown flat
- **The banner under the page header spells out this conversation's uncertainty**: a Claude session
  with edited reruns is marked "this session has N branch points; abandoned branches are not shown";
  a forked session is marked "forked from «some session», replayed prefix stripped", with the parent
  title clickable to jump straight there; where the parent is not in scan scope (or does not match),
  a prominent warning style says outright "the strip may have gone too far (losing messages) or not
  far enough (duplicates) — please check against the source" rather than offering false certainty
- The session page opens fast regardless of session size: question text is read at exact byte offsets
  rather than by reading the whole file
- Project detail's "Sessions" section lists this project's sessions on both agent sides, one row =
  side badge (CC/CX) + title + question count + token consumption + last activity as a relative time
- The title comes from the **first real question** — harness noise (warmup messages, `[cron:…]`
  prefixes, slash command wrappers, injected skill bodies) has been stripped; on the Codex side the
  session name it gave itself takes priority
- The question count counts only **what a human asked**: tool results fed back in, a subagent's own
  transcript, and noise messages do not count; nor do questions on **the branch abandoned** after an
  edit and rerun — only "how this conversation finally went" is counted
- A forked session (branched from another and continued) replays the parent's history at its start.
  It is marked **⑂ fork** in the list, its count covers only questions new since the fork, and its
  title comes from the first real question after stripping (a session name Codex gave itself still
  takes priority and is not displaced)
- A session that produced **no new question at all** after the fork (its content being entirely a
  replay of the parent's history, verified entry by entry) does not enter the list — it has no
  question to find, the same rule as warmup sessions, and its tokens still count
- When the parent session has been cleaned up or is outside scan scope, the replayed span can only be
  identified heuristically, and the session is marked **⑂? strip uncertain** — better to strip too
  little (and see a few duplicates) than to silently drop a real question
- Sorting is `newest first | oldest first`, newest first by default; **switching to another section
  and back keeps your last choice**
- "Last activity" is the largest timestamp inside the session file, which is a different measure from
  the project list's activity sort (which uses the file modification time)
- The overview section's recent sessions card lists the 5 most recent with a total count, and
  clicking any row **goes straight to that session's page**; returning from a session page lands on
  the "Sessions" section
- **The top of the sessions section searches all of this project's sessions**: by default it searches
  questions only — small, clean, precise hits; it can be switched to "full text" (which hits tool
  output and other noise, which is exactly why it is a toggle). Case-insensitive
- **Hits are grouped by session**: the group header is the session (side badge, title, fork status)
  and inside it are the matching questions and highlighted snippets; it answers "in which
  conversation" first and "which line" second. Body hits carry a "body" marker and a context snippet
- **Clicking a hit goes straight to** that question in that session: the session page opens scrolled
  into position, the row holds a yellow highlight for about 10 seconds before fading, and a purple
  bar stays at the left edge to mark "this is the row you jumped to", disappearing when any question
  row is clicked; the sort toggle is the same one as in the session list and applies to hit groups too
- Hits in fork replay copies and on abandoned branches **do not masquerade as results**: in full-text
  search such hits are collapsed and the results header reports how many were collapsed — the same
  sentence is not reported once per generation of a fork chain
- With no hits it says "questions only by default — try switching to full text" rather than showing
  a blank
- A project with no sessions at all gets an empty state

## Boundaries and non-goals
- A turn with no prose reply (for example, asking and then closing) expands to just the fetch
  footnote rather than a fake placeholder; a tool return that was never fed back (an async tool
  spanning turns) shows as having no return record, with the real return in the range of the later
  turn it physically belongs to
- Only registered projects' sessions are listed; **subagent sessions and warmup sessions (where
  nobody asked anything at any point) do not get their own rows, but their tokens still count toward
  the statistics** — so the session count here and the denominator on the token card are not the same
  thing, and the UI says so
- A session marked **⑂? strip uncertain** **may have a few duplicated questions** at its start: with
  the parent outside scan scope the replayed span cannot be checked entry by entry, and the only
  available judgement is "were these written at almost the same moment". This is a deliberate
  trade-off — the other direction silently drops real questions, and that is invisible
