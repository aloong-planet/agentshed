//! A conversation's usage read (token-stats::REQ-003, token-stats::REQ-004): its format checked (token-stats::CON-001),
//! its trajectory record, its own id, and its model calls, each once within the database. The session walk takes the
//! format check and the trajectory record from here (`walk.rs`).

use std::collections::{HashMap, HashSet};
use std::path::Path;

use rusqlite::Connection;

use super::db::{self, Cell, Failed, Read};
use super::entry::Call;
use super::proto::{self, ModelUsage, TrajectoryMetadata};

/// The format the side supports (token-stats::CON-001): user version 1, with the tables and columns usage is read from —
/// the steps' index and metadata, the generator metadata's index and data, the trajectory metadata, and the trajectory
/// table's cascade id (the conversation's own id). A database of any other shape is unreadable (token-stats::REQ-004): it
/// fails here, before a record is decoded, so a drift shows as a counted conversation rather than as figures that
/// quietly shrank.
const SUPPORTED_USER_VERSION: f64 = 1.0;
const REQUIRED_COLUMNS: [(&str, &[&str]); 4] = [
    ("steps", &["idx", "metadata"]),
    ("gen_metadata", &["idx", "data"]),
    ("trajectory_metadata_blob", &["id", "data"]),
    ("trajectory_meta", &["cascade_id"]),
];

pub(super) fn check_format(conn: &Connection) -> Read<()> {
    let version = db::first_row(conn, "PRAGMA user_version", |cells| Ok(matches!(cells.first(), Some(Cell::Number(v)) if *v == SUPPORTED_USER_VERSION)))?;
    if version != Some(true) {
        return Err(Failed);
    }
    for (table, columns) in REQUIRED_COLUMNS {
        // A missing table has no columns, so it fails the same check
        let mut have = HashSet::new();
        db::each_row(conn, &format!("PRAGMA table_info({table})"), |cells| {
            // `name` is the second column
            if let Some(Cell::Text(name)) = cells.get(1) {
                have.insert(name.clone());
            }
            Ok(())
        })?;
        if columns.iter().any(|c| !have.contains(*c)) {
            return Err(Failed);
        }
    }
    Ok(())
}

/// The conversation's trajectory record (the `main` row; the table's default id and the only row in every measured
/// database); None when there is none, or its data is no blob
pub(super) fn trajectory_record(conn: &Connection) -> Read<Option<TrajectoryMetadata>> {
    let record = db::first_row(conn, "SELECT data FROM trajectory_metadata_blob WHERE id = 'main'", |cells| match cells.first() {
        Some(Cell::Blob(b)) => Ok(Some(proto::trajectory_metadata(b)?)),
        _ => Ok(None),
    })?;
    Ok(record.flatten())
}

/// The conversation's own ids, as its database records them: the trajectory table's cascade ids, in the table's order
/// (one row in every measured database, its id equal to the database's name — 19 of 19, forks and subagents included).
/// Read from the database rather than taken from its file's name, so that a renamed file cannot make every step look
/// copied and its calls vanish without a trace; a trajectory table with no row is a shape never measured, and
/// unreadable.
fn own_conversation_ids(conn: &Connection) -> Read<Vec<String>> {
    let mut ids: Vec<String> = Vec::new();
    db::each_row(conn, "SELECT cascade_id FROM trajectory_meta", |cells| {
        if let Some(Cell::Text(id)) = cells.first() {
            if !id.is_empty() && !ids.contains(id) {
                ids.push(id.clone());
            }
        }
        Ok(())
    })?;
    if ids.is_empty() { Err(Failed) } else { Ok(ids) }
}

/// A step's index as a key the generator records' step indices find it by: a number, compared as JavaScript's `Map`
/// compares one (-0 is 0); an index of another kind is found by none
fn step_key(cell: &Cell<'_>) -> Option<u64> {
    match cell {
        Cell::Number(n) => Some(index_key(*n)),
        _ => None,
    }
}

fn index_key(n: f64) -> u64 {
    (if n == 0.0 { 0.0 } else { n }).to_bits()
}

/// What a step says, kept small while the generator records are read
struct StepInfo {
    at: Option<f64>,
    copied: bool,
    /// The call it carries, as an index into the calls
    call: Option<usize>,
}

/// One call while the database is read: its usage, its step's time, and the generator record's model
struct Pending {
    usage: ModelUsage,
    at: Option<f64>,
    model: Option<String>,
}

/// The calls, each once within the database by its identity
#[derive(Default)]
struct Calls {
    calls: Vec<Pending>,
    by_identity: HashMap<String, usize>,
}

impl Calls {
    /// A call; the same call recorded again keeps the step's time, and the generator record brings the model
    fn add(&mut self, usage: &ModelUsage, at: Option<f64>, model: Option<&String>) -> usize {
        if let Some(&seen) = usage.identity.as_ref().and_then(|id| self.by_identity.get(id)) {
            let call = &mut self.calls[seen];
            if call.model.is_none() {
                call.model = model.cloned();
            }
            return seen;
        }
        let i = self.calls.len();
        if let Some(id) = &usage.identity {
            self.by_identity.insert(id.clone(), i);
        }
        self.calls.push(Pending { usage: usage.clone(), at, model: model.cloned() });
        i
    }

    /// A retry entry is a call of its own only with token counts and an identity of its own (token-stats::REQ-003/AC-02)
    fn add_retries(&mut self, own: Option<&ModelUsage>, retries: &[Option<ModelUsage>], at: Option<f64>, model: Option<&String>) {
        for r in retries.iter().flatten() {
            let Some(id) = &r.identity else { continue };
            if r.has_tokens() && own.is_none_or(|o| o.identity.as_ref() != Some(id)) {
                self.add(r, at, model);
            }
        }
    }
}

/// A conversation's calls and the session facts its steps give
struct ConversationCalls {
    calls: Vec<Call>,
    /// The largest step time, copied steps included (theirs being older) (session-view::REQ-003/AC-04)
    at: Option<f64>,
    /// The source of the last copied step: the conversation the nearest copied content came from
    /// (session-view::REQ-005/AC-02)
    fork_of: Option<String>,
}

/// A conversation's model calls, each once (token-stats::REQ-003). agy records a call three times in one database — the
/// step's usage, the generator record's usage and the first entry of that record's retry list — so calls are matched by
/// identity within the database, and the step's time and the generator record's model are joined onto one call. A step
/// whose recorded-in conversation is another one — a fork's copy of its parent's history — and a generator record
/// attached only to such steps, or attached to no step here and naming another conversation as its maker, are that
/// conversation's usage, never this one's (AC-06). The steps are read first and kept small; the generator records,
/// which hold each call's whole prompt, are read one row at a time, each held whole while it is decoded.
fn conversation_calls(own: &[String], conn: &Connection) -> Read<ConversationCalls> {
    let is_own = |id: &String| own.contains(id);
    let mut calls = Calls::default();
    let mut steps: HashMap<u64, StepInfo> = HashMap::new();
    let mut last_step_at: Option<f64> = None;
    let mut fork_of: Option<String> = None;
    db::each_row(conn, "SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL ORDER BY idx", |cells| {
        let Some(Cell::Blob(metadata)) = cells.get(1) else { return Err(Failed) };
        let m = proto::step_metadata(metadata)?;
        let copied = m.source_conversation_id.as_ref().is_some_and(|id| !is_own(id));
        let mut info = StepInfo { at: m.completed_at.or(m.created_at), copied, call: None };
        for t in [m.created_at, m.completed_at].into_iter().flatten() {
            if last_step_at.is_none_or(|last| t > last) {
                last_step_at = Some(t);
            }
        }
        if copied {
            fork_of = m.source_conversation_id.clone();
        } else {
            if let Some(u) = m.usage.as_ref().filter(|u| u.has_tokens()) {
                info.call = Some(calls.add(u, info.at, None));
            }
            calls.add_retries(m.usage.as_ref(), &m.retries, info.at, None);
        }
        if let Some(key) = cells.first().and_then(step_key) {
            steps.insert(key, info);
        }
        Ok(())
    })?;
    db::each_row(conn, "SELECT idx, data FROM gen_metadata WHERE data IS NOT NULL ORDER BY idx", |cells| {
        let Some(Cell::Blob(data)) = cells.get(1) else { return Err(Failed) };
        let g = proto::generator_metadata(data)?;
        let named: Vec<&StepInfo> = g.step_indices.iter().filter_map(|&i| steps.get(&index_key(i))).collect();
        // Copied: every step it names was copied; or, naming no step here, its own record names another conversation as
        // the one that made the call — a fork copies such a record too, and with the parent gone nothing else tells
        let copied = if named.is_empty() { g.conversation_id.as_ref().is_some_and(|id| !is_own(id)) } else { named.iter().all(|s| s.copied) };
        if copied {
            return Ok(());
        }
        let own_steps: Vec<&&StepInfo> = named.iter().filter(|s| !s.copied).collect();
        let at = own_steps.first().and_then(|s| s.at);
        if let Some(u) = g.usage.as_ref().filter(|u| u.has_tokens()) {
            // A call with no identity is matched to the step it names that carries an unidentified call — the only link
            // between the two copies when there is no id to match
            let step_call = if u.identity.is_none() {
                own_steps.iter().filter_map(|s| s.call).find(|&c| calls.calls[c].usage.identity.is_none())
            } else {
                None
            };
            match step_call {
                Some(c) => {
                    let call = &mut calls.calls[c];
                    if call.model.is_none() {
                        call.model = g.response_model.clone();
                    }
                }
                None => {
                    calls.add(u, at, g.response_model.as_ref());
                }
            }
        }
        calls.add_retries(g.usage.as_ref(), &g.retries, at, g.response_model.as_ref());
        Ok(())
    })?;
    let calls = calls
        .calls
        .into_iter()
        .map(|c| Call {
            identity: c.usage.identity,
            at: c.at,
            input: c.usage.input,
            output: c.usage.output,
            cache_read: c.usage.cache_read,
            cache_write: c.usage.cache_write,
            model: c.model,
        })
        .collect();
    Ok(ConversationCalls { calls, at: last_step_at, fork_of })
}

/// What a readable conversation's database says
pub(super) struct Usage {
    /// The first folder URI its trajectory record lists, the one it is credited to (token-stats::REQ-003/AC-08)
    pub(super) first_folder_uri: Option<String>,
    pub(super) calls: Vec<Call>,
    /// Its own id, as its trajectory table records it (token-stats::REQ-003/AC-06)
    pub(super) id: String,
    /// Whether its own metadata says it is a subagent (token-stats::REQ-003/AC-07)
    pub(super) subagent: bool,
    pub(super) at: Option<f64>,
    pub(super) fork_of: Option<String>,
}

/// A conversation's usage read: readable; unreadable in the supported format; or failed while agy was writing it, which
/// is not counted and keeps its last result (token-stats::REQ-004/AC-03)
pub(super) enum UsageRead {
    Read(Usage),
    Unreadable,
    Failed,
}

/// Reads a conversation's usage without writing under agy's directories (token-stats::CON-002). `tmp_parent` is where a
/// copy is made when a log is beside the database.
pub(super) fn read(file: &str, tmp_parent: &Path) -> UsageRead {
    let log_before = db::has_log(file);
    let read = db::read(file, tmp_parent, |conn| {
        check_format(conn)?;
        let m = trajectory_record(conn)?.ok_or(Failed)?;
        let own = own_conversation_ids(conn)?;
        let c = conversation_calls(&own, conn)?;
        Ok(Usage {
            first_folder_uri: m.folder_uris.first().cloned(),
            calls: c.calls,
            id: own[0].clone(),
            subagent: m.is_subagent(),
            at: c.at,
            fork_of: c.fork_of,
        })
    });
    match read {
        Ok(usage) => UsageRead::Read(usage),
        Err(Failed) if db::failed_while_written(file, log_before) => UsageRead::Failed,
        Err(Failed) => UsageRead::Unreadable,
    }
}
