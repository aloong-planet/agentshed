//! Grok's question index (session-view G1, C1, C2, C3): which lines hold a question, where each question's turn ends,
//! and what the turn called.
//!
//! A question is the run of `user_message_chunk` records sharing one prompt index, the chunks' texts joined as they
//! were written: a long question is split mid-word (measured, as the prose chunks are), so any separator would corrupt
//! it. No noise rule applies: a prompt whose first chunk is an injected notice starts no question. Its own indexer, not
//! the one the other sides share (`question/`): a question spans several lines, and a turn ends at the last line that
//! parsed before the next question, not at that question's start.

use super::line::Line;
use crate::question::Record;
use crate::text::{self, Units};

/// What opens an injected harness notice, which is not the user speaking: measured 2026-08-16, 15 of 237 prompts, every
/// one a pure `<system-reminder>` background-task notice. Only a prompt whose first chunk is one is left out — a mixed
/// prompt (unobserved) stays a question, erring in the visible direction.
const NOTICE: &str = "<system-reminder";

/// The tool call that dispatches a subagent; every other tool call is a tool. Its `subagent_spawned` and
/// `subagent_finished` records are the call's typed mirror and are not counted again (session-view, Implementation
/// Decisions, the per-side turn volume).
const DISPATCH: &str = "spawn_subagent";

#[derive(Default)]
pub(super) struct Indexer {
    records: Vec<Record>,
    /// The prompt index of the open prompt, the one the last user chunk that started a prompt belongs to; None before
    /// any, or when that chunk carried none
    open_prompt: Option<f64>,
    /// Whether the open prompt became a question: a left-out notice's later chunks are not joined to the question
    /// before it
    open_pushed: bool,
    /// The first question's text, kept once a second question starts
    first: Option<Units>,
    /// The last question's text, its chunks joined as they come; its fingerprint is taken once it is whole
    last: Units,
}

impl Indexer {
    /// One line that parsed, in the stream's order; `at` is its time
    pub(super) fn line(&mut self, line: &Line<'_>, at: Option<f64>, start: u64, end: u64) {
        let u = &line.update;
        let end = end as f64;
        if u.kind.is_some_and(|k| k.is("user_message_chunk")) {
            // A chunk whose content carries no text is a chunk of empty text
            let chunk = u.text.map(|t| t.units()).unwrap_or_default();
            let prompt = u.prompt_index;
            if prompt.is_some() && prompt == self.open_prompt {
                if self.open_pushed {
                    // Another chunk of the open question: its range and its text grow
                    if let Some(rec) = self.records.last_mut() {
                        rec.end = end;
                        rec.turn_end = end;
                    }
                    self.last.extend(chunk);
                } else {
                    // A left-out prompt's chunk still lies inside the previous turn
                    self.extend_turn(end);
                }
                return;
            }
            self.open_prompt = prompt;
            if text::starts_with(text::trim_start(&chunk), NOTICE) {
                self.open_pushed = false;
                self.extend_turn(end);
                return;
            }
            self.open_pushed = true;
            self.close_last();
            let start = start as f64;
            self.records.push(Record { start, end, turn_end: end, at, tools: 0.0, subagents: 0.0, fingerprint: 0.0 });
            self.last = chunk;
            return;
        }
        // Lines before the first question belong to no turn; every later one extends the open turn
        let Some(rec) = self.records.last_mut() else { return };
        rec.turn_end = end;
        if u.kind.is_some_and(|k| k.is("tool_call")) {
            if u.title.is_some_and(|t| t.is(DISPATCH)) {
                rec.subagents += 1.0;
            } else {
                rec.tools += 1.0;
            }
        }
    }

    fn extend_turn(&mut self, end: f64) {
        if let Some(rec) = self.records.last_mut() {
            rec.turn_end = end;
        }
    }

    /// The last question is whole: its fingerprint is taken, and the first question's text kept
    fn close_last(&mut self) {
        let Some(rec) = self.records.last_mut() else { return };
        rec.fingerprint = f64::from(text::fingerprint(&self.last));
        if self.records.len() == 1 {
            self.first = Some(std::mem::take(&mut self.last));
        }
    }

    /// The index, its last turn running to `file_end`, the end of the last line that parsed, and the first question's
    /// text, None when there is no question
    pub(super) fn done(mut self, file_end: f64) -> (Vec<Record>, Option<Units>) {
        self.close_last();
        if let Some(last) = self.records.last_mut() {
            last.turn_end = file_end;
        }
        (self.records, self.first)
    }
}
