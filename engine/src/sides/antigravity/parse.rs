//! An Antigravity CLI conversation's parse: its usage read (token-stats::REQ-003, token-stats::REQ-004) and, for a
//! readable one that is not a subagent, its transcript's question index (session-view::REQ-004). A transcript not there
//! — the empty conversation agy creates has none (measured) — or one that will not open gives no question, so the
//! conversation is not listed while its tokens count (session-view::REQ-004/AC-08).

use napi::Result;

use super::entry::{Entry, Job, Parsed};
use super::transcript;
use super::usage::{self, UsageRead};
use crate::text::{self, Units};

/// What the parse takes from JavaScript itself, where the rule is the runtime's own
pub(super) trait Runtime {
    /// `Date.parse(text)`; NaN when it reads none
    fn date_parse(&self, text: &[u16]) -> f64;
    /// A folder URI's local path (`folderPath` in `src/main/providers/agy-proto.ts`): `fileURLToPath(new URL(uri))` for
    /// a `file:` URI; None for a URI of another scheme, one that does not parse, or one naming no local path
    fn folder_path(&self, uri: &str) -> Result<Option<Units>>;
    /// `text.toLowerCase()`
    fn lower_case(&self, text: &[u16]) -> Result<Units>;
}

/// The conversation's entry. Errors are the runtime's alone: a read that fails is an outcome, not an error.
pub(super) fn parse(job: &Job, rt: &dyn Runtime) -> Result<Parsed> {
    let u = match usage::read(&job.file, &job.tmp_parent) {
        UsageRead::Read(u) => u,
        UsageRead::Unreadable => return Ok(Parsed::Unreadable),
        UsageRead::Failed => return Ok(Parsed::Failed),
    };
    let (questions, first) = if u.subagent { (Vec::new(), None) } else { transcript::index(&job.transcript, &|t| rt.date_parse(t)) };
    // Credited to the first folder the record lists, presumed to be the directory agy was launched in
    // (token-stats::REQ-003/AC-08); none when it lists none, or the first is not a local folder
    let folder = match &u.first_folder_uri {
        Some(uri) => rt.folder_path(uri)?,
        None => None,
    };
    let project_key = match folder {
        Some(f) => text::merge_key(&f, |t| rt.lower_case(t))?,
        None => Vec::new(),
    };
    Ok(Parsed::Entry(Entry {
        project_key,
        // A session with no question is not listed, and its tokens still count (session-view::REQ-003/AC-02)
        listed: !u.subagent && !questions.is_empty(),
        title: first.map(|q| text::clip_title(&q)),
        calls: u.calls,
        conversation_id: u.id,
        subagent: u.subagent,
        at: u.at,
        fork_of: u.fork_of,
        questions,
    }))
}
