//! What every side's session walk does alike, written once: a directory's entries in scan order, a path below a
//! directory the walk listed, what `statSync` tells of a file, whether a path is no longer there, and the files the
//! token store holds below a directory that is there but cannot be listed.
//!
//! Scan order is a function of paths (token-stats, Implementation Decisions, Scan order): a directory's entries ordered
//! by the UTF-8 bytes of their names, a directory's files at the directory's own place among its siblings. The
//! TypeScript orders what it takes outside the walk by the same definition (`compareNames` and `compareScanOrder` in
//! `src/main/providers/scan-order.ts`). `std::fs::read_dir` gives entries in no order — APFS's is a hash order — so a
//! listing is sorted here.

use std::fs;
use std::io::ErrorKind;
use std::os::unix::fs::MetadataExt;

/// What an entry is, as its listing says without following a link (`Dirent.isDirectory()` and `isFile()`): a link to a
/// directory is neither
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Directory,
    File,
    Other,
}

/// One entry of a listing
pub(crate) struct Entry {
    /// Its name as Node decodes it: UTF-8, an invalid sequence becoming U+FFFD
    pub(crate) name: String,
    /// Its path, below the listed directory
    pub(crate) path: String,
    pub(crate) kind: Kind,
}

/// A directory's entries in scan order; None when it cannot be listed — it is not there, it is no directory, it cannot
/// be read, or the listing fails part-way — each of which makes `readdirSync` throw
pub(crate) fn entries(dir: &str) -> Option<Vec<Entry>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = match entry.file_type() {
            Ok(t) if t.is_dir() => Kind::Directory,
            Ok(t) if t.is_file() => Kind::File,
            _ => Kind::Other,
        };
        out.push(Entry { path: below(dir, &name), name, kind });
    }
    out.sort_by(|a, b| a.name.as_bytes().cmp(b.name.as_bytes()));
    Some(out)
}

/// `join(dir, name)` for a directory the walk reached and one of its entries' names: the directory's path is already
/// normalised and a name holds no slash, so joining is putting one slash between them
pub(crate) fn below(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

/// What `statSync` tells of a file, a link followed, each figure the double Node holds it as
pub(crate) struct Stat {
    /// `mtimeMs`: the seconds times 1000 plus the nanoseconds over 10^6, as Node computes it from the two
    pub(crate) mtime_ms: f64,
    pub(crate) size: f64,
    pub(crate) ino: f64,
}

/// The file's `statSync`; None when it throws
pub(crate) fn stat(path: &str) -> Option<Stat> {
    let m = fs::metadata(path).ok()?;
    Some(Stat { mtime_ms: m.mtime() as f64 * 1000.0 + m.mtime_nsec() as f64 / 1_000_000.0, size: m.size() as f64, ino: m.ino() as f64 })
}

/// Whether a path is no longer there, as `isAbsent` (src/main/providers/read-utils.ts) decides: the look at it fails
/// because it is not found or a part of the path is not a directory. A path behind a directory that cannot be entered is
/// there but cannot be looked at, which `Path::exists` would answer as not there.
pub(crate) fn is_absent(path: &str) -> bool {
    fs::metadata(path).is_err_and(|e| matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory))
}

/// The files the token store holds an entry for, which a walk keeps below a directory that is there but cannot be
/// listed: such a directory is not taken as empty (token-stats, Failure modes and boundaries: the token store). They are
/// asked for at the first such directory, and once: a walk that lists every directory never reads them, so a rescan
/// does not read every path the store holds (token-stats::QR-002).
pub(crate) struct Held<'a> {
    /// The paths, None when they cannot be read, which holds nothing; taken when first asked
    ask: Option<Box<dyn FnMut() -> Option<Vec<String>> + 'a>>,
    paths: Vec<String>,
}

impl<'a> Held<'a> {
    /// The files `ask` gives when first needed; with no `ask`, nothing is held
    pub(crate) fn new(ask: Option<Box<dyn FnMut() -> Option<Vec<String>> + 'a>>) -> Self {
        Held { ask, paths: Vec::new() }
    }

    /// The held files below a directory the walk reached, in scan order, each with its path's components below `dir`:
    /// compared component by component, each name by its UTF-8 bytes, as a listing would have put them (not by whole
    /// paths, which would put `a-b/x` before `a/y`)
    pub(crate) fn below(&mut self, dir: &str) -> Vec<(String, Vec<String>)> {
        if let Some(mut ask) = self.ask.take() {
            self.paths = ask().unwrap_or_default();
        }
        let prefix = if dir.ends_with('/') { dir.to_owned() } else { format!("{dir}/") };
        let mut out: Vec<(String, Vec<String>)> = self
            .paths
            .iter()
            .filter_map(|path| path.strip_prefix(&prefix).map(|rest| (path.clone(), rest.split('/').map(str::to_owned).collect())))
            .collect();
        out.sort_by(|a, b| a.1.cmp(&b.1));
        out
    }
}
