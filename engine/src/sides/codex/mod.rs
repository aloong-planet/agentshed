//! Codex: its rollouts' entries (token-stats Sequence B; session-view's Codex rules), and its side of the session walk.
//! This file is the adapter the side registers in `sides/mod.rs`: it reads a parse job, the TypeScript `ParseJob` of kind
//! `codex`, and writes the entry as the TypeScript `ParseResult`. A value the entry only carries over from the job — the
//! file, its project, the session metadata, a resumed parse's running total — goes back as the job's own JavaScript
//! value. The walk's sessions it writes as the TypeScript `CodexSessionMeta`.

mod cold;
mod combine;
mod entry;
mod head;
mod line;
mod parse;
mod question;
mod title;
mod turn;
mod walk;

use napi::sys::napi_value;
use napi::{Error, Result};

use self::entry::{Earlier, Event, Job, KeptTotal, Parsed};
use self::walk::{Readings, Session};
use super::{Kept, Side, Walked};
use crate::exports::js::Js;
use crate::question::Record;
use crate::read::{Failed, Served};
use crate::text::{self, Units};
use crate::turn::Block;
use crate::walk::Held;

pub(crate) struct Codex;

impl Side for Codex {
    fn parse(&self, js: &Js, job: napi_value) -> Result<napi_value> {
        let given = read_job(js, job)?;
        match parse::parse(&given.job, &mut |text| js.date_parse(text)) {
            Some(parsed) => write_result(js, &given, &parsed),
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

    fn read_ranges(&self, file: &str, ranges: &[(u64, u64)]) -> Option<std::result::Result<Served, Failed>> {
        Some(cold::ranges(file, ranges))
    }

    fn read_questions(&self, file: &str, ranges: &[(u64, u64)], each: &mut dyn FnMut(usize, &[u8])) -> std::result::Result<(), Failed> {
        cold::questions(file, ranges, each)
    }

    fn stored(&self, file: &str) -> crate::read::Stored {
        cold::stored(file)
    }

    fn read_turn(&self, file: &str, question: (u64, u64), body: Option<(u64, u64)>) -> std::result::Result<crate::read::TurnRead, Failed> {
        cold::turn(file, question, body)
    }

    fn turn_body(&self, file: &str, lines: Vec<String>) -> Vec<Block> {
        crate::seams::before_turn_assembly(file);
        turn::blocks(lines, std::slice::from_ref(&question::DISPATCH))
    }

    fn full_text(&self, file: &str, needle: &[u16], turns: &[crate::search::Turn]) -> std::result::Result<crate::search::Found, Failed> {
        cold::full_text(file, needle, turns)
    }

    /// Every rollout under Codex's data root, `roots.codexHome`, with the run's first-line readings
    fn walk(&self, js: &Js, roots: napi_value, kept: &mut Kept, held: &mut Held, _tmp_parent: Option<&str>) -> Option<Result<Walked>> {
        let mut walked = || -> Result<Walked> {
            let home = js.string(js.get(roots, "codexHome")?)?.ok_or_else(|| Error::from_reason("the scan roots name no codexHome"))?;
            let trees = walk::TREES.iter().map(|t| Ok(String::from_utf16_lossy(&js.path_join(&[&home, &text::units(t)])?))).collect::<Result<Vec<_>>>()?;
            let (listed, kept_apart) = walk::walk(&trees, kept.of::<Readings>(), held, &mut |t| js.date_parse(t));
            Ok(Walked { listed: js.array(listed.iter().map(|s| write_session(js, s)))?, held: js.array(kept_apart.iter().map(|s| write_session(js, s)))? })
        };
        Some(walked())
    }

    /// A rollout's session, read off its first line as the walk reads it; null when it gives none
    fn meta(&self, js: &Js, file: &str) -> Option<Result<napi_value>> {
        Some(match walk::read_head(file, None, &mut |t| js.date_parse(t)) {
            Some(session) => write_session(js, &session),
            None => js.null(),
        })
    }
}

/// A session as the TypeScript `CodexSessionMeta`
fn write_session(js: &Js, s: &Session) -> Result<napi_value> {
    js.object(&[
        ("file", js.text(&text::units(&s.file))?),
        ("cwd", js.text(&s.cwd)?),
        ("subagent", js.boolean(s.subagent)?),
        ("mtimeMs", js.num(s.mtime_ms)?),
        ("sessionId", js.text_or_null(s.session_id.as_ref())?),
        ("parentId", js.text_or_null(s.parent_id.as_ref())?),
        ("forkedAt", js.num_or_null(s.forked_at)?),
        ("paginated", js.boolean(s.paginated)?),
    ])
}

/// The job, and the JavaScript values the entry carries over from it
struct Given {
    job: Job,
    file: napi_value,
    project_key: napi_value,
    meta: napi_value,
    /// A resumed parse's running total, handed back when no line replaces it
    total: napi_value,
}

fn read_job(js: &Js, job: napi_value) -> Result<Given> {
    let file = js.get(job, "file")?;
    let meta = js.get(job, "meta")?;
    let from = js.get(job, "from")?;
    let mut total = js.null()?;
    let earlier = if js.truthy(from)? {
        let agg = js.get(from, "agg")?;
        let state = js.get(from, "state")?;
        total = js.get(state, "prevTotal")?;
        Some(Earlier {
            events: rows(js, js.get(agg, "events")?, event)?,
            at: js.number(js.get(agg, "at")?)?,
            questions: rows(js, js.get(agg, "questions")?, record)?,
            cursor: js.number(js.get(state, "cursor")?)?.unwrap_or(f64::NAN),
            total: kept_numbers(js, total)?,
            total_key: js.string(js.get(state, "prevTotalKey")?)?,
            boundary: js.number(js.get(state, "boundary")?)?.unwrap_or(f64::NAN),
            seen_responses: rows(js, js.get(state, "seenResponses")?, |js, v| Ok(js.string(v)?.unwrap_or_default()))?,
            model: js.string(js.get(state, "model")?)?.unwrap_or_default(),
            first_title: js.string(js.get(state, "firstTitle")?)?,
        })
    } else {
        None
    };
    Ok(Given {
        job: Job {
            file: String::from_utf16_lossy(&js.string(file)?.unwrap_or_default()),
            subagent: js.truthy(js.get(meta, "subagent")?)?,
            thread_name: js.string(js.get(job, "threadName")?)?,
            from: earlier,
        },
        file,
        project_key: js.get(job, "projectKey")?,
        meta,
        total,
    })
}

/// `num()` of the three fields a later event is measured against, of the running total the state kept; None when it
/// kept none. The plan resumes only from a state whose running total is an object or null (`isCodexResume`).
fn kept_numbers(js: &Js, total: napi_value) -> Result<Option<[f64; 3]>> {
    if js.nullish(total)? {
        return Ok(None);
    }
    let num = |key: &str| -> Result<f64> { Ok(js.number(js.get(total, key)?)?.filter(|x| x.is_finite()).unwrap_or(0.0)) };
    Ok(Some([num("input_tokens")?, num("cached_input_tokens")?, num("output_tokens")?]))
}

fn rows<T>(js: &Js, list: napi_value, row: impl Fn(&Js, napi_value) -> Result<T>) -> Result<Vec<T>> {
    js.elements(list)?.unwrap_or_default().into_iter().map(|v| row(js, v)).collect()
}

/// The numbers of one row, None where it holds null
fn numbers<const N: usize>(js: &Js, row: napi_value) -> Result<[Option<f64>; N]> {
    let cells = js.elements(row)?.unwrap_or_default();
    let mut out = [None; N];
    for (i, cell) in cells.into_iter().take(N).enumerate() {
        out[i] = js.number(cell)?;
    }
    Ok(out)
}

fn event(js: &Js, row: napi_value) -> Result<Event> {
    let [at, input, cached, output, cache_write] = numbers::<5>(js, row)?;
    let n = |x: Option<f64>| x.unwrap_or(f64::NAN);
    Ok(Event { at, input: n(input), cached: n(cached), output: n(output), cache_write: n(cache_write) })
}

fn record(js: &Js, row: napi_value) -> Result<Record> {
    let [start, end, turn_end, at, tools, subagents, fingerprint] = numbers::<7>(js, row)?;
    let n = |x: Option<f64>| x.unwrap_or(f64::NAN);
    Ok(Record {
        start: n(start),
        end: n(end),
        turn_end: n(turn_end),
        at,
        tools: n(tools),
        subagents: n(subagents),
        fingerprint: n(fingerprint),
    })
}

fn write_result(js: &Js, given: &Given, p: &Parsed) -> Result<napi_value> {
    let questions = js.records(&p.questions)?;
    let events = js.array(p.events.iter().map(|e| {
        js.array([js.num_or_null(e.at), js.num(e.input), js.num(e.cached), js.num(e.output), js.num(e.cache_write)])
    }))?;
    let meta = |key: &str| js.get(given.meta, key);
    let agg = js.object(&[
        ("kind", js.text(&crate::text::units("codex"))?),
        ("file", given.file),
        ("projectKey", given.project_key),
        ("listed", js.boolean(p.listed)?),
        ("title", js.text(&p.title)?),
        ("titleFromThread", js.boolean(p.title_from_thread)?),
        ("at", js.num_or_null(p.at)?),
        ("model", js.text(&p.model)?),
        ("sessionId", meta("sessionId")?),
        ("parentId", meta("parentId")?),
        ("forkedAt", meta("forkedAt")?),
        ("paginated", meta("paginated")?),
        ("questions", questions),
        ("events", events),
        ("boundary", js.num(p.boundary)?),
    ])?;
    let total = match &p.total {
        KeptTotal::None => js.null()?,
        KeptTotal::Earlier => given.total,
        KeptTotal::Text(text) => js.parse_json(text)?,
    };
    let state = js.object(&[
        ("cursor", js.num(p.cursor)?),
        ("prevTotal", total),
        ("prevTotalKey", js.text_or_null(p.total_key.as_ref())?),
        ("boundary", js.num(p.state_boundary)?),
        ("seenResponses", js.array(p.seen_responses.iter().map(|id| js.text(id)))?),
        ("model", js.text(&p.model)?),
        ("firstTitle", js.text_or_null(p.first_title.as_ref())?),
    ])?;
    js.object(&[("agg", agg), ("state", state)])
}
