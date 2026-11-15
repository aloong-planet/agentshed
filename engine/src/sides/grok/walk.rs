//! The Grok side of the session walk: `sessions/<percent-encoded cwd>/<session id>/` under Grok's data root (the layout
//! measured 2026-08-16), each session credited to the directory its parent directory's name decodes to and identified by
//! its authoritative update stream (ADR-0019). The session page's single-file rebuild judges a stream's session by the
//! same `subagent`, so a page and a scan read a session alike.

use std::fs;
use std::panic::{AssertUnwindSafe, catch_unwind};

use napi::Result;

use crate::json::{Kind, Read, Reader};
use crate::text::Units;
use crate::{seams, walk};

/// The tree under Grok's data root the walk takes
pub(super) const TREE: &str = "sessions";

/// A session directory's authoritative stream: its identity, and the file its time is read from (projects-list B7)
const STREAM: &str = "updates.jsonl";

/// A session (`GrokSessionMeta` in src/main/providers/grok.ts)
pub(super) struct Session {
    /// The authoritative stream's path
    pub(super) file: String,
    /// The project it is credited to: its directory's percent-encoded name, decoded
    pub(super) cwd: Units,
    /// Whether its own record says it is a subagent's (projects-list B8)
    pub(super) subagent: bool,
    /// The stream's modification time: "the session file's mtime" keeps one meaning across the sides, though this side
    /// keeps a session as a directory (projects-list B7)
    pub(super) mtime_ms: f64,
}

/// Every session under `tree` (`TREE` under the data root), in scan order. `decode` is JavaScript's
/// `decodeURIComponent`, None where it throws.
pub(super) fn walk(tree: &str, decode: &dyn Fn(&str) -> Result<Option<Units>>) -> Result<Vec<Session>> {
    let mut out = Vec::new();
    let Some(cwd_dirs) = walk::entries(tree) else { return Ok(out) };
    for cwd_dir in cwd_dirs {
        if cwd_dir.kind != walk::Kind::Directory {
            continue;
        }
        // A name that is not valid percent-encoding loses only its own directory, not the scan
        let Some(cwd) = decode(&cwd_dir.name)? else { continue };
        let Some(session_dirs) = walk::entries(&cwd_dir.path) else { continue };
        // Loose files at either level (prompt_history.jsonl, session_search.sqlite) are not sessions
        for session_dir in session_dirs {
            if session_dir.kind != walk::Kind::Directory {
                continue;
            }
            let stream = walk::below(&session_dir.path, STREAM);
            // No authoritative stream, no session identity: skipped without abandoning the scan (token-stats F6)
            let Some(st) = walk::stat(&stream) else { continue };
            // A read that panics is the summary's failed read, which says nothing (token-stats, Scans and the window)
            let subagent = catch_unwind(AssertUnwindSafe(|| {
                seams::before_parse(&stream);
                subagent(&session_dir.path)
            }))
            .unwrap_or(false);
            out.push(Session { file: stream, cwd: cwd.clone(), subagent, mtime_ms: st.mtime_ms });
        }
    }
    Ok(out)
}

/// Whether a session is a subagent's. A child session sits beside its parent, so depth cannot tell the two apart: the
/// judgement reads what the record says about itself, `summary.json`'s `"session_kind": "subagent"` (measured
/// 2026-08-16; a parent session has no `session_kind` at all). A summary that cannot be read says nothing, and a record
/// that says nothing is not a subagent — miscounting one extra session is visible, silently dropping a real one is not.
pub(super) fn subagent(session_dir: &str) -> bool {
    let Ok(bytes) = fs::read(walk::below(session_dir, "summary.json")) else { return false };
    says_subagent(&String::from_utf8_lossy(&bytes)).unwrap_or(false)
}

/// Whether the summary, read by `JSON.parse`'s grammar, is an object whose `session_kind` is "subagent", its last
/// `session_kind` counting
fn says_subagent(text: &str) -> Read<bool> {
    let mut r = Reader::new(text);
    let mut kind = None;
    if r.kind()? == Kind::Object {
        r.members(|key, r| {
            if key.is("session_kind") {
                kind = r.string_or_skip()?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
    } else {
        r.skip()?;
    }
    r.end()?;
    Ok(kind.is_some_and(|k| k.is("subagent")))
}
