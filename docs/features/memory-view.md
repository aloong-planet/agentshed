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
- Clicking a row expands that project's memory file list; clicking a file opens a drawer to view it;
  an unreadable file reports the error inside the drawer without interrupting
- Codex global memory (not per project) is shown in three states according to the feature toggle:
  when the feature is off, it explains how to turn it on (rather than falsely reporting "no
  content"); when it is on with nothing in it, it shows "nothing yet"; when there is content it gets
  its own row that expands and can be viewed (if the feature is off but old files remain, they are
  listed truthfully with a note)
- Project detail Memory section: the main memory file (MEMORY.md) is rendered directly; topic files
  are listed and open in a drawer
- A Codex-only project shows an explanation (memory is a Claude-side mechanism, and Codex memory is
  global)

## Boundaries and non-goals
- Read-only: no editing or deleting memories; memory is agent-generated content
- Subagent-level private memories are not shown
- Overly long files are truncated for display
