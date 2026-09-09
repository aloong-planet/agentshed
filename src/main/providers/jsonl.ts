// Read jsonl line by line, giving each line's **byte** range within the file.
//
// Why not readline: it hands back strings only, with no byte offsets — and the premise of "click a
// question and fetch its whole turn on demand"
// is being able to call createReadStream({ start, end }) on the source file (spec C2), where the offsets
// have to be bytes.
// Computing them afterwards with Buffer.byteLength(line) does not work either — readline eats the line
// ending (with no way to tell \n from \r\n),
// so the reconstructed offsets drift cumulatively line by line.
//
// Splitting on 0x0A is safe for UTF-8: every continuation byte of a multi-byte sequence is ≥ 0x80, so \n
// can never appear
// inside a character. So the Buffer is only split at newlines and decoded once a whole line has arrived,
// and a multi-byte character spanning read chunks is never cut in half.
//
// Chunk size: 1 MB, not the stream's 64 KB default. Under Electron each 64 KB chunk costs about 3 ms
// more than it does under Node (measured 2026-09-09 on an 839 MB Codex session already in the page
// cache: 44.6 s in the Electron main process against 3.5 s under Node; the mechanism was not
// profiled, and a worker thread in the same process paid the same), so the default turned every
// gigabyte of live session into a minute of startup scan. The size is chosen on the whole cold scan,
// not on that file: fs.ReadStream allocates a chunk-sized buffer for every read (Node 24's `_read`),
// so a scan over thousands of small files pays for a large chunk on each of them. The big file alone
// keeps getting faster up to 8 MB (2.0 s at 1 MB, 1.4 s at 8 MB), while the whole set (3.3 GB in
// 3947 files) reads 15.5 s at 256 KB, 12.5 s at 512 KB, 11.3 s at 1 MB, 12.5 s at 2 MB, 17.6 s at
// 4 MB and 49.8 s at 16 MB, against 90.5 s at the default. A larger chunk also bounds the
// Buffer.concat copies a multi-megabyte line costs (the longest measured is 13.5 MB). Files are read
// one after another, so the price is one 1 MB buffer per read in flight. The size is a parameter so
// tests can put a chunk boundary where they want it instead of guessing the runtime's default; the
// invariant that such numbers are measured under Electron, never Node, is in CONTEXT.md, and
// `pnpm bench:scan` is how they are taken.
import { createReadStream } from 'node:fs'

const NEWLINE = 0x0a

/** The read chunk size in production, in bytes; see the header for why it is not the stream default */
export const JSONL_CHUNK_BYTES = 1024 * 1024

/**
 * @param onLine Called once per line that **parses into an object**.
 *   `start` = that line's first byte offset; `end` = the offset after the line ending (the file length
 *   when the last line has none).
 *   So [start, end) slices out "the whole line plus its line ending", and adjacent lines meet end to end
 *   with no overlap and no gap.
 *   Empty lines, bad lines and lines whose top level is not an object are all skipped (an active session
 *   may be mid-line), but the bytes they occupy
 *   still count toward the offsets — skipping only hurts itself and does not disturb the lines after it.
 * @param chunkBytes The read chunk size in bytes. Production takes the default; tests pass a small
 *   value to place a chunk boundary exactly where the case needs one.
 * @throws When the file cannot be opened, leaving the caller to decide how to degrade (discard the whole
 *   file, or record zero).
 */
export async function eachJsonlLine(
  file: string,
  onLine: (obj: Record<string, unknown>, start: number, end: number) => void,
  chunkBytes: number = JSONL_CHUNK_BYTES
): Promise<void> {
  const emit = (line: Buffer, start: number, end: number): void => {
    if (line.length === 0) return
    const text = line.toString('utf8')
    if (!text.trim()) return
    try {
      const obj: unknown = JSON.parse(text)
      if (typeof obj === 'object' && obj !== null) onLine(obj as Record<string, unknown>, start, end)
    } catch {
      // Skip bad lines (an active session mid-write, or corruption)
    }
  }

  let pending: Buffer | null = null
  /** The offset of pending's first byte within the file */
  let base = 0
  const stream: AsyncIterable<Buffer> = createReadStream(file, { highWaterMark: chunkBytes })
  for await (const chunk of stream) {
    const buf: Buffer = pending === null ? chunk : Buffer.concat([pending, chunk])
    let from = 0
    for (;;) {
      const nl = buf.indexOf(NEWLINE, from)
      if (nl === -1) break
      emit(buf.subarray(from, nl), base + from, base + nl + 1)
      from = nl + 1
    }
    pending = from < buf.length ? buf.subarray(from) : null
    base += from
  }
  if (pending !== null) emit(pending, base, base + pending.length)
}
