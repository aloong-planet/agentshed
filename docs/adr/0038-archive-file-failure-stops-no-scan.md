# ADR-0038: An archive file that fails stops no scan: memory carries the figures, the disk keeps the last good file, and the user is told once

- Status: Accepted (2026-11-05)

## Context

ADR-0026 makes the usage archive the owner of the effective rows, and says nothing of what a failed
write means for them. The archive was written inside the merge and a failure threw, so every scan
failed with it. Measured on 2026-11-04 with the settings directory read-only after launch: no snapshot
in 2.5 seconds where the control gave 8, and new sessions did not appear. With the archive's rename
blocked from launch, the first scan stayed on the placeholder. The automatic rescan retried and failed
the same way until the directory was writable again.

The token cache had just stopped failing the scan on the same failure, but its case is not this one:
the cache only spares the next launch a parse, while the archive holds history nothing else holds.

One failure here also lost history. A file that exists and cannot be read was taken for a corrupt one:
measured with the file at mode 000 and the directory writable, the load read no rows, the next merge
wrote, and a total of 100 on disk became 40.

## Options

1. **Carry on from memory, keep the last good file, try again at each scan, and tell the user once per
   run; treat an unreadable file like one of a newer format** — chosen.
2. Keep failing the scan — rejected: a problem with history stops the whole app, and a first launch
   never shows anything. The failure is visible only as data that stops updating.
3. Carry on with only a log line — rejected: the archive's one promise, that history survives what the
   agent deletes, would not be kept while nothing on screen says so, and the user is the one who can
   free the disk.
4. A standing state on the page while the file fails — rejected: it would be a new state form needing a
   prototype, on screen for as long as a condition the user may not be able to change at once. One
   sentence says what the user needs to know.
5. A toast at every failed scan — rejected: scans run every five minutes and on focus, so it would
   repeat without saying anything new.
6. A toast at the moment of the first failure, whatever the window's state — rejected: the common case
   is the timed scan while the user is in another application, where it comes and goes unseen, and
   nothing says it again that run.
7. Roll memory back to the file when a write fails — rejected: a row the scan saw would be forgotten
   even while the app stays open, and a retained pair's observed value with it, for no gain in what
   the file holds.
8. Keep treating an unreadable file as corrupt — rejected: it overwrites history that is only out of
   reach. The load already refuses to degrade a newer format to empty for this reason.
9. Carry the notice in the snapshot — rejected: the snapshot is saved with the display copy, so a
   restored page would report a failure from an earlier run, and the field would have to be filled in
   for every saved page.

## Decision

We adopt **option 1**.

- **A failed write does not fail the scan.** The effective rows computed in memory go out as usual and
  the failure is logged. The file stays the last good archive and no temporary file stays behind,
  whichever step failed. What the failed merge moved stays in memory, and each later scan writes again,
  so the archive catches up with no restart once the directory is writable. A restore, which a developer
  runs, still fails loudly.
- **A file that exists and cannot be read is not corrupt.** It takes the path a newer format takes: the
  effective rows are the live rows, no day is archived-only and nothing is written. The read is tried
  again at each scan, because a change of mode does not move the file's signature. A file that reads and
  does not parse stays corrupt. A stat failing for any reason but absence says nothing about the file,
  so it clears nothing.
- **The user is told once per run**, in one toast in the current UI language: usage history cannot be
  saved right now, because its file in the settings directory cannot be read or written. The sentence
  states no system error, and no sentence crosses IPC (ADR-0016): the main process answers a command true
  once in a run, and the window asks at mount, with each snapshot and on focus. With the window unfocused
  it does not ask, so the toast waits for focus. A failure that clears before then is not reported.

## Consequences

- Positive: a read-only or full settings directory no longer stops the app from showing anything new, and
  a first launch leaves the placeholder. Nothing the file holds is lost or overwritten by these failures.
- Negative, the cost accepted: a row that reached only memory, and is gone from the agent's data before a
  write succeeds, is not archived. The agents-overview restart sequence takes the same line for saved
  pages.
- Negative: a restart while the write is blocked compares against the last good file, so a higher figure
  and a retained pair's observed value held only in memory are gone. If an application update comes in
  that window, a loss retained only in memory is accepted as a correction (token-stats C18).
- Negative: while a file cannot be read, past days only the archive held read lower or empty, without
  hatching, until it can be read. A retained day reads its lower live figure for that time.
- Negative: the notice is one toast. A user who misses it is not told again until the next run.
- Neutral: an instance that already read the file and finds it unreadable later writes from memory, which
  holds its history, so that case needs no rule of its own.

## Sources

Issue #362 and the readings behind it, made during #359 and #362: a later scan with the directory
read-only, a first scan with the rename blocked, the unreadable file, and `document.hasFocus()` in a real
shown window (true at start, false after a blur, true after a focus, with the window's focus event).
ADR-0007, ADR-0016, ADR-0026; token-stats C3, C4, C8, C10, C18, C22, C23; agents-overview A4d and the
restart sequence.
