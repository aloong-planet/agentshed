//! Grok: its sessions' entries (token-stats Sequence F; session-view Sequence G), and its side of the session walk. This
//! file is the adapter the side registers in `sides/mod.rs`: it reads a parse job, the TypeScript `ParseJob` of kind
//! `grok`, and writes the entry as the TypeScript `ParseResult`. A value the entry only carries over from the job — the
//! file, its project and whether the session is a subagent's — goes back as the job's own JavaScript value. The walk's
//! sessions it writes as the TypeScript `GrokSessionMeta`.

mod combine;
mod entry;
mod line;
mod parse;
mod question;
mod title;
mod walk;

use napi::sys::napi_value;
use napi::{Error, Result};

use self::entry::{Job, Parsed};
use super::{Kept, Side};
use crate::exports::js::Js;
use crate::text::{self, Units};

pub(crate) struct Grok;

impl Side for Grok {
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value> {
        let file = js.get(job, "file")?;
        let subagent = js.get(job, "subagent")?;
        let given = Job { file: String::from_utf16_lossy(&js.string(file)?.unwrap_or_default()), subagent: js.truthy(subagent)? };
        match parse::parse(&given) {
            Some(parsed) => write_result(js, job, file, subagent, &parsed),
            None => js.null(),
        }
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

    fn question_text(&self, range: &str) -> Option<Units> {
        question::shown(range)
    }

    fn dispatches(&self) -> &'static [&'static str] {
        std::slice::from_ref(&question::DISPATCH)
    }

    /// Every session under Grok's data root, `roots.grokHome`
    fn walk(&self, js: &Js, roots: napi_value, _kept: &mut Kept, _tmp_parent: Option<&str>) -> Option<Result<napi_value>> {
        let walked = || -> Result<napi_value> {
            let home = js.string(js.get(roots, "grokHome")?)?.ok_or_else(|| Error::from_reason("the scan roots name no grokHome"))?;
            let tree = String::from_utf16_lossy(&js.path_join(&[&home, &text::units(walk::TREE)])?);
            let sessions = walk::walk(&tree, &|name| js.decode_uri_component(&text::units(name)))?;
            js.array(sessions.iter().map(|s| {
                js.object(&[
                    ("file", js.text(&text::units(&s.file))?),
                    ("cwd", js.text(&s.cwd)?),
                    ("subagent", js.boolean(s.subagent)?),
                    ("mtimeMs", js.num(s.mtime_ms)?),
                ])
            }))
        };
        Some(walked())
    }

    /// A stream's session, read the way the walk reads it: its project from the percent-encoded directory two levels up
    /// (`sessions/<cwd>/<session id>/updates.jsonl`), whether it is a subagent's from the summary beside it. Null when
    /// that directory's name is not valid percent-encoding, which the walk skips too.
    fn meta(&self, js: &Js, file: &str) -> Option<Result<napi_value>> {
        let read = || -> Result<napi_value> {
            let session_dir: Units = js.path_dirname(&text::units(file))?;
            let name = js.path_basename(&js.path_dirname(&session_dir)?)?;
            match js.decode_uri_component(&name)? {
                Some(cwd) => js.object(&[("cwd", js.text(&cwd)?), ("subagent", js.boolean(walk::subagent(&String::from_utf16_lossy(&session_dir)))?)]),
                None => js.null(),
            }
        };
        Some(read())
    }
}

fn write_result(js: &Js, job: napi_value, file: napi_value, subagent: napi_value, p: &Parsed) -> Result<napi_value> {
    let events = js.array(p.events.iter().map(|e| {
        let f = &e.figures;
        // Cache creation is not read on this side (ADR-0023)
        js.array([js.num_or_null(e.at), js.num(f.input), js.num(f.cached), js.num(f.output), js.num(0.0), js.text_or_null(e.model.as_ref())])
    }))?;
    let agg = js.object(&[
        ("kind", js.text(&crate::text::units("grok"))?),
        ("file", file),
        ("projectKey", js.get(job, "projectKey")?),
        ("subagent", subagent),
        ("title", js.text(&p.title)?),
        ("at", js.num_or_null(p.at)?),
        ("listed", js.boolean(p.listed)?),
        ("questions", js.records(&p.questions)?),
        ("events", events),
    ])?;
    js.object(&[("agg", agg)])
}
