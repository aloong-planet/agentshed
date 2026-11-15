//! A Grok session's entry: what a parse of its update stream gives (the token cache's per-file aggregate, `GrokFileAgg`
//! in `src/main/providers/token-stats.ts`), and what a parse is given. A Grok stream is parsed whole whenever it
//! changes (token-stats, Implementation Decisions, Cache), so no state is kept for a later parse.

use crate::question::Record;
use crate::text::Units;

/// What a parse is given
pub(super) struct Job {
    /// The session's update stream, the one file that carries its usage, its conversation and its tool calls (F1)
    pub(super) file: String,
    /// A subagent's session is never listed (F5)
    pub(super) subagent: bool,
}

/// `num()` of a usage figure's three fields the accounting reads: reported input (which already includes the cached
/// reads, F2), cached reads and output. Cache creation is not read on this side (ADR-0023).
#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub(super) struct Figures {
    pub(super) input: f64,
    pub(super) cached: f64,
    pub(super) output: f64,
}

/// One per-turn, per-model usage event: `[at, input, cachedRead, output, cacheCreation, model]`, cache creation always
/// 0 (ADR-0023). The model is the billed one the per-model map names it by, or none for a turn without the map (F3).
pub(super) struct Event {
    pub(super) at: Option<f64>,
    pub(super) figures: Figures,
    pub(super) model: Option<Units>,
}

/// What a parse gives: the aggregate's fields the stream decides
pub(super) struct Parsed {
    pub(super) title: Units,
    /// The largest timestamp in the stream (session-view A1)
    pub(super) at: Option<f64>,
    pub(super) listed: bool,
    pub(super) questions: Vec<Record>,
    pub(super) events: Vec<Event>,
}
