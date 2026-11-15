//! The Codex side of the session walk: every rollout under Codex's sessions and archived sessions — both count toward
//! the figures, as ccusage's `paths.rs` reads them — plain and cold alike (token-stats B12), depth-first in scan order,
//! each credited to a project by its first line (projects-list B2–B4); and the run's first-line readings
//! (token-stats::QR-002/AC-01). The session page's single-file rebuild reads a rollout's first line through the same
//! `read_head`, so a page and a scan credit a rollout alike.

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};

use super::head;
use crate::read::{self, Stored};
use crate::text::{self, Units};
use crate::{seams, walk};

/// The trees under Codex's data root the walk takes, in the order it takes them
pub(super) const TREES: [&str; 2] = ["sessions", "archived_sessions"];

/// The first line measures up to 42 KB (its `session_meta` embeds the base instructions), so it is read up to its line
/// feed, this many bytes of the file at a time
const HEAD_STEP: usize = 64 * 1024;
/// A file this far in with no line feed is given up on rather than read into memory
const HEAD_MAX: usize = 4 * 1024 * 1024;

/// A rollout's session, as its first line gives it (`CodexSessionMeta` in src/main/providers/codex.ts)
#[derive(Clone)]
pub(super) struct Session {
    pub(super) file: String,
    /// The project it is credited to: the first line's `payload.cwd`
    pub(super) cwd: Units,
    /// A subagent thread (`payload.thread_source` is "subagent"), which counts toward no session count or activity time
    pub(super) subagent: bool,
    pub(super) mtime_ms: f64,
    /// `payload.id`
    pub(super) session_id: Option<Units>,
    /// The parent session's id: `payload.forked_from_id`, else `source.subagent.thread_spawn.parent_thread_id`. Only these
    /// two, as ccusage's `replay.rs` takes them: `payload.parent_thread_id` is no fork relationship, as a continuation on
    /// the same thread carries it too, and taking it for the parent would strip the session's own usage.
    pub(super) parent_id: Option<Units>,
    /// The fork moment, the top-level timestamp: the parent's usage before it is the history this session replays
    pub(super) forked_at: Option<f64>,
    /// Whether the first line carries an ordinal, as the paginated format writes it: a paginated child thread replays
    /// nothing, so nothing is stripped from it (session-view B2)
    pub(super) paginated: bool,
}

/// A reading with the rest of the signature it was read under; the time is the session's own
struct Reading {
    size: f64,
    ino: f64,
    session: Session,
}

/// The run's first-line readings (token-stats::QR-002/AC-01). A walk opens a rollout only when its modification time,
/// size or inode differ from the ones the last walk saw, and otherwise hands back what was read then: on a machine with
/// three thousand rollouts, most of them cold, reading every first line again was most of a rescan. An edit that moves
/// none of the three is not seen until the file next changes, the limit the token cache's own signature has.
///
/// Kept in memory and never saved, so a run's first walk reads every first line. Only a reading that gave a session is
/// kept: a rollout that gave none is read again at every walk, because a failure can end without the signature moving
/// (a change of mode does not touch it), and a kept failure would hide the session until the file next changed — which
/// a cold rollout never does.
#[derive(Default)]
pub(super) struct Readings(HashMap<String, Reading>);

/// Every rollout under `trees` (the paths of `TREES` under the data root), in scan order, with what `readings` holds
/// from the last walk; `readings` then holds this walk's. `date_parse` is JavaScript's own `Date.parse`, for a time
/// outside the forms `text::date_parse` reads.
pub(super) fn walk(trees: &[String], readings: &mut Readings, date_parse: &mut dyn FnMut(&[u16]) -> f64) -> Vec<Session> {
    let mut out = Vec::new();
    let mut last = std::mem::take(&mut readings.0);
    // Rebuilt at each walk, so a rollout that left the tree leaves the readings with it
    let mut next = HashMap::new();
    for tree in trees {
        walk_dir(tree, &mut out, &mut last, &mut next, date_parse);
    }
    readings.0 = next;
    out
}

/// The rollouts under a directory, depth-first: a directory's entries in scan order, each subdirectory at its place
fn walk_dir(dir: &str, out: &mut Vec<Session>, last: &mut HashMap<String, Reading>, next: &mut HashMap<String, Reading>, date_parse: &mut dyn FnMut(&[u16]) -> f64) {
    // A directory that cannot be listed loses its own rollouts only
    let Some(entries) = walk::entries(dir) else { return };
    for entry in entries {
        if entry.kind == walk::Kind::Directory {
            walk_dir(&entry.path, out, last, next, date_parse);
            continue;
        }
        // Plain and cold rollouts alike (token-stats B12): a cold one is the same session under its compressed path
        if !(entry.name.ends_with(".jsonl") || entry.name.ends_with(".jsonl.zst")) {
            continue;
        }
        if let Some(session) = kept_or_read(&entry.path, last, next, date_parse) {
            out.push(session);
        }
    }
}

/// A rollout's session: the kept one while its signature stands, a fresh reading otherwise. The signature is taken
/// before the first line is read, as the token cache takes its own, so a rollout replaced while it is read shows as
/// changed at the next walk instead of matching a signature its reading never saw.
fn kept_or_read(file: &str, last: &mut HashMap<String, Reading>, next: &mut HashMap<String, Reading>, date_parse: &mut dyn FnMut(&[u16]) -> f64) -> Option<Session> {
    let st = walk::stat(file)?;
    if let Some(was) = last.remove(file) {
        if was.session.mtime_ms == st.mtime_ms && was.size == st.size && was.ino == st.ino {
            let session = was.session.clone();
            next.insert(file.to_owned(), was);
            return Some(session);
        }
    }
    // A read that panics is the rollout's failed read: it gives no session, and nothing is kept (token-stats, Scans and
    // the window)
    let session = catch_unwind(AssertUnwindSafe(|| {
        seams::before_parse(file);
        read_head(file, Some(st.mtime_ms), date_parse)
    }))
    .ok()
    .flatten()?;
    next.insert(file.to_owned(), Reading { size: st.size, ino: st.ino, session: session.clone() });
    Some(session)
}

/// A rollout's session, read off its first line; None when the file cannot be read, or its first line is corrupt or
/// names no project (projects-list B4). `mtime_ms` is the file's time when the caller has taken it; taken after the line
/// when not.
pub(super) fn read_head(file: &str, mtime_ms: Option<f64>, date_parse: &mut dyn FnMut(&[u16]) -> f64) -> Option<Session> {
    let stored = if file.ends_with(".jsonl.zst") { Stored::Zstd } else { Stored::Plain };
    let line = read::first_line(file, stored, HEAD_STEP, HEAD_MAX).ok()??;
    let text = String::from_utf8_lossy(&line);
    let h = head::read(&text).ok()??;
    let p = &h.payload;
    let cwd = p.cwd.filter(|c| !c.is_empty())?;
    let parent = p.forked_from_id.filter(|s| !s.is_empty()).or(p.spawn_parent.filter(|s| !s.is_empty()));
    let forked_at = h.timestamp.and_then(|t| text::time_value(&t.units(), date_parse));
    let mtime_ms = match mtime_ms {
        Some(t) => t,
        None => walk::stat(file)?.mtime_ms,
    };
    Some(Session {
        file: file.to_owned(),
        cwd: cwd.units(),
        subagent: p.thread_source.is_some_and(|s| s.is("subagent")),
        mtime_ms,
        session_id: p.id.map(|s| s.units()),
        parent_id: parent.map(|s| s.units()),
        forked_at,
        paginated: h.ordinal,
    })
}
