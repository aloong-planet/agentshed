//! The token store (token-stats, Implementation Decisions, Cache; ADR-0044): a SQLite database in the settings
//! directory, holding each session file's entry as a row under its path, with its signature and its per-file
//! aggregate; the de-duplication keys each entry carries; and each group's combined result with the combination it came
//! from (token-stats::CON-003). The store reads no entry and no result: what one holds is the grouping's (`group/`) to
//! judge, and what it records beside an entry — its keys, its side, its project, whether it is listed, the id its side's
//! forks name it by — is handed to it with the entry, so nothing here differs by agent side.
//!
//! - **Opening** (token-stats C1, C2): a store of this structure version, with this version's tables, is used as it
//!   is. Anything else under the store's name — none, a file that is no database or will not open, another version,
//!   other tables — is replaced by an empty store of this version; so is one with a log or shared-memory file that
//!   stops it from opening. A file at one of those paths is removed and never a directory, so a store that cannot be
//!   replaced is no store, and the open fails.
//! - **Writing** (token-stats C3, C27): what one call changes lands in one transaction. The store's log and
//!   shared-memory files (`-wal`, `-shm`) sit beside it. A write that finds another process holding the store waits
//!   for it, and one that still cannot write fails, landing nothing.
//! - **A snapshot** (token-stats C16) is a copy of the store, read without writing to it or beside it.
//! - **One SQLite per process on the store**: a process that holds the store open reaches it only through this module.
//!   A second copy of SQLite in the same process, such as Node's `node:sqlite`, keeps locks of its own that this one
//!   does not see, and POSIX locks belong to the process: closing that copy's connection to the store releases this
//!   one's locks, and taking itself for the last connection it checkpoints and deletes the store's log and shared-memory
//!   files from under it (measured while writing the tests: a write that landed after it was in a deleted log). Another
//!   process is safe, as SQLite's locks between processes are what C27 rests on.

use crate::seams;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, ErrorCode, OpenFlags, Transaction, TransactionBehavior, params};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// The store's file in the settings directory
pub const FILE: &str = "token-store.sqlite";

/// The files SQLite keeps beside a store: its log and shared-memory files, and the journal of a store opened in another
/// mode. Removed with the store when it is replaced, as a stale one would be read with the new store.
const BESIDE: [&str; 3] = ["-wal", "-shm", "-journal"];

/// How long a write waits for another process holding the store before it fails (token-stats C27). Another process
/// holds it for one write: a scan's changes, or the import of the JSON cache, which took 1.3–1.9 s on this machine's
/// data (ADR-0044).
const WAIT: Duration = Duration::from_secs(5);

/// The store's tables and indexes, exactly as this structure creates them. A store's own text for each is compared with
/// these, so a table of another shape is no store of this version.
///
/// - `entries`: one row per file. `id` is the file's number, which its keys and its group name it by; `rev` is the
///   number of the write that last held an entry there, so a group's input tells one entry from the next. `kind`,
///   `listed`, `project` and `own` are what the grouping read of the entry when it was written, null for an entry it
///   could not read: its side, whether it is listed, its project and the id its side's forks name it by. They come
///   before the aggregate, so reading them never reads the aggregate, which can be large.
/// - `keys`: each entry's de-duplication keys, each a 64-bit hash of its side and its text. A hash two keys share only
///   puts their files in one group, and the combination over a group is the same over any set it is closed in.
/// - `results`: each group's combined result: its members' numbers in scan order, its input, the combination it came
///   from, and the result.
const ENTRIES: &str = "CREATE TABLE entries (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, rev INTEGER, kind TEXT, \
listed INTEGER, project TEXT, own TEXT, sig TEXT NOT NULL, agg TEXT NOT NULL, resume TEXT)";
const KEYS: &str = "CREATE TABLE keys (key INTEGER NOT NULL, file INTEGER NOT NULL)";
const KEYS_BY_FILE: &str = "CREATE INDEX keys_by_file ON keys (file)";
const KEYS_BY_KEY: &str = "CREATE INDEX keys_by_key ON keys (key)";
const RESULTS: &str =
    "CREATE TABLE results (id INTEGER PRIMARY KEY, members BLOB NOT NULL, input BLOB NOT NULL, combination TEXT NOT NULL, result BLOB NOT NULL)";

/// What a store of this structure holds besides its data, by name: the tables and indexes, and the index SQLite keeps
/// for the unique path
fn schema() -> Vec<(String, String, Option<String>)> {
    vec![
        ("table".into(), "entries".into(), Some(ENTRIES.into())),
        ("table".into(), "keys".into(), Some(KEYS.into())),
        ("index".into(), "keys_by_file".into(), Some(KEYS_BY_FILE.into())),
        ("index".into(), "keys_by_key".into(), Some(KEYS_BY_KEY.into())),
        ("table".into(), "results".into(), Some(RESULTS.into())),
        ("index".into(), "sqlite_autoindex_entries_1".into(), None),
    ]
}

/// One row as it is held. A column holding anything but text is handed out as none: the caller then has no entry for
/// the path, which is what an entry that is not well formed is.
pub struct Row {
    pub path: String,
    pub sig: Option<String>,
    pub agg: Option<String>,
    pub resume: Option<String>,
}

/// One entry to hold under its path, replacing what is held there
pub struct Put {
    pub path: String,
    pub sig: String,
    pub agg: String,
    pub resume: Option<String>,
}

/// What the grouping read of an entry: its side, whether it is listed, its project, and the id its side's forks name it
/// by
#[derive(Clone, Debug, PartialEq)]
pub struct Facts {
    pub kind: String,
    pub listed: bool,
    pub project: String,
    pub own: Option<String>,
}

/// An entry to write, with what the grouping read of it: none for an entry it could not read
pub struct Entry<'a> {
    pub put: &'a Put,
    pub facts: Option<Facts>,
    pub keys: Vec<i64>,
}

/// A file's row without its entry: its number, its path, its signature, the write that held its entry, and what the
/// grouping read of the entry
pub struct Head {
    pub id: i64,
    pub path: String,
    pub sig: Option<String>,
    pub rev: Option<i64>,
    pub facts: Option<Facts>,
}

/// A group's row without its result; a column that is not of its type is none
pub struct StoredGroup {
    pub id: i64,
    pub members: Option<Vec<i64>>,
    pub input: Option<Vec<u8>>,
    pub combination: Option<String>,
}

/// Members' numbers as a group's row keeps them: each a 64-bit integer, little-endian
fn members_blob(ids: &[i64]) -> Vec<u8> {
    ids.iter().flat_map(|id| id.to_le_bytes()).collect()
}

fn members_of(blob: &[u8]) -> Option<Vec<i64>> {
    (blob.len() % 8 == 0).then(|| blob.chunks_exact(8).map(|b| i64::from_le_bytes(b.try_into().unwrap_or([0; 8]))).collect())
}

pub struct Store {
    conn: Connection,
    /// The store's data version as this connection last read it: another process's write moves it (token-stats C27)
    data_version: i64,
}

/// An opened store, and whether opening it made it: none was there, or what was there was replaced
pub struct Opened {
    pub store: Store,
    pub created: bool,
}

/// Why what is at the store's path was not used
enum Unusable {
    /// It is no store of this version: it is replaced
    Garbage,
    /// Another process held it for longer than the wait: it may be a good store, so it is not replaced, and the open fails
    Held(String),
}

fn message(error: rusqlite::Error) -> String {
    error.to_string()
}

fn is_held(error: &rusqlite::Error) -> bool {
    matches!(error.sqlite_error_code(), Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked))
}

/// A column's text; anything else is none
fn text(value: ValueRef<'_>) -> Option<String> {
    match value {
        ValueRef::Text(bytes) => std::str::from_utf8(bytes).ok().map(str::to_owned),
        _ => None,
    }
}

/// The rows a query of `path, sig, agg, resume` gives; one whose path is not text is no row
fn rows_of(statement: &mut rusqlite::Statement<'_>, args: impl rusqlite::Params) -> rusqlite::Result<Vec<Row>> {
    let mut rows = statement.query(args)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let Some(path) = text(row.get_ref(0)?) else { continue };
        out.push(Row { path, sig: text(row.get_ref(1)?), agg: text(row.get_ref(2)?), resume: text(row.get_ref(3)?) });
    }
    Ok(out)
}

/// Whether a connection holds a store of this structure version: its recorded version, and its tables as text
fn holds_store(conn: &Connection, version: u32) -> rusqlite::Result<bool> {
    let recorded: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if recorded != i64::from(version) {
        return Ok(false);
    }
    Ok(held_schema(conn)? == schema())
}

fn held_schema(conn: &Connection) -> rusqlite::Result<Vec<(String, String, Option<String>)>> {
    let mut statement = conn.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY name")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
    rows.collect()
}

/// Removes a file the store keeps; nothing there is done already, and a directory is never removed
fn remove_file(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("{} cannot be removed: {error}", path.display())),
    }
}

fn beside(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

impl Store {
    /// The store in `dir`, of structure `version`: the one there when it is usable, otherwise a new empty one. The
    /// directory is made when it is not there, as the JSON cache's write made it.
    pub fn open(dir: &Path, version: u32) -> Result<Opened, String> {
        std::fs::create_dir_all(dir).map_err(|error| format!("{} cannot be made: {error}", dir.display()))?;
        let path = dir.join(FILE);
        match Self::open_existing(&path, version) {
            Ok(store) => return Ok(Opened { store, created: false }),
            Err(Unusable::Held(why)) => return Err(why),
            Err(Unusable::Garbage) => {}
        }
        remove_file(&path)?;
        for suffix in BESIDE {
            remove_file(&beside(&path, suffix))?;
        }
        let store = Self::create(&path, version).map_err(message)?;
        Ok(Opened { store, created: true })
    }

    fn open_existing(path: &Path, version: u32) -> Result<Self, Unusable> {
        // Without CREATE: a store that is not there is not made here, so that a store is only ever made whole
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)
            .map_err(|_| Unusable::Garbage)?;
        let checked = conn.busy_timeout(WAIT).and_then(|()| holds_store(&conn, version));
        match checked {
            Ok(true) => {}
            Ok(false) => return Err(Unusable::Garbage),
            Err(error) if is_held(&error) => return Err(Unusable::Held(message(error))),
            Err(_) => return Err(Unusable::Garbage),
        }
        Self::ready(conn).map_err(|error| if is_held(&error) { Unusable::Held(message(error)) } else { Unusable::Garbage })
    }

    fn create(path: &Path, version: u32) -> rusqlite::Result<Self> {
        let mut conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        conn.busy_timeout(WAIT)?;
        conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get::<_, String>(0))?;
        let tx = conn.transaction()?;
        tx.execute_batch(&format!("{ENTRIES}; {KEYS}; {KEYS_BY_FILE}; {KEYS_BY_KEY}; {RESULTS}; PRAGMA user_version = {version};"))?;
        tx.commit()?;
        // The store's own file records its version and its table from the start (Store::write says why)
        conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()))?;
        Self::ready(conn)
    }

    /// The connection set up for use: the log beside the store, so a reader never waits for a writer (token-stats C27)
    fn ready(conn: Connection) -> rusqlite::Result<Self> {
        conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get::<_, String>(0))?;
        // A cache: a commit survives the application's crash, and one lost to a power cut is parsed again
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        let data_version = conn.query_row("PRAGMA data_version", [], |row| row.get(0))?;
        Ok(Store { conn, data_version })
    }

    /// Every file's row without its entry
    pub fn heads(&self) -> Result<Vec<Head>, String> {
        heads(&self.conn)
    }

    /// The row held under a path, if any
    pub fn get(&self, path: &str) -> Result<Option<Row>, String> {
        let mut statement =
            self.conn.prepare_cached("SELECT path, sig, agg, resume FROM entries WHERE path = ?1").map_err(message)?;
        Ok(rows_of(&mut statement, params![path]).map_err(message)?.into_iter().next())
    }

    /// Removes the rows under `removes` and holds each of `entries`, in one transaction: all of it lands, or none of it.
    /// A group keeps its row: the next scan finds it without a removed member, or with a member whose entry is another
    /// write's, and combines it again.
    pub fn write(&mut self, entries: &[Entry<'_>], removes: &[String]) -> Result<(), String> {
        let tx = self.write_transaction()?;
        for path in removes {
            seams::before_store_statement()?;
            tx.prepare_cached("DELETE FROM keys WHERE file IN (SELECT id FROM entries WHERE path = ?1)")
                .and_then(|mut s| s.execute(params![path]))
                .map_err(message)?;
            seams::before_store_statement()?;
            tx.prepare_cached("DELETE FROM entries WHERE path = ?1").and_then(|mut s| s.execute(params![path])).map_err(message)?;
        }
        let mut rev = max_rev(&tx)?;
        for entry in entries {
            rev += 1;
            put(&tx, entry, rev)?;
        }
        // A transaction dropped before this point rolls back, a panic's unwinding included
        tx.commit().map_err(message)?;
        self.checkpoint();
        Ok(())
    }

    /// A transaction that holds the store's write lock from its start: IMMEDIATE, waiting for another process that
    /// holds it
    pub fn write_transaction(&self) -> Result<Transaction<'_>, String> {
        // Unchecked: a scan that cannot take the write lock reads in a transaction of its own instead, and this store
        // never opens one inside another
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate).map_err(message)
    }

    /// A transaction that only reads: what it reads is the store as one commit left it
    pub fn read_transaction(&self) -> Result<Transaction<'_>, String> {
        Transaction::new_unchecked(&self.conn, TransactionBehavior::Deferred).map_err(message)
    }

    /// After a write's commit: what landed is copied from the log into the store's own file as far as no reader of the
    /// other process holds it back, so that a copy of that file alone, the restore's snapshot, holds it. A checkpoint
    /// that cannot run now runs after a later write; the write has landed either way.
    pub fn checkpoint(&self) {
        let _ = self.conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()));
    }

    /// Whether another process wrote to the store since this connection last asked (token-stats C27). A failed read
    /// answers yes, so the caller reads the store again rather than trust what it holds.
    pub fn changed_by_other(&mut self) -> bool {
        match self.conn.query_row("PRAGMA data_version", [], |row| row.get::<_, i64>(0)) {
            Ok(version) => {
                let changed = version != self.data_version;
                self.data_version = version;
                changed
            }
            Err(_) => true,
        }
    }
}

/// The number of the last write that held an entry, 0 when none did
pub fn max_rev(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT ifnull(max(rev), 0) FROM entries", [], |row| row.get::<_, i64>(0)).map_err(message)
}

fn integer(value: ValueRef<'_>) -> Option<i64> {
    if let ValueRef::Integer(n) = value { Some(n) } else { None }
}

fn blob(value: ValueRef<'_>) -> Option<&[u8]> {
    if let ValueRef::Blob(b) = value { Some(b) } else { None }
}

/// Every file's row without its entry; one whose path is not text is none
pub fn heads(conn: &Connection) -> Result<Vec<Head>, String> {
    let mut statement = conn.prepare_cached("SELECT id, path, sig, rev, kind, listed, project, own FROM entries").map_err(message)?;
    let mut rows = statement.query([]).map_err(message)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(message)? {
        let cell = |i| row.get_ref(i).map_err(message);
        let Some(path) = text(cell(1)?) else { continue };
        let facts = match (text(cell(4)?), integer(cell(5)?), text(cell(6)?)) {
            (Some(kind), Some(listed), Some(project)) => Some(Facts { kind, listed: listed != 0, project, own: text(cell(7)?) }),
            _ => None,
        };
        out.push(Head { id: row.get(0).map_err(message)?, path, sig: text(cell(2)?), rev: integer(cell(3)?), facts });
    }
    Ok(out)
}

/// Every group's row without its result
pub fn groups(conn: &Connection) -> Result<Vec<StoredGroup>, String> {
    let mut statement = conn.prepare_cached("SELECT id, members, input, combination FROM results").map_err(message)?;
    let mut rows = statement.query([]).map_err(message)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(message)? {
        let cell = |i| row.get_ref(i).map_err(message);
        out.push(StoredGroup {
            id: row.get(0).map_err(message)?,
            members: blob(cell(1)?).and_then(members_of),
            input: blob(cell(2)?).map(<[u8]>::to_vec),
            combination: text(cell(3)?),
        });
    }
    Ok(out)
}

/// Each group's stored result, by the group's number, given to `each`; a result that is not a blob is given as none
pub fn results(conn: &Connection, mut each: impl FnMut(i64, Option<&[u8]>)) -> Result<(), String> {
    let mut statement = conn.prepare_cached("SELECT id, result FROM results").map_err(message)?;
    let mut rows = statement.query([]).map_err(message)?;
    while let Some(row) = rows.next().map_err(message)? {
        each(row.get(0).map_err(message)?, blob(row.get_ref(1).map_err(message)?));
    }
    Ok(())
}

/// The aggregate held under a file's number, when it is text
pub fn agg(conn: &Connection, id: i64) -> Result<Option<String>, String> {
    let mut statement = conn.prepare_cached("SELECT agg FROM entries WHERE id = ?1").map_err(message)?;
    let mut rows = statement.query(params![id]).map_err(message)?;
    match rows.next().map_err(message)? {
        Some(row) => Ok(text(row.get_ref(0).map_err(message)?)),
        None => Ok(None),
    }
}

/// A file's keys, by its number
pub fn keys_of(conn: &Connection, id: i64) -> Result<Vec<i64>, String> {
    let mut statement = conn.prepare_cached("SELECT key FROM keys WHERE file = ?1").map_err(message)?;
    let keys = statement.query_map(params![id], |row| row.get(0)).map_err(message)?;
    keys.collect::<rusqlite::Result<_>>().map_err(message)
}

/// The numbers of the files holding a key
pub fn files_of(conn: &Connection, key: i64) -> Result<Vec<i64>, String> {
    let mut statement = conn.prepare_cached("SELECT file FROM keys WHERE key = ?1").map_err(message)?;
    let files = statement.query_map(params![key], |row| row.get(0)).map_err(message)?;
    files.collect::<rusqlite::Result<_>>().map_err(message)
}

// The writes below are each a statement of a write transaction the caller holds on `tx`

/// Holds an entry under its path as write `rev`, with its keys; the file's number. A file keeps its number when its
/// entry is replaced.
pub fn put(tx: &Connection, entry: &Entry<'_>, rev: i64) -> Result<i64, String> {
    let p = entry.put;
    let f = entry.facts.as_ref();
    seams::before_store_statement()?;
    let id: i64 = tx
        .prepare_cached(
            "INSERT INTO entries (path, sig, agg, resume, rev, kind, listed, project, own) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
             ON CONFLICT (path) DO UPDATE SET sig = excluded.sig, agg = excluded.agg, resume = excluded.resume, rev = excluded.rev, \
             kind = excluded.kind, listed = excluded.listed, project = excluded.project, own = excluded.own RETURNING id",
        )
        .and_then(|mut s| {
            s.query_row(
                params![
                    p.path,
                    p.sig,
                    p.agg,
                    p.resume,
                    rev,
                    f.map(|f| &f.kind),
                    f.map(|f| f.listed),
                    f.map(|f| &f.project),
                    f.and_then(|f| f.own.as_ref())
                ],
                |row| row.get(0),
            )
        })
        .map_err(message)?;
    // Only the keys that changed are written: a key's hash puts it on any page of the key index, so writing every key of
    // a file that gained one line would write most of that index (token-stats::QR-003/AC-03)
    let held: std::collections::HashSet<i64> = keys_of(tx, id)?.into_iter().collect();
    let given: std::collections::HashSet<i64> = entry.keys.iter().copied().collect();
    let mut gone: Vec<i64> = held.difference(&given).copied().collect();
    gone.sort_unstable();
    let mut remove = tx.prepare_cached("DELETE FROM keys WHERE file = ?1 AND key = ?2").map_err(message)?;
    for key in gone {
        seams::before_store_statement()?;
        remove.execute(params![id, key]).map_err(message)?;
    }
    let mut insert = tx.prepare_cached("INSERT INTO keys (key, file) VALUES (?1, ?2)").map_err(message)?;
    for key in entry.keys.iter().filter(|k| !held.contains(k)) {
        seams::before_store_statement()?;
        insert.execute(params![key, id]).map_err(message)?;
    }
    Ok(id)
}

/// Removes a file's entry and its keys, by its number
pub fn remove(tx: &Connection, id: i64) -> Result<(), String> {
    seams::before_store_statement()?;
    tx.prepare_cached("DELETE FROM keys WHERE file = ?1").and_then(|mut s| s.execute(params![id])).map_err(message)?;
    seams::before_store_statement()?;
    tx.prepare_cached("DELETE FROM entries WHERE id = ?1").and_then(|mut s| s.execute(params![id])).map_err(message)?;
    Ok(())
}

/// Removes a group's row
pub fn drop_group(tx: &Connection, id: i64) -> Result<(), String> {
    seams::before_store_statement()?;
    tx.prepare_cached("DELETE FROM results WHERE id = ?1").and_then(|mut s| s.execute(params![id])).map_err(message)?;
    Ok(())
}

/// Holds a group's combined result: its members' numbers in scan order, its input and the combination it came from
pub fn add_group(tx: &Connection, members: &[i64], input: &[u8], combination: &str, result: &[u8]) -> Result<(), String> {
    seams::before_store_statement()?;
    tx.prepare_cached("INSERT INTO results (members, input, combination, result) VALUES (?1, ?2, ?3, ?4)")
        .and_then(|mut s| s.execute(params![members_blob(members), input, combination, result]))
        .map_err(message)?;
    Ok(())
}

/// What a snapshot holds: the structure version it records, none when it is no store, and its rows when that version is
/// `version`
pub struct Snapshot {
    pub version: Option<u32>,
    pub rows: Option<Vec<Row>>,
}

/// A copy of the store read for the restore (token-stats C16): opened immutable, so nothing is written to it or beside
/// it, not even a log or shared-memory file, and nothing locks it
pub fn read_snapshot(file: &Path, version: u32) -> Snapshot {
    let none = Snapshot { version: None, rows: None };
    let Some(file) = file.to_str() else { return none };
    // In a URI `%`, `?` and `#` are not themselves; every other character of a path is
    let uri = format!("file:{}?immutable=1", file.replace('%', "%25").replace('?', "%3f").replace('#', "%23"));
    let Ok(conn) = Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return none;
    };
    let Ok(recorded) = conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0)) else { return none };
    let Ok(recorded) = u32::try_from(recorded) else { return none };
    if recorded != version {
        // A version alone is all a store of another structure is known by
        return Snapshot { version: Some(recorded), rows: None };
    }
    if !matches!(holds_store(&conn, version), Ok(true)) {
        return none;
    }
    // A copy that cannot be read through is no store either
    match conn.prepare("SELECT path, sig, agg, resume FROM entries ORDER BY rowid").and_then(|mut statement| rows_of(&mut statement, [])) {
        Ok(rows) => Snapshot { version: Some(recorded), rows: Some(rows) },
        Err(_) => none,
    }
}
