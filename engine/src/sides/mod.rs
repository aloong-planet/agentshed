//! The agent sides the module reads, and the one trait they implement. This is the only list of the sides: code outside
//! `sides/` never names one, and each side's own rules stay inside its directory but for the adapter it registers here.
//!
//! The trait gains a method only when side-free code calls one.

mod antigravity;
mod claude;
mod codex;
mod grok;

use napi::Result;
use napi::sys::napi_value;

use crate::exports::js::{Js, LocalDates};
use crate::group::{Builder, Decoded, Member};

/// What side-free code asks of a side
pub(crate) trait Side: Sync {
    /// Parses one session file: `job` is the TypeScript `ParseJob` of the side's kind, and the result its `ParseResult`
    /// — the file's entry, or null when the file cannot be read (token-stats B12, F6, token-stats::REQ-004)
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value>;

    /// What a parse that panicked answers: the file's failed read, under the side's rule for a read that fails
    /// (token-stats, Scans and the window). By default the answer for a file that cannot be read, null.
    fn failed(&self, js: &Js, _job: napi_value) -> Result<napi_value> {
        js.null()
    }

    /// The titles the side's agent keeps for its sessions apart from their files, read from under its data root
    /// `home`, a copy made under `tmp_parent` (the system temporary directory when none) where one is needed; None when
    /// the module does not read this side's titles
    fn titles(&self, _js: &Js, _home: &str, _tmp_parent: Option<&str>) -> Option<Result<napi_value>> {
        None
    }

    /// What the store records beside an entry of this side, read from its aggregate's text: its de-duplication keys and
    /// its facts; None when the aggregate is not well formed by the side's rules (`isWellFormedAgg` in
    /// src/main/providers/token-stats.ts, rule for rule)
    fn decode(&self, agg: &str) -> Option<Decoded>;

    /// Combines a group's members of this side, in scan order, into `out`, as the combination over every file of the
    /// scan set gives them (token-stats::CON-003); Err with a member whose aggregate is not well formed
    fn combine(&self, dates: &LocalDates<'_>, members: &[Member<'_>], out: &mut Builder) -> Result<std::result::Result<(), u32>>;
}

/// The side whose files a job of `kind` names, when the module reads them
pub(crate) fn named(kind: &str) -> Option<&'static dyn Side> {
    match kind {
        "antigravity" => Some(&antigravity::Antigravity),
        "claude" => Some(&claude::Claude),
        "codex" => Some(&codex::Codex),
        "grok" => Some(&grok::Grok),
        _ => None,
    }
}
