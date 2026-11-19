// Cold rollouts (spec token-stats B12, session-view C2): Codex compresses a rollout untouched for seven
// days into `<name>.jsonl.zst` and deletes the plain file (its compression.rs, read 2026-09-09). The same
// session, the same contents, the same identity rules — but readable only as a stream from its start:
// every byte offset the question index records for it is an offset in the decompressed stream, and
// every range read is one pass through that stream that stops at the last range (range-read.ts), and every
// turn's read one pass that stops at the turn's end (turn-read.ts).
// The engine module reads it (ADR-0045), by the reader the scan reads a cold rollout with and under the
// same truncation rule, each read on a thread of its own and four at most at once on the thread that
// asks. Node's own zstd decoder is not used: under Electron 43 (Node 24) it stopped at a stream's first frame whenever the
// second began inside the same read (measured 2026-11-16). Decompressing a whole file into memory for a
// range read was rejected on measurement (the 921 MB active rollout would hold about 1.4 GB); memory
// here follows the bytes served.
import { threadEngineModule } from '../engine-module'
import type { ByteRange } from './range-read'

const COLD_SUFFIX = '.jsonl.zst'

export function isColdRollout(file: string): boolean {
  return file.endsWith(COLD_SUFFIX)
}

/**
 * How many cold reads run at once on a thread, whatever asks them there, each read on a thread of the engine module's
 * own; the others wait their turn, in the order asked. Every expanded turn of a page asks its own read, all of them
 * again on a revisit, and a search is not cancelled by the next one, so no caller can bound them alone. Four is spec
 * session-view D2b's cap, and the parallelism Node's decoder had on the four threads of libuv's pool. The count is this
 * module's, so each thread that loads it keeps its own: the main process's thread reads for the session page and both
 * searches, the scan worker only for a stripped fork's title (token-stats.ts), a line each and rare, so the process
 * runs four in practice and eight at most.
 */
const COLD_READS_AT_ONCE = 4
let reading = 0
const waiting: Array<() => void> = []

/**
 * A cold rollout has no byte-addressable ranges (spec session-view C2): one pass through its
 * decompressed stream serves every requested range, in input order, and stops once the last range's
 * end has passed — so opening a session is one pass for all its question texts, expanding a turn one
 * pass to that turn, a question search one pass per file. Memory follows the bytes served; `bytesRead` is the
 * decompressed length traversed, which a test can hold against the last range's end as the evidence of
 * a single pass. A read that reaches the stream's end and finds it cut short rejects (spec token-stats
 * B12), as does a file that cannot be read or decompressed as far as the read goes. It starts once fewer than
 * `COLD_READS_AT_ONCE` are running.
 */
export function readColdRanges(file: string, ranges: readonly ByteRange[]): Promise<{ bufs: Buffer[]; bytesRead: number }> {
  return inColdPlace(() => threadEngineModule().readRanges('codex', file, ranges))
}

/**
 * Runs `read`, a read through a cold rollout's stream on a thread of the engine module's own, once fewer than
 * `COLD_READS_AT_ONCE` are running: a range read, a turn's read (turn-read.ts), or a question search (question-search.ts)
 * or full-text search (full-text.ts) of a cold rollout
 */
export async function inColdPlace<T>(read: () => Promise<T>): Promise<T> {
  if (reading < COLD_READS_AT_ONCE) reading++
  else await new Promise<void>((go) => waiting.push(go))
  try {
    return await read()
  } finally {
    // A read that settles, or throws before it starts, hands its place to the first one waiting, or gives it up
    const next = waiting.shift()
    if (next) next()
    else reading--
  }
}
