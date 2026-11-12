# The quit's flush relied on the scan holding the thread

**Date**: 2026-11-12 · **Surface**: the quit handler and the display copy (`display-cache.json`)

## What happened

The change that moved the scan to a worker thread (ADR-0043) made the quit handler flush the display copy and, beside
that, wait for the worker to stop. A scan the worker finished before it took the stop still handed over its result. The
main process saved the display copy for it after the one flush had been taken, and the exit cut that write: the display
copy on disk stayed the previous scan's, and `.display-cache.json.tmp-<pid>` was left in the settings directory, where
nothing removes it. On the built app over a home of real size, 12 of 15 quits that landed in the last half second of a
rescan ended that way, each leaving a file of about 2 MB.

Before the change the same handler was right without anyone having made it so. The scan held the main process's thread
to its end, so the handler could only run after the scan's save, and its flush covered it. Taking the scan off the
thread took that order away. It was found by the independent review of the change, from the code, and it never shipped.

## Why no test caught it

- The order was held by the thread and stated nowhere, so no case was about it.
- The e2e case for quitting during a scan holds the first scan open on a timer. A worker waiting on a timer takes the
  stop at once and hands over nothing. The window needs a scan with a long synchronous stretch, which is a home of
  real size; a fixture home's scan is over in milliseconds.
- The changes made to the code to see a case turn red came from the design's own list: the stop not sent, the stop not
  waited for. None asked what else settles while the quit waits.
- The first attempt to reproduce it would have read as "cannot be reproduced": it timed the quit from the window's
  first snapshot, which is the saved display's and not a scan of that launch, so all 16 quits came after the scan had
  ended and nothing went wrong in any of them.

## What it settled

The quit stops the worker first and flushes afterwards, in a function of its own (`settleForQuit`) with a case over the
real display store: a save that lands while the worker stops is on disk when the quit goes on. Four changes to the
order each turn it red. The same sweep on the fixed build: 14 quits landed, and all 14 left the last scan's display
copy on disk and no temporary file.

## What remains

- The handler's call of that function is guarded by no case. The e2e case for quitting during a scan runs through it,
  but its held scan hands nothing over, the reason above: it passed on the commit that had the defect, and it passes
  when the quit never stops the worker (measured by taking the call out).
- A forced termination can still cut a display write, as before this change, and the temporary file it leaves is
  never removed: its name carries the process id of a run that is gone.
- A page's read still under way when the quit begins is not waited for, as before this change: it reads the session
  file after the question index arrives, and its save can land after the flush. The second review of the fix found
  the fix's own comment claiming otherwise.
- The general form: when work leaves a thread, whatever ran after it only because it held the thread now runs during
  it. In this change the handlers of the main process were read for that after the finding — the quit handler was the
  one; the scan's own state is still replaced in one stretch after its single wait.
