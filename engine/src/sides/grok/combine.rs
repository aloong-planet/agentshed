//! Grok's entries read back from the store, and a group of them combined (token-stats F2, F5, F7): each per-turn,
//! per-model event counted on its own day, with no match across files — a subagent's record appears once in the scan,
//! the parent holding a pointer to it (F5). No key links a Grok file to another, so each is a group alone.

use napi::Result;

use crate::exports::js::LocalDates;
use crate::group::{self, Builder, Decoded, Fields, Fork, Member, Session};
use crate::json::{self, Value};
use crate::store::Facts;
use crate::text::{self, Units};

/// One event as the aggregate keeps it: `[ts, input, cachedRead, output, cacheCreation, billedModel]`
struct Event {
    at: Option<f64>,
    input: f64,
    cached: f64,
    output: f64,
    cache_write: f64,
    model: Option<Units>,
}

fn event(cells: &[Value<'_>]) -> Event {
    Event {
        at: json::cell_number_or_null(&cells[0]),
        input: json::cell_number(&cells[1]),
        cached: json::cell_number(&cells[2]),
        output: json::cell_number(&cells[3]),
        cache_write: json::cell_number(&cells[4]),
        model: json::cell_text(&cells[5]),
    }
}

struct Agg {
    fields: Fields,
    events: Vec<Event>,
}

/// The aggregate, when it is well formed: the fields every side carries, the events rows of six, `subagent` a boolean
fn read(agg: &str) -> Option<Agg> {
    let (mut events, mut subagent) = (None, None);
    let common = group::read(agg, |key, r| {
        if key.is("events") {
            events = Some(json::rows(r, "NnnnnS", event)?);
        } else if key.is("subagent") {
            group::field(&mut subagent, r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    let fields = common.fields()?;
    group::boolean(subagent)?;
    Some(Agg { fields, events: events?? })
}

pub(super) fn decode(agg: &str) -> Option<Decoded> {
    let a = read(agg)?;
    let facts = Facts { kind: "grok".to_owned(), listed: a.fields.listed, project: String::from_utf16_lossy(&a.fields.project_key), own: None };
    Some(Decoded { keys: Vec::new(), facts })
}

pub(super) fn combine(dates: &LocalDates<'_>, members: &[Member<'_>], out: &mut Builder) -> Result<std::result::Result<(), u32>> {
    for m in members {
        let Some(agg) = read(m.agg) else { return Ok(Err(m.index)) };
        let f = agg.fields;
        let mut tokens = 0.0;
        for (k, e) in agg.events.iter().enumerate() {
            // The Codex shape (F2): reported input already includes the cached reads, so the input is what is left and
            // the total is input and output, the side's own; cache creation is not collected (ADR-0023)
            let total = e.input + e.output;
            if total == 0.0 {
                continue;
            }
            tokens += total;
            let day = match e.at {
                Some(ts) => Some(text::day(dates.of(ts)?)),
                None => None,
            };
            let figures = [group::non_negative(e.input - e.cached), e.output, e.cached, e.cache_write, total];
            out.row(m.index, k as u32, day.as_deref(), "grok", &f.project_key, e.model.as_deref().unwrap_or_default(), figures);
            if !f.project_key.is_empty() {
                out.project(2, m.index, 0, &f.project_key);
            }
        }
        // No fork mechanism on this side; a subagent's or a question-less session is not listed
        if !f.project_key.is_empty() && f.listed {
            out.project(2, m.index, 0, &f.project_key);
            out.session(Session {
                member: m.index,
                project: f.project_key,
                side: text::units("grok"),
                title: f.title,
                at: f.at,
                tokens,
                file: f.file,
                questions: f.questions.len() as f64,
                fork: Fork::None,
                retitle: None,
            });
        }
    }
    Ok(Ok(()))
}
