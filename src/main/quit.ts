// What a normal quit waits for before the app is let go (ADR-0043).

/**
 * Stops the scan worker, then flushes the display copy. In that order: a scan the worker finishes before it takes
 * the stop still hands over its result, which is saved while the quit waits, and a flush taken before the wait let
 * the exit cut that save's write — the display copy on disk stayed the older one, and its temporary file was left
 * behind. A change pending when the quit begins waits for the worker only while the window has focus; without focus
 * the display store has already begun writing it (agents-overview::REQ-008). A page's read still under way when the
 * worker has stopped is not waited for, as none was before the worker: it reads the session file after the worker's
 * answer, and its change can land after this flush.
 */
export async function settleForQuit(flush: () => Promise<void>, stopScans: () => Promise<void>): Promise<void> {
  await stopScans()
  await flush()
}
