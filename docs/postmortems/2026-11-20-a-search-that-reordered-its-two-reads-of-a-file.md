# A search that reordered its two reads of a file

**Date**: 2026-11-20 · **Surface**: a project's full-text search (`searchProjectSessions`)

## What happened

While a project's question search moved into the engine module (#495), full-text mode was changed to run the full-text
search first and the question search after it, so that the question search could be told which turns had a body hit
and hand back only their texts. The independent review found what that order does to a file deleted while the search
runs. A session whose file was deleted once its full-text search had begun lost everything: the full-text search,
already reading, found its body hits, then the question search could not open the file, and the session was left out.
Session-view D3 says that a file that cannot be read to its end after its questions were read, one gone since among
them, loses its full-text part alone and keeps its question hits. The ticket kept D3 unchanged, and the change's notes
said that every combination of failures gave the same outcome as before.

## Why no test caught it

- Every failing case failed the file for the whole search, or failed one read by a property of the file. A file locked
  before the search, and the panic seam, which names a file for both reads, fail both reads. The line limit and a
  stream cut short after the last question fail the full-text read alone. Both kinds give the same outcome in either
  order. The outcomes were compared read by read, each read failing on its own, and never for a file that changes
  between the two reads of one search.
- No seam could change a file between two reads. The hold seam lets a read through by releasing its file, and a read it
  released checked the hold again once it woke. A hold placed right after the release therefore caught that read again
  instead of the next one.

## What it settled

The questions are searched first again, and in full-text mode the question search hands back every question's text for
the body hits found after it (ADR-0052). The hold seam's release returns once the reads it let go have left the gate,
so that a hold right after it catches only later reads. The case "a session file gone once its questions were read
loses its full-text part alone, and its question hits stay (D3)" lets the search's first read of the file through,
deletes the file while the second waits, and asserts the question hit alone. It failed on the reordered code.
