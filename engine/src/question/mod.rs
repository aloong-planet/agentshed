//! The question index a session's lines give, line by line (session-view C1, C2): where each question is, the end of
//! its turn, its time, the tools and subagents its turn called, and its content fingerprint. No question text is kept
//! in the index (session-view D2a). A side decides which line holds a question and what a line called, and which of
//! the questions the index keeps once every line is read; the indexer strips the noise (the same rules as the title,
//! so a session of noise alone has no question and is not listed) and keeps the records.

use crate::text::{self, Units};

/// One question's index, which the token cache stores as `[start, end, turnEnd, at, tools, subagents, fingerprint]`.
/// The numbers are as JavaScript holds them, so a record an earlier parse made comes back as it was.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Record {
    /// Where the question's line starts, and where it ends
    pub(crate) start: f64,
    pub(crate) end: f64,
    /// Where its turn ends: the next question's line start, or the end of the last line that parsed
    pub(crate) turn_end: f64,
    pub(crate) at: Option<f64>,
    pub(crate) tools: f64,
    pub(crate) subagents: f64,
    pub(crate) fingerprint: f64,
}

/// What one line called in its turn
#[derive(Clone, Copy, Default)]
pub(crate) struct Calls {
    pub(crate) tools: u32,
    pub(crate) subagents: u32,
}

pub(crate) struct Indexer {
    records: Vec<Record>,
    /// Parallel to `records`: each question's stripped text, for the title; None for a record an earlier parse made,
    /// which the index does not keep the text of
    heads: Vec<Option<Units>>,
}

impl Indexer {
    /// `seed`: the records of an earlier parse of the same file, for a parse resumed from where that one stopped. The
    /// last of them keeps collecting its turn's calls and its end until the next question arrives, as if the file had
    /// been read through.
    pub(crate) fn new(seed: Vec<Record>) -> Self {
        let heads = seed.iter().map(|_| None).collect();
        Indexer { records: seed, heads }
    }

    /// One line that parsed, in the file's order: `question` is the side's raw question text on it, if any, `at` the
    /// line's time, and `calls` what it called. Answers whether the line is a question, and so the index's next record.
    pub(crate) fn line(&mut self, question: Option<Units>, at: Option<f64>, calls: impl FnOnce() -> Calls, start: u64, end: u64) -> bool {
        if let Some(clean) = question.and_then(|raw| text::real_user_text(&raw)) {
            if let Some(prev) = self.records.last_mut() {
                prev.turn_end = start as f64;
            }
            let fingerprint = f64::from(text::fingerprint(&clean));
            let (start, end) = (start as f64, end as f64);
            self.records.push(Record { start, end, turn_end: end, at, tools: 0.0, subagents: 0.0, fingerprint });
            self.heads.push(Some(clean));
            return true;
        }
        // Lines before the first question (the session's metadata, noise) belong to no turn
        let Some(cur) = self.records.last_mut() else { return false };
        let c = calls();
        cur.tools += f64::from(c.tools);
        cur.subagents += f64::from(c.subagents);
        false
    }

    /// The index, its last turn running to `file_end` — the end of the last line that parsed, so a half-written line is
    /// never sliced into a turn — and the first question's stripped text: None when there is no question, or when the
    /// first was seeded
    pub(crate) fn done(self, file_end: f64) -> (Vec<Record>, Option<Units>) {
        self.done_keeping(file_end, |_| true)
    }

    /// `done`, keeping only the records `keep` takes by their place in the index. The last record's turn runs to
    /// `file_end` before any is dropped, so a turn that ended on a dropped question keeps ending there, and the end of a
    /// dropped last turn goes with it. The first question is the first kept one.
    pub(crate) fn done_keeping(mut self, file_end: f64, mut keep: impl FnMut(usize) -> bool) -> (Vec<Record>, Option<Units>) {
        if let Some(last) = self.records.last_mut() {
            if file_end > last.turn_end {
                last.turn_end = file_end;
            }
        }
        let mut records = Vec::with_capacity(self.records.len());
        let mut first = None;
        for (i, (record, head)) in self.records.into_iter().zip(self.heads).enumerate() {
            if !keep(i) {
                continue;
            }
            if records.is_empty() {
                first = head;
            }
            records.push(record);
        }
        (records, first)
    }
}
