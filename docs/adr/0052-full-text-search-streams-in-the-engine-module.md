# ADR-0052: A project's full-text search reads each session file a line at a time in the engine module, off the main thread, and hands back only what it shows

- Status: Accepted (2026-11-17)

## Context

A project's full-text search read each session file whole into the main process, a cold rollout decompressed whole
by the engine module (ADR-0045), and matched it, mapped its hits to turns and cut its snippets on the main thread. A
cold rollout whose stream exceeds 2 GiB ended the main process, and a large file held the main thread for seconds and
raised the footprint by about twice its size (Sources); what the search shows had to stay as it was.

## Options

1. **The search in the engine module: each file's stream read a line at a time on a thread of its own, the module
   mapping the hits to turns, counting those in no turn and cutting each turn's snippet** — chosen.
2. Keep reading each file whole on the main process — rejected: a stream above 2 GiB ends the main process, and the
   search holds the main thread and memory as long and as large as the file (Sources).
3. Search the stream in the module but hand each turn's hit line back for its snippet — rejected: the lines holding a
   hit came to 1.9 GB in one file, each to be parsed on the main thread (Sources).
4. Move the question search's byte match into the module too — not taken up (not recorded; left out when scoping, as
   the question search reads only the questions' ranges).

## Decision

We adopt **option 1**.

- The module is given the needle, the file and its turns, and gives back the hits in no turn and each turn's first
  body hit with its snippet; the question search and the question text it reads stay in TypeScript.
- The byte rule, the mapping of a hit to its turn and the snippet are the whole-file search's, quirk for quirk
  (session-view D2–D5).
- A cold rollout's search takes one of the places its reads share (session-view C2), and a file that cannot be read to
  its end gives nothing of what its search found (session-view D3).

## Consequences

- Positive: the search holds one line of a file at a time, off the main thread, so no file is too large to search
  and none holds the main process (Sources).
- Negative: the byte match exists twice, the question search's in TypeScript and this one's in the module, so a
  change to the rule is made in both.
- Negative: a snippet is cut from text lowered by Rust's case mapping, not by the JavaScript the app runs, and the
  two agree only while both carry one Unicode version.
- Negative: the footprint still follows a file's longest line, held with its lowered copy and, while its snippet is
  cut, its strings as UTF-16: a 67.7 MB line raised it by about 208 MB (Sources).
- Neutral: on this machine's data the search found what the whole-file search found in every project that search
  completes in (Sources).

## Sources

#480, the whole-file search under Electron 43.2.0 on this machine's data: a cold rollout's 3,344,334,555-byte stream
ended the main process. #479, 2026-11-17, the same binary and data, warm page cache, three runs each, before against
after: project B (2.19 GB read by full text), `error`, 15.3 s, a 4.3 s stall and the footprint 2,503 MB up against
4.9 s, 21–23 ms and 77 MB; project C (0.61 GB), `error`, 4.9 s, 1.95–1.97 s and 667 MB against 0.9 s, 12–13 ms and
33 MB; project A (5.61 GB, the 3.34 GB stream among it), after only, 15.2–15.3 s, 12–13 ms and 208 MB. In A's largest
stream, whose longest line is 67.7 MB, the lines holding `error` came to 1,926 MB. Over 554 of the 555 projects (A left out), the two searches gave
equal results in every one whose files did not change between the runs (553), for `error` and for a Han needle.
