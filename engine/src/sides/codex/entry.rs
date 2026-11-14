//! A Codex rollout's entry: what a parse of it gives (the token cache's per-file aggregate and the state a later parse
//! resumes from, `CodexFileAgg` and `CodexResume` in `src/main/providers/token-stats.ts`), and what a resumed parse is
//! given of the parse it continues.

use crate::question::Record;
use crate::text::Units;

/// One per-turn usage event: `[at, input, cached, output, cacheWrite]`. The last is always 0 from a parse: cache
/// creation is not collected on this side (ADR-0023); an event an earlier parse made comes back as it was.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Event {
    pub(super) at: Option<f64>,
    pub(super) input: f64,
    pub(super) cached: f64,
    pub(super) output: f64,
    pub(super) cache_write: f64,
}

/// What a parse is given
pub(super) struct Job {
    pub(super) file: String,
    /// A subagent's session is never listed
    pub(super) subagent: bool,
    /// The session index's name for the rollout, which titles it before anything else (session-view A4)
    pub(super) thread_name: Option<Units>,
    /// The parse this one resumes, when the rollout only grew since (token-stats, Implementation Decisions, Cache)
    pub(super) from: Option<Earlier>,
}

/// The parse a resumed parse continues: its aggregate's lists and time, and the state it stopped in
pub(super) struct Earlier {
    pub(super) events: Vec<Event>,
    pub(super) at: Option<f64>,
    pub(super) questions: Vec<Record>,
    /// The end of the last line it parsed: the next parse reads from here
    pub(super) cursor: f64,
    /// The running total of its last usage event, `num()` of the fields a later one is measured against; None when it
    /// had none
    pub(super) total: Option<[f64; 3]>,
    pub(super) total_key: Option<Units>,
    /// The usage boundary as it stood: -1 when no usage record had been read
    pub(super) boundary: f64,
    pub(super) seen_responses: Vec<Units>,
    pub(super) model: Units,
    pub(super) first_title: Option<Units>,
}

/// The running total a resumed parse will measure against, as the state keeps it
pub(super) enum KeptTotal {
    /// None: no usage event carried one
    None,
    /// The one the earlier parse kept, handed back as it was given
    Earlier,
    /// One a line wrote, as the line writes it
    Text(String),
}

/// What a parse gives: the aggregate's fields and the state a later parse resumes from
pub(super) struct Parsed {
    pub(super) listed: bool,
    pub(super) title: Units,
    pub(super) title_from_thread: bool,
    pub(super) at: Option<f64>,
    pub(super) model: Units,
    pub(super) questions: Vec<Record>,
    pub(super) events: Vec<Event>,
    /// The usage boundary (B9): the index in `events` from which entries come from usage records
    pub(super) boundary: f64,
    pub(super) cursor: f64,
    pub(super) total: KeptTotal,
    pub(super) total_key: Option<Units>,
    /// The boundary as the state keeps it: -1 while no usage record has been read
    pub(super) state_boundary: f64,
    pub(super) seen_responses: Vec<Units>,
    pub(super) first_title: Option<Units>,
}
