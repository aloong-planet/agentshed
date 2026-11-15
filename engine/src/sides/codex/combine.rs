//! Codex's entries read back from the store, and a group of them combined (token-stats B2, B7–B10; session-view B2):
//! a fork's replay of its parent's history stripped from its usage before it counts, and from its questions before it
//! is listed, its parent being the first file in scan order of the session id the fork names. A group is linked by
//! the session id each rollout records and the parent id a fork names, so a fork and every file of its parent's id are
//! in one group.

use std::collections::HashMap;

use napi::Result;

use crate::exports::js::LocalDates;
use crate::group::{self, Builder, Decoded, Fields, Member, Session};
use crate::json::{self, Value};
use crate::question;
use crate::store::Facts;
use crate::text::{self, Units};

/// One per-turn usage event as the aggregate keeps it: `[ts, input, cached, output, cacheWrite]`
#[derive(Clone, Copy)]
struct Event {
    at: Option<f64>,
    input: f64,
    cached: f64,
    output: f64,
    cache_write: f64,
}

fn event(cells: &[Value<'_>]) -> Event {
    Event {
        at: json::cell_number_or_null(&cells[0]),
        input: json::cell_number(&cells[1]),
        cached: json::cell_number(&cells[2]),
        output: json::cell_number(&cells[3]),
        cache_write: json::cell_number(&cells[4]),
    }
}

/// Whether two events carry the same usage
fn same_usage(x: &Event, y: &Event) -> bool {
    x.input == y.input && x.cached == y.cached && x.output == y.output && x.cache_write == y.cache_write
}

struct Agg {
    fields: Fields,
    events: Vec<Event>,
    title_from_thread: bool,
    boundary: f64,
    paginated: bool,
    model: Units,
    session_id: Option<Units>,
    parent_id: Option<Units>,
    forked_at: Option<f64>,
}

/// The aggregate, when it is well formed: the fields every side carries, the events rows of five, `titleFromThread`
/// and `paginated` booleans, `boundary` a number, `model` a string, `sessionId` and `parentId` strings or null,
/// `forkedAt` a number or null
fn read(agg: &str) -> Option<Agg> {
    let mut events = None;
    let [mut from_thread, mut boundary, mut paginated, mut model, mut session, mut parent, mut forked] = [None; 7];
    let common = group::read(agg, |key, r| {
        let slot = match () {
            () if key.is("events") => {
                events = Some(json::rows(r, "Nnnnn", event)?);
                return Ok(());
            }
            () if key.is("titleFromThread") => &mut from_thread,
            () if key.is("boundary") => &mut boundary,
            () if key.is("paginated") => &mut paginated,
            () if key.is("model") => &mut model,
            () if key.is("sessionId") => &mut session,
            () if key.is("parentId") => &mut parent,
            () if key.is("forkedAt") => &mut forked,
            () => return r.skip(),
        };
        group::field(slot, r)
    })?;
    Some(Agg {
        fields: common.fields()?,
        events: events??,
        title_from_thread: group::boolean(from_thread)?,
        boundary: group::number(boundary)?,
        paginated: group::boolean(paginated)?,
        model: group::string(model)?,
        session_id: group::string_or_null(session)?,
        parent_id: group::string_or_null(parent)?,
        forked_at: group::number_or_null(forked)?,
    })
}

/// A string that is not empty (a truthy one)
fn truthy(s: &Option<Units>) -> Option<&Units> {
    s.as_ref().filter(|s| !s.is_empty())
}

pub(super) fn decode(agg: &str) -> Option<Decoded> {
    let a = read(agg)?;
    let keys = [truthy(&a.session_id), truthy(&a.parent_id)].into_iter().flatten().cloned().collect();
    let facts = Facts {
        kind: "codex".to_owned(),
        listed: a.fields.listed,
        project: String::from_utf16_lossy(&a.fields.project_key),
        own: a.session_id.as_deref().map(String::from_utf16_lossy),
    };
    Some(Decoded { keys, facts })
}

/// Where `slice(0, end)` of a list of `len` ends
fn slice_end(end: f64, len: usize) -> usize {
    let end = if end.is_nan() { 0.0 } else { end.trunc() };
    let len_f = len as f64;
    if end < 0.0 { (len_f + end).max(0.0) as usize } else { end.min(len_f) as usize }
}

/// A rewrite burst (ccusage's `detect_rewritten_burst`): when the first two events are at most a second apart, the
/// start is copied history, up to the first gap longer than a second; the number of events it holds
fn rewritten_burst(events: &[Event]) -> usize {
    const PAUSE_MS: f64 = 1000.0;
    if events.len() < 2 {
        return 0;
    }
    let (Some(t0), Some(t1)) = (events[0].at, events[1].at) else { return 0 };
    let gap = t1 - t0;
    if gap < 0.0 || gap > PAUSE_MS {
        return 0;
    }
    let (mut i, mut prev) = (1, t1);
    while i + 1 < events.len() {
        let Some(next) = events[i + 1].at else { break };
        let d = next - prev;
        if d < 0.0 || d > PAUSE_MS {
            break;
        }
        prev = next;
        i += 1;
    }
    i + 1
}

/// Five figures — input, output, cache reads, cache writes, total — added field by field
fn add(into: &mut [f64; 5], from: [f64; 5]) {
    for (sum, x) in into.iter_mut().zip(from) {
        *sum += x;
    }
}

pub(super) fn combine(dates: &LocalDates<'_>, members: &[Member<'_>], out: &mut Builder) -> Result<std::result::Result<(), u32>> {
    let mut aggs = Vec::with_capacity(members.len());
    for m in members {
        match read(m.agg) {
            Some(a) => aggs.push(a),
            None => return Ok(Err(m.index)),
        }
    }
    // Each session id's first file in scan order
    let mut by_session: HashMap<&Units, usize> = HashMap::new();
    for (a, agg) in aggs.iter().enumerate() {
        if let Some(id) = truthy(&agg.session_id) {
            by_session.entry(id).or_insert(a);
        }
    }
    for (a, agg) in aggs.iter().enumerate() {
        let member = members[a].index;
        // Only the legacy span can hold a replayed prefix: usage records are never copied into a child thread (B10)
        let legacy = &agg.events[..slice_end(agg.boundary, agg.events.len())];
        let mut start = 0;
        if let Some(parent_id) = truthy(&agg.parent_id) {
            match by_session.get(parent_id) {
                // The parent is not in the scan set, or is this very file: the rewrite burst
                None => start = rewritten_burst(legacy),
                Some(&p) if p == a => start = rewritten_burst(legacy),
                Some(&p) => {
                    let parent = &aggs[p].events;
                    // The parent's events up to the first later than the fork moment, as ccusage cuts them
                    let replay = agg
                        .forked_at
                        .and_then(|f| parent.iter().position(|e| e.at.is_some_and(|t| t > f)))
                        .unwrap_or(parent.len());
                    while start < legacy.len() && start < replay && same_usage(&parent[start], &legacy[start]) {
                        start += 1;
                    }
                    // Not even the first matches: the parent's stream cannot anchor the replay
                    if start == 0 {
                        start = rewritten_burst(legacy);
                    }
                }
            }
        }
        let mut totals = [0.0; 5];
        // Each day's own turns' figures (B8)
        let mut by_day: Vec<(Units, [f64; 5])> = Vec::new();
        let mut day_at: HashMap<Units, usize> = HashMap::new();
        let mut undated = [0.0; 5];
        for e in &agg.events[start..] {
            // Input less the cache reads it includes; the total is input and output, the side's own (ADR-0023)
            let turn = [group::non_negative(e.input - e.cached), e.output, e.cached, e.cache_write, e.input + e.output];
            add(&mut totals, turn);
            if turn[4] == 0.0 {
                continue;
            }
            match e.at {
                None => add(&mut undated, turn),
                Some(ts) => {
                    let day = text::day(dates.of(ts)?);
                    let i = *day_at.entry(day.clone()).or_insert_with(|| {
                        by_day.push((day, [0.0; 5]));
                        by_day.len() - 1
                    });
                    add(&mut by_day[i].1, turn);
                }
            }
        }
        let f = &agg.fields;
        let mut k = 0;
        for (day, figures) in &by_day {
            out.row(member, k, Some(day), "codex", &f.project_key, &agg.model, *figures);
            k += 1;
        }
        if undated[4] > 0.0 {
            out.row(member, k, None, "codex", &f.project_key, &agg.model, undated);
        }
        if f.project_key.is_empty() {
            continue;
        }
        out.project(2, member, 0, &f.project_key);
        if !f.listed {
            continue;
        }
        // The questions as the session shows them: its parent's replay stripped by fingerprint, apart from the usage's
        // strip (ticket 03b)
        let parent = truthy(&agg.parent_id).and_then(|id| by_session.get(id)).filter(|&&p| p != a);
        let (stripped, fork) = question::strip_replay_prefix(
            &f.questions,
            parent.map(|&p| aggs[p].fields.questions.as_slice()),
            agg.forked_at,
            // A paginated child carries no replayed events: nothing to strip, no check to fail
            agg.parent_id.is_some() && !agg.paginated,
        );
        let shown = &f.questions[stripped..];
        // A session stripped empty is not listed; its tokens still count
        let Some(first) = shown.first() else { continue };
        // Its title taken from its first question left once that question changed; a session-index name keeps its
        // place (A4)
        let retitle = (!agg.title_from_thread && shown.len() < f.questions.len()).then_some([first.start, first.end]);
        out.session(Session {
            member,
            project: f.project_key.clone(),
            side: text::units("codex"),
            title: f.title.clone(),
            at: f.at,
            tokens: totals[4],
            file: f.file.clone(),
            questions: shown.len() as f64,
            fork,
            retitle,
        });
    }
    Ok(Ok(()))
}
