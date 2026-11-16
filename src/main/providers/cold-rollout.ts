// Cold rollouts (spec token-stats B12, session-view C2): Codex compresses a rollout untouched for seven
// days into `<name>.jsonl.zst` and deletes the plain file (its compression.rs, read 2026-09-09). The same
// session, the same contents, the same identity rules — but readable only as a stream from its start:
// every byte offset the question index records for it is an offset in the decompressed stream, and
// every range read is one pass through that stream that stops at the last range (range-read.ts).
// The engine module reads it (ADR-0045), by the reader the scan reads a cold rollout with and under the
// same truncation rule, on a thread of its own. Node's own zstd decoder is not used: under Electron 43
// (Node 24) it stopped at a stream's first frame whenever the second began inside the same read
// (measured 2026-11-16). Decompressing a whole file into memory for a range read was rejected on
// measurement (the 921 MB active rollout would hold about 1.4 GB); memory here follows the bytes served.
import { readFile } from 'node:fs/promises'
import { threadEngineModule } from '../engine-module'
import type { ByteRange } from './range-read'

const COLD_SUFFIX = '.jsonl.zst'

export function isColdRollout(file: string): boolean {
  return file.endsWith(COLD_SUFFIX)
}

/**
 * A cold rollout has no byte-addressable ranges (spec session-view C2): one pass through its
 * decompressed stream serves every requested range, in input order, and stops once the last range's
 * end has passed — so opening a session is one pass for all its question texts, expanding a turn one
 * pass to that turn, a search one pass per file. Memory follows the bytes served; `bytesRead` is the
 * decompressed length traversed, which a test can hold against the last range's end as the evidence of
 * a single pass. A read that reaches the stream's end and finds it cut short rejects (spec token-stats
 * B12), as does a file that cannot be read or decompressed as far as the read goes.
 */
export function readColdRanges(file: string, ranges: readonly ByteRange[]): Promise<{ bufs: Buffer[]; bytesRead: number }> {
  return threadEngineModule().readRanges('codex', file, ranges)
}

/** The whole rollout, decompressed for a cold one — the full-text search's read-whole path (spec D2, D3) */
export async function readRolloutWhole(file: string): Promise<Buffer> {
  if (!isColdRollout(file)) return readFile(file)
  // One range from the stream's start past any end a file can have: the read goes to the stream's end,
  // where the truncation rule judges it
  const { bufs } = await readColdRanges(file, [{ start: 0, end: Number.MAX_SAFE_INTEGER }])
  return bufs[0]
}
