# Memory view

## Overview
Agents accumulate cross-session memories automatically and those memories shape later behaviour, but
the content is buried in a data directory, so users do not know "what has the agent remembered about
my project". This feature summarises each project's memories on the global page and shows them in
full in project detail.

## Capabilities
- Global page Memory section: lists projects that have memories (whether there is a main memory file,
  the topic count, the last modification), in reverse order of last modification; stale projects are
  listed as usual with a badge
- Clicking a row expands that project's memory file list; clicking a file opens it in a drawer that
  reads like a skill's files do: rendered by default, its header fields shown as a card, the raw text
  one switch away; a previously read file reopens immediately even after restarting, and remains
  readable if its refresh fails. A file never successfully read reports its error inside the drawer
- A link in a memory file to another file of the same memory opens that file in the drawer; a web link
  opens in the system browser; a link to anything else shows a notice and the drawer stays where it is
- `[[name]]` references and placeholders written in angle brackets (such as `<slug>`) show as written
  rather than disappearing — in memory files and in every other rendered document: skill files,
  CLAUDE.md and AGENTS.md, and a project's artifacts
- Codex global memory (not per project) is shown in three states according to the feature toggle:
  when the feature is off, it explains how to turn it on (rather than falsely reporting "no
  content"); when it is on with nothing in it, it shows "nothing yet"; when there is content it gets
  its own row that expands and can be viewed (if the feature is off but old files remain, they are
  listed truthfully with a note)
- Project detail Memory section: the main memory file (MEMORY.md) is rendered directly; topic files
  are listed and open in the same drawer, and the main file's links to them open them there
- A project no Claude Code registry records — Codex only, Antigravity CLI only, or both — shows an
  explanation (memory is a Claude-side mechanism, and Codex memory is global)

## Boundaries and non-goals
- Read-only: no editing or deleting memories; memory is agent-generated content
- Subagent-level private memories are not shown
- Antigravity CLI's own memories are not shown on either page
- Overly long files are truncated for display
