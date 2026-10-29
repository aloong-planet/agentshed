# Session view

## Overview
Session records sit in the agent sides' data directories, with no way for a user to look back at
"what did I ask in this project". Project detail gains a "Sessions" section listing that project's
sessions, one per row, with "how many questions I asked in this conversation".

## Capabilities
- **Opening a session turns a page rather than flashing one**: the project page you are on stays put
  until the session page has arrived, then the stage switches at once. A session opened before
  comes back instantly, including after a restart, with its header, fork information and questions.
  Previously read answers appear immediately when expanded again; unread answers wait for a read.
  A failed refresh keeps the last successful content. Jumping to a fork's parent works the same
  way. While a session page is open, an automatic refresh keeps its question list current with the
  file — a question asked since you opened it appears on its own, while expansion, sort and day-group folding stay as they were. A rewritten question
  receives its corresponding answer, never an answer attached only by the old question number.
- **Session page**: opened by clicking a session row (in the section or on the overview card) — at
  the top are the back button (on one line, a long project name cut short; a session opened from the
  global search results has two ways out there instead — back to the search results, or on into the
  project), side badge, title and volume information (question count / tokens /
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
  the main session are there; the internal steps are not, since the records either carry no stable
  reference chain that would attribute them to a specific dispatch or keep them in the subagent's own
  record, which is not read — so we say they are not shown rather than guessing at a pairing
- **Reasoning and thinking are presented honestly**: Codex has only plaintext sub-headings, and the
  body is encrypted content that can never be obtained — the UI says so rather than blurring it with
  full reasoning; Claude's thinking is likewise only a placeholder in the records, with no body, while
  Antigravity CLI records its thinking as plain text, which shows in full
- **Record types we have not seen are never silently swallowed**: when an agent update introduces a
  new type, a line appears in that turn saying "this turn has N unrecognised records (types: …)" —
  the content stays as it is in the source file, and you at least know something is not shown
- If the session file changes while the page is open, a turn without saved content shows a
  rebuilding notice while that session is refreshed. An already read answer stays visible during
  the refresh; if the question itself changes, its new answer follows the new question
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
  far enough (duplicates) — please check against the source" rather than offering false certainty.
  A conversation made by Antigravity CLI's `/fork` is marked "forked from «some session», copied
  history stripped", its parent's title linking to the parent; Antigravity CLI marks every copied step,
  so this strip is never uncertain, and when the parent is no longer on this machine the banner says
  so, with nothing to follow
- The session page opens fast regardless of session size: question text is read at exact byte offsets
  rather than by reading the whole file
- Project detail's "Sessions" section lists this project's sessions on every agent side, one row =
  side badge + title + question count + token consumption + last activity as a relative time
- The title comes from the **first real question** — harness noise (warmup messages, `[cron:…]`
  prefixes, slash command wrappers, injected skill bodies, and on the Codex side the harness's own
  messages: a guardian's transcript preamble, task notifications, delegation blocks) has been
  stripped; on the Codex side the session name it gave itself takes priority, and on the Antigravity
  CLI side the title it generated for the conversation (one it generates later appears at the next
  automatic refresh)
- An Antigravity CLI conversation's page lists the questions you typed, without the time and settings
  notes Antigravity CLI adds to each; expanding one shows the answer, its thinking, each tool call with
  its result (a denied or still-running call included), a subagent dispatch with what the subagent
  sent back (nothing for a dispatch you cancelled), and a model call that failed as its error text. A
  question you undid with Antigravity CLI's rewind takes no number, does not appear and is not found by
  a question search; the redo that replaced it does. A conversation made by `/fork` lists only the
  questions asked after the fork, and its token figure counts only what it used itself
- Codex sessions in the agent's newer record format list their questions and open like any other:
  the question is the human message the agent recorded, the prose is the agent's message; a session
  whose only user-side content is the agent's injected context (instructions, environment,
  plugin recommendations) has no question and is not listed, while its tokens still count
- The question count counts the **user's messages**: tool results fed back in, a subagent's own
  transcript, and noise messages do not count; nor do questions on **the branch abandoned** after an
  edit and rerun — only "how this conversation finally went" is counted
- A forked session (branched from another and continued) replays the parent's history at its start.
  It is marked **fork** in the list, its count covers only questions new since the fork, and its
  title comes from the first real question after stripping (a session name Codex gave itself still
  takes priority and is not displaced). A Codex session forked in the newer record format carries
  no replayed history: every question in it is its own, nothing is stripped, and it carries no fork
  marking. An Antigravity CLI fork lists only the questions asked after the fork, with nothing to strip, and is
  titled as any Antigravity CLI conversation is (both described above)
- A session that produced **no new question at all** after the fork (its content being entirely a
  replay of the parent's history, verified entry by entry) does not enter the list — it has no
  question to find, the same rule as warmup sessions, and its tokens still count
- When the parent session has been cleaned up or is outside scan scope, the replayed span can only be
  identified heuristically, and the session is marked **uncertain strip** — better to strip too
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
- **A question hit always shows its keyword**: the row shows the question on one line from its start; when
  the keyword lies too far in to be seen, the row starts shortly before it, after an ellipsis (or at the
  keyword itself when a long keyword leaves no room), and it is judged again when the window changes size
- **Clicking a hit goes straight to** that question in that session: the session page opens scrolled
  into position, the row holds a yellow highlight for about 10 seconds before fading, and a purple
  bar stays at the left edge to mark "this is the row you jumped to", disappearing when any question
  row is clicked; the sort toggle is the same one as in the session list and applies to hit groups too
- Hits in fork replay copies and on abandoned branches **do not masquerade as results**: in full-text
  search such hits are collapsed and the results header reports how many were collapsed — the same
  sentence is not reported once per generation of a fork chain
- With no hits it says "questions only by default — try switching to full text" rather than showing
  a blank
- A session Codex has compressed after a week of inactivity is listed, opens, expands and is searched
  like any other; opening it or expanding a turn takes a moment longer on a very large one (a fraction
  of a second on the largest here), and no more memory than the part being shown
- A project with no sessions at all gets an empty state
- **Picking a conversation back up in its own tool**: every session belongs to one agent side, and the
  session page's header shows the ID that side gives it, at the end of the volume line. Three buttons
  at the right of the title copy the ID, show the session's record file in Finder (selected there),
  and copy a resume command — one line that changes into the project's directory and resumes the
  session in its side's own command-line tool (`claude --resume`, `codex resume`, `grok --resume` or
  `agy --conversation`, followed by the ID). The directory is always quoted, and an ID with any unusual
  character is too, so pasting the line runs exactly that and nothing else. An Antigravity CLI session's
  ID is its conversation ID, and its record file is the conversation's database
- **Each button names itself the moment the pointer or the keyboard reaches it**; the resume button's
  tooltip also shows the whole command it copies. A copy turns that button into a check and its tooltip
  into "Copied" for a moment; a copy made just before jumping to a fork's parent stays with its own page
- For a stale project's session (reached from global search), the command is still copied, and its
  tooltip warns that the project directory no longer exists, so the command's change of directory will
  fail
- A session whose ID cannot be read says "Session ID unavailable"; its copy and resume buttons are
  greyed out and say why, while showing the record file still works. A page restored from the last run
  before session IDs were kept shows this form for a Codex session until the page is refreshed
- If the record file has gone by the time Finder is asked to show it, or the clipboard refuses a copy,
  an error notice says so and nothing else changes

## Boundaries and non-goals
- A session page left open while Codex compresses its file loses that file: the page itself shows an
  error after the automatic refresh that follows, rather than a stale page or a crash, and the
  session reappears in the list under its compressed form; opening it there works as normal
- MCP tool calls and web searches made by Codex are not shown inside a turn, on either of its record
  formats; the calls that do show are the command, patch, dynamic and search-tool calls it records
  as tool calls
- A turn with no prose reply (for example, asking and then closing) expands to just the fetch
  footnote rather than a fake placeholder; a tool return that was never fed back (an async tool
  spanning turns) shows as having no return record, with the real return in the range of the later
  turn it physically belongs to
- Only registered projects' sessions are listed; **subagent sessions and warmup sessions (where
  nobody asked anything at any point — on the Antigravity CLI side, the conversation it creates each
  time its interface is opened and left) do not get their own rows, but their tokens still count toward
  the statistics** — so the session count here and the denominator on the token card are not the same
  thing, and the UI says so
- An Antigravity CLI subagent's own steps are not shown inside the turn that dispatched it, only the
  dispatch and what it sent back; prose that links to a file in the workspace shows the link as written,
  not as something to click
- A session marked **uncertain strip** **may have a few duplicated questions** at its start: with
  the parent outside scan scope the replayed span cannot be checked entry by entry, and the only
  available judgement is "were these written at almost the same moment". This is a deliberate
  trade-off — the other direction silently drops real questions, and that is invisible
- The product only copies the command and asks Finder to show the file: it never runs a command, opens a
  terminal, or resumes a session inside an agent's own app or editor extension, and it does not check
  whether the agent's command-line tool is installed — a missing one is the shell's to report. What a
  resume then does is the agent's own business: an archived Codex session asks to be unarchived first,
  and a Codex conversation the agent wrote in several record files shows the same ID on each of them
- The session ID and its buttons appear on the session page only, not on the session rows, the overview
  card or global search hits
- Text an agent tool writes into a session as if you had typed it is shown as a question: the summary
  written after a context compaction, a message from a subagent or another session, Codex's own
  context blocks. It is listed and counted, titles the session when it comes first, and is found by
  the search
