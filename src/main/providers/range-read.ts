// Reading a file by byte range (spec C2/D2b): fetching a turn on a question click, reading text for the
// question list, and reading back for search
// all go through this one path — **never reading whole**, so a 133 MB session reads the same order of
// magnitude as a 3 MB one.
//
// The concurrency cap defaults to 4 (spec D2b: 🔬 a to-be-confirmed value). The measured warm-cache knee
// is at 8; 4 is taken because
// it equals Node's default libuv thread pool size, and going beyond 4 only pays off if
// UV_THREADPOOL_SIZE is raised at the same time;
// do not touch this value until cold-disk data exists (destination: .scratch/scan-cold-start/).
import { open } from 'node:fs/promises'

/** A shared bounded-concurrency map: results come back in input order, regardless of completion order */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  let firstErr: unknown
  let failed = false
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length || failed) return
      try {
        out[i] = await fn(items[i], i)
      } catch (e) {
        if (!failed) {
          failed = true
          firstErr = e
        }
        return
      }
    }
  })
  // Wait for **every** in-flight task to settle before throwing (allSettled semantics): Promise.all
  // rejects at the first error,
  // leaving in-flight promises with no listener — and their later failures (an EBADF because the caller's
  // finally already closed the fd, say)
  // are unhandledRejections, which smoke's error grep amplifies into a red gate.
  await Promise.all(workers)
  if (failed) throw firstErr
  return out
}

export interface ByteRange {
  start: number
  /** The exclusive upper bound (the same convention as QuestionRec's [start, end)) */
  end: number
}

/**
 * Read each range's raw bytes (used by search's byte matching layer, ticket 08: the coarse pass does not
 * decode).
 * `bytesRead` is the total bytes actually read — the **evidence** that nothing was read whole, and what
 * tests assert on
 * rather than wall-clock time (which drifts with the page cache).
 * A range past the end of the file is truncated to what is readable; if the file cannot be opened the
 * whole call is refused and the caller degrades.
 */
export async function readRangeBuffers(
  file: string,
  ranges: readonly ByteRange[],
  limit = 4
): Promise<{ bufs: Buffer[]; bytesRead: number }> {
  const fd = await open(file, 'r')
  let bytesRead = 0
  try {
    const bufs = await mapLimit(ranges, limit, async (g) => {
      const len = Math.max(0, g.end - g.start)
      if (len === 0) return Buffer.alloc(0)
      const buf = Buffer.alloc(len)
      const r = await fd.read(buf, 0, len, g.start)
      bytesRead += r.bytesRead
      return buf.subarray(0, r.bytesRead)
    })
    return { bufs, bytesRead }
  } finally {
    await fd.close()
  }
}

/** Read each range's UTF-8 text (a decoding skin over readRangeBuffers) */
export async function readRanges(
  file: string,
  ranges: readonly ByteRange[],
  limit = 4
): Promise<{ texts: string[]; bytesRead: number }> {
  const { bufs, bytesRead } = await readRangeBuffers(file, ranges, limit)
  return { texts: bufs.map((b) => b.toString('utf8')), bytesRead }
}
