//! A project's question search over one session file (session-view D4): a question hits when its text, as the question
//! list shows it, holds the needle once both are lowered by `toLowerCase`, as global search matches a question
//! (global-search S6). So every letter's other case matches, not only ASCII's; quotes and backslashes match as written,
//! the text being the question's as parsed; and the words either side of a line break match with a space between them,
//! the text being normalised.

use crate::text::{self, Units};

/// A question the search gives back
pub(crate) struct Question {
    /// Its index among the questions asked about
    pub(crate) index: u32,
    /// Its text, as the question list shows it; None when its range holds no question
    pub(crate) text: Option<Units>,
    /// Whether it holds the needle
    pub(crate) hit: bool,
}

/// The questions of one file matched as their ranges come, keeping those that hit, or every one
pub(crate) struct Questions<'a> {
    /// The needle lowered
    needle: Units,
    /// Whether every question is kept, hit or not
    every: bool,
    /// The text a question's range holds, as the question list shows it (the side's `question_text`)
    shown: &'a dyn Fn(&str) -> Option<Units>,
    found: Vec<Question>,
}

impl<'a> Questions<'a> {
    /// A search for `needle`, a JavaScript string's code units, that keeps every question when `every`, each with its
    /// text and whether it hits, so that a caller can show a question it found otherwise
    pub(crate) fn new(needle: &[u16], every: bool, shown: &'a dyn Fn(&str) -> Option<Units>) -> Self {
        Questions { needle: text::to_lower_case(needle), every, shown, found: Vec::new() }
    }

    /// The question at `index` among those asked about: its range's bytes as read, decoded as `Buffer.toString('utf8')`
    /// decodes them
    pub(crate) fn question(&mut self, index: usize, range: &[u8]) {
        let shown = (self.shown)(&text::line_text(range));
        // `includes` holds an empty needle everywhere, which `find` does not
        let hit = shown.as_ref().is_some_and(|t| self.needle.is_empty() || text::find(&text::to_lower_case(t), &self.needle, 0).is_some());
        if hit || self.every {
            self.found.push(Question { index: index as u32, text: shown, hit });
        }
    }

    /// The questions kept, in the order their ranges came
    pub(crate) fn found(self) -> Vec<Question> {
        self.found
    }
}
