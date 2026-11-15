//! A conversation's full transcript and the question index it gives (session-view::REQ-004). agy writes the
//! transcript as a JSON line per step (`transcript_full.jsonl`), every line carrying its step index and one of five types
//! — measured over every transcript of 2026-10-28 (15 transcripts, 104 lines): USER_INPUT 24, PLANNER_RESPONSE 44,
//! GENERIC 24 (a tool call's result), SYSTEM_MESSAGE 11, ERROR_MESSAGE 1.
//!
//! The session page and both searches still read a question's text by `questionTextAt` in
//! `src/main/providers/question-index.ts`, and a turn by `src/main/providers/turn-content.ts`, which apply the same
//! question and rewind rules (until #432): a change to those rules here is made there too.

use crate::json::{self, Kind, Read, Reader, Str};
use crate::question::Record;
use crate::read::{self, Stored};
use crate::text::{self, Units};

/// The tool call that dispatches a subagent (2 of the 24 measured calls); its result only echoes the creation
const DISPATCH: &str = "invoke_subagent";

/// The fields the rules read off a line, as JavaScript's property access on the parsed line reads them: a value of
/// another kind than a rule takes is none to it, and of a repeated key the last value counts
#[derive(Default)]
struct Line<'a> {
    kind: Option<Str<'a>>,
    content: Option<Str<'a>>,
    /// `step_index` when it is a number: a finite one is the line's step
    step: Option<f64>,
    created_at: Option<Str<'a>>,
    /// `tool_calls` when it is an array: how many of its calls dispatch a subagent, and how many do not
    calls: Option<(u32, u32)>,
}

/// What a line holds
enum Parsed<'a> {
    /// An object: the fields read off it
    Object(Line<'a>),
    /// An array, which is an object to `typeof`: a line that parsed, with none of the fields
    Array,
    /// A string, a number, a boolean or null: not a line the index is given
    Other,
}

/// The line, read; Bad when `JSON.parse` would refuse it
fn read_line(text: &str) -> Read<Parsed<'_>> {
    let mut r = Reader::new(text);
    let parsed = match r.kind()? {
        Kind::Object => {
            let mut line = Line::default();
            r.members(|key, r| {
                if key.is("type") {
                    line.kind = r.string_or_skip()?;
                } else if key.is("content") {
                    line.content = r.string_or_skip()?;
                } else if key.is("step_index") {
                    line.step = if r.kind()? == Kind::Number { Some(r.number()?) } else { r.skip().map(|_| None)? };
                } else if key.is("created_at") {
                    line.created_at = r.string_or_skip()?;
                } else if key.is("tool_calls") {
                    line.calls = if r.kind()? == Kind::Array { Some(calls(r)?) } else { r.skip().map(|_| None)? };
                } else {
                    r.skip()?;
                }
                Ok(())
            })?;
            Parsed::Object(line)
        }
        Kind::Array => {
            r.skip()?;
            Parsed::Array
        }
        _ => {
            r.skip()?;
            Parsed::Other
        }
    };
    r.end()?;
    Ok(parsed)
}

/// A `tool_calls` array's calls: `(dispatches, others)`, a call being a dispatch when it is an object whose `name` is
/// the dispatch tool's
fn calls(r: &mut Reader<'_>) -> Read<(u32, u32)> {
    let (mut dispatches, mut others) = (0, 0);
    r.elements(|r| {
        let mut name = None;
        json::record(r, |key, r| {
            if key.is("name") {
                name = r.string_or_skip()?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        if name.is_some_and(|n| n.is(DISPATCH)) {
            dispatches += 1;
        } else {
            others += 1;
        }
        Ok(())
    })?;
    Ok((dispatches, others))
}

/// An agy question (session-view::REQ-004/AC-01): a user-input line's request body. agy appends blocks after it — the
/// additional metadata (every one of the 24 measured lines) and a settings change (13) — which are not the question. A
/// line without a request block (never measured) is listed whole, so that nothing is lost; an empty request is no
/// question. Normalised like every side's question text (session-view::REQ-002). The other harnesses' noise shapes are
/// not stripped from it: none of them is agy's, and its own additions sit outside the block.
fn question(line: &Line<'_>) -> Option<Units> {
    if !line.kind.is_some_and(|k| k.is("USER_INPUT")) {
        return None;
    }
    let content = line.content?.units();
    // `/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/`: the first opening tag that a closing one follows, which is the first
    // opening tag whenever any is
    let open = text::units("<USER_REQUEST>");
    let request = text::find(&content, &open, 0).and_then(|at| {
        let from = at + open.len();
        text::find(&content, &text::units("</USER_REQUEST>"), from).map(|end| &content[from..end])
    });
    let t = text::normalize(request.unwrap_or(&content));
    if t.is_empty() { None } else { Some(t) }
}

/// One line that parsed, kept until the end, as a rewind is known only once its redo arrives
struct Kept {
    start: f64,
    end: f64,
    /// Its step index; None when it carries none (never measured), and then it is neither a redo nor undone
    step: Option<f64>,
    question: Option<Units>,
    at: Option<f64>,
    tools: f64,
    subagents: f64,
}

/// Which lines a rewind left behind (session-view::REQ-004/AC-03). agy's rewind keeps the undone lines in the transcript
/// and writes the redo under the same step indices (measured): a line whose step index is not greater than an earlier
/// line's starts a redo, and every line from the first one carrying that index up to the redo is undone. Equivalently,
/// a line is undone exactly when a later line's step index is not greater than its own — which is what this reads, from
/// the end.
fn kept_lines(lines: &[Kept]) -> Vec<bool> {
    let mut kept = vec![false; lines.len()];
    let mut later_min = f64::INFINITY;
    for (i, l) in lines.iter().enumerate().rev() {
        kept[i] = l.step.is_none_or(|s| s < later_min);
        if let Some(s) = l.step.filter(|&s| s < later_min) {
            later_min = s;
        }
    }
    kept
}

/// The transcript's question index and its first question's text, None when it has none. A transcript not there — the
/// empty conversation agy creates has none (measured) — or one that will not read to its end gives no question
/// (session-view::REQ-004/AC-08). `date_parse` is JavaScript's own `Date.parse`, for a time outside the forms
/// `text::date_parse` reads.
///
/// The index is decided at the end: the kept questions, each turn running from its question's line to the next kept
/// question's line (C1), less any run of undone lines at its end — a rewind back to the next question leaves the turn
/// before it ending where the undone lines begin. Undone lines inside a turn (a rewind to a step within it) stay in its
/// range and are dropped when the turn is read. Calls count on kept lines only (session-view::REQ-004/AC-07). A line
/// that will not parse is skipped, its bytes still counted toward the offsets of the lines after it, and a last line
/// with no line feed is read like any other: agy's writer is not known to end every line with one.
pub(super) fn index(path: &str, date_parse: &dyn Fn(&[u16]) -> f64) -> (Vec<Record>, Option<Units>) {
    let mut lines: Vec<Kept> = Vec::new();
    let mut file_end = 0.0;
    let read = read::each_line(path, Stored::Plain, 0, |bytes, start, end, _line_feed| {
        if bytes.is_empty() {
            return;
        }
        let decoded = String::from_utf8_lossy(bytes);
        let (start, end) = (start as f64, end as f64);
        let kept = match read_line(&decoded) {
            Ok(Parsed::Object(l)) => Kept {
                start,
                end,
                step: l.step.filter(|s| s.is_finite()),
                question: question(&l),
                at: l.created_at.and_then(|t| {
                    let units = t.units();
                    let ms = text::date_parse(&units).unwrap_or_else(|| date_parse(&units));
                    (!ms.is_nan()).then_some(ms)
                }),
                tools: if l.kind.is_some_and(|k| k.is("PLANNER_RESPONSE")) { l.calls.map_or(0.0, |(_, others)| f64::from(others)) } else { 0.0 },
                subagents: if l.kind.is_some_and(|k| k.is("PLANNER_RESPONSE")) { l.calls.map_or(0.0, |(d, _)| f64::from(d)) } else { 0.0 },
            },
            Ok(Parsed::Array) => Kept { start, end, step: None, question: None, at: None, tools: 0.0, subagents: 0.0 },
            Ok(Parsed::Other) | Err(_) => return,
        };
        lines.push(kept);
        file_end = end;
    });
    if read.is_err() {
        return (Vec::new(), None);
    }
    let kept = kept_lines(&lines);
    let qs: Vec<usize> = (0..lines.len()).filter(|&i| kept[i] && lines[i].question.is_some()).collect();
    let first = qs.first().and_then(|&i| lines[i].question.clone());
    let records = qs
        .iter()
        .enumerate()
        .map(|(k, &qi)| {
            let next = qs.get(k + 1).copied().unwrap_or(lines.len());
            // The turn's last kept line: the undone run after it, if any, belongs to no turn
            let mut last = next - 1;
            while last > qi && !kept[last] {
                last -= 1;
            }
            let turn_end = if last + 1 < lines.len() { lines[last + 1].start } else { file_end };
            let (mut tools, mut subagents) = (0.0, 0.0);
            for i in qi + 1..=last {
                if kept[i] {
                    tools += lines[i].tools;
                    subagents += lines[i].subagents;
                }
            }
            let l = &lines[qi];
            let fingerprint = f64::from(text::fingerprint(l.question.as_deref().unwrap_or_default()));
            Record { start: l.start, end: l.end, turn_end, at: l.at, tools, subagents, fingerprint }
        })
        .collect();
    (records, first)
}
