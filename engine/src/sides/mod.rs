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

use crate::exports::js::Js;
use crate::text::Units;

/// What side-free code asks of a side
pub(crate) trait Side: Sync {
    /// Parses one session file: `job` is the TypeScript `ParseJob` of the side's kind, and the result its `ParseResult`
    /// — the file's entry, or null when the file cannot be read (token-stats B12, F6, token-stats::REQ-004)
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value>;

    /// The question a range of a session file holds, as the session page and both searches show it: `range` is the
    /// question's range as the side's question index recorded it, read and decoded (session-view C2). None when the
    /// range holds no question.
    fn question_text(&self, range: &str) -> Option<Units>;

    /// The tool names whose call dispatches a subagent, which the session page's turn draws as one (session-view C3):
    /// the names the side's question index counts a turn's subagents by
    fn dispatches(&self) -> &'static [&'static str];

    /// Which lines of a turn's range the turn holds, one flag per line as the range's text splits at its line feeds:
    /// `range` is the turn's range as the side's question index recorded it, read and decoded. By default every line,
    /// for a side whose agent leaves no line of a turn's range out of it.
    fn kept_lines(&self, range: &str) -> Vec<bool> {
        range.split('\n').map(|_| true).collect()
    }

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
