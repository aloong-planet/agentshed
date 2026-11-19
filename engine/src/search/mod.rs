//! The full-text search of one session file (session-view D2, D3): the file's stream read line by line, never held
//! whole, and each hit of the needle mapped to the turn it falls in. What it gives back is what the search shows of
//! the file: how many hits fall in no turn (folded), and each turn with a hit in its body, with the snippet of its first.
//! And a project's question search over one file (`questions`).
//!
//! A hit is every offset where the stream's bytes equal the needle's UTF-8 bytes once ASCII letters are folded, hits
//! overlapping, as a search of the whole buffer for them would find them; the turn of a hit, the snippet of a turn's
//! first body hit and the order they come back in are those the whole-file search worked out from that buffer, rule
//! for rule (search-sessions.ts before #479).

mod questions;
mod snippet;

pub(crate) use questions::{Question, Questions};

use memchr::memmem::Finder;

use crate::read::{self, Failed, Stored};
use crate::text::Units;

/// A turn as the question index records it, in the stream's offsets: its question runs from `start` to `question_end`,
/// and the turn to `end`
#[derive(Clone, Copy)]
pub(crate) struct Turn {
    pub(crate) start: u64,
    pub(crate) question_end: u64,
    pub(crate) end: u64,
}

/// What the search found in one file
pub(crate) struct Found {
    /// The hits that fall in no turn
    pub(crate) folded: u64,
    /// Each turn with a hit in its body, by its index among the turns, ascending, with the snippet of its first such hit
    pub(crate) body: Vec<(u32, Option<Units>)>,
}

/// Searches the stream of `path` for `needle`, a JavaScript string's code units, against `turns`; also answers the
/// stream's last byte, for the side to judge whether it was cut short. Failed when the file cannot be read to its end;
/// nothing it found is then given.
pub(crate) fn full_text(path: &str, stored: Stored, needle: &[u16], turns: &[Turn]) -> Result<(Found, Option<u8>), Failed> {
    crate::seams::before_range_read(path);
    // The needle's bytes as `Buffer.from(needle, 'utf8')` makes them: a lone surrogate becomes U+FFFD
    let bytes = String::from_utf16_lossy(needle).into_bytes();
    let mut hits = Hits::new(needle, turns);
    if bytes.is_empty() {
        let last = read::each_line(path, stored, 0, |_, _, _, _| {})?;
        return Ok((hits.found(), last));
    }
    let folded: Vec<u8> = bytes.to_ascii_lowercase();
    let last = match folded.iter().position(|&b| b == b'\n') {
        None => {
            let letters = folded.iter().any(u8::is_ascii_alphabetic);
            let finder = Finder::new(&folded);
            let mut lowered: Vec<u8> = Vec::new();
            read::each_line(path, stored, 0, |line, start, _, _| {
                // A needle without a line feed hits inside one line, where every such hit is
                let hay: &[u8] = if letters {
                    lowered.clear();
                    lowered.extend(line.iter().map(u8::to_ascii_lowercase));
                    &lowered
                } else {
                    line
                };
                let mut from = 0;
                while let Some(i) = finder.find(&hay[from..]) {
                    let at = from + i;
                    hits.hit(start + at as u64, || snippet::snippet(line, needle));
                    from = at + 1;
                }
            })?
        }
        Some(first_lf) => {
            // A hit of a needle with a line feed starts in the line that its first line feed ends, at that line's last
            // `first_lf` bytes, and goes on through the bytes after it: at most one hit starts in each line
            let head = &folded[..first_lf];
            let rest = &folded[first_lf + 1..];
            let mut pending: Vec<Pending> = Vec::new();
            read::each_line(path, stored, 0, |line, _, end, ended| {
                // The bytes this line adds to the stream, its line feed included, carry each hit begun before it
                let mut kept = Vec::with_capacity(pending.len());
                for mut p in pending.drain(..) {
                    match p.carry(line, ended, rest) {
                        Carry::Whole => hits.confirm(p),
                        Carry::More => kept.push(p),
                        Carry::Broken => {}
                    }
                }
                pending = kept;
                if !ended || line.len() < head.len() || !line[line.len() - head.len()..].iter().map(u8::to_ascii_lowercase).eq(head.iter().copied()) {
                    return;
                }
                // The hit starts at the line's line feed when the needle begins with one: the line around that offset
                // is then empty
                let at = end - 1 - head.len() as u64;
                let around: &[u8] = if head.is_empty() { &[] } else { line };
                let p = Pending { at, matched: 0, snippet: hits.snippet_for(at, around) };
                if rest.is_empty() {
                    hits.confirm(p);
                } else {
                    pending.push(p);
                }
            })?
        }
    };
    Ok((hits.found(), last))
}

/// A hit of a needle with a line feed, its bytes up to that line feed seen, waiting on the bytes after it
struct Pending {
    at: u64,
    /// How many of the bytes after the needle's first line feed have matched
    matched: usize,
    /// The snippet it gives its turn when it is the turn's first body hit, worked out as it began; None otherwise
    snippet: Option<Option<Units>>,
}

enum Carry {
    Whole,
    More,
    Broken,
}

impl Pending {
    /// Matches the next bytes of the stream, `line` and its line feed when it has one, against what of `rest` is left
    fn carry(&mut self, line: &[u8], ended: bool, rest: &[u8]) -> Carry {
        let lf: &[u8] = if ended { b"\n" } else { b"" };
        for &b in line.iter().chain(lf) {
            if self.matched == rest.len() {
                return Carry::Whole;
            }
            if b.to_ascii_lowercase() != rest[self.matched] {
                return Carry::Broken;
            }
            self.matched += 1;
        }
        if self.matched == rest.len() { Carry::Whole } else { Carry::More }
    }
}

/// The hits as they come, in the stream's order, mapped to the turns
struct Hits<'a> {
    needle: &'a [u16],
    turns: &'a [Turn],
    folded: u64,
    /// The turns with a body hit, in the order their first came, and its snippet
    body: Vec<(u32, Option<Units>)>,
    seen: std::collections::HashSet<u32>,
}

impl<'a> Hits<'a> {
    fn new(needle: &'a [u16], turns: &'a [Turn]) -> Self {
        Hits { needle, turns, folded: 0, body: Vec::new(), seen: std::collections::HashSet::new() }
    }

    /// A hit at `at`; `snippet` gives its snippet, and is called only when the hit is its turn's first body hit
    fn hit(&mut self, at: u64, snippet: impl FnOnce() -> Option<Units>) {
        match turn_index_of(self.turns, at) {
            None => self.folded += 1,
            // A hit on the question's own range is the question search's
            Some(t) if at < self.turns[t].question_end => {}
            Some(t) if self.seen.contains(&(t as u32)) => {}
            Some(t) => {
                self.seen.insert(t as u32);
                self.body.push((t as u32, snippet()));
            }
        }
    }

    /// The snippet a hit beginning at `at` would give its turn, when it would be the turn's first body hit so far
    fn snippet_for(&self, at: u64, line: &[u8]) -> Option<Option<Units>> {
        match turn_index_of(self.turns, at) {
            Some(t) if at >= self.turns[t].question_end && !self.seen.contains(&(t as u32)) => Some(snippet::snippet(line, self.needle)),
            _ => None,
        }
    }

    /// A hit of a needle with a line feed, now seen whole. When it is its turn's first body hit it was so as it began,
    /// as no turn loses a body hit, so its snippet was worked out then.
    fn confirm(&mut self, p: Pending) {
        let snippet = p.snippet;
        self.hit(p.at, || snippet.flatten());
    }

    fn found(mut self) -> Found {
        self.body.sort_by_key(|&(t, _)| t);
        Found { folded: self.folded, body: self.body }
    }
}

/// The index of the turn whose range, from its question's start to its end, holds `at`, by the binary search
/// `turnIndexOf` in search-sessions.ts made, step for step, so that turns that overlap or are out of order map as they
/// did there
fn turn_index_of(turns: &[Turn], at: u64) -> Option<usize> {
    let mut lo: i64 = 0;
    let mut hi: i64 = turns.len() as i64 - 1;
    while lo <= hi {
        let mid = ((lo + hi) >> 1) as usize;
        if at < turns[mid].start {
            hi = mid as i64 - 1;
        } else if at >= turns[mid].end {
            lo = mid as i64 + 1;
        } else {
            return Some(mid);
        }
    }
    None
}
