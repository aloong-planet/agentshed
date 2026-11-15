//! agy's records, read by field number (ADR-0037). agy keeps each conversation in a SQLite database whose rows carry
//! protobuf blobs; the schema is not published, and the field numbers here are those of the descriptors embedded in the
//! agy 1.4.9 binary (exa.cortex_pb.CortexTrajectoryMetadata, CortexStepMetadata, CortexStepGeneratorMetadata and the
//! messages they nest). The extraction script and the descriptor set stay with the research record
//! (~/research/antigravity-cli-internals/spike/), so a drift can be re-checked against a new binary.
//!
//! Only the fields the side needs are read; every other field is skipped by its wire type — a length-delimited one by
//! its length prefix, so a large field (a prompt) is never decoded. A record that ends inside a field is malformed: read
//! as "less", it would quietly turn a broken conversation into a different one.
//!
//! Every number is read as a double built by the operations of the TypeScript reader this one replaced
//! (`src/main/providers/agy-proto.ts`, removed with #431), so a varint beyond 2^53 gives the value JavaScript gave.

/// A record that will not decode
#[derive(Debug)]
pub(super) struct Malformed;

type Decoded<T> = Result<T, Malformed>;

/// A string field's text, as `TextDecoder` gives it: UTF-8 with U+FFFD for an invalid sequence, and a leading byte order
/// mark dropped
pub(super) fn text(bytes: &[u8]) -> String {
    let decoded = String::from_utf8_lossy(bytes);
    match decoded.strip_prefix('\u{feff}') {
        Some(rest) => rest.to_owned(),
        None => decoded.into_owned(),
    }
}

/// `text(bytes) || null`
fn text_or_none(bytes: &[u8]) -> Option<String> {
    Some(text(bytes)).filter(|t| !t.is_empty())
}

/// A base-128 varint as JavaScript's number: exact up to 2^53, and beyond that the double each step rounds to
fn varint(buf: &[u8], pos: &mut usize) -> Decoded<f64> {
    let mut value = 0.0_f64;
    let mut scale = 1.0_f64;
    for _ in 0..10 {
        let b = *buf.get(*pos).ok_or(Malformed)?;
        *pos += 1;
        value += f64::from(b & 0x7f) * scale;
        if b & 0x80 == 0 {
            return Ok(value);
        }
        scale *= 128.0;
    }
    // Longer than ten bytes
    Err(Malformed)
}

/// One field's value: a varint's number, a length-delimited field's bytes, or neither for a fixed-width one (no field
/// the side reads is fixed-width)
#[derive(Clone, Copy)]
enum Value<'a> {
    Varint(f64),
    Bytes(&'a [u8]),
    Fixed,
}

/// One field of a message: its number and its value
#[derive(Clone, Copy)]
struct Field<'a> {
    number: f64,
    value: Value<'a>,
}

impl<'a> Field<'a> {
    fn is(&self, number: u32) -> bool {
        self.number == f64::from(number)
    }

    /// The bytes of a length-delimited field
    fn bytes(&self) -> Option<&'a [u8]> {
        match self.value {
            Value::Bytes(b) => Some(b),
            _ => None,
        }
    }

    /// The bytes of a field a usage record reads as a message or a string: one in another wire type is a record of
    /// another shape
    fn length_delimited(&self) -> Decoded<&'a [u8]> {
        self.bytes().ok_or(Malformed)
    }

    /// The number of a field a usage record reads as a varint
    fn varint_value(&self) -> Decoded<f64> {
        match self.value {
            Value::Varint(v) => Ok(v),
            _ => Err(Malformed),
        }
    }
}

/// Every field of one message, in order, through `each`; a fixed-width field is skipped by its width. Groups (wire types
/// 3 and 4) are malformed: none of the 196 messages reachable from CortexTrajectoryMetadata declares one (agy 1.4.9's
/// descriptors hold a single group field, elsewhere), and 6 and 7 are not protobuf wire types at all.
fn each_field<'a>(buf: &'a [u8], mut each: impl FnMut(Field<'a>) -> Decoded<()>) -> Decoded<()> {
    let mut pos = 0;
    let end = buf.len() as f64;
    while pos < buf.len() {
        let key = varint(buf, &mut pos)?;
        let number = (key / 8.0).floor();
        let wire = key % 8.0;
        let value = if wire == 0.0 {
            Value::Varint(varint(buf, &mut pos)?)
        } else if wire == 2.0 {
            let n = varint(buf, &mut pos)?;
            if pos as f64 + n > end {
                return Err(Malformed);
            }
            let n = n as usize;
            let bytes = &buf[pos..pos + n];
            pos += n;
            Value::Bytes(bytes)
        } else if wire == 1.0 || wire == 5.0 {
            let n = if wire == 1.0 { 8 } else { 4 };
            if pos + n > buf.len() {
                return Err(Malformed);
            }
            pos += n;
            Value::Fixed
        } else {
            return Err(Malformed);
        };
        each(Field { number, value })?;
    }
    Ok(())
}

// ── The trajectory record (token-stats::REQ-003/AC-07, AC-08) ──

/// What a conversation's trajectory metadata says about where it ran and whose child it is
pub(super) struct TrajectoryMetadata {
    /// The folder URIs in the order the record lists them: workspace_uris (7), else each workspace's folder (1.1)
    pub(super) folder_uris: Vec<String>,
    /// parent_conversation_id (5); None when absent or empty
    parent_conversation_id: Option<String>,
    /// nesting_depth (17); 0 when absent
    nesting_depth: f64,
    /// Whether subagent_spec (8) is present
    has_subagent_spec: bool,
}

impl TrajectoryMetadata {
    /// A subagent conversation is one whose own metadata names a parent conversation, or carries a nesting depth or a
    /// subagent spec (token-stats::REQ-003/AC-07) — never judged by where its file sits nor by its trajectory source,
    /// which agy writes as 17 for subagents and main conversations alike (measured)
    pub(super) fn is_subagent(&self) -> bool {
        self.parent_conversation_id.is_some() || self.nesting_depth != 0.0 || self.has_subagent_spec
    }
}

/// Decodes exa.cortex_pb.CortexTrajectoryMetadata, the `main` row of a conversation's trajectory_metadata_blob table.
/// Measured on every conversation of 2026-10-28 (19): both folder fields carry the same folder, a main conversation has
/// none of fields 5, 8 and 17, and a subagent has all three. A field here in another wire type than it is read in is
/// passed over, as the TypeScript reader passes it over.
pub(super) fn trajectory_metadata(buf: &[u8]) -> Decoded<TrajectoryMetadata> {
    let mut uris = Vec::new();
    let mut workspace_folders = Vec::new();
    let mut m = TrajectoryMetadata { folder_uris: Vec::new(), parent_conversation_id: None, nesting_depth: 0.0, has_subagent_spec: false };
    each_field(buf, |f| {
        match (f.number, f.value) {
            // CortexWorkspaceMetadata: workspace_folder_absolute_uri = 1
            (n, Value::Bytes(b)) if n == 1.0 => each_field(b, |w| {
                if let (true, Some(folder)) = (w.is(1), w.bytes()) {
                    workspace_folders.push(text(folder));
                }
                Ok(())
            })?,
            (n, Value::Bytes(b)) if n == 5.0 => m.parent_conversation_id = text_or_none(b),
            (n, Value::Bytes(b)) if n == 7.0 => uris.push(text(b)),
            (n, Value::Bytes(_)) if n == 8.0 => m.has_subagent_spec = true,
            (n, Value::Varint(v)) if n == 17.0 => m.nesting_depth = v,
            _ => {}
        }
        Ok(())
    })?;
    m.folder_uris = if uris.is_empty() { workspace_folders } else { uris };
    Ok(m)
}

// ── Usage records (token-stats::REQ-003) ──
//
// A model call is recorded in a step's metadata (exa.cortex_pb.CortexStepMetadata, `steps.metadata`) and in a
// generator record (exa.cortex_pb.CortexStepGeneratorMetadata, `gen_metadata.data`), each carrying the call's
// exa.codeium_common_pb.ModelUsageStats. A field the side reads arriving with another wire type than its descriptor
// declares is a record of another shape, not a smaller one, and will not decode like a record cut short: read as "no
// such field" it would quietly drop a call (token-stats::REQ-004/AC-01). Fields the side does not read are skipped by
// their wire type whatever it is — the generator record's prompt fields (chat_model.message_prompts, the system prompt)
// by their length prefix, so a prompt of hundreds of megabytes is never decoded. No message reachable from either record
// declares a group (agy 1.4.9's descriptors, checked 2026-10-29).

/// One call's usage as agy records it
#[derive(Clone)]
pub(super) struct ModelUsage {
    /// input_tokens (2): already without the cache reads (measured)
    pub(super) input: f64,
    /// output_tokens (3): thinking already inside (thinking 9 + response 10 = output on every measured call)
    pub(super) output: f64,
    /// cache_write_tokens (4)
    pub(super) cache_write: f64,
    /// cache_read_tokens (5)
    pub(super) cache_read: f64,
    /// The call's identity (token-stats::REQ-003/AC-01): response_id (11), else provider_assigned_message_id (12), else
    /// message_id (7); None when it carries none
    pub(super) identity: Option<String>,
}

impl ModelUsage {
    /// Whether it carries token counts at all: a failed attempt's carries only the model (measured)
    pub(super) fn has_tokens(&self) -> bool {
        self.input + self.output + self.cache_read + self.cache_write > 0.0
    }
}

fn usage(buf: &[u8]) -> Decoded<ModelUsage> {
    let mut u = ModelUsage { input: 0.0, output: 0.0, cache_write: 0.0, cache_read: 0.0, identity: None };
    let (mut message_id, mut response_id, mut provider_id) = (String::new(), String::new(), String::new());
    each_field(buf, |f| {
        if f.is(2) {
            u.input = f.varint_value()?;
        } else if f.is(3) {
            u.output = f.varint_value()?;
        } else if f.is(4) {
            u.cache_write = f.varint_value()?;
        } else if f.is(5) {
            u.cache_read = f.varint_value()?;
        } else if f.is(7) {
            message_id = text(f.length_delimited()?);
        } else if f.is(11) {
            response_id = text(f.length_delimited()?);
        } else if f.is(12) {
            provider_id = text(f.length_delimited()?);
        }
        Ok(())
    })?;
    u.identity = [response_id, provider_id, message_id].into_iter().find(|id| !id.is_empty());
    Ok(u)
}

/// google.protobuf.Timestamp as epoch ms
fn timestamp(buf: &[u8]) -> Decoded<f64> {
    let (mut seconds, mut nanos) = (0.0, 0.0);
    each_field(buf, |f| {
        if f.is(1) {
            seconds = f.varint_value()?;
        } else if f.is(2) {
            nanos = f.varint_value()?;
        }
        Ok(())
    })?;
    Ok(seconds * 1000.0 + (nanos / 1_000_000.0).floor())
}

/// exa.cortex_pb.RetryInfo's usage (2)
fn retry(buf: &[u8]) -> Decoded<Option<ModelUsage>> {
    let mut u = None;
    each_field(buf, |f| {
        if f.is(2) {
            u = Some(usage(f.length_delimited()?)?);
        }
        Ok(())
    })?;
    Ok(u)
}

/// What a step's metadata says about the call it recorded
pub(super) struct StepMetadata {
    /// created_at (1), epoch ms
    pub(super) created_at: Option<f64>,
    /// completed_at (8), epoch ms
    pub(super) completed_at: Option<f64>,
    /// model_usage (9); None when the step recorded no call
    pub(super) usage: Option<ModelUsage>,
    /// Each retry_infos (28) entry's usage (2), None for an entry without one
    pub(super) retries: Vec<Option<ModelUsage>>,
    /// source_trajectory_step_info (20).cascade_id (4): the conversation the step was recorded in — another
    /// conversation's id on a step a fork copied (measured); None when absent
    pub(super) source_conversation_id: Option<String>,
}

/// Decodes exa.cortex_pb.CortexStepMetadata, a row of a conversation's `steps.metadata`
pub(super) fn step_metadata(buf: &[u8]) -> Decoded<StepMetadata> {
    let mut m = StepMetadata { created_at: None, completed_at: None, usage: None, retries: Vec::new(), source_conversation_id: None };
    each_field(buf, |f| {
        if f.is(1) {
            m.created_at = Some(timestamp(f.length_delimited()?)?);
        } else if f.is(8) {
            m.completed_at = Some(timestamp(f.length_delimited()?)?);
        } else if f.is(9) {
            m.usage = Some(usage(f.length_delimited()?)?);
        } else if f.is(28) {
            m.retries.push(retry(f.length_delimited()?)?);
        } else if f.is(20) {
            // SourceTrajectoryStepInfo: trajectory_id 1, step_index 2, metadata_index 3, cascade_id 4
            each_field(f.length_delimited()?, |s| {
                if s.is(4) {
                    m.source_conversation_id = text_or_none(s.length_delimited()?);
                }
                Ok(())
            })?;
        }
        Ok(())
    })?;
    Ok(m)
}

/// What a generator record says about the call it made
pub(super) struct GeneratorMetadata {
    /// step_indices (2): the steps the call produced (packed, as agy writes it, or unpacked)
    pub(super) step_indices: Vec<f64>,
    /// chat_model (1).usage (4); None when absent
    pub(super) usage: Option<ModelUsage>,
    /// chat_model.retry_infos (17): each entry's usage (2), None for an entry without one. agy lists the successful
    /// attempt here too, so the first entry repeats the call (measured)
    pub(super) retries: Vec<Option<ModelUsage>>,
    /// chat_model.response_model (19) as agy recorded it; None when absent or empty
    pub(super) response_model: Option<String>,
    /// chat_model.custom_metadata (20)'s `cascade_id`: the conversation that made the call — the parent's on a record a
    /// fork copied (all 56 measured records carry it, failed calls included); None when absent
    pub(super) conversation_id: Option<String>,
}

/// Decodes exa.cortex_pb.CortexStepGeneratorMetadata, a row of a conversation's `gen_metadata.data`
pub(super) fn generator_metadata(buf: &[u8]) -> Decoded<GeneratorMetadata> {
    let mut g = GeneratorMetadata { step_indices: Vec::new(), usage: None, retries: Vec::new(), response_model: None, conversation_id: None };
    each_field(buf, |f| {
        if f.is(2) {
            // A repeated uint32: packed into one length-delimited run of varints (how agy writes it), or one varint per
            // field (the other encoding the protobuf format allows)
            if let Value::Varint(v) = f.value {
                g.step_indices.push(v);
            } else {
                let run = f.length_delimited()?;
                let mut pos = 0;
                while pos < run.len() {
                    g.step_indices.push(varint(run, &mut pos)?);
                }
            }
        } else if f.is(1) {
            // ChatModelMetadata, the oneof's chat-model branch; an injected response (7) is no model call
            each_field(f.length_delimited()?, |c| {
                if c.is(4) {
                    g.usage = Some(usage(c.length_delimited()?)?);
                } else if c.is(17) {
                    g.retries.push(retry(c.length_delimited()?)?);
                } else if c.is(19) {
                    g.response_model = text_or_none(c.length_delimited()?);
                } else if c.is(20) {
                    // A map<string, string> entry: key 1, value 2
                    let (mut key, mut value) = (String::new(), String::new());
                    each_field(c.length_delimited()?, |e| {
                        if e.is(1) {
                            key = text(e.length_delimited()?);
                        } else if e.is(2) {
                            value = text(e.length_delimited()?);
                        }
                        Ok(())
                    })?;
                    if key == "cascade_id" {
                        g.conversation_id = Some(value).filter(|v| !v.is_empty());
                    }
                }
                Ok(())
            })?;
        }
        Ok(())
    })?;
    Ok(g)
}
