//! Claude Code: its session files' entries (token-stats Sequence A; session-view's Claude rules). This file is the
//! adapter the side registers in `sides/mod.rs`: it reads a parse job, the TypeScript `ParseJob` of kind `claude`, and
//! writes the entry as the TypeScript `ParseResult`. A value the entry only carries over from the job — the file and its
//! project — goes back as the job's own JavaScript value.

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

pub(crate) struct Claude;

impl Side for Claude {
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value> {
        let file = js.get(job, "file")?;
        let given = Job { file: String::from_utf16_lossy(&js.string(file)?.unwrap_or_default()), listed: js.truthy(js.get(job, "listed")?)? };
        match parse::parse(&given, &mut |text| js.date_parse(text)) {
            Some(parsed) => write_result(js, file, js.get(job, "projectKey")?, &parsed),
            None => js.null(),
        }
    }
}

fn write_result(js: &Js, file: napi_value, project_key: napi_value, p: &Parsed) -> Result<napi_value> {
    let dates = js.local_dates()?;
    let entries = js.array(p.usage.iter().map(|u| {
        let day = match u.at {
            Some(ms) => js.text(&parse::day(dates.of(ms)?))?,
            None => js.null()?,
        };
        // `[id, requestId, sidechain, input, output, cacheRead, cacheWrite, model, day]`
        js.array([
            js.text_or_null(u.id.as_ref()),
            js.text_or_null(u.request_id.as_ref()),
            js.num(if u.sidechain { 1.0 } else { 0.0 }),
            js.num(u.input),
            js.num(u.output),
            js.num(u.cache_read),
            js.num(u.cache_write),
            js.text_or_null(u.model.as_ref()),
            Ok(day),
        ])
    }))?;
    let agg = js.object(&[
        ("kind", js.text(&crate::text::units("claude"))?),
        ("file", file),
        ("forkPoints", js.num(p.fork_points)?),
        ("projectKey", project_key),
        ("listed", js.boolean(p.listed)?),
        ("title", js.text(&p.title)?),
        ("at", js.num_or_null(p.at)?),
        ("questions", js.records(&p.questions)?),
        ("entries", entries),
    ])?;
    js.object(&[("agg", agg)])
}
