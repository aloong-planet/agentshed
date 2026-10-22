# ADR-0036: Text the agent tools write into a session as the user stays a question

- Status: Accepted (2026-10-22)

## Context

The question index is the source of a session's title, its question count, the session page's question list,
a project's session search and global search. It takes every user entry of a transcript and strips the noise
shapes that session-view A4 and B1 name, enumerated from real transcripts in August and September 2026. Since
then the agent tools write more of their own text into a session as user entries:
- Claude Code's summary after a context compaction ("This session is being continued from a previous
  conversation that ran out of context…");
- messages from a subagent or another session (`Another Claude session sent a message: <agent-message …>`,
  `<cross-session-message …>`);
- Claude Code's artifact-content marker;
- Codex's ambient UI state (`<in-app-browser-context source="ambient-ui-state">`), its "Files mentioned by the
  user" list and its question replies (`<send_user_message_question_reply>`).

None of these is on the strip list, so each is titled, counted, listed and searched as a question. Measured on
2026-10-22 over the owner's Claude Code transcripts (7,181 user entries in 2,584 files): 102 compaction
summaries in 30 sessions, from about 9,300 to 23,900 characters long (median about 16,000), one of them the first entry of its session and so
its title. Of the user entries a keyword hits, injected text accounts for about four in ten with the Chinese
keywords tried, and for most with English technical terms (`capabilities.toml`: 102 of 106; `landing page`: 17
of 20). Codex transcripts were not counted.

## Options

1. **Leave the text as it is: any user entry whose shape is not on the strip list is a question**
2. Enumerate every injected shape across all transcripts and strip each, keeping the user's own words where a
   shape wraps them (a paste, a request after a file list) — rejected by the owner after looking at a real
   compaction summary in one of the owner's sessions and at the share of hits above: this text is a normal part
   of the session
3. Keep compaction summaries as questions but strip the other injected shapes (the messages between agents,
   Codex's ambient state and the rest) — offered as the recommendation and rejected by the owner: all of it is
   treated alike

## Decision

We choose **option 1**: text an agent tool writes into a session as a user entry is a question unless its shape
is on session-view's strip list (A4, B1). It titles the session when it comes first, counts in the question
count, is listed on the session page, and is found by a project's session search and by global search. The
strip list keeps the shapes it has; injected text in other shapes is not added to it. Changing this needs a new
ADR.

## Consequences

- Positive: no stripping rules chase the tools' changing formats. Session-view A4 records how a sampled list
  of shapes was incomplete twice; a rule that is never written cannot go stale or drop words the user typed
- Positive: a compaction summary or a message between agents stays findable, so a search can still lead to
  where a long session was summarised or handed over
- Negative: titles, counts and searches include text the user did not type. A session whose first entry is a
  compaction summary is titled with it, a question count is higher than the number of things asked, and a
  keyword search, above all for an English technical term, returns many such entries
- Negative: a compaction summary restates a whole conversation, so one entry can match many keywords at once
- Neutral: the existing strip shapes (warmup, cron prefixes, local commands, slash commands, injected skill
  bodies, the Codex harness families of B1) stay as they are
- Neutral: a global search hit whose keyword lies past the line's cut shows no highlight, and injected entries,
  being long, make such rows common

## Sources

The owner's decision of 2026-10-22, after looking at a compaction summary in the agentshed project (a
16,602-character entry of 2026-10-08, one of ten in its session) and at the share of injected text among
keyword hits: first that compaction summaries are normal, then that every injected shape is. The measurement of
2026-10-22: every Claude Code transcript under `~/.claude/projects`, user entries read as JSON, the compaction
summary recognised by its opening sentence and the agent messages by their opening tags, keyword hits counted
per class. The global search screenshots of 2026-10-21, over the owner's real data, where these entries were
first seen filling the results.
