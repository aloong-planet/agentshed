// Cold rollouts (spec token-stats B12, session-view C2): Codex compresses a rollout untouched for seven
// days into `<name>.jsonl.zst` and deletes the plain file (its compression.rs, read 2026-09-09). The same
// session, the same contents, the same identity rules — but readable only as a stream from its start:
// every byte offset the question index records for it is an offset in the decompressed stream, and
// every range read is one streaming decompression that stops at the last range (range-read.ts).
// Decompressing a whole file into memory was rejected on measurement (the 921 MB active rollout would
// hold about 1.4 GB); memory here follows the bytes served.
import { createReadStream, openSync, readSync, closeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { constants, createZstdDecompress, zstdDecompressSync } from 'node:zlib'

const COLD_SUFFIX = '.jsonl.zst'

export function isColdRollout(file: string): boolean {
  return file.endsWith(COLD_SUFFIX)
}

/** Whether a directory entry is a rollout at all: plain or cold */
export function isRolloutName(name: string): boolean {
  return name.endsWith('.jsonl') || name.endsWith(COLD_SUFFIX)
}

/** The rollout's file name without either suffix — the title fallback and the id are taken from it */
export function rolloutStem(file: string): string | null {
  const name = file.split('/').pop()
  if (name === undefined) return null
  return name.endsWith(COLD_SUFFIX) ? name.slice(0, -COLD_SUFFIX.length) : name.replace(/\.jsonl$/, '')
}

/**
 * The rollout's bytes as a chunk stream: the file itself for a plain rollout, the decompressed stream for
 * a cold one. A read error on the compressed file is forwarded into the decompression stream, so the
 * consumer's `for await` throws instead of hanging; a corrupt or truncated stream throws from the
 * decoder the same way.
 */
export function rolloutBytes(file: string, highWaterMark: number): AsyncIterable<Buffer> {
  const raw = createReadStream(file, { highWaterMark })
  if (!isColdRollout(file)) return raw
  // The decoder's output chunk is the consumer's read chunk: at its 16 KB default the line reader paid the
  // per-chunk Electron cost the 1 MB read chunk exists to avoid (measured 2026-09-11, ten cold rollouts of
  // 525 MB: 9.0 s against 1.0 s plain; see the figure recorded in spec token-stats B12 for the size below)
  const dec = createZstdDecompress({ chunkSize: highWaterMark })
  raw.on('error', (e) => dec.destroy(e))
  // A consumer that stops early (a range read that reached its last range) destroys the decoder; the
  // file stream must not stay open behind it
  dec.on('close', () => raw.destroy())
  return completeOrThrow(raw.pipe(dec))
}

/**
 * Node's zstd decoder reports nothing for a truncated frame (measured 2026-09-11 on Node 24: a stream
 * cut in half decodes its first half and ends cleanly, synchronously and as a stream alike), so
 * truncation is judged by the recorder's own mechanism instead: every rollout line ends with a newline
 * and a cold rollout is never mid-write (Codex compresses only what was untouched for seven days), so a
 * decompressed stream that does not end with a newline is cut short (spec token-stats B12). Measured
 * over every rollout on this machine, all 1391 end with a newline, the 935 cold ones included. A cut
 * landing exactly on a line end escapes this and reads as a shorter session — self-harm, that file only.
 */
async function* completeOrThrow(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
  let last = -1
  for await (const chunk of stream) {
    if (chunk.length > 0) last = chunk[chunk.length - 1]
    yield chunk
  }
  if (last !== -1 && last !== 0x0a) throw new Error('cold rollout truncated: the decompressed stream does not end with a newline')
}

/** The whole rollout, decompressed for a cold one — the full-text search's read-whole path (spec D3) */
export async function readRolloutWhole(file: string): Promise<Buffer> {
  if (!isColdRollout(file)) return readFile(file)
  const parts: Buffer[] = []
  for await (const chunk of rolloutBytes(file, WHOLE_CHUNK)) parts.push(chunk)
  return Buffer.concat(parts)
}

/** The read chunk for streaming reads of a cold rollout; the line reader's own size is its own choice */
export const COLD_CHUNK_BYTES = 1024 * 1024
const WHOLE_CHUNK = COLD_CHUNK_BYTES

/** The compressed bytes read per step while looking for the first newline */
const HEAD_STEP = 64 * 1024

/**
 * A cold rollout's first line, decoded synchronously from a growing compressed prefix: zstd decodes a
 * truncated stream up to what it holds when asked to flush rather than finish (measured 2026-09-11: 4 KB
 * of compressed bytes yield the 40 KB first line). `maxBytes` caps the decompressed prefix, as the plain
 * reader caps its own. Returns null when no newline is found within the cap, or when the file is not zstd.
 */
export function readFirstLineCold(file: string, maxBytes: number): string | null {
  const fd = openSync(file, 'r')
  try {
    const chunks: Buffer[] = []
    let offset = 0
    for (;;) {
      const buf = Buffer.alloc(HEAD_STEP)
      const n = readSync(fd, buf, 0, HEAD_STEP, offset)
      if (n > 0) {
        chunks.push(buf.subarray(0, n))
        offset += n
      }
      const out = zstdDecompressSync(Buffer.concat(chunks), { finishFlush: constants.ZSTD_e_flush })
      const nl = out.indexOf(0x0a)
      if (nl !== -1) return out.subarray(0, nl).toString('utf8')
      if (n === 0) return out.length > 0 ? out.toString('utf8') : null
      if (out.length >= maxBytes) return null
    }
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}
