// Antigravity CLI's records, read by field number (ADR-0037). agy keeps each conversation in a SQLite database whose
// rows carry protobuf blobs; the schema is not published, and the field numbers here are those of the descriptors
// embedded in the agy 1.4.9 binary (exa.cortex_pb.CortexTrajectoryMetadata and the messages it nests). The extraction
// script and the descriptor set stay with the research record (~/research/antigravity-cli-internals/spike/), so a
// drift can be re-checked against a new binary.
//
// Only the fields the side needs are read; every other field is skipped by its wire type — a length-delimited one by
// its length prefix, so a large field (a prompt) is never materialised. A record that ends inside a field is malformed
// and throws: decoding it as "less" would quietly turn a broken conversation into a different one.
import { fileURLToPath } from 'node:url'

/** The read position over one message's bytes */
interface Cursor {
  buf: Uint8Array
  pos: number
}

function malformed(what: string): Error {
  return new Error(`agy record: ${what}`)
}

/** A base-128 varint as a number: exact up to 2^53. The one value read from a varint is nesting_depth, judged only as
 * zero or not, which a loss of precision in a huge (or negative int32) value cannot change */
function readVarint(c: Cursor): number {
  let value = 0
  let scale = 1
  for (let i = 0; i < 10; i++) {
    if (c.pos >= c.buf.length) throw malformed('varint runs past the end')
    const b = c.buf[c.pos++]
    value += (b & 0x7f) * scale
    if ((b & 0x80) === 0) return value
    scale *= 0x80
  }
  throw malformed('varint longer than ten bytes')
}

/** One field of a message: its number, and its value — a number for a varint, the bytes for a length-delimited one */
interface Field {
  field: number
  varint: number | null
  bytes: Uint8Array | null
}

/** Every field of one message, in order; fixed-width and unread fields are skipped by their wire type */
function* fieldsOf(buf: Uint8Array): Generator<Field> {
  const c: Cursor = { buf, pos: 0 }
  while (c.pos < buf.length) {
    const key = readVarint(c)
    const field = Math.floor(key / 8)
    const wire = key % 8
    if (wire === 0) {
      yield { field, varint: readVarint(c), bytes: null }
    } else if (wire === 2) {
      const n = readVarint(c)
      if (c.pos + n > buf.length) throw malformed(`field ${field} runs past the end`)
      yield { field, varint: null, bytes: buf.subarray(c.pos, c.pos + n) }
      c.pos += n
    } else if (wire === 1 || wire === 5) {
      const n = wire === 1 ? 8 : 4
      if (c.pos + n > buf.length) throw malformed(`field ${field} runs past the end`)
      c.pos += n
    } else {
      // Groups (3, 4): none of the 196 messages reachable from CortexTrajectoryMetadata declares one (agy 1.4.9's
      // descriptors hold a single group field, elsewhere); 6 and 7 are not protobuf wire types at all
      throw malformed(`wire type ${wire}`)
    }
  }
}

const text = new TextDecoder()

/** What a conversation's trajectory metadata says about where it ran and whose child it is */
export interface TrajectoryMetadata {
  /** The folder URIs in the order the record lists them: workspace_uris (7), else each workspace's folder (1.1) */
  folderUris: string[]
  /** parent_conversation_id (5); null when absent or empty */
  parentConversationId: string | null
  /** nesting_depth (17); 0 when absent */
  nestingDepth: number
  /** Whether subagent_spec (8) is present */
  hasSubagentSpec: boolean
}

/**
 * Decode exa.cortex_pb.CortexTrajectoryMetadata — the `main` row of a conversation's trajectory_metadata_blob table.
 * Measured on every conversation of 2026-10-28 (19): both folder fields carry the same folder, a main conversation
 * has none of fields 5, 8 and 17, and a subagent has all three.
 */
export function decodeTrajectoryMetadata(buf: Uint8Array): TrajectoryMetadata {
  const uris: string[] = []
  const workspaceFolders: string[] = []
  let parent: string | null = null
  let depth = 0
  let spec = false
  for (const f of fieldsOf(buf)) {
    if (f.field === 1 && f.bytes) {
      // CortexWorkspaceMetadata: workspace_folder_absolute_uri = 1
      for (const w of fieldsOf(f.bytes)) if (w.field === 1 && w.bytes) workspaceFolders.push(text.decode(w.bytes))
    } else if (f.field === 5 && f.bytes) {
      parent = text.decode(f.bytes) || null
    } else if (f.field === 7 && f.bytes) {
      uris.push(text.decode(f.bytes))
    } else if (f.field === 8 && f.bytes) {
      spec = true
    } else if (f.field === 17 && f.varint !== null) {
      depth = f.varint
    }
  }
  return {
    folderUris: uris.length > 0 ? uris : workspaceFolders,
    parentConversationId: parent,
    nestingDepth: depth,
    hasSubagentSpec: spec
  }
}

/**
 * A subagent conversation is one whose own metadata names a parent conversation, or carries a nesting depth or a
 * subagent spec (token-stats::REQ-003/AC-07) — never judged by where its file sits nor by its trajectory source, which
 * agy writes as 17 for subagents and main conversations alike (measured).
 */
export function isSubagent(m: TrajectoryMetadata): boolean {
  return m.parentConversationId !== null || m.nestingDepth !== 0 || m.hasSubagentSpec
}

/** A folder URI's local path; null for one that is not a `file:` URI or does not parse */
export function folderPath(uri: string): string | null {
  try {
    const url = new URL(uri)
    return url.protocol === 'file:' ? fileURLToPath(url) : null
  } catch {
    return null
  }
}

/**
 * The folder a conversation is credited to: the first one its metadata lists, presumed to be the directory agy was
 * launched in (token-stats::REQ-003/AC-08). Null when the record lists none, or the first is not a local folder.
 */
export function firstFolder(m: TrajectoryMetadata): string | null {
  return m.folderUris.length > 0 ? folderPath(m.folderUris[0]) : null
}
