//! The agent sides the module reads, and the one trait they implement. This is the only list of the sides: code outside
//! `sides/` never names one, and each side's own rules stay inside its directory but for the adapter it registers here.
//!
//! The trait gains a method only when side-free code calls one.

mod codex;

use napi::Result;
use napi::sys::napi_value;

use crate::exports::js::Js;

/// What side-free code asks of a side
pub(crate) trait Side: Sync {
    /// Parses one session file: `job` is the TypeScript `ParseJob` of the side's kind, and the result its `ParseResult`
    /// — the file's entry, or null when the file cannot be read (token-stats B12, F6, token-stats::REQ-004)
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value>;
}

/// The side whose files a job of `kind` names, when the module reads them
pub(crate) fn named(kind: &str) -> Option<&'static dyn Side> {
    match kind {
        "codex" => Some(&codex::Codex),
        _ => None,
    }
}
