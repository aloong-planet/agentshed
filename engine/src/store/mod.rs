//! The token store (token-stats, Implementation Decisions, Cache; ADR-0044): a SQLite database in the settings
//! directory, holding each session file's entry as a row under its path, with its signature and its per-file
//! aggregate. The store never reads an entry: what one holds, and whether it is well formed, is its caller's to judge,
//! so nothing here differs by agent side.
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
use rusqlite::{Connection, ErrorCode, OpenFlags, TransactionBehavior, params};
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

/// The store's one table, exactly as this structure creates it. A store's own text for it is compared with this, so a
/// table of another shape is no store of this version.
const ENTRIES: &str = "CREATE TABLE entries (path TEXT PRIMARY KEY NOT NULL, sig TEXT NOT NULL, agg TEXT NOT NULL, resume TEXT)";

/// What a store of this structure holds besides its data, by name: the table, and the index SQLite keeps for its key
fn schema() -> Vec<(String, String, Option<String>)> {
    vec![
        ("table".into(), "entries".into(), Some(ENTRIES.into())),
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
        tx.execute_batch(&format!("{ENTRIES}; PRAGMA user_version = {version};"))?;
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

    /// The row held under a path, if any
    pub fn get(&self, path: &str) -> Result<Option<Row>, String> {
        let mut statement =
            self.conn.prepare_cached("SELECT path, sig, agg, resume FROM entries WHERE path = ?1").map_err(message)?;
        Ok(rows_of(&mut statement, params![path]).map_err(message)?.into_iter().next())
    }

    /// Every row held, in the order the rows were first written: a file keeps its place when its entry is replaced
    pub fn all(&self) -> Result<Vec<Row>, String> {
        let mut statement = self.conn.prepare_cached("SELECT path, sig, agg, resume FROM entries ORDER BY rowid").map_err(message)?;
        rows_of(&mut statement, []).map_err(message)
    }

    /// Removes the rows under `removes` and holds each of `puts`, in one transaction: all of it lands, or none of it
    pub fn write(&mut self, puts: &[Put], removes: &[String]) -> Result<(), String> {
        // IMMEDIATE takes the write lock at the start, waiting for another process that holds it
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(message)?;
        {
            let mut remove = tx.prepare_cached("DELETE FROM entries WHERE path = ?1").map_err(message)?;
            for path in removes {
                seams::before_store_statement()?;
                remove.execute(params![path]).map_err(message)?;
            }
            let mut put = tx
                .prepare_cached(
                    "INSERT INTO entries (path, sig, agg, resume) VALUES (?1, ?2, ?3, ?4) \
                     ON CONFLICT (path) DO UPDATE SET sig = excluded.sig, agg = excluded.agg, resume = excluded.resume",
                )
                .map_err(message)?;
            for entry in puts {
                seams::before_store_statement()?;
                put.execute(params![entry.path, entry.sig, entry.agg, entry.resume]).map_err(message)?;
            }
        }
        // A transaction dropped before this point rolls back, a panic's unwinding included
        tx.commit().map_err(message)?;
        // What landed is copied from the log into the store's own file as far as no reader of the other process holds
        // it back, so that a copy of that file alone, the restore's snapshot, holds it. A checkpoint that cannot run
        // now runs after a later write; the write has landed either way.
        let _ = self.conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()));
        Ok(())
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
