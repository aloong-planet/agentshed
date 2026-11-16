# ADR-0039: An archive file that cannot be written or read stops no scan

- Status: Accepted (2026-11-05)

## Context

The usage archive holds history nothing else holds (ADR-0007), and while the app runs the settings directory it lives
in can go read-only or full, or the file can stop being readable. A write failure that fails the scan stops the whole
app over a problem with history, and a file that exists but cannot be read, taken for a corrupt one, lets the next write
replace history that is only out of reach. The token cache can be rebuilt by parsing again; the archive cannot.

## Options

1. **Carry on from memory, keep the last good file, try again at each scan and tell the user once per run; treat an
   unreadable file like one of a newer format** — chosen.
2. Keep failing the scan — rejected: a first launch never shows anything, and later the failure shows only as data
   that stops updating.
3. Carry on with only a log line — rejected: the archive's one promise, that history survives what the agent deletes,
   would lapse with nothing on screen saying so, and the user is the one who can free the disk.
4. A standing state on the page while the file fails — rejected: a new state form needing a prototype, on screen as long
   as a condition the user may not be able to change at once, when one sentence says what they need to know.
5. A toast at every failed scan — rejected: scans run every five minutes and on focus, so it would repeat without saying
   anything new.
6. A toast at the first failure, whatever the window's state — rejected: a timed scan fails while the user is in
   another application, so it comes and goes unseen and nothing repeats it that run.
7. Roll memory back to the file when a write fails — rejected: a row the scan saw would be forgotten while the app stays
   open, and a retained pair's observed value with it, for no gain in what the file holds.
8. Keep treating an unreadable file as corrupt — rejected: it overwrites history that is only out of reach, as
   degrading a newer format to empty would.
9. Carry the notice in the snapshot — rejected: the snapshot is saved with the display copy, so a restored page would
   report a failure from an earlier run, and every saved page would need the field filled in.

## Decision

We adopt **option 1**.

- **A failed write does not fail the scan.** The effective rows computed in memory go out and the failure is logged;
  the file stays the last good archive. What the failed merge moved stays in memory and each later scan writes again,
  so the file catches up with no restart once the directory is writable. A developer's restore still fails loudly.
- **A file that exists and cannot be read is not corrupt.** It takes a newer format's path: the effective rows are the
  live rows, no day is archived-only, nothing is written, and the read is tried again at each scan. A file that reads
  and does not parse stays corrupt, and a stat failing for any reason but absence clears nothing.
- **The user is told once per run**, in one toast saying usage history cannot be saved right now (token-stats C4).
  With the window unfocused the toast waits for focus, and a failure that clears before then is not reported.

## Consequences

- Positive: a settings directory that goes read-only or full while the app runs no longer stops it showing anything
  new, and a first scan whose archive cannot be written leaves the placeholder. Nothing the file holds is lost or
  overwritten by these failures.
- Negative: a row that reached only memory, and is gone from the agent's data before a write succeeds, is not
  archived; this is the cost accepted.
- Negative: a restart while writes are blocked compares against the last good file, so a higher figure or a retained
  pair's observed value held only in memory is gone. An application update in that window accepts a loss retained only
  in memory as a correction (token-stats C18).
- Negative: while the file cannot be read, past days only the archive held read lower or empty, without hatching, and a
  retained day reads its lower live figure.
- Negative: the notice is one toast, and a user who misses it is not told again until the next run.
- Negative: a settings directory already read-only or full at launch never reaches a scan: the application does not
  start, and a native dialog names the directory and says why (token-stats C25).
- Neutral: an instance that finds its already-read file unreadable later writes from memory, which holds its history,
  so the case needs no rule of its own.

## Sources

Readings made during #359 and #362: with the settings directory read-only after launch (2026-11-04), no snapshot in
2.5 seconds where the control gave 8; with the file at mode 000 and the directory writable, a load that took it for
corrupt read no rows and the next merge turned a total of 100 on disk into 40; `document.hasFocus()` in a real shown
window, true at start, false after a blur and true after a focus. ADR-0001, ADR-0007, ADR-0026; token-stats C3, C4,
C8, C10, C18, C22, C23, C25; agents-overview A4d and the restart sequence.
