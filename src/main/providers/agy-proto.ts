// Antigravity CLI's records, read by field number (ADR-0037). agy keeps each conversation in a SQLite database whose
// rows carry protobuf blobs; the schema is not published, and the field numbers here are those of the descriptors
// embedded in the agy 1.4.9 binary (exa.cortex_pb.CortexTrajectoryMetadata, CortexStepMetadata,
// CortexStepGeneratorMetadata and the messages they nest). The extraction
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

/** One field of a message: its number, and its value — a number for a varint, the bytes for a length-delimited one,
 * neither for a fixed-width one (no field the readers read is fixed-width) */
interface Field {
  field: number
  varint: number | null
  bytes: Uint8Array | null
}

/** Every field of one message, in order; a fixed-width field's value is skipped by its width */
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
      yield { field, varint: null, bytes: null }
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

// ── Usage records (token-stats::REQ-003) ──
//
// A model call is recorded in a step's metadata (exa.cortex_pb.CortexStepMetadata, `steps.metadata`) and in a
// generator record (exa.cortex_pb.CortexStepGeneratorMetadata, `gen_metadata.data`), each carrying the call's
// exa.codeium_common_pb.ModelUsageStats. A field the reader reads arriving with another wire type than its descriptor
// declares is a record of another shape, not a smaller one, and throws like a record cut short: decoding it as "no
// such field" would quietly drop a call (token-stats::REQ-004/AC-01). Fields the reader does not read are skipped by
// their wire type whatever it is — the generator record's prompt fields (chat_model.message_prompts, the system prompt)
// by their length prefix, so a prompt of hundreds of megabytes is never decoded. No message reachable from either
// record declares a group (agy 1.4.9's descriptors, checked 2026-10-29).

/** One call's usage as agy records it */
export interface ModelUsage {
  /** input_tokens (2): already without the cache reads (measured) */
  input: number
  /** output_tokens (3): thinking already inside (thinking 9 + response 10 = output on every measured call) */
  output: number
  /** cache_write_tokens (4) */
  cacheWrite: number
  /** cache_read_tokens (5) */
  cacheRead: number
  /** The call's identity (token-stats::REQ-003/AC-01): response_id (11), else provider_assigned_message_id (12), else
   * message_id (7); null when it carries none */
  identity: string | null
}

/** What a step's metadata says about the call it recorded */
export interface StepMetadata {
  /** created_at (1), epoch ms; null when absent */
  createdAt: number | null
  /** completed_at (8), epoch ms; null when absent */
  completedAt: number | null
  /** model_usage (9); null when the step recorded no call */
  usage: ModelUsage | null
  /** Each retry_infos (28) entry's usage (2), null for an entry without one */
  retries: Array<ModelUsage | null>
  /** source_trajectory_step_info (20).cascade_id (4): the conversation the step was recorded in — another
   * conversation's id on a step a fork copied (measured); null when absent */
  sourceConversationId: string | null
}

/** What a generator record says about the call it made */
export interface GeneratorMetadata {
  /** step_indices (2): the steps the call produced (packed, as agy writes it, or unpacked) */
  stepIndices: number[]
  /** chat_model (1).usage (4); null when absent */
  usage: ModelUsage | null
  /** chat_model.retry_infos (17): each entry's usage (2), null for an entry without one. agy lists the successful
   * attempt here too, so the first entry repeats the call (measured) */
  retries: Array<ModelUsage | null>
  /** chat_model.response_model (19) as agy recorded it; null when absent or empty */
  responseModel: string | null
  /** chat_model.custom_metadata (20)'s `cascade_id`: the conversation that made the call — the parent's on a record a
   * fork copied (all 56 measured records carry it, failed calls included); null when absent */
  conversationId: string | null
}

function lengthDelimited(f: Field): Uint8Array {
  if (f.bytes === null) throw malformed(`field ${f.field} is not length-delimited`)
  return f.bytes
}

function varintValue(f: Field): number {
  if (f.varint === null) throw malformed(`field ${f.field} is not a varint`)
  return f.varint
}

function decodeUsage(buf: Uint8Array): ModelUsage {
  const u = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  let messageId = ''
  let responseId = ''
  let providerId = ''
  for (const f of fieldsOf(buf)) {
    if (f.field === 2) u.input = varintValue(f)
    else if (f.field === 3) u.output = varintValue(f)
    else if (f.field === 4) u.cacheWrite = varintValue(f)
    else if (f.field === 5) u.cacheRead = varintValue(f)
    else if (f.field === 7) messageId = text.decode(lengthDelimited(f))
    else if (f.field === 11) responseId = text.decode(lengthDelimited(f))
    else if (f.field === 12) providerId = text.decode(lengthDelimited(f))
  }
  return { ...u, identity: responseId || providerId || messageId || null }
}

/** google.protobuf.Timestamp as epoch ms */
function decodeTimestamp(buf: Uint8Array): number {
  let seconds = 0
  let nanos = 0
  for (const f of fieldsOf(buf)) {
    if (f.field === 1) seconds = varintValue(f)
    else if (f.field === 2) nanos = varintValue(f)
  }
  return seconds * 1000 + Math.floor(nanos / 1_000_000)
}

/** exa.cortex_pb.RetryInfo's usage (2) */
function decodeRetry(buf: Uint8Array): ModelUsage | null {
  let usage: ModelUsage | null = null
  for (const f of fieldsOf(buf)) if (f.field === 2) usage = decodeUsage(lengthDelimited(f))
  return usage
}

/** Decode exa.cortex_pb.CortexStepMetadata — a row of a conversation's `steps.metadata` */
export function decodeStepMetadata(buf: Uint8Array): StepMetadata {
  const m: StepMetadata = { createdAt: null, completedAt: null, usage: null, retries: [], sourceConversationId: null }
  for (const f of fieldsOf(buf)) {
    if (f.field === 1) m.createdAt = decodeTimestamp(lengthDelimited(f))
    else if (f.field === 8) m.completedAt = decodeTimestamp(lengthDelimited(f))
    else if (f.field === 9) m.usage = decodeUsage(lengthDelimited(f))
    else if (f.field === 28) m.retries.push(decodeRetry(lengthDelimited(f)))
    else if (f.field === 20) {
      // SourceTrajectoryStepInfo: trajectory_id 1, step_index 2, metadata_index 3, cascade_id 4
      for (const s of fieldsOf(lengthDelimited(f))) {
        if (s.field === 4) m.sourceConversationId = text.decode(lengthDelimited(s)) || null
      }
    }
  }
  return m
}

/** Decode exa.cortex_pb.CortexStepGeneratorMetadata — a row of a conversation's `gen_metadata.data` */
export function decodeGeneratorMetadata(buf: Uint8Array): GeneratorMetadata {
  const g: GeneratorMetadata = { stepIndices: [], usage: null, retries: [], responseModel: null, conversationId: null }
  for (const f of fieldsOf(buf)) {
    if (f.field === 2) {
      // A repeated uint32: packed into one length-delimited run of varints (how agy writes it), or one varint per
      // field (the other encoding the protobuf format allows)
      if (f.varint !== null) g.stepIndices.push(f.varint)
      else {
        const c: Cursor = { buf: lengthDelimited(f), pos: 0 }
        while (c.pos < c.buf.length) g.stepIndices.push(readVarint(c))
      }
    } else if (f.field === 1) {
      // ChatModelMetadata — the oneof's chat-model branch; an injected response (7) is no model call
      for (const c of fieldsOf(lengthDelimited(f))) {
        if (c.field === 4) g.usage = decodeUsage(lengthDelimited(c))
        else if (c.field === 17) g.retries.push(decodeRetry(lengthDelimited(c)))
        else if (c.field === 19) g.responseModel = text.decode(lengthDelimited(c)) || null
        else if (c.field === 20) {
          // A map<string, string> entry: key 1, value 2
          let key = ''
          let value = ''
          for (const e of fieldsOf(lengthDelimited(c))) {
            if (e.field === 1) key = text.decode(lengthDelimited(e))
            else if (e.field === 2) value = text.decode(lengthDelimited(e))
          }
          if (key === 'cascade_id') g.conversationId = value || null
        }
      }
    }
  }
  return g
}

/** Whether a usage carries token counts at all — a failed attempt's carries only the model (measured) */
export function hasTokens(u: ModelUsage): boolean {
  return u.input + u.output + u.cacheRead + u.cacheWrite > 0
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
