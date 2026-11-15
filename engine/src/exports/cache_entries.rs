//! What `CacheEntries` (src/main/providers/token-stats.ts) calls: the token store, opened by whichever thread runs the
//! scan, its scan by group (crate::group), and a copy of it read for the restore. It converts between JavaScript and the
//! store and holds no rule.
//!
//! A failure of the store is answered as a value — a message, or none — and never thrown, so that the caller can tell
//! it from a panic, which is thrown (`catch_unwind`): a failed write fails no scan, a panic outside a parse fails it
//! (token-stats C3; Scans and the window, failure modes).

use crate::exports::js::Js;
use crate::group::{self, ScanFile, Scanned, Summed};
use crate::store;
use crate::text::{self, Units};
use napi::bindgen_prelude::{FromNapiValue, Unknown};
use napi::sys::napi_value;
use napi::{Env, Error, JsValue, Result};
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

/// A file's row without its entry: its signature, and what the grouping read of its entry when it was written — its
/// side, whether it is listed, its project and the id its side's forks name it by — null when it could not read it
#[napi(object)]
pub struct StoreHead {
    pub path: String,
    pub sig: Option<String>,
    pub kind: Option<String>,
    pub listed: Option<bool>,
    pub project_key: Option<String>,
    pub own_id: Option<String>,
}

/// The heads a read gave, or why it failed
#[napi(object)]
pub struct StoreHeads {
    pub rows: Vec<StoreHead>,
    pub failure: Option<String>,
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

fn read(rows: std::result::Result<Vec<store::Row>, String>) -> StoreRead {
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

    /// Every file's row without its entry
    #[napi(catch_unwind)]
    pub fn heads(&self) -> StoreHeads {
        let read = match &self.store {
            Some(store) => store.heads(),
            None => Err(self.unopened()),
        };
        match read {
            Ok(heads) => StoreHeads {
                rows: heads
                    .into_iter()
                    .map(|h| {
                        let facts = h.facts;
                        StoreHead {
                            path: h.path,
                            sig: h.sig,
                            kind: facts.as_ref().map(|f| f.kind.clone()),
                            listed: facts.as_ref().map(|f| f.listed),
                            project_key: facts.as_ref().map(|f| f.project.clone()),
                            own_id: facts.and_then(|f| f.own),
                        }
                    })
                    .collect(),
                failure: None,
            },
            Err(failure) => StoreHeads { rows: Vec::new(), failure: Some(failure) },
        }
    }

    /// Holds `puts` and removes `removes` in one transaction; null when it landed, otherwise why it did not
    #[napi(catch_unwind)]
    pub fn write(&mut self, puts: Vec<StorePut>, removes: Vec<String>) -> Option<String> {
        let unopened = self.unopened();
        let Some(store) = &mut self.store else { return Some(unopened) };
        let puts: Vec<store::Put> =
            puts.into_iter().map(|p| store::Put { path: p.path, sig: p.sig, agg: p.agg, resume: p.resume }).collect();
        // An entry the grouping cannot read is held with nothing beside it: no scan takes it for a hit
        let entries: Vec<store::Entry<'_>> = puts
            .iter()
            .map(|put| match group::decode(&put.agg) {
                Some((facts, keys)) => store::Entry { put, facts: Some(facts), keys },
                None => store::Entry { put, facts: None, keys: Vec::new() },
            })
            .collect();
        store.write(&entries, &removes).err()
    }

    /// Scans `files` (`{ path, put?: { sig, agg, resume? }, admitted, title }`, in scan order) by group under the
    /// combination `combination`: `{ bad, failure }` naming the files whose stored entry the combination cannot read,
    /// with nothing written, or the scan's figures (`summed`) with why the store could not be read or written, or null
    #[napi(catch_unwind)]
    pub fn scan<'env>(&self, env: &'env Env, combination: String, files: Unknown<'env>) -> Result<Unknown<'env>> {
        let js = Js::new(env);
        let files = scan_files(&js, files.value().value)?;
        let Some(store) = &self.store else {
            // No store: every file is the caller's to parse, or all of them were
            let failure = Some(self.unopened());
            return answer(env, if files.iter().all(|f| f.put.is_some()) { in_memory(&js, &files, failure)? } else { bad(&js, &files, failure)? });
        };
        let dates = js.local_dates()?;
        let answer_value = match group::scan(store, &dates, &combination, &files)? {
            Scanned::Summed { summed: s, failure } => summed(&js, &s, &files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), failure)?,
            Scanned::Bad { files: paths, failure } => {
                let list = js.array(paths.iter().map(|p| js.text(&text::units(p))))?;
                let failure = match failure {
                    Some(why) => js.text(&text::units(&why))?,
                    None => js.null()?,
                };
                js.object(&[("bad", list), ("failure", failure)])?
            }
        };
        answer(env, answer_value)
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

fn answer<'env>(env: &'env Env, value: napi_value) -> Result<Unknown<'env>> {
    // SAFETY: a value of this call's environment, made on its thread
    unsafe { Unknown::from_napi_value(env.raw(), value) }
}

fn lossy(units: Option<Units>) -> String {
    String::from_utf16_lossy(&units.unwrap_or_default())
}

/// The files a scan is given, as JavaScript holds them
fn scan_files(js: &Js, files: napi_value) -> Result<Vec<ScanFile>> {
    let mut out = Vec::new();
    for f in js.elements(files)?.unwrap_or_default() {
        let put = js.get(f, "put")?;
        let put = if js.nullish(put)? {
            None
        } else {
            let resume = js.get(put, "resume")?;
            Some(store::Put {
                path: lossy(js.string(js.get(f, "path")?)?),
                sig: lossy(js.string(js.get(put, "sig")?)?),
                agg: lossy(js.string(js.get(put, "agg")?)?),
                resume: if js.nullish(resume)? { None } else { Some(lossy(js.string(resume)?)) },
            })
        };
        out.push(ScanFile {
            path: lossy(js.string(js.get(f, "path")?)?),
            put,
            admitted: js.truthy(js.get(f, "admitted")?)?,
            title: js.string(js.get(f, "title")?)?,
        });
    }
    Ok(out)
}

/// A scan with no store to read, every file given its entry: combined in memory
fn in_memory(js: &Js, files: &[ScanFile], failure: Option<String>) -> Result<napi_value> {
    let entries: Vec<_> = files.iter().map(|f| (f.put.as_ref().map_or("", |p| p.agg.as_str()), f.admitted, f.title.as_deref())).collect();
    let dates = js.local_dates()?;
    match group::combine_entries(&dates, &entries)? {
        Ok(s) => summed(js, &s, &files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), failure),
        Err(bad) => Err(Error::from_reason(format!("the entry parsed for {} is not well formed", files[bad[0]].path))),
    }
}

/// A scan with no store to read: the files it was to give are the caller's to parse
fn bad(js: &Js, files: &[ScanFile], failure: Option<String>) -> Result<napi_value> {
    let list = js.array(files.iter().filter(|f| f.put.is_none()).map(|f| js.text(&text::units(&f.path))))?;
    let failure = match failure {
        Some(why) => js.text(&text::units(&why))?,
        None => js.null()?,
    };
    js.object(&[("bad", list), ("failure", failure)])
}

/// The figures a scan derives from the token cache, as `TokenEngine` takes them: `{ rows, projects, sessionFiles,
/// antigravityUnreadable, retitle, failure }`. `projects` holds `[key, sessions]` pairs; `retitle` holds `[project,
/// session, start, end]` for each session titled by its first question left; `paths` are the scan's files by place.
pub(super) fn summed(js: &Js, s: &Summed, paths: &[&str], failure: Option<String>) -> Result<napi_value> {
    let rows = js.array(s.rows.iter().map(|r| {
        let [input, output, read, write, total] = r.figures;
        js.object(&[
            ("day", js.text(&r.day)?),
            ("side", js.text(&r.side)?),
            ("projectKey", js.text(&r.project)?),
            ("model", js.text(&r.model)?),
            ("input", js.num(input)?),
            ("output", js.num(output)?),
            ("cacheRead", js.num(read)?),
            ("cacheWrite", js.num(write)?),
            ("total", js.num(total)?),
        ])
    }))?;
    let mut retitle = Vec::new();
    let projects = js.array(s.projects.iter().enumerate().map(|(p, (key, sessions))| {
        let list = js.array(sessions.iter().enumerate().map(|(i, x)| {
            if let Some([start, end]) = x.retitle {
                retitle.push([p as f64, i as f64, start, end]);
            }
            js.object(&[
                ("side", js.text(&x.side)?),
                ("title", js.text_or_null(x.title.as_ref())?),
                ("at", js.num_or_null(x.at)?),
                ("tokens", js.num(x.tokens)?),
                ("file", js.text(&x.file)?),
                ("questionCount", js.num(x.questions)?),
                ("forkState", js.text(&text::units(x.fork.name()))?),
            ])
        }))?;
        js.array([js.text(key), Ok(list)])
    }))?;
    let retitle = js.array(retitle.iter().map(|r| js.array(r.iter().map(|&x| js.num(x)))))?;
    let allow = js.array(s.allow.iter().map(|&p| js.text(&text::units(paths[p as usize]))))?;
    let failure = match failure {
        Some(why) => js.text(&text::units(&why))?,
        None => js.null()?,
    };
    js.object(&[
        ("rows", rows),
        ("projects", projects),
        ("sessionFiles", allow),
        ("antigravityUnreadable", js.num(s.unreadable)?),
        ("retitle", retitle),
        ("failure", failure),
    ])
}
