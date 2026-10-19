# ADR-0034: Global search reads every project's question texts from main-process memory, warmed when its page opens

- Status: Accepted (2026-10-19; proposed the same day, accepted on the in-app measurements under Sources)

## Context

Global search matches the questions of every project's sessions as the user types. Read from disk
the way a project's own session search reads them, one search over this machine's 111 listed
sessions (2.8 GB on disk, 39 of them cold rollouts) took about 3.2 s in the Electron main process,
and 2.5 s of that went on a single project's cold rollouts: a compressed file has no byte-addressed
ranges, so reaching its last question means decompressing nearly all of it. The figure grows as
Codex compresses more rollouts after seven days. Typing with a 200 ms pause would start a new
3-second search at every pause. Session-view D2a rules that the on-disk accounting and
question-index cache holds no question text, so that it does not become a second search corpus read
at every startup.

## Options

1. **Hold the question texts of every listed session in main-process memory, load them when the
   global search page first opens in a run, and replace a session's texts whenever its question
   index is rebuilt; never write them to disk.**
2. The same in-memory texts, loaded by the first search rather than by opening the page — rejected
   by the owner's ruling: the first search would wait the whole load, while loading on open overlaps
   it with the typing.
3. No in-memory texts: every search reads question ranges from disk as a project's own search does —
   rejected: about 3.2 s per search and growing, which would push the box to search on Enter
   instead of as the user types.
4. Persist question texts in the accounting and question-index cache — rejected by D2a's original
   measurement: question lines are about 9.5% of session bytes, a megabyte-scale addition to a file
   read at every startup, and a truncated preview loses the body (39.7% of questions exceed 60
   characters).
5. An inverted index (not recorded as a compared option; the conventional alternative) — not taken:
   a linear match over the loaded texts took about 4 ms for all 4776 questions, so an index buys
   nothing at this size.

## Decision

We adopt **option 1**. The main process keeps one question text per displayed question of every
listed session in every project, stale projects included, as a corpus that exists only in memory and
only for global search. Opening the global search page starts loading it; a search that arrives
before loading finishes waits for it. The corpus follows the question index: a session whose question-index
identity changes — its file, or the byte ranges of its displayed questions — has its texts read again (an
answer appended to it does not), and a session that leaves the listed set leaves the corpus. Nothing
of it is persisted. A project's own session search keeps reading from disk.

## Consequences

- Positive: after the warm-up, a search over every project costs milliseconds (about 4 ms measured),
  so the box can search as the user types and the results can be refreshed after every rescan at
  the cost of the sessions that changed.
- Negative: a second copy of the question texts lives in the main process for the rest of the run
  once the page has been opened — 2.27 MB of text here, growing with the number of questions.
- Negative: opening the page costs one full read of the question ranges (about 3.3 s here, mostly
  decompressing cold rollouts) even when no search follows.
- Negative: the corpus is correct only while it follows the question index; a session rewritten or
  compressed under it must not keep its old texts, or a hit names a question the session no longer
  holds.
- Neutral: D2a's on-disk rule and ADR-0011's single cache are unchanged; this corpus is neither
  persisted nor used as an offset index.

## Sources

- Measured 2026-10-19 under Electron 43.2.0 on this machine, warm page cache, with a scratch benchmark
  bundling the app's own scan, token engine and search code: question-mode search over every
  project 3157–3356 ms (slowest project 2464–2617 ms; one 542.6 MB cold rollout alone 1080 ms);
  full-text mode 18–23 s with a peak resident size of about 2.6 GB; loading all 4776 question texts
  3258 ms, 2.27 MB of UTF-8; a linear case-insensitive match over them 3–4.4 ms.
- The owner's rulings of 2026-10-19: global search matches questions only, over registered projects
  with stale ones included; the corpus is held in memory and warmed when the page opens.
- `docs/specs/session-view.md` D2 and D2a; ADR-0011.

**Evidence closed (accepted 2026-10-19)**: measured in the running app — the built app on this machine's agent
data, with a copy of the app's own userData files, under Electron 43.2.0. Opening the page read every listed
session's questions (113 sessions in 30 projects) in 3.06 s with no scan under way, and in 4.75 s with an
automatic rescan every 1.5 s alongside it. A search's round trip from the renderer, IPC and validation included,
took 3.5–13.9 ms at the median of seven runs per keyword (the longest single run 59 ms; 2132 and 2430 hits for
two one-letter keywords), and 3.5–10.2 ms under the same rescans. After the searches, none of 25 sampled
question texts that are not titles was found more often in any of the app's files than before the run.
