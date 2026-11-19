//! Claude Code: its session files' entries (token-stats Sequence A; session-view's Claude rules), and its side of the
//! session walk. This file is the adapter the side registers in `sides/mod.rs`: it reads a parse job, the TypeScript
//! `ParseJob` of kind `claude`, and writes the entry as the TypeScript `ParseResult`. A value the entry only carries over
//! from the job — the file and its project — goes back as the job's own JavaScript value. The walk's transcripts it
//! writes as the TypeScript `ClaudeTranscript`.

mod combine;
mod entry;
mod line;
mod parse;
mod question;
mod title;
mod turn;
mod walk;

use napi::sys::napi_value;
use napi::{Error, Result};

use self::entry::{Job, Parsed};
use super::{Kept, Side, Walked};
use crate::exports::js::Js;
use crate::text::{self, Units};
use crate::turn::TurnBody;
use crate::walk::Held;

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
        &question::DISPATCH
    }

    fn turn_body(&self, lines: Vec<String>) -> TurnBody {
        TurnBody::Blocks(turn::blocks(lines, self.dispatches()))
    }

    fn walk(&self, js: &Js, roots: napi_value, _kept: &mut Kept, held: &mut Held, _tmp_parent: Option<&str>) -> Option<Result<Walked>> {
        let mut walked = || -> Result<Walked> {
            let home = js.string(js.get(roots, "claudeHome")?)?.ok_or_else(|| Error::from_reason("the scan roots name no claudeHome"))?;
            let tree = String::from_utf16_lossy(&js.path_join(&[&home, &text::units(walk::TREE)])?);
            let (listed, kept_apart) = walk::walk(&tree, held);
            let list = |transcripts: &[walk::Session]| {
                js.array(transcripts.iter().map(|t| {
                    js.object(&[("file", js.text(&text::units(&t.file))?), ("dir", js.text(&text::units(&t.dir))?), ("nested", js.boolean(t.nested)?)])
                }))
            };
            Ok(Walked { listed: list(&listed)?, held: list(&kept_apart)? })
        };
        Some(walked())
    }
}

fn write_result(js: &Js, file: napi_value, project_key: napi_value, p: &Parsed) -> Result<napi_value> {
    let dates = js.local_dates()?;
    let entries = js.array(p.usage.iter().map(|u| {
        let day = match u.at {
            Some(ms) => js.text(&crate::text::day(dates.of(ms)?))?,
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
