//! The test seams, compiled into builds made for tests only (the `test-seams` feature). A packaged build has none of
//! them. Their exports are in `exports/tests.rs`, each named `seam_…`, and no export elsewhere is (build.rs fails a
//! build otherwise), so packaging's refusal of a module exporting a `seam…` name covers each (scripts/build-engine.mjs).
//!
//! - The panic seams: a test names a file, and the module panics while it parses that file — or, through the walk's
//!   own seam, while the session walk reads that entry, or through the read's, while it reads that file's ranges for
//!   the session page or a search, or searches its full text — so that a test can show what a panic in the module does
//!   to a read. They are apart so that a case of each reaches its own read: a parse never begins for an entry the walk
//!   gave up on.
//! - The hold seam: a test names a file, and every read of its ranges and every full-text search of it waits, on the
//!   read's own thread and before it opens the file, until the test releases it, so that a case decides the order reads
//!   run and settle in rather than how long each takes. A read held for longer than the seam's valve panics, and its
//!   promise rejects as a read that panicked does, so that a case whose read is never released fails rather than hangs.
//! - The store-write seam: a test names a number of statements, and the next write to a token store fails once that
//!   many have run, so that a test can show a write cut short between two of its statements (token-stats C3).
//! - The copy seam: a test names a directory, and the module notes each directory it makes there to copy one of agy's
//!   databases into, with its mode as made, so that a test can see what a read cut short would leave behind: the
//!   module's read is one call that takes no pause, and removes the copy before it returns.
//! - The store-statement seam: a test runs a statement against a token store on a connection of its own, to read the
//!   store or to change it as a disk or a hand would. It goes through the module's own SQLite: a second copy of SQLite
//!   in the same process, such as Node's `node:sqlite`, does not see this one's locks, and closing its connection to
//!   the store takes this one's away and deletes the store's log from under it (POSIX locks belong to the process).
//! - The line-reader seam: the benchmark reads a file through the line reader every parse reads a session file by,
//!   and counts its lines, so that a figure about reading files is taken through the reader the app uses
//!   (`pnpm bench:scan file`, the AGENTS.md invariant on such figures).
//! - The line-limit seam: a test names a file and a limit, and the line reader holds that file's lines to the limit
//!   instead of its own, so that a case can show a line one byte past the limit failing its file, and what a read of
//!   such a line costs, without writing a file of hundreds of MiB.
//! - The lowercase seam: a test lowers a text by the rule the full-text search's snippets lower strings by, so that a
//!   test can hold it to JavaScript's `toLowerCase` over every code point (full-text.test.ts).
//! - The JSON string seam: a test reads a text as one string value through the reader every line is read by, so that
//!   a test can hold what the reader makes of each character, wherever it falls in the reader's scan, to what
//!   `JSON.parse` makes of it.

/// Called by every function that parses a session file, before it reads the file: in a build made for tests, it panics
/// when the file is the one the panic seam names, and otherwise does nothing.
pub(crate) fn before_parse(file: &str) {
    #[cfg(feature = "test-seams")]
    panic_on(&NAMED, file, "parsing");
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
}

/// Called by the session walk for each entry it reads — a Codex rollout, a Grok session's update stream, an Antigravity
/// conversation's database — before it reads it: in a build made for tests, it panics when the entry is the one the
/// walk's panic seam names, and otherwise does nothing.
pub(crate) fn before_walk_read(file: &str) {
    #[cfg(feature = "test-seams")]
    panic_on(&NAMED_WALKED, file, "walking");
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
}

/// Called by a read of a session file's ranges, and by its full-text search, before it opens the file: in a build made
/// for tests, it panics when the file is the one the read's panic seam names, waits while the hold seam holds the
/// file's reads, and otherwise does nothing.
pub(crate) fn before_range_read(file: &str) {
    #[cfg(feature = "test-seams")]
    {
        panic_on(&NAMED_READ, file, "reading");
        hold_seam::wait(file);
    }
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
}

#[cfg(feature = "test-seams")]
pub(crate) mod hold_seam {
    use std::sync::{Condvar, Mutex, MutexGuard};
    use std::time::{Duration, Instant};

    /// How long a read waits at the gate before it panics instead: longer than a case takes to release what it holds,
    /// shorter than it is given to fail in
    const VALVE: Duration = Duration::from_secs(5);

    /// The files whose reads are held, and the file of each read waiting at the gate now
    struct Gate {
        held: Vec<String>,
        waiting: Vec<String>,
    }

    /// One for the whole process, as the module's code is shared by every thread
    static GATE: Mutex<Gate> = Mutex::new(Gate { held: Vec::new(), waiting: Vec::new() });
    static RELEASED: Condvar = Condvar::new();

    fn gate() -> MutexGuard<'static, Gate> {
        GATE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Holds every read of `file` from now on, until it is released
    pub(crate) fn hold(file: String) {
        let mut gate = gate();
        if !gate.held.contains(&file) {
            gate.held.push(file);
        }
    }

    /// Releases the reads of `file`, or of every file: those waiting go on, and those to come are not held
    pub(crate) fn release(file: Option<String>) {
        let mut gate = gate();
        match file {
            Some(file) => gate.held.retain(|held| *held != file),
            None => gate.held.clear(),
        }
        drop(gate);
        RELEASED.notify_all();
    }

    /// The file of each read waiting at the gate now, in the order they came to it
    pub(crate) fn waiting() -> Vec<String> {
        gate().waiting.clone()
    }

    pub(super) fn wait(file: &str) {
        let valve = Instant::now() + VALVE;
        let mut gate = gate();
        if !gate.held.iter().any(|held| held == file) {
            return;
        }
        gate.waiting.push(file.to_owned());
        let mut given_up = false;
        while gate.held.iter().any(|held| held == file) {
            let now = Instant::now();
            if now >= valve {
                given_up = true;
                break;
            }
            gate = RELEASED.wait_timeout(gate, valve - now).unwrap_or_else(|poisoned| poisoned.into_inner()).0;
        }
        if let Some(at) = gate.waiting.iter().position(|waiting| waiting == file) {
            gate.waiting.remove(at);
        }
        drop(gate);
        if given_up {
            panic!("the hold seam's valve: a read of {file} was held for {VALVE:?} and never released");
        }
    }
}

#[cfg(feature = "test-seams")]
fn panic_on(named: &std::sync::Mutex<Option<String>>, file: &str, while_doing: &str) {
    let named = named.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();
    if named.as_deref() == Some(file) {
        panic!("the panic seam, while {while_doing} {file}");
    }
}

/// The file the module panics on while parsing, the entry it panics on while walking, and the file it panics on while
/// reading its ranges; one each for the whole process, as the module's code is shared by every thread
#[cfg(feature = "test-seams")]
static NAMED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
#[cfg(feature = "test-seams")]
static NAMED_WALKED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
#[cfg(feature = "test-seams")]
static NAMED_READ: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Names the file the module panics while parsing, or none
#[cfg(feature = "test-seams")]
pub(crate) fn name_panic_file(file: Option<String>) {
    *NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
}

/// Names the entry the module panics while the session walk reads it, or none
#[cfg(feature = "test-seams")]
pub(crate) fn name_walk_panic_file(file: Option<String>) {
    *NAMED_WALKED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
}

/// Names the file the module panics on while reading its ranges, or none
#[cfg(feature = "test-seams")]
pub(crate) fn name_read_panic_file(file: Option<String>) {
    *NAMED_READ.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
}

/// Called as a read makes the directory it copies one of agy's databases into: in a build made for tests, it notes the
/// directory and its mode when it is made in the directory the copy seam names, and otherwise does nothing.
pub(crate) fn copy_dir_made(dir: &std::path::Path) {
    #[cfg(feature = "test-seams")]
    copy_seam::note(dir);
    #[cfg(not(feature = "test-seams"))]
    let _ = dir;
}

#[cfg(feature = "test-seams")]
pub(crate) mod copy_seam {
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    /// The directory the copies are watched in, and each one made there since it was named: its path and its mode
    struct Watch {
        parent: PathBuf,
        made: Vec<(String, u32)>,
    }

    /// One for the whole process, as the module's code is shared by every thread
    static WATCH: Mutex<Option<Watch>> = Mutex::new(None);

    /// Watches the copies made in `parent` from now on, or none
    pub(crate) fn watch(parent: Option<String>) {
        *WATCH.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = parent.map(|p| Watch { parent: PathBuf::from(p), made: Vec::new() });
    }

    pub(super) fn note(dir: &Path) {
        let mut watch = WATCH.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(w) = watch.as_mut().filter(|w| dir.parent() == Some(w.parent.as_path())) {
            // The mode as the directory stands, read back rather than taken from what was asked for
            let mode = std::fs::metadata(dir).map_or(0, |m| m.permissions().mode() & 0o7777);
            w.made.push((dir.to_string_lossy().into_owned(), mode));
        }
    }

    /// Each copy made in the watched directory since it was named, in the order they were made
    pub(crate) fn made() -> Vec<(String, u32)> {
        WATCH.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).as_ref().map_or_else(Vec::new, |w| w.made.clone())
    }
}

/// Called before each statement of a write to a token store: in a build made for tests, it fails the write once the
/// store-write seam's count of statements has run, and the seam is then spent; otherwise it does nothing.
pub(crate) fn before_store_statement() -> Result<(), String> {
    #[cfg(feature = "test-seams")]
    {
        let mut left = store_write_seam::LEFT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        match *left {
            Some(0) => {
                *left = None;
                return Err("the write was cut short by the store-write seam".to_owned());
            }
            Some(n) => *left = Some(n - 1),
            None => {}
        }
    }
    Ok(())
}

#[cfg(feature = "test-seams")]
pub(crate) mod store_write_seam {
    use std::sync::Mutex;

    /// The statements the next write to a token store runs before it fails; one for the whole process
    pub(super) static LEFT: Mutex<Option<u32>> = Mutex::new(None);

    /// Makes the next write to a token store fail after this many of its statements, or no write fail
    pub(crate) fn cut_after(statements: Option<u32>) {
        *LEFT.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = statements;
    }
}

#[cfg(feature = "test-seams")]
pub(crate) mod store_statement_seam {
    use rusqlite::types::ValueRef;
    use rusqlite::{Connection, OpenFlags};
    use std::path::Path;

    fn failed(error: impl std::fmt::Display) -> String {
        error.to_string()
    }

    /// Runs one statement against the token store in `dir`, bound to `params` (text or null), on a connection of its
    /// own, and answers with the rows it gives: each value as text, a blob as `x'…'` in hexadecimal, or null. A store
    /// that is not there is not made.
    pub(crate) fn run(dir: &str, sql: &str, params: &[Option<String>]) -> Result<Vec<Vec<Option<String>>>, String> {
        let conn = Connection::open_with_flags(
            Path::new(dir).join(crate::store::FILE),
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(failed)?;
        let mut statement = conn.prepare(sql).map_err(failed)?;
        let columns = statement.column_count();
        let mut rows = statement.query(rusqlite::params_from_iter(params.iter())).map_err(failed)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(failed)? {
            let mut values = Vec::with_capacity(columns);
            for i in 0..columns {
                values.push(match row.get_ref(i).map_err(failed)? {
                    ValueRef::Null => None,
                    ValueRef::Integer(n) => Some(n.to_string()),
                    ValueRef::Real(x) => Some(x.to_string()),
                    ValueRef::Text(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
                    ValueRef::Blob(bytes) => Some(format!("x'{}'", bytes.iter().map(|b| format!("{b:02x}")).collect::<String>())),
                });
            }
            out.push(values);
        }
        Ok(out)
    }
}

#[cfg(feature = "test-seams")]
pub(crate) mod line_reader_seam {
    use crate::read::{self, Stored};

    /// How many lines `file` gives the line reader, read through its zstd stream when it is `cold`, as a cold rollout is
    pub(crate) fn count(file: &str, cold: bool) -> Result<u32, String> {
        let mut lines = 0;
        read::each_line(file, if cold { Stored::Zstd } else { Stored::Plain }, 0, |_, _, _, _| lines += 1)
            .map_err(|_| format!("{file} could not be read to its end"))?;
        Ok(lines)
    }
}

/// The longest line the line reader takes from `file`: in a build made for tests, the limit the line-limit seam names
/// for that file, and otherwise `limit`
pub(crate) fn line_max(file: &str, limit: usize) -> usize {
    #[cfg(feature = "test-seams")]
    return line_limit_seam::of(file).unwrap_or(limit);
    #[cfg(not(feature = "test-seams"))]
    {
        let _ = file;
        limit
    }
}

#[cfg(feature = "test-seams")]
pub(crate) mod line_limit_seam {
    use std::sync::Mutex;

    /// Each file named, with the limit its lines are held to; one for the whole process, as the module's code is shared
    /// by every thread, and keyed by file, as the tests of one process share it
    static LIMITS: Mutex<Vec<(String, usize)>> = Mutex::new(Vec::new());

    /// Holds the lines of `file` to `limit` bytes from now on, or to the reader's own limit again
    pub(crate) fn limit(file: String, limit: Option<u32>) {
        let mut limits = LIMITS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        limits.retain(|(named, _)| *named != file);
        if let Some(limit) = limit {
            limits.push((file, limit as usize));
        }
    }

    pub(super) fn of(file: &str) -> Option<usize> {
        LIMITS.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).iter().find(|(named, _)| named == file).map(|&(_, limit)| limit)
    }
}

#[cfg(feature = "test-seams")]
pub(crate) mod json_string_seam {
    use crate::json::Reader;
    use crate::text::Units;

    /// What the reader makes of `text` as one string value with nothing but whitespace around it: the string's code
    /// units, or None when it refuses the text, as `JSON.parse` refuses a line
    pub(crate) fn read(text: &str) -> Option<Units> {
        let mut reader = Reader::new(text);
        let string = reader.string().ok()?;
        reader.end().ok()?;
        Some(string.units())
    }
}
