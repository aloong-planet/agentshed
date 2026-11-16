//! A Codex rollout's parse (token-stats Sequence B, ADR-0027): the usage, the question index, the session time, the
//! model and the title, whole or resumed from where an earlier parse stopped.
//!
//! The usage sources (ADR-0027): a usage record is Codex's own per-response accounting, and the first one in line
//! order is the usage boundary (B9). Before it, the legacy per-turn usage events count; from it on only the records do,
//! one per response id (B1). An event's increment is its per-turn figure, unless its running total did not advance —
//! the same turn reported again (B7) — and where it carries no per-turn figure the increment is the difference of two
//! running totals. A record or event with an all-zero breakdown carries nothing to attribute (B6).

use std::collections::HashSet;

use super::entry::{Event, Job, KeptTotal, Parsed};
use super::{line, question, title};
use crate::json::{self, max};
use crate::question::{Calls, Indexer};
use crate::read::{self, Stored};
use crate::text::{self, Units};

/// `Math.max(0, x)` for an x that is not NaN
fn at_least_zero(x: f64) -> f64 {
    if x > 0.0 { x } else { 0.0 }
}

/// `num(x)`: a finite number, else 0
fn finite(x: f64) -> f64 {
    if x.is_finite() { x } else { 0.0 }
}

/// The four running fields as one comparable value: has this event's running total moved
fn total_key(t: &line::Tokens) -> Units {
    let key = [t.input, t.cached, t.output, t.total].map(text::number_string).join("|");
    text::units(&key)
}

/// The start a resumed parse reads from, as a file stream takes it: a whole number of bytes, at least 0 and at most
/// 2^53 - 1; any other is a read that fails
fn resume_start(cursor: f64) -> Option<u64> {
    (cursor >= 0.0 && cursor.fract() == 0.0 && cursor <= 9_007_199_254_740_991.0).then_some(cursor as u64)
}

/// The rollout's entry; None when it cannot be read to its end (B12). `date_parse` is JavaScript's own `Date.parse`,
/// for a timestamp outside the forms `text::date_parse` reads.
pub(super) fn parse(job: &Job, date_parse: &mut dyn FnMut(&[u16]) -> f64) -> Option<Parsed> {
    let from = job.from.as_ref();
    let mut events: Vec<Event> = from.map(|f| f.events.clone()).unwrap_or_default();
    // The previous usage event's running total, carried across lines so that a turn reported again is recognised by
    // its running total standing still (B7)
    let mut prev: Option<[f64; 3]> = from.and_then(|f| f.total);
    let mut kept_total = if prev.is_some() { KeptTotal::Earlier } else { KeptTotal::None };
    let mut prev_key: Option<Units> = from.and_then(|f| f.total_key.clone());
    // The usage boundary (B9): the index in `events` from which entries come from usage records; -1 until the first
    let mut boundary = from.map_or(-1.0, |f| f.boundary);
    // The response ids already counted, in the order first met (a `Set`, as the state keeps it)
    let mut seen: Vec<Units> = Vec::new();
    let mut seen_set: HashSet<Units> = HashSet::new();
    for id in from.map(|f| f.seen_responses.as_slice()).unwrap_or_default() {
        if seen_set.insert(id.clone()) {
            seen.push(id.clone());
        }
    }
    let mut model = from.map_or_else(|| text::units("unknown"), |f| f.model.clone());
    // The session time: the latest timestamp in the file (session-view A1)
    let mut last_at: Option<f64> = from.and_then(|f| f.at);
    let mut index = Indexer::new(from.map(|f| f.questions.clone()).unwrap_or_default());
    let mut file_end = from.map_or(0.0, |f| f.cursor);
    let start = match from {
        Some(f) => resume_start(f.cursor)?,
        None => 0,
    };
    let stored = if job.file.ends_with(".jsonl.zst") { Stored::Zstd } else { Stored::Plain };

    let last = read::each_line(&job.file, stored, start, |bytes, start, end, line_feed| {
        // Codex ends every line with a line feed (B12): a last line without one is still being written, and is read
        // whole, from the cursor, at the next scan. So a resumed parse equals a whole parse.
        if bytes.is_empty() || !line_feed {
            return;
        }
        let decoded = text::line_text(bytes);
        // A line `JSON.parse` refuses is skipped (A8), and so is a string, a number, a boolean or null; the bytes still
        // count toward the offsets of the lines after them
        let parsed = match line::read(&decoded) {
            Ok(json::Line::Object(l)) => l,
            Ok(json::Line::Array) => {
                index.line(None, None, Calls::default, start, end);
                file_end = end as f64;
                return;
            }
            Ok(json::Line::Other) | Err(_) => return,
        };
        let l = &parsed;
        let at = l.timestamp.and_then(|t| text::time_value(&t.units(), date_parse));
        index.line(question::question(l), at, || question::calls(l), start, end);
        file_end = end as f64;
        if let Some(t) = at {
            last_at = Some(last_at.map_or(t, |l| max(l, t)));
        }
        let p = &l.payload;
        let kind = l.kind;
        if kind.is_some_and(|k| k.is("turn_context")) {
            if let Some(m) = p.model {
                model = m.units();
            }
        }
        if kind.is_some_and(|k| k.is("token_usage_record")) {
            if boundary == -1.0 {
                boundary = events.len() as f64;
            }
            if let Some(id) = p.response_id {
                let id = id.units();
                if !seen_set.insert(id.clone()) {
                    return;
                }
                seen.push(id);
            }
            let u = &p.usage;
            if !u.truthy || (u.input == 0.0 && u.output == 0.0 && u.cached == 0.0) {
                return;
            }
            events.push(Event { at, input: u.input, cached: u.cached, output: u.output, cache_write: 0.0 });
            return;
        }
        // The legacy source, before the boundary only
        if !p.kind.is_some_and(|k| k.is("token_count")) || boundary != -1.0 {
            return;
        }
        let last = &p.info.last;
        let total = &p.info.total;
        let key = total.truthy.then(|| total_key(total));
        let advanced = key.is_none() || key != prev_key;
        let usage: Option<[f64; 3]> = if last.truthy && advanced {
            Some([last.input, last.cached, last.output])
        } else if total.truthy {
            let before = prev.unwrap_or([0.0; 3]);
            Some([
                finite(at_least_zero(total.input - before[0])),
                finite(at_least_zero(total.cached - before[1])),
                finite(at_least_zero(total.output - before[2])),
            ])
        } else {
            None
        };
        // Both carried forward whatever the event holds, a missing running total included: "previous" means the
        // previous event's, for the key and the figures alike
        prev_key = key;
        prev = total.truthy.then_some([total.input, total.cached, total.output]);
        kept_total = match p.info.total_text {
            Some(t) => KeptTotal::Text(t.to_owned()),
            None => KeptTotal::None,
        };
        let Some([input, cached, output]) = usage else { return };
        if input == 0.0 && output == 0.0 && cached == 0.0 {
            return;
        }
        // Cache creation is not read on this side (ADR-0023)
        events.push(Event { at, input, cached, output, cache_write: 0.0 });
    })
    .ok()?;
    // Every rollout line ends with a line feed and a cold rollout is never mid-write, so a decompressed stream that does
    // not end with one was cut short, and is skipped (B12). A cut that lands exactly on a line end escapes this and
    // reads as a shorter session.
    if stored == Stored::Zstd && last.is_some_and(|b| b != b'\n') {
        return None;
    }

    let seeded = from.map_or(0, |f| f.questions.len());
    let (questions, first) = index.done(file_end);
    let first_title = title::first_question_title(first.as_ref(), seeded, from.and_then(|f| f.first_title.as_ref()));
    Some(Parsed {
        // A session with no real question is not listed, and its tokens still count (session-view A3a)
        listed: !job.subagent && !questions.is_empty(),
        title: title::title(job.thread_name.as_ref(), first_title.as_ref(), &job.file),
        title_from_thread: job.thread_name.is_some(),
        at: last_at,
        model,
        questions,
        boundary: if boundary == -1.0 { events.len() as f64 } else { boundary },
        events,
        cursor: file_end,
        total: kept_total,
        total_key: prev_key,
        state_boundary: boundary,
        seen_responses: seen,
        first_title,
    })
}
