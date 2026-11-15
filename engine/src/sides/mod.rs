//! The agent sides the module reads, and the one trait they implement. This is the only list of the sides: code outside
//! `sides/` never names one, and each side's own rules stay inside its directory but for the adapter it registers here.
//! The session walk takes each walked side's list through its adapter, and what the run keeps from one walk to the next
//! is held here for every side alike (`Kept`), each side's part of a type of its own.
//!
//! The trait gains a method only when side-free code calls one.

mod antigravity;
mod claude;
mod codex;
mod grok;

use std::any::Any;

use napi::Result;
use napi::sys::napi_value;

use crate::exports::js::Js;

/// What side-free code asks of a side
pub(crate) trait Side: Sync {
    /// Parses one session file: `job` is the TypeScript `ParseJob` of the side's kind, and the result its `ParseResult`
    /// — the file's entry, or null when the file cannot be read (token-stats B12, F6, token-stats::REQ-004)
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value>;

    /// What a parse that panicked answers: the file's failed read, under the side's rule for a read that fails
    /// (token-stats, Scans and the window). By default the answer for a file that cannot be read, null.
    fn failed(&self, js: &Js, _job: napi_value) -> Result<napi_value> {
        js.null()
    }

    /// The titles the side's agent keeps for its sessions apart from their files, read from under its data root
    /// `home`, a copy made under `tmp_parent` (the system temporary directory when none) where one is needed; None when
    /// the module does not read this side's titles
    fn titles(&self, _js: &Js, _home: &str, _tmp_parent: Option<&str>) -> Option<Result<napi_value>> {
        None
    }

    /// The side's list in the session walk: its sessions under its data root, which `roots` (the TypeScript `ScanRoots`)
    /// names, in scan order, as its list in the TypeScript `SessionWalk`. `kept` holds what the run's walks keep, of which
    /// the side takes its own; a copy a read needs is made under `tmp_parent` (the system temporary directory when none).
    /// None when the module does not walk this side.
    fn walk(&self, _js: &Js, _roots: napi_value, _kept: &mut Kept, _tmp_parent: Option<&str>) -> Option<Result<napi_value>> {
        None
    }

    /// One session file's metadata, read as the walk reads it, for the session page's single-file rebuild; None when the
    /// module does not read this side's
    fn meta(&self, _js: &Js, _file: &str) -> Option<Result<napi_value>> {
        None
    }
}

/// The side whose files a job of `kind` names, when the module reads them
pub(crate) fn named(kind: &str) -> Option<&'static dyn Side> {
    match kind {
        "antigravity" => Some(&antigravity::Antigravity),
        "claude" => Some(&claude::Claude),
        "codex" => Some(&codex::Codex),
        "grok" => Some(&grok::Grok),
        _ => None,
    }
}

/// The sides the session walk lists, under the names its result gives them, in the order a scan walks their data roots
/// (token-stats, Implementation Decisions, Scan order)
const WALKED: [(&str, &dyn Side); 3] = [("codex", &codex::Codex), ("grok", &grok::Grok), ("antigravity", &antigravity::Antigravity)];

/// The session walk: each walked side's list, as the TypeScript `SessionWalk`
pub(crate) fn walk(js: &Js, roots: napi_value, kept: &mut Kept, tmp_parent: Option<&str>) -> Result<napi_value> {
    let mut lists = Vec::with_capacity(WALKED.len());
    for (name, side) in WALKED {
        if let Some(list) = side.walk(js, roots, kept, tmp_parent) {
            lists.push((name, list?));
        }
    }
    js.object(&lists)
}

/// What one run's session walks keep from one walk to the next: each side's own, of a type its directory keeps private,
/// made empty when the side first asks for it
#[derive(Default)]
pub(crate) struct Kept(Vec<Box<dyn Any>>);

impl Kept {
    /// What the side keeping a `T` keeps
    fn of<T: Default + 'static>(&mut self) -> &mut T {
        let at = match self.0.iter().position(|k| k.is::<T>()) {
            Some(at) => at,
            None => {
                self.0.push(Box::new(T::default()));
                self.0.len() - 1
            }
        };
        self.0[at].downcast_mut().expect("what is kept at a type's place is of that type")
    }
}
