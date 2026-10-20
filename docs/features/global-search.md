# Global search

> Related decisions: ADR-0034 (the question texts held in memory, read when the page opens)

## Overview
A project's own session search only looks inside that project, so finding a conversation you remember but
cannot place means guessing projects one after another. Global search searches what you asked in every
project's sessions from a page of its own, and takes you from a hit straight to that session inside its
project.

## Capabilities
- A Search item sits in the rail directly below Projects; it opens the search page and stays
  marked while the page is shown
- The box searches as you type, once typing pauses — no button, no Enter. It matches the questions of every
  listed session in every registered project, stale projects included; case is ignored for every letter,
  not only English ones. Its placeholder says how many sessions in how many projects are searched
- The first time the page is shown in a run, the questions are read in; the header says "Reading the
  sessions' questions…" meanwhile, and a keyword typed in the meantime shows its results once the reading
  is done. After that, a search answers at once
- The results are grouped by project: a heading with a folder icon, the project's name, and its session
  and hit counts — hovering it shows the full path, since projects can share a name; a stale project's
  name is struck through and tagged stale. Under each heading, one card per session
- A session card shows the side badge, the title, the fork or uncertain-strip marker where the session
  carries one, and its hit count; each hit row shows the question's number in its session, the question on
  one line with every occurrence of the keyword highlighted, and when it was asked
- A header line counts the hits, sessions and projects, with a Newest first / Oldest first switch:
  projects are ordered by their most recently active matching session and sessions by their own last
  activity, and Oldest first reverses both; hits inside a session stay in question order
- Every hit is listed, however many — no cap and no "show more"
- With no hit, one line says so and points to a project's Sessions tab, switched to full text, for
  answers and tool output; a search that cannot be completed (a keyword longer than 200 characters, for
  instance) says so on one line instead, and changing the keyword tries again
- Clicking a hit opens that session at that question, inside Projects: the project is selected and its row
  scrolled into view in the list, and the question carries the same arrival highlight a project search hit
  gives. Clicking a card's header opens the session without locating a question. The search page stays on
  screen until the session page is ready, and a session seen before opens at once
- A session opened from the results — a hit, or a card's header — has two ways out where the back control
  usually sits: "Back to search results" brings the search page back as you left it, and "Go to <project> ·
  Sessions" opens the project on its Sessions tab — "Go to <project>" for a stale project, onto its stale
  note. Both stay on one line, a long name cut short. Leaving for the search page with the rail and coming
  back keeps them; the fork banner's parent, or a session opened from the project, has the usual back
  control
- The Search item brings the page back as you left it — keyword, results, sort and scroll position — from
  anywhere in the app, for the rest of the run; after a restart the page starts empty
- The results follow the data: after each automatic rescan they refresh in place, keeping the keyword,
  sort and scroll position, so a session that gained a matching question gains the hit and one that went
  away leaves
- With no session to search yet, the box stays, its placeholder carries no number, and the page says that
  sessions appear once an agent has had a conversation in a registered project

## Boundaries and non-goals
- Questions only: answers, tool output and everything else in a turn are reached through the project's
  own Sessions search, switched to full text
- The sessions searched are the ones each project's Sessions tab lists: a directory no agent registered is
  not searched, nor are subagent or warmup sessions; questions inside a compacted window cannot be found
- A session marked uncertain strip may hit on a few replayed questions at its start that its parent also
  hits
- A question written over several lines is matched as it is shown, its line breaks read as spaces
- A hit in a stale project selects the project, but the project list hides stale projects by default, so
  its row is not on screen unless stale projects are shown
- The question texts are kept in memory for the run and never saved; reading them in costs a moment the
  first time the page is shown in a run, and the keyword and results are not kept across restarts
- Artifacts, memories, configuration and components are not searched here, and the results have
  no side filter
