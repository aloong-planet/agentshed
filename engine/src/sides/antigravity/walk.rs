//! The Antigravity CLI side of the session walk: every conversation, a `.db` file directly in agy's conversations
//! directory (subagents sit there too, measured), never its `-wal` and `-shm` companions nor anything one level down
//! (token-stats::CON-001); each credited to the first folder its trajectory record lists (token-stats::REQ-003/AC-08)
//! and judged a subagent's or not by its own metadata (AC-07), read without writing under agy's directories (CON-002)
//! through the reader, the format check and the trajectory record the usage read takes.

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;

use napi::Result;

use super::parse::Runtime;
use super::{db, usage};
use crate::json::max;
use crate::text::Units;
use crate::{seams, walk};

/// The directory under agy's data root the walk lists
pub(super) const TREE: &str = "conversations";

/// A conversation (`AntigravitySessionMeta` in src/main/providers/antigravity.ts)
pub(super) struct Session {
    /// The database's path: the session's identity
    pub(super) file: String,
    /// The folder it is credited to; None when it cannot be read or lists no local folder, so it is credited to none
    pub(super) cwd: Option<Units>,
    pub(super) subagent: bool,
    /// The later of the database's and its log's modification times: while agy writes, only the log changes
    /// (projects-list::REQ-001/AC-04, measured)
    pub(super) mtime_ms: f64,
}

/// What a conversation's metadata says
#[derive(Clone)]
struct Attribution {
    cwd: Option<Units>,
    subagent: bool,
}

/// A conversation's signature: the database's modification time and its log's time and size, or no log — never the
/// database's size, which a checkpoint leaves unchanged (measured; token-stats Implementation Decisions). The token
/// cache keys a conversation by the same parts (`conversationSignature` in src/main/providers/antigravity.ts).
#[derive(PartialEq)]
struct Signature {
    db: f64,
    log: Option<(f64, f64)>,
}

/// A successful read, with the signature it was read under
struct Attributed {
    signature: Signature,
    attribution: Attribution,
}

/// What each conversation's metadata said, by path, with the signature it was read under: an unchanged conversation is
/// not opened again, which keeps a rescan from opening, or copying, every database each time. Only successful reads are
/// kept, and only for the conversations the last walk saw.
#[derive(Default)]
pub(super) struct Attributions(HashMap<String, Attributed>);

/// What one read gave
enum Attempt {
    Read(Attribution),
    /// It will not open, is in another format, or its record will not decode or is not there: it is credited to none
    Nothing,
    /// It failed while agy was writing it (token-stats::REQ-004/AC-03)
    Failed,
}

/// Every conversation in `tree` (`TREE` under the data root), in scan order, with what `kept` holds from the last walk;
/// `kept` then holds this walk's. A copy a read needs is made under `tmp_parent`.
pub(super) fn walk(tree: &str, kept: &mut Attributions, tmp_parent: &Path, rt: &dyn Runtime) -> Result<Vec<Session>> {
    let mut out = Vec::new();
    let mut seen = HashMap::new();
    let Some(entries) = walk::entries(tree) else {
        kept.0 = seen;
        return Ok(out);
    };
    for entry in entries {
        if entry.kind != walk::Kind::File || !entry.name.ends_with(".db") {
            continue;
        }
        let file = entry.path;
        // Gone since the listing
        let Some((signature, mtime_ms)) = signature(&file) else { continue };
        let last = kept.0.remove(&file);
        let attributed = match last {
            Some(last) if last.signature == signature => Some(last),
            last => match attempt(&file, tmp_parent, rt)? {
                // A read that failed while agy was writing keeps the last successful one, under its old signature, so
                // the next walk reads the conversation again (token-stats::REQ-004/AC-03)
                Attempt::Failed => last,
                Attempt::Read(attribution) => Some(Attributed { signature, attribution }),
                Attempt::Nothing => None,
            },
        };
        let Attribution { cwd, subagent } = attributed.as_ref().map_or(Attribution { cwd: None, subagent: false }, |a| a.attribution.clone());
        if let Some(a) = attributed {
            seen.insert(file.clone(), a);
        }
        out.push(Session { file, cwd, subagent, mtime_ms });
    }
    kept.0 = seen;
    Ok(out)
}

/// The conversation's signature and its time; None when the database is gone
fn signature(file: &str) -> Option<(Signature, f64)> {
    let db = walk::stat(file)?.mtime_ms;
    let log = walk::stat(&format!("{file}-wal")).map(|s| (s.mtime_ms, s.size));
    let mtime_ms = log.map_or(db, |(t, _)| max(db, t));
    Some((Signature { db, log }, mtime_ms))
}

/// One read of a conversation's folder and subagent markers. A read that panics is its failed read, judged as a parse's
/// is (token-stats, Scans and the window): agy writing it while a log is beside the database or the database is gone,
/// otherwise credited to none. The log is looked at as the panic is caught: the read it interrupted is not there to say
/// whether one was beside the database when it began.
fn attempt(file: &str, tmp_parent: &Path, rt: &dyn Runtime) -> Result<Attempt> {
    let read = catch_unwind(AssertUnwindSafe(|| {
        seams::before_parse(file);
        read_attribution(file, tmp_parent, rt)
    }));
    match read {
        Ok(attempt) => attempt,
        Err(_) => Ok(if db::failed_while_written(file, false) { Attempt::Failed } else { Attempt::Nothing }),
    }
}

fn read_attribution(file: &str, tmp_parent: &Path, rt: &dyn Runtime) -> Result<Attempt> {
    let log_before = db::has_log(file);
    let record = db::read(file, tmp_parent, |conn| {
        usage::check_format(conn)?;
        usage::trajectory_record(conn)
    });
    Ok(match record {
        Ok(Some(m)) => {
            // Credited to the first folder the record lists, presumed to be the directory agy was launched in; none when
            // it lists none, or the first is not a local folder
            let cwd = match m.folder_uris.first() {
                Some(uri) => rt.folder_path(uri)?,
                None => None,
            };
            Attempt::Read(Attribution { cwd, subagent: m.is_subagent() })
        }
        Ok(None) => Attempt::Nothing,
        Err(db::Failed) if db::failed_while_written(file, log_before) => Attempt::Failed,
        Err(db::Failed) => Attempt::Nothing,
    })
}
