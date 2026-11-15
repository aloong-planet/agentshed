//! Grok: its sessions' entries (token-stats Sequence F; session-view Sequence G). This file is the adapter the side
//! registers in `sides/mod.rs`: it reads a parse job, the TypeScript `ParseJob` of kind `grok`, and writes the entry as
//! the TypeScript `ParseResult`. A value the entry only carries over from the job — the file, its project and whether
//! the session is a subagent's — goes back as the job's own JavaScript value.

mod entry;
mod line;
mod parse;
mod question;
mod title;

use napi::Result;
use napi::sys::napi_value;

use self::entry::{Job, Parsed};
use super::Side;
use crate::exports::js::Js;
use crate::text::Units;

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

    fn question_text(&self, range: &str) -> Option<Units> {
        question::shown(range)
    }

    fn dispatches(&self) -> &'static [&'static str] {
        std::slice::from_ref(&question::DISPATCH)
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
