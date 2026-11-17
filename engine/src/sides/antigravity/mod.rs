//! Antigravity CLI (`agy`, ADR-0037): its conversations' entries — each conversation a SQLite database directly in agy's
//! conversations directory, read without writing there (token-stats::CON-001, CON-002, REQ-003, REQ-004; session-view's
//! Antigravity rules) — and agy's own conversation titles. This file is the adapter the side registers in
//! `sides/mod.rs`: it reads a parse job, the TypeScript `ParseJob` of kind `antigravity`, and writes the entry as the
//! TypeScript `ParseResult`. The file goes back as the job's own JavaScript value. Its side of the session walk it writes
//! as the TypeScript `AntigravitySessionMeta`.

mod db;
mod combine;
mod entry;
mod parse;
mod proto;
mod titles;
mod transcript;
mod usage;
mod walk;

use std::path::{Path, PathBuf};

use napi::sys::napi_value;
use napi::{Error, Result};

use self::entry::{Entry, Job, Parsed};
use self::parse::Runtime;
use self::walk::Attributions;
use super::{Kept, Side, Walked};
use crate::exports::js::Js;
use crate::text::{self, Units};
use crate::walk::Held;

pub(crate) struct Antigravity;

impl Side for Antigravity {
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value> {
        let file = js.get(job, "file")?;
        let given = Job {
            file: path_text(js, file)?,
            transcript: path_text(js, js.get(job, "transcript")?)?,
            tmp_parent: tmp_parent(js, js.get(job, "tmpParent")?)?,
        };
        match parse::parse(&given, &JsRuntime(js))? {
            Parsed::Entry(entry) => write_entry(js, file, &entry),
            Parsed::Unreadable => write_unreadable(js, file),
            Parsed::Failed => js.null(),
        }
    }

    fn question_text(&self, range: &str) -> Option<Units> {
        transcript::shown(range)
    }

    fn dispatches(&self) -> &'static [&'static str] {
        std::slice::from_ref(&transcript::DISPATCH)
    }

    /// The lines a rewind left behind (session-view::REQ-004/AC-03)
    fn kept_lines(&self, lines: &[String]) -> Vec<bool> {
        transcript::kept_in(lines)
    }

    /// A panic while a conversation was parsed is its failed read (token-stats, Scans and the window), judged as
    /// token-stats::REQ-004/AC-03 judges one: not counted, its last result kept, while a log is beside the database or
    /// the database is no longer there, and unreadable otherwise (AC-01). The log is looked at as the panic is caught:
    /// the read it interrupted is not there to say whether one was beside the database when it began.
    fn failed(&self, js: &Js, job: napi_value) -> Result<napi_value> {
        let file = js.get(job, "file")?;
        if db::failed_while_written(&path_text(js, file)?, false) { js.null() } else { write_unreadable(js, file) }
    }

    /// agy's own conversation titles (session-view::REQ-003/AC-03): `[conversation id, title]` pairs, or null when the read
    /// failed while agy was writing them
    fn titles(&self, js: &Js, home: &str, tmp_parent: Option<&str>) -> Option<Result<napi_value>> {
        let answer = || -> Result<napi_value> {
            let tmp = copy_parent(js, tmp_parent)?;
            match titles::read(Path::new(home), &tmp) {
                Some(pairs) => js.array(pairs.iter().map(|(id, title)| js.array([js.text(&text::units(id)), js.text(&text::units(title))]))),
                None => js.null(),
            }
        };
        Some(answer())
    }

    fn decode(&self, agg: &str) -> Option<crate::group::Decoded> {
        combine::decode(agg)
    }

    fn combine(
        &self,
        dates: &crate::exports::js::LocalDates<'_>,
        members: &[crate::group::Member<'_>],
        out: &mut crate::group::Builder,
    ) -> Result<std::result::Result<(), u32>> {
        combine::combine(dates, members, out)
    }

    /// Every conversation in agy's data root, `roots.antigravityHome`, with what the run's walks read of each
    fn walk(&self, js: &Js, roots: napi_value, kept: &mut Kept, held: &mut Held, tmp_parent: Option<&str>) -> Option<Result<Walked>> {
        let mut walked = || -> Result<Walked> {
            let home = js.string(js.get(roots, "antigravityHome")?)?.ok_or_else(|| Error::from_reason("the scan roots name no antigravityHome"))?;
            let tree = String::from_utf16_lossy(&js.path_join(&[&home, &text::units(walk::TREE)])?);
            let tmp = copy_parent(js, tmp_parent)?;
            let (listed, kept_apart) = walk::walk(&tree, kept.of::<Attributions>(), held, &tmp, &JsRuntime(js))?;
            let listed = js.array(listed.iter().map(|s| {
                js.object(&[
                    ("file", js.text(&text::units(&s.file))?),
                    ("cwd", js.text_or_null(s.cwd.as_ref())?),
                    ("subagent", js.boolean(s.subagent)?),
                    ("mtimeMs", js.num(s.mtime_ms)?),
                ])
            }))?;
            Ok(Walked { listed, held: js.array(kept_apart.iter().map(|file| js.text(&text::units(file))))? })
        };
        Some(walked())
    }
}

/// The rules the parse takes from JavaScript, read through this call's JavaScript
struct JsRuntime<'a>(&'a Js);

impl Runtime for JsRuntime<'_> {
    fn date_parse(&self, text: &[u16]) -> f64 {
        self.0.date_parse(text)
    }

    /// `fileURLToPath` throws for a URL of a scheme other than `file:`, as it does for one naming a host or an encoded
    /// slash, so a URI of another scheme names no folder without a check of its own
    fn folder_path(&self, uri: &str) -> Result<Option<Units>> {
        let js = self.0;
        let Some(url) = js.new_url(&text::units(uri))? else { return Ok(None) };
        js.file_url_to_path(url)
    }

    fn lower_case(&self, text: &[u16]) -> Result<Units> {
        self.0.lower_case(text)
    }
}

/// A path the job names
fn path_text(js: &Js, value: napi_value) -> Result<String> {
    Ok(String::from_utf16_lossy(&js.string(value)?.unwrap_or_default()))
}

/// Where a copy is made for a parse job: the job's directory, else the system temporary directory
fn tmp_parent(js: &Js, value: napi_value) -> Result<PathBuf> {
    let given = js.string(value)?.map(|dir| String::from_utf16_lossy(&dir));
    copy_parent(js, given.as_deref())
}

/// Where a copy is made for a call that names its directory or none: that directory, else the system temporary
/// directory
fn copy_parent(js: &Js, given: Option<&str>) -> Result<PathBuf> {
    Ok(match given {
        Some(t) => PathBuf::from(t),
        None => PathBuf::from(String::from_utf16_lossy(&js.os_tmpdir()?)),
    })
}

fn text_or_null(js: &Js, s: Option<&String>) -> Result<napi_value> {
    s.map_or_else(|| js.null(), |s| js.text(&text::units(s)))
}

fn write_entry(js: &Js, file: napi_value, e: &Entry) -> Result<napi_value> {
    let calls = js.array(e.calls.iter().map(|c| {
        js.array([
            text_or_null(js, c.identity.as_ref()),
            js.num_or_null(c.at),
            js.num(c.input),
            js.num(c.output),
            js.num(c.cache_read),
            js.num(c.cache_write),
            text_or_null(js, c.model.as_ref()),
        ])
    }))?;
    let questions = js.records(&e.questions)?;
    let agg = js.object(&[
        ("kind", js.text(&text::units("antigravity"))?),
        ("file", file),
        ("projectKey", js.text(&e.project_key)?),
        ("unreadable", js.boolean(false)?),
        ("calls", calls),
        ("conversationId", js.text(&text::units(&e.conversation_id))?),
        ("subagent", js.boolean(e.subagent)?),
        ("listed", js.boolean(e.listed)?),
        ("at", js.num_or_null(e.at)?),
        ("forkOf", text_or_null(js, e.fork_of.as_ref())?),
        ("title", js.text_or_null(e.title.as_ref())?),
        ("questions", questions),
    ])?;
    js.object(&[("agg", agg)])
}

/// A conversation that cannot be read in the supported format: kept as an entry that counts it, listed nowhere
/// (token-stats::REQ-004/AC-01)
fn write_unreadable(js: &Js, file: napi_value) -> Result<napi_value> {
    let agg = js.object(&[
        ("kind", js.text(&text::units("antigravity"))?),
        ("file", file),
        ("projectKey", js.text(&[])?),
        ("unreadable", js.boolean(true)?),
        ("calls", js.array([])?),
        ("conversationId", js.text(&[])?),
        ("subagent", js.boolean(false)?),
        ("listed", js.boolean(false)?),
        ("at", js.null()?),
        ("forkOf", js.null()?),
        ("title", js.null()?),
        ("questions", js.array([])?),
    ])?;
    js.object(&[("agg", agg)])
}
