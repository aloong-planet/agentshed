//! A Claude Code session file's parse (token-stats Sequence A, ADR-0005; session-view's Claude rules): its usage lines,
//! its question index with the branches resolved, its session time, its branch points and its title. A file is always
//! parsed whole: the question filter needs the whole parent graph (token-stats, Implementation Decisions, Cache).
//!
//! Each usage line is one entry, and the de-duplication across files is the combination's, not the parse's: an entry
//! keeps the message id and request id it is matched by and whether it is a sidechain's (A3–A5). The total is the four
//! figures summed (A1); a synthetic model's tokens count in no model bucket (A6); where a `cache_creation` breakdown
//! exists, its 5m and 1h figures are the cache write, not the flat field (A7) — the same rule as ccusage's
//! `TokenUsageRaw::cache_creation_token_count`, and the two can differ (2 lines on 2026-07-13 differed by 894).

use super::entry::{Job, Parsed, Usage};
use super::{line, question, title};
use crate::question::{Calls, Indexer};
use crate::read::{self, Stored};
use crate::text::{self, Units};

/// The model a line names when no model produced it (A6)
const SYNTHETIC: &str = "<synthetic>";

/// The session file's entry; None when it cannot be read to its end. `date_parse` is JavaScript's own `Date.parse`, for
/// a timestamp outside the forms `text::date_parse` reads.
pub(super) fn parse(job: &Job, date_parse: &mut dyn FnMut(&[u16]) -> f64) -> Option<Parsed> {
    let mut usage: Vec<Usage> = Vec::new();
    // The session time: the largest timestamp over every line, a user's message included, which carries no usage
    // (session-view A1; measured over 118 sessions, 45% have a last line later than the last usage line)
    let mut last_at: Option<f64> = None;
    // The question index and the title share a source: only the indexer decides which line is the first real question
    let mut index = Indexer::new(Vec::new());
    let mut chain = question::Chain::default();
    // Parallel to the index's records: the uuid of each question's line, for the walk-back
    let mut question_uuids: Vec<Option<Units>> = Vec::new();
    let mut file_end = 0.0;

    read::each_line(&job.file, Stored::Plain, 0, |bytes, start, end, _line_feed| {
        // A last line without a line feed is read as any other: an active session may be mid-line, and such a line
        // does not parse, while one that parses counts
        if bytes.is_empty() {
            return;
        }
        let decoded = String::from_utf8_lossy(bytes);
        // A line `JSON.parse` refuses is skipped (A8), and so is a string, a number, a boolean or null; the bytes still
        // count toward the offsets of the lines after them
        let l = match line::read(&decoded) {
            Ok(line::Parsed::Object(l)) => l,
            Ok(line::Parsed::Array) => {
                index.line(None, None, Calls::default, start, end);
                file_end = end as f64;
                return;
            }
            Ok(line::Parsed::Other) | Err(_) => return,
        };
        chain.line(&l);
        let at = l.timestamp.and_then(|t| text::time_value(&t.units(), date_parse));
        if index.line(question::question(&l), at, || question::calls(&l), start, end) {
            question_uuids.push(l.uuid.map(|u| u.units()));
        }
        file_end = end as f64;
        // Time values are never NaN, nor a negative zero
        if let Some(t) = at {
            last_at = Some(last_at.map_or(t, |l| l.max(t)));
        }
        let m = &l.message;
        let Some(u) = m.usage else { return };
        usage.push(Usage {
            id: m.id.map(|s| s.units()),
            request_id: l.request_id.map(|s| s.units()),
            sidechain: l.sidechain,
            input: u.input,
            output: u.output,
            cache_read: u.cache_read,
            cache_write: u.cache_creation.map_or(u.cache_creation_flat, |(five_minutes, one_hour)| five_minutes + one_hour),
            model: m.model.filter(|s| !s.is(SYNTHETIC)).map(|s| s.units()),
            at,
        });
    })
    .ok()?;

    // Only the questions on the chain from the last main-chain line back to its root stay (B3). A question whose line
    // has no uuid cannot be judged on or off the chain and is kept: losing a real question is a worse violation of the
    // feature's reason for existing than keeping one extra abandoned entry.
    let on_chain = chain.walk();
    let (questions, first) = index.done_keeping(file_end, |i| match (&on_chain, &question_uuids[i]) {
        (Some(on), Some(uuid)) => on.contains(uuid),
        _ => true,
    });
    Some(Parsed {
        // A session with no real question is not listed, and its tokens still count (session-view A3a). Measured: of one
        // project's 1511 sessions, 1004 hold a single Warmup, which would make 66% of the rows uuid file names
        listed: job.listed && !questions.is_empty(),
        title: title::title(first.as_ref(), &job.file),
        // With no timestamp in the file, the file's modification time (session-view A1)
        at: last_at.or_else(|| modified_ms(&job.file)),
        fork_points: chain.fork_points() as f64,
        questions,
        usage,
    })
}

/// `fs.statSync(file).mtimeMs`, as Node computes it from the seconds and the nanoseconds; None when the file cannot be
/// stat'ed
fn modified_ms(file: &str) -> Option<f64> {
    use std::os::unix::fs::MetadataExt;
    let m = std::fs::metadata(file).ok()?;
    Some(m.mtime() as f64 * 1000.0 + m.mtime_nsec() as f64 / 1_000_000.0)
}

/// The day a usage line is filed under: its local date in the time zone the process runs in, `YYYY-MM-DD` as
/// `localDay` in `src/shared/format.ts` writes it, from `[getFullYear(), getMonth(), getDate()]`
pub(super) fn day([year, month, date]: [f64; 3]) -> Units {
    let two = |n: f64| {
        let s = text::number_string(n);
        if s.len() < 2 { format!("0{s}") } else { s }
    };
    text::units(&format!("{}-{}-{}", text::number_string(year), two(month + 1.0), two(date)))
}
