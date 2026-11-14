//! A Claude Code session file's entry: what a parse of it gives (the token cache's per-file aggregate, `ClaudeFileAgg`
//! in `src/main/providers/token-stats.ts`), and what a parse is given.

use crate::question::Record;
use crate::text::Units;

/// What a parse is given
pub(super) struct Job {
    pub(super) file: String,
    /// Whether the file may be listed: a top-level session file, not a subagent's or another nested transcript
    pub(super) listed: bool,
}

/// One usage line, before the cross-file de-duplication the combination does (token-stats A3–A5): the message id and
/// the request id it is matched by, whether it is a sidechain's, its four figures, its model and its time
pub(super) struct Usage {
    pub(super) id: Option<Units>,
    pub(super) request_id: Option<Units>,
    pub(super) sidechain: bool,
    pub(super) input: f64,
    pub(super) output: f64,
    pub(super) cache_read: f64,
    pub(super) cache_write: f64,
    /// None for a synthetic model or none (A6): its tokens count, in no model bucket
    pub(super) model: Option<Units>,
    /// The line's time, which files the usage under its local day; None when it has none
    pub(super) at: Option<f64>,
}

/// What a parse gives: the aggregate's fields
pub(super) struct Parsed {
    pub(super) listed: bool,
    pub(super) title: Units,
    pub(super) at: Option<f64>,
    pub(super) fork_points: f64,
    pub(super) questions: Vec<Record>,
    pub(super) usage: Vec<Usage>,
}
