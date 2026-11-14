//! The test seams, compiled into builds made for tests only (the `test-seams` feature). A packaged build has none of
//! them. Every export here is named `seam_…`, and no export elsewhere is (build.rs fails a build otherwise), so
//! packaging's refusal of a module exporting a `seam…` name covers each (scripts/build-engine.mjs).
//!
//! - The panic seam: a test names a file, and the module panics while it parses that file, so that a test can show
//!   what a panic in the module does to a read.
//! - The store-write seam: a test names a number of statements, and the next write to a token store fails once that
//!   many have run, so that a test can show a write cut short between two of its statements (token-stats C3).
//! - The store-statement seam: a test runs a statement against a token store on a connection of its own, to read the
//!   store or to change it as a disk or a hand would. It goes through the module's own SQLite: a second copy of SQLite
//!   in the same process, such as Node's `node:sqlite`, does not see this one's locks, and closing its connection to
//!   the store takes this one's away and deletes the store's log from under it (POSIX locks belong to the process).

/// Called by every function that parses a session file, before it reads the file: in a build made for tests, it
/// panics when the file is the one the seam names, and otherwise does nothing.
#[cfg_attr(not(feature = "test-seams"), allow(dead_code))]
pub(crate) fn before_parse(file: &str) {
    #[cfg(feature = "test-seams")]
    {
        let named = panic_seam::NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();
        if named.as_deref() == Some(file) {
            panic!("the panic seam, while parsing {file}");
        }
    }
    #[cfg(not(feature = "test-seams"))]
    let _ = file;
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
mod store_write_seam {
    use napi_derive::napi;
    use std::sync::Mutex;

    /// The statements the next write to a token store runs before it fails; one for the whole process
    pub(super) static LEFT: Mutex<Option<u32>> = Mutex::new(None);

    /// Makes the next write to a token store fail after this many of its statements, or no write fail
    #[napi(catch_unwind)]
    pub fn seam_cut_store_write_after(statements: Option<u32>) {
        *LEFT.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = statements;
    }
}

#[cfg(feature = "test-seams")]
mod store_statement_seam {
    use napi_derive::napi;
    use rusqlite::types::ValueRef;
    use rusqlite::{Connection, OpenFlags};
    use std::path::Path;

    fn failed(error: impl std::fmt::Display) -> napi::Error {
        napi::Error::from_reason(error.to_string())
    }

    /// Runs one statement against the token store in `dir`, bound to `params` (text or null), on a connection of its
    /// own, and answers with the rows it gives: each value as text, a blob as `x'…'` in hexadecimal, or null. A store
    /// that is not there is not made.
    #[napi(catch_unwind)]
    pub fn seam_store_statement(dir: String, sql: String, params: Vec<Option<String>>) -> napi::Result<Vec<Vec<Option<String>>>> {
        let conn = Connection::open_with_flags(
            Path::new(&dir).join(crate::store::FILE),
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(failed)?;
        let mut statement = conn.prepare(&sql).map_err(failed)?;
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
mod panic_seam {
    use napi_derive::napi;
    use std::sync::Mutex;

    /// The file the module panics on; one for the whole process, as the module's code is shared by every thread
    pub(super) static NAMED: Mutex<Option<String>> = Mutex::new(None);

    /// Names the file the module panics while parsing, or none
    #[napi(catch_unwind)]
    pub fn seam_panic_while_parsing(file: Option<String>) {
        *NAMED.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = file;
    }

    /// A stand-in for a function that parses a session file, for the seam's own tests: it parses nothing, and answers
    /// with the file once the seam has let it through
    #[napi(catch_unwind)]
    pub fn seam_parse(file: String) -> String {
        super::before_parse(&file);
        file
    }
}
