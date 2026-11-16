# ADR-0034: Global search reads every project's question texts from main-process memory, warmed when its page opens

- Status: Accepted (2026-10-19)

## Context

Global search matches the questions of every project's sessions as the user types, starting a search at each pause.
Read from disk the way a project's own session search reads them, one search over every project took about 3.2 s,
most of it decompressing cold rollouts, which have no byte-addressed ranges, and the figure grows as Codex compresses
more rollouts (Sources). The question index holds no question text (session-view D2a), so the texts come either from
the session files at each search or from somewhere new.

## Options

1. **Hold the question texts of every listed session in main-process memory, load them when the global search page
   first opens in a run, and read a session's texts again whenever its question index changes; never write them to
   disk** — chosen.
2. The same texts in memory, loaded by the first search rather than by opening the page — rejected by the owner: the
   first search would wait for the whole load, while loading on open overlaps it with the typing.
3. No texts in memory, every search reading question ranges from disk as a project's own search does — rejected: about
   3.2 s per search and growing, which would push the box to search on Enter instead of as the user types.
4. Question texts stored in the question index — rejected under session-view D2a: question lines are about 9.5% of
   session bytes, a megabyte-scale addition to the token store, and a truncated preview would lose the body, since
   39.7% of questions exceed 60 characters.
5. An inverted index (not recorded; the conventional alternative) — rejected: a linear match over the loaded texts took
   about 4 ms for all 4,776 questions, so an index buys nothing at this size.

## Decision

We adopt **option 1**. The main process keeps one question text per displayed question of every listed session in
every project, stale projects included, as a corpus that exists only in memory and only for global search. Opening
the global search page starts loading it, and a search that arrives before loading finishes waits for it. A session
whose question-index identity changes (its file, or the byte ranges of its displayed questions) has its texts read
again, while an answer appended to it does not, and a session that leaves the listed set leaves the corpus. Nothing of
it is persisted, and a project's own session search keeps reading from disk.

## Consequences

- Positive: after the warm-up a search over every project costs milliseconds, so the box searches as the user types
  and its results can be refreshed after every scan at the cost of the sessions that changed.
- Negative: once the page has been opened, a second copy of the question texts lives in the main process for the rest
  of the run, growing with the number of questions (2.27 MB here).
- Negative: opening the page costs one full read of the question ranges, about 3 s here and mostly decompressing cold
  rollouts, even when no search follows.
- Negative: the corpus is right only while it follows the question index; a session rewritten or compressed under it
  must not keep its old texts, or a hit names a question the session no longer holds.
- Neutral: the corpus is neither persisted nor an offset index, so the question index still holds no question text
  (session-view D2a) and stays one cache with the token figures (ADR-0011).

## Sources

- Measured on 2026-10-19 on this machine under Electron 43.2.0, warm page cache, over 111 listed sessions (2.8 GB on
  disk, 39 of them cold rollouts), with the app's own scan, token engine and search code: question-mode search over
  every project from disk 3,157–3,356 ms (the slowest project 2,464–2,617 ms; one 542.6 MB cold rollout alone
  1,080 ms); full-text mode 18–23 s at a peak resident size of about 2.6 GB; loading all 4,776 question texts 3,258 ms,
  2.27 MB of UTF-8; a linear case-insensitive match over them 3–4.4 ms.
- Measured the same day in the built app on this machine's agent data, under Electron 43.2.0: opening the page read
  every listed session's questions (113 sessions in 30 projects) in 3.06 s with no scan under way and in 4.75 s with an
  automatic rescan every 1.5 s alongside; a search's round trip from the renderer, IPC and validation included, took
  3.5–13.9 ms at the median of seven runs per keyword (the longest single run 59 ms), and 3.5–10.2 ms under the same
  rescans.
- The owner's rulings of 2026-10-19: global search matches questions only, over registered projects with stale ones
  included, and the corpus is held in memory and warmed when the page opens.
- `docs/specs/session-view.md` D2 and D2a; `docs/specs/global-search.md`.
