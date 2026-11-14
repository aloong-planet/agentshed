//! What `CacheEntries` (src/main/providers/token-stats.ts) calls: the token store, opened by whichever thread runs the
//! scan, and a copy of it read for the restore. It converts between JavaScript and the store and holds no rule.
//!
//! A failure of the store is answered as a value — a message, or none — and never thrown, so that the caller can tell
//! it from a panic, which is thrown (`catch_unwind`): a failed write fails no scan, a panic outside a parse fails it
//! (token-stats C3; Scans and the window, failure modes).

use crate::store;
use napi_derive::napi;
use std::path::Path;

/// A row as the store holds it; a column holding anything but text is null
#[napi(object)]
pub struct StoreRow {
    pub path: String,
    pub sig: Option<String>,
    pub agg: Option<String>,
    pub resume: Option<String>,
}

/// An entry to hold under its path
#[napi(object)]
pub struct StorePut {
    pub path: String,
    pub sig: String,
    pub agg: String,
    pub resume: Option<String>,
}

/// The rows a read gave, or why it failed
#[napi(object)]
pub struct StoreRead {
    pub rows: Vec<StoreRow>,
    pub failure: Option<String>,
}

/// A snapshot: the structure version it records (null when it is no store), and its rows when that is the version asked
#[napi(object)]
pub struct StoreSnapshot {
    pub version: Option<u32>,
    pub rows: Option<Vec<StoreRow>>,
}

fn row(row: store::Row) -> StoreRow {
    StoreRow { path: row.path, sig: row.sig, agg: row.agg, resume: row.resume }
}

fn read(rows: Result<Vec<store::Row>, String>) -> StoreRead {
    match rows {
        Ok(rows) => StoreRead { rows: rows.into_iter().map(row).collect(), failure: None },
        Err(failure) => StoreRead { rows: Vec::new(), failure: Some(failure) },
    }
}

/// The token store of one settings directory, as one thread holds it
#[napi]
pub struct TokenStore {
    store: Option<store::Store>,
    created: bool,
    failure: Option<String>,
}

#[napi]
impl TokenStore {
    /// Opens the store in `dir` for structure `version`, making an empty one when there is none to use. When even that
    /// fails, the store has none and says why in `failure`.
    #[napi(constructor, catch_unwind)]
    pub fn new(dir: String, version: u32) -> Self {
        match store::Store::open(Path::new(&dir), version) {
            Ok(opened) => TokenStore { store: Some(opened.store), created: opened.created, failure: None },
            Err(failure) => TokenStore { store: None, created: false, failure: Some(failure) },
        }
    }

    /// Whether opening made the store: none was there, or what was there was replaced
    #[napi(getter, catch_unwind)]
    pub fn created(&self) -> bool {
        self.created
    }

    /// Why the store could not be opened, or null
    #[napi(getter, catch_unwind)]
    pub fn failure(&self) -> Option<String> {
        self.failure.clone()
    }

    /// The row under `path`, as a read of none or one row
    #[napi(catch_unwind)]
    pub fn get(&self, path: String) -> StoreRead {
        match &self.store {
            Some(store) => read(store.get(&path).map(|found| found.into_iter().collect())),
            None => read(Err(self.unopened())),
        }
    }

    /// Every row
    #[napi(catch_unwind)]
    pub fn all(&self) -> StoreRead {
        match &self.store {
            Some(store) => read(store.all()),
            None => read(Err(self.unopened())),
        }
    }

    /// Holds `puts` and removes `removes` in one transaction; null when it landed, otherwise why it did not
    #[napi(catch_unwind)]
    pub fn write(&mut self, puts: Vec<StorePut>, removes: Vec<String>) -> Option<String> {
        let unopened = self.unopened();
        let Some(store) = &mut self.store else { return Some(unopened) };
        let puts: Vec<store::Put> =
            puts.into_iter().map(|p| store::Put { path: p.path, sig: p.sig, agg: p.agg, resume: p.resume }).collect();
        store.write(&puts, &removes).err()
    }

    /// Whether another process wrote to the store since this one last asked
    #[napi(catch_unwind)]
    pub fn changed_by_other(&mut self) -> bool {
        self.store.as_mut().is_none_or(store::Store::changed_by_other)
    }

    fn unopened(&self) -> String {
        self.failure.clone().unwrap_or_else(|| "the token store is not open".to_owned())
    }
}

/// A copy of a token store, read for the restore without writing to it or beside it
#[napi(catch_unwind)]
pub fn read_token_store_snapshot(file: String, version: u32) -> StoreSnapshot {
    let snapshot = store::read_snapshot(Path::new(&file), version);
    StoreSnapshot { version: snapshot.version, rows: snapshot.rows.map(|rows| rows.into_iter().map(row).collect()) }
}
