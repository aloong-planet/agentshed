//! An Antigravity CLI conversation's entry: what a parse of it gives (the token cache's per-file aggregate,
//! `AntigravityFileAgg` in `src/main/providers/token-stats.ts`), and what a parse is given.

use std::path::PathBuf;

use crate::question::Record;
use crate::text::Units;

/// What a parse is given
pub(super) struct Job {
    /// The conversation database, the session's identity
    pub(super) file: String,
    /// Its full transcript, where its questions are (session-view::REQ-004): `agyTranscriptPath`'s, as the planning
    /// thread works it out, so the question index and the session page's range reads take one path
    pub(super) transcript: String,
    /// Where a copy is made when a log is beside the database
    pub(super) tmp_parent: PathBuf,
}

/// One model call, as the token cache keeps it: `[identity, time, input, output, cache read, cache write, model]`. The
/// identity is the call's response id, else its provider-assigned id, else its message id; None when it carries none,
/// and then it is never matched across databases. The time is the call's step's completion, else its creation
/// (token-stats::REQ-003/AC-05); None for a call recorded by a generator record alone. The model is the generator
/// record's response model as agy recorded it; None without one (token-stats::REQ-003/AC-04).
pub(super) struct Call {
    pub(super) identity: Option<String>,
    pub(super) at: Option<f64>,
    pub(super) input: f64,
    pub(super) output: f64,
    pub(super) cache_read: f64,
    pub(super) cache_write: f64,
    pub(super) model: Option<String>,
}

/// A readable conversation's entry
pub(super) struct Entry {
    /// The merge key of the first folder its trajectory record lists (token-stats::REQ-003/AC-08); empty when none is a
    /// local folder
    pub(super) project_key: Units,
    pub(super) calls: Vec<Call>,
    /// Its own id as its trajectory table records it: the key agy's summaries and a fork's copied steps name it by
    pub(super) conversation_id: String,
    /// A subagent conversation gets no row (token-stats::REQ-003/AC-07)
    pub(super) subagent: bool,
    /// Listed: no subagent, and at least one question (session-view::REQ-003/AC-02)
    pub(super) listed: bool,
    /// The largest step timestamp in the database (session-view::REQ-003/AC-04)
    pub(super) at: Option<f64>,
    /// For a fork, the conversation its last copied step came from (session-view::REQ-005/AC-02)
    pub(super) fork_of: Option<String>,
    /// The first question clipped as a title: the fallback for a conversation agy did not title (session-view::REQ-003/AC-03)
    pub(super) title: Option<Units>,
    /// The question index over its transcript
    pub(super) questions: Vec<Record>,
}

/// What a parse gives
pub(super) enum Parsed {
    Entry(Entry),
    /// Unreadable in the supported format (token-stats::REQ-004/AC-01): kept as an entry, so that the count of such
    /// conversations survives a scan that serves it from the cache, and listed nowhere
    Unreadable,
    /// The read failed while agy was writing it (token-stats::REQ-004/AC-03): no entry, and the last one is kept
    Failed,
}
