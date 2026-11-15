//! The question index a session's lines give, line by line (session-view C1, C2): where each question is, the end of
//! its turn, its time, the tools and subagents its turn called, and its content fingerprint. No question text is kept
//! in the index (session-view D2a). A side decides which line holds a question and what a line called, and which of
//! the questions the index keeps once every line is read; the indexer strips the noise (the same rules as the title,
//! so a session of noise alone has no question and is not listed) and keeps the records.

use crate::sides::Side;
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

/// Two adjacent questions this close are a program writing in one go rather than a person's rhythm (session-view B2).
/// The same measure as the token side's rewrite burst (ccusage's replay.rs), and computed apart from it: metering is a
/// de-duplication rule and display is what the conversation looks like, so neither takes the other's conclusion.
const BURST_GAP_MS: f64 = 1000.0;

/// How many of a fork's leading questions are the replay of its parent's, and the fork's state (session-view B2): the
/// questions after them are the session's own. Failing safe decides each step: a real question stripped would vanish
/// unseen, a replayed one kept shows as a duplicate with the uncertain mark to explain it, so a check that does not pass
/// strips nothing.
///
/// `parent` is the parent's index when the parent is in the scan set; `forked_at` the fork's moment. Whether the session
/// is a fork is given apart (`is_fork`): no parent is both "not a fork" and "a fork whose parent is gone", whose states
/// differ.
pub(crate) fn strip_replay_prefix(child: &[Record], parent: Option<&[Record]>, forked_at: Option<f64>, is_fork: bool) -> (usize, crate::group::Fork) {
    use crate::group::Fork;
    if !is_fork {
        return (0, Fork::None);
    }
    let Some(parent) = parent else {
        // The parent is gone: what is left is that a replay is written in one go, the gaps between its lines near zero.
        // The opening run of such gaps, the first question its own start; out of order is no burst
        let mut n = usize::from(!child.is_empty());
        while n < child.len() {
            let (Some(a), Some(b)) = (child[n - 1].at, child[n].at) else { break };
            if b - a < 0.0 || b - a > BURST_GAP_MS {
                break;
            }
            n += 1;
        }
        // One question with no question at a person's rhythm after it is no burst
        if n == 1 {
            n = 0;
        }
        // Never stripped empty: a fork that made nothing new shows one question too many, where a misjudged burst would
        // lose the whole session
        if n >= child.len() {
            n = child.len().saturating_sub(1);
        }
        return (n, Fork::Uncertain);
    };
    // The parent's questions before the fork's moment are the ones it replays, compared by their fingerprints: a replay
    // rewrites the times
    let replay = forked_at
        .and_then(|f| parent.iter().position(|q| q.at.is_some_and(|t| t > f)))
        .unwrap_or(parent.len());
    let mut n = 0;
    while n < replay && n < child.len() && child[n].fingerprint == parent[n].fingerprint {
        n += 1;
    }
    // Only a match of the whole span is certain
    (n, if n == replay && replay > 0 { Fork::Stripped } else { Fork::Uncertain })
}

/// The title the question a range holds gives its session, as the index's first question gives it: the question's text
/// as shown, clipped (`text::clip_title`); None when the range holds no question. `range` is the question's range as
/// the side's index recorded it, read and decoded. A fork whose first questions were stripped as replays takes its title
/// from its first question left (session-view B2).
pub(crate) fn title(side: &dyn Side, range: &str) -> Option<Units> {
    side.question_text(range).map(|t| text::clip_title(&t))
}
