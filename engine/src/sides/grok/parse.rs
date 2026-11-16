//! A Grok session's parse (token-stats Sequence F): its update stream's completed turns, its question index, its time
//! and its title.
//!
//! A completed turn's per-model map holds one entry per billed model, which is what makes the per-model split exact
//! (F3), and a turn without the map counts its own figures under no model. The cost the record carries is never read
//! (F4). A full enumeration of this machine's 224 completed turns (2026-08-16) found 222 of the full shape, one with an
//! empty usage `{}` and one without a cost but flagged incomplete, so every figure read tolerates absence.

use super::entry::{Event, Job, Parsed};
use super::line::{self, Line};
use super::question::Indexer;
use super::title;
use crate::json::{self, max};
use crate::read::{self, Stored};
use crate::text;

/// The session's entry; None when its stream cannot be read to its end
pub(super) fn parse(job: &Job) -> Option<Parsed> {
    let mut events: Vec<Event> = Vec::new();
    let mut index = Indexer::default();
    let mut last_at: Option<f64> = None;
    let mut file_end = 0.0;
    // Always `updates.jsonl` (the walk's name for the stream, src/main/providers/grok.ts), so never a cold one
    read::each_line(&job.file, Stored::Plain, 0, |bytes, start, end, _line_feed| {
        // A last line without a line feed counts as any other: a Grok stream is parsed whole whenever it changes, so
        // no later parse resumes past it
        if bytes.is_empty() {
            return;
        }
        let decoded = text::line_text(bytes);
        // A line `JSON.parse` refuses is skipped (A8), and so is a string, a number, a boolean or null; the bytes still
        // count toward the offsets of the lines after them
        let l = match line::read(&decoded) {
            Ok(json::Line::Object(l)) => l,
            Ok(json::Line::Array) => Line::default(),
            Ok(json::Line::Other) | Err(_) => return,
        };
        let at = l.timestamp.filter(|t| t.is_finite()).map(|t| t * 1000.0);
        index.line(&l, at, start, end);
        file_end = end as f64;
        if let Some(t) = at {
            last_at = Some(last_at.map_or(t, |l| max(l, t)));
        }
        let u = &l.update;
        if !u.kind.is_some_and(|k| k.is("turn_completed")) || !u.usage.truthy {
            return;
        }
        if u.usage.models.is_empty() {
            events.push(Event { at, figures: u.usage.figures, model: None });
            return;
        }
        for (model, figures) in &u.usage.models {
            // A null entry: reading its figures threw in the TypeScript parser, which then skipped the rest of the line
            // as a bad one's, keeping what the line had given before it
            let Some(figures) = figures else { break };
            events.push(Event { at, figures: *figures, model: Some(model.clone()) });
        }
    })
    .ok()?;
    let (questions, first) = index.done(file_end);
    Some(Parsed {
        title: title::title(&job.file, first.as_ref()),
        at: last_at,
        // A session with no question is not listed, and its tokens still count (session-view A3a)
        listed: !job.subagent && !questions.is_empty(),
        questions,
        events,
    })
}
