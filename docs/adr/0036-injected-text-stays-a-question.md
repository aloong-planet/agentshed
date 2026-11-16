# ADR-0036: Text the agent tools write into a session as the user stays a question

- Status: Accepted (2026-10-22)

## Context

The question index takes every user entry of a transcript, strips the noise shapes that session-view A4 and B1 name,
and is the source of a session's title, its question count, the session page's question list and both searches. The
agent tools also write text of their own into a session as user entries, in shapes that list does not hold: Claude
Code's summary after a context compaction ("This session is being continued from a previous conversation that ran
out of context…"), messages from a subagent or another session (`<agent-message …>`, `<cross-session-message …>`),
Claude Code's artifact-content marker, and Codex's ambient UI state (`<in-app-browser-context
source="ambient-ui-state">`), its "Files mentioned by the user" list and its question replies
(`<send_user_message_question_reply>`). Each is therefore titled, counted, listed and searched as a question, and in
the owner's Claude Code transcripts such text makes up a large share of keyword hits (Sources).

## Options

1. **Leave the text as it is: any user entry whose shape is not on the strip list is a question** — chosen.
2. Enumerate every injected shape across all transcripts and strip each, keeping the user's own words where a shape
   wraps them (a paste, a request after a file list) — rejected by the owner: this text is a normal part of the
   session.
3. Keep compaction summaries as questions but strip the other injected shapes (the messages between agents, Codex's
   ambient state and the rest) — rejected by the owner: all of it is treated alike.

## Decision

We choose **option 1**: text an agent tool writes into a session as a user entry is a question unless its shape is on
session-view's strip list (A4, B1). When it comes first it is the session's title wherever the title is the first
question, it counts in the question count, it is listed on the session page, and a project's session search and
global search find it. The strip list keeps the shapes it has, and no injected shape is added to it.

## Consequences

- Positive: no stripping rule chases the tools' changing formats, and a rule that is never written cannot go stale or
  drop words the user typed, which a list built from sampled shapes risks (session-view A4).
- Positive: a compaction summary or a message between agents stays findable, so a search can still lead to where a
  long session was summarised or handed over.
- Negative: titles, counts and searches include text the user did not type. A session whose first entry is a
  compaction summary is titled with it, a question count is higher than the number of things asked, and a keyword
  search, above all for an English technical term, returns many such entries.
- Negative: a compaction summary restates a whole conversation, so one entry can match many keywords at once.
- Neutral: injected entries are long, so many of their hit rows open mid-question after a leading ellipsis, starting
  just before the keyword to keep it in view (session-view::REQ-002).

## Sources

- The owner's decision of 2026-10-22 that every injected shape is a normal part of the session, taken on a compaction
  summary in the agentshed project (a 16,602-character entry of 2026-10-08, one of ten in its session) and on the
  share of injected text among keyword hits.
- Measured on 2026-10-22 over every Claude Code transcript under `~/.claude/projects` (7,181 user entries in 2,584
  files): 102 compaction summaries in 30 sessions, from about 9,300 to 23,900 characters long (median about 16,000),
  one of them its session's first entry and so its title; of the user entries a keyword hits, injected text is about
  four in ten with the Chinese keywords tried and most with English technical terms (`capabilities.toml`: 102 of 106;
  `landing page`: 17 of 20). Codex transcripts were not counted.
