//! Opening one of agy's databases without writing under agy's directories (token-stats::CON-002), and the values its
//! rows hold, as the reader reads them.
//!
//! An ordinary read-only SQLite open of a database in WAL mode leaves `-shm` and `-wal` files behind (measured
//! 2026-10-28), so a database with no log beside it is opened in place as immutable — SQLite then takes no lock and
//! creates nothing (measured 2026-10-29) — and one with a log (agy has it open) is copied, log first, into a temporary
//! directory of this application's own, read there, and the copy removed. The log goes first for agy exiting between
//! the two copies: its last connection merges the log into the database before deleting it, so a log already gone
//! means the database copied after it holds everything. A checkpoint agy runs while it keeps writing could still land
//! between the two copies (not observed; the mechanism allows it): a read of such a pair that fails contributes
//! nothing, and the next scan reads it again.
//!
//! A copy is made by `std::fs::copy`, which on macOS clones the file (`fclonefileat`) when the database and the copy are
//! on one volume that clones (APFS), and copies it (`fcopyfile`) otherwise: across volumes, or on a volume that does not.
//!
//! The walk still opens conversations through `readConversationDb` in `src/main/providers/antigravity.ts` (until #431),
//! by the same rules.

use std::fs::{self, DirBuilder};
use std::os::unix::fs::DirBuilderExt;
use std::path::{Path, PathBuf};

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags, Row};

use crate::seams;

/// The read failed: the database would not open or read in the shape asked for, a record would not decode, or the copy
/// could not be made. What the read gave is then not used.
#[derive(Debug)]
pub(super) struct Failed;

impl From<rusqlite::Error> for Failed {
    fn from(_: rusqlite::Error) -> Self {
        Failed
    }
}

impl From<super::proto::Malformed> for Failed {
    fn from(_: super::proto::Malformed) -> Self {
        Failed
    }
}

pub(super) type Read<T> = Result<T, Failed>;

/// Whether a path is there, as Node's `existsSync` answers: any failure to look counts as not there
fn exists(path: &str) -> bool {
    Path::new(path).exists()
}

/// Whether a log is beside the database
pub(super) fn has_log(file: &str) -> bool {
    exists(&format!("{file}-wal"))
}

/// Whether a failed read is agy writing the database rather than a format it cannot be read in
/// (token-stats::REQ-004/AC-03): a log was beside the database before the read or is after it — agy had it open, and a
/// torn copy or a database mid-write is not a format change — or the database is gone (deleted since the listing).
pub(super) fn failed_while_written(file: &str, log_before: bool) -> bool {
    log_before || has_log(file) || !exists(file)
}

/// A directory of this application's own, made under the temporary parent and holding a copy only while it is read:
/// the user's alone (mode 0700, as `mkdtemp` makes it), so a read cut short leaves nothing anyone else can read; removed
/// with everything in it when dropped, a read that panicked included
struct CopyDir(PathBuf);

impl CopyDir {
    /// A new `agentshed-agy-XXXXXX` directory under `parent`, as `mkdtempSync(join(parent, 'agentshed-agy-'))` names it
    fn new(parent: &Path) -> Read<Self> {
        const LETTERS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for attempt in 0..100u32 {
            let mut seed = random_seed(attempt);
            let suffix: String = (0..6)
                .map(|_| {
                    let c = LETTERS[(seed % LETTERS.len() as u64) as usize];
                    seed /= LETTERS.len() as u64;
                    char::from(c)
                })
                .collect();
            let dir = parent.join(format!("agentshed-agy-{suffix}"));
            match DirBuilder::new().mode(0o700).create(&dir) {
                Ok(()) => {
                    seams::copy_dir_made(&dir);
                    return Ok(CopyDir(dir));
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(Failed),
            }
        }
        Err(Failed)
    }
}

impl Drop for CopyDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Bits no two directories made at once share: the standard library's per-process random keys, the time and a count
fn random_seed(attempt: u32) -> u64 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u32(attempt);
    h.write_u32(std::process::id());
    if let Ok(t) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        h.write_u128(t.as_nanos());
    }
    h.finish()
}

/// Opens one of agy's databases without writing under agy's directories and hands it to `read`; the connection is
/// closed, and a copy removed, before this returns. `tmp_parent` is where a copy's directory is made.
pub(super) fn read<T>(file: &str, tmp_parent: &Path, read: impl FnOnce(&Connection) -> Read<T>) -> Read<T> {
    if !has_log(file) {
        // In a URI `%`, `?` and `#` are not themselves; every other character of a path is
        let uri = format!("file:{}?immutable=1", file.replace('%', "%25").replace('?', "%3f").replace('#', "%23"));
        let conn = Connection::open_with_flags(uri, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
        return read(&conn);
    }
    let dir = CopyDir::new(tmp_parent)?;
    let copy = dir.0.join("conversation.db");
    let mut copy_log = copy.clone().into_os_string();
    copy_log.push("-wal");
    match fs::copy(format!("{file}-wal"), &copy_log) {
        Ok(_) => {}
        // agy exited between the look and the copy: its last connection merged the log into the database
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(Failed),
    }
    fs::copy(file, &copy).map_err(|_| Failed)?;
    // The copy is this application's own, so it is opened like any database. agy's `-shm` — the index its running
    // connection keeps over the log — is not copied; SQLite builds the copy's own from the copied log (measured: a row
    // only the log holds reads back). The connection is dropped before the directory is.
    let conn = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    read(&conn)
}

/// One column's value as `node:sqlite` hands it to JavaScript, the reader the side's rules were written against: an
/// integer is a number, and one beyond 2^53 − 1 either way fails the read as `node:sqlite` throws on it; text is UTF-8
/// with U+FFFD for an invalid sequence; a blob is its bytes
pub(super) enum Cell<'a> {
    Number(f64),
    Text(String),
    Blob(&'a [u8]),
    Null,
}

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// A row's cells, every column converted, as `node:sqlite` converts a row before it hands it over
pub(super) fn cells<'a>(row: &'a Row<'_>, columns: usize) -> Read<Vec<Cell<'a>>> {
    (0..columns)
        .map(|i| {
            Ok(match row.get_ref(i)? {
                ValueRef::Integer(v) if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&v) => Cell::Number(v as f64),
                ValueRef::Integer(_) => return Err(Failed),
                ValueRef::Real(v) => Cell::Number(v),
                ValueRef::Text(t) => Cell::Text(String::from_utf8_lossy(t).into_owned()),
                ValueRef::Blob(b) => Cell::Blob(b),
                ValueRef::Null => Cell::Null,
            })
        })
        .collect()
}

/// Every row `sql` gives, one at a time, each handed to `each` with its cells
pub(super) fn each_row(conn: &Connection, sql: &str, mut each: impl FnMut(Vec<Cell<'_>>) -> Read<()>) -> Read<()> {
    let mut statement = conn.prepare_cached(sql)?;
    let columns = statement.column_count();
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        each(cells(row, columns)?)?;
    }
    Ok(())
}

/// The first row `sql` gives, as `.get()` reads it; None when it gives none
pub(super) fn first_row<T>(conn: &Connection, sql: &str, row: impl FnOnce(Vec<Cell<'_>>) -> Read<T>) -> Read<Option<T>> {
    let mut statement = conn.prepare_cached(sql)?;
    let columns = statement.column_count();
    let mut rows = statement.query([])?;
    match rows.next()? {
        Some(r) => Ok(Some(row(cells(r, columns)?)?)),
        None => Ok(None),
    }
}
