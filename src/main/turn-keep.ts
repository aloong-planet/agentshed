// The keep size (session-view, the in-turn fetch states; ADR-0053): a turn whose body is longer than this is shown when
// fetched, but kept neither in the display copy nor in the renderer's memory, so a revisit fetches it again. The copy is
// read at launch as one string, and a failed read loses every saved page; a turn's kept size has no bound against its
// body (tool inputs are re-serialised), so the body, known from the index before any read, is what decides.
import { rescanIntervalMs } from './rescan'

/** 8 MiB, measured on the body alone, as the turn limit is: exactly this much is kept, one byte more is not */
const TURN_KEEP_BYTES = 8 * 1024 * 1024
/** Test seam (the AGENTSHED_ family a packaged build refuses): lowers the size so that e2e need not write 8 MiB */
export const TURN_KEEP_SEAM = 'AGENTSHED_TURN_KEEP_BYTES'

/** The keep size in effect: the seam's positive number, otherwise 8 MiB */
export function turnKeepBytes(env: string | undefined): number {
  return rescanIntervalMs(env, TURN_KEEP_BYTES)
}

/** Whether a turn whose body is this long is kept */
export function turnKept(bodyBytes: number, keepBytes: number): boolean {
  return bodyBytes <= keepBytes
}
