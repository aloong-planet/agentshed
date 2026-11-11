// What a normal quit waits for before the app is let go (ADR-0043).

/**
 * Stops the scan worker, then flushes the display copy. In that order: a scan's result, or a page's read, that the
 * worker hands over while it stops is saved while the quit waits, and a flush taken before the wait let the exit
 * cut that save's write — the display copy on disk stayed the older one, and its temporary file was left behind.
 * A save pending when the quit begins does not wait for the worker: the display store writes it on its own timer.
 */
export async function settleForQuit(flush: () => Promise<void>, stopScans: () => Promise<void>): Promise<void> {
  await stopScans()
  await flush()
}
