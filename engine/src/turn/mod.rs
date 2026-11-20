//! A turn's body as the session page draws it (session-view, In-turn blocks): the blocks a side's rules assemble from
//! the lines the turn holds, the read of those lines every side's rules go through (`read_lines`), and the rules the
//! sides share — a block's time, a tool's input and its one-line summary, how a value is named in the trace of unknown
//! types, and the trace itself (session-view C8). What a side's lines mean is the side's own (`sides/<side>/turn.rs`).
//! Every side's turns are assembled here (ADR-0054).

use std::collections::HashSet;

use crate::json::{self, Gap, Kind, Read, Reader, Str};
use crate::text::{self, JsString, Units};

/// A block's time, as `Date.parse` reads the line's timestamp: none when the line has no string timestamp or the
/// string gives NaN. A string `text::date_parse` does not read is handed over as it is, and read by JavaScript's own
/// `Date.parse` when the blocks reach the main process's thread, which alone can call it.
#[derive(Clone)]
pub(crate) enum At {
    None,
    Ms(f64),
    Later(Units),
}

/// A block of a turn, field for field the TypeScript `TurnBlock` of its kind
pub(crate) enum Block {
    /// An assistant's prose (`TurnTextBlock`, its role always `assistant`)
    Text { at: At, body: JsString },
    /// An assistant's thinking in plain text (`TurnThinkBlock`)
    Think { at: At, body: JsString },
    /// A reasoning's plain-text sub-headings (`TurnReasonBlock`): its body is encrypted, never to be had (session-view
    /// C6)
    Reason { at: At, titles: Vec<JsString> },
    /// A tool call and what it returned (`TurnToolBlock`): `name` None for a call that names no tool, `output` None for
    /// one nothing was returned for
    Tool { at: At, name: Option<JsString>, summary: JsString, input: JsString, output: Option<JsString>, truncated: bool },
    /// A subagent's dispatch and what it returned (`TurnSubBlock`), its steps none and its `unlinked` true: no provider
    /// gives a key joining a subagent's lines to its dispatch (session-view C3). `name` None for a dispatch nothing names.
    Sub { at: At, name: Option<JsString>, prompt: JsString, result: Option<JsString> },
    /// The trace of the lines of types outside the side's known ones (`TurnUnknownBlock`, session-view C8)
    Unknown { count: u32, types: Vec<JsString> },
}

/// The time of a line whose timestamp is `timestamp`, a string or None for a value of any other kind or none
/// (`typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN`, NaN none)
pub(crate) fn at_of(timestamp: Option<Str<'_>>) -> At {
    let Some(timestamp) = timestamp else { return At::None };
    let units = timestamp.units();
    match text::date_parse(&units) {
        Some(ms) => At::Ms(ms),
        None => At::Later(units),
    }
}

/// How the session page shows a tool's input, `v` the value here (`inputText` of the assembly): a string as it is,
/// null as nothing, any other value as `JSON.stringify(v, null, 2)` writes it. An absent input is shown as nothing too.
pub(crate) fn input_text(r: &mut Reader<'_>) -> Read<JsString> {
    match r.kind()? {
        Kind::String => Ok(r.string()?.text()),
        Kind::Null => r.skip().map(|()| JsString::empty()),
        _ => json::stringify(r, Gap::Two).map(JsString::Utf8),
    }
}

/// The value here as the trace of unknown types names it (`labelOf`): a string as it is, any other value as its JSON,
/// on one line. An absent value is named `undefined`.
pub(crate) fn label(r: &mut Reader<'_>) -> Read<JsString> {
    match r.kind()? {
        Kind::String => Ok(r.string()?.text()),
        _ => json::stringify(r, Gap::None).map(JsString::Utf8),
    }
}

/// The label of an absent value
pub(crate) fn undefined_label() -> JsString {
    JsString::Utf8("undefined".to_owned())
}

/// How many code units a tool's one-line summary keeps before it is clipped
const SUMMARY_MAX: usize = 88;

/// A one-line summary of `text` (`oneLine`): its first line, up to the first line feed, its ends trimmed, and past 88
/// code units the first 88 and `…`, a surrogate pair cut in two as `slice` cuts it. Only a line feed ends the line: a
/// carriage return, U+2028 or U+2029 is the line's, and white space at its ends is trimmed. Only as much of the text as
/// the summary takes is read, and no more of it held than the summary keeps.
pub(crate) fn one_line(text: impl IntoIterator<Item = u16>) -> JsString {
    let mut out = Units::with_capacity(SUMMARY_MAX + 1);
    // How many units the line has read, and how many of them run to its last that is not white space
    let (mut read, mut kept) = (0, 0);
    for u in text {
        if u == 0x0a {
            break;
        }
        if kept == 0 && text::is_space(u) {
            continue;
        }
        read += 1;
        if out.len() < SUMMARY_MAX {
            out.push(u);
        }
        if !text::is_space(u) {
            kept = read;
            if kept > SUMMARY_MAX {
                break;
            }
        }
    }
    if kept > SUMMARY_MAX {
        return clipped(out);
    }
    out.truncate(kept);
    JsString::from_units(out)
}

/// A summary past 88 code units, clipped: its first 88 and `…`
fn clipped(mut out: Units) -> JsString {
    out.truncate(SUMMARY_MAX);
    out.push(0x2026);
    JsString::from_units(out)
}

/// A tool's one-line summary while it is collapsed, of its input as shown (`oneLine(text.replace(/\s+/g, ' '))`): each
/// run of white space one space, the ends trimmed, and past 88 code units the first 88 and `…`, a surrogate pair cut
/// in two as `slice` cuts it. Only as much of the input as the summary takes is read.
pub(crate) fn summary(input: &JsString) -> JsString {
    let mut out = Units::with_capacity(SUMMARY_MAX + 1);
    let mut space = false;
    for u in input.units() {
        if text::is_space(u) {
            space = !out.is_empty();
            continue;
        }
        if space {
            out.push(0x20);
            space = false;
        }
        out.push(u);
        if out.len() > SUMMARY_MAX {
            break;
        }
    }
    if out.len() > SUMMARY_MAX {
        return clipped(out);
    }
    JsString::from_units(out)
}

/// The trace of the unknown types a turn's lines hold (session-view C8): each type by its label, in the order first met,
/// and how many lines there were
#[derive(Default)]
pub(crate) struct Unknowns {
    types: Vec<JsString>,
    seen: HashSet<JsString>,
    count: u32,
}

impl Unknowns {
    /// A line of the type `label`
    pub(crate) fn note(&mut self, label: JsString) {
        self.count += 1;
        if self.seen.insert(label.clone()) {
            self.types.push(label);
        }
    }

    /// The trace's block, at the end of the turn's blocks, when a line of an unknown type was met
    pub(crate) fn block(self) -> Option<Block> {
        (self.count > 0).then_some(Block::Unknown { count: self.count, types: self.types })
    }
}

/// A side's rules for the lines of a turn, as the read of its lines hands each line to them (`read_lines`)
pub(crate) trait Rules {
    /// What a line gives the turn, a string it gives by its place among the line's strings
    type Given;

    /// What the line `text` gives the turn, and the line's time: each string it gives noted in `strings`, still the
    /// line's. None for a line that gives the turn nothing.
    fn given<'a>(&mut self, text: &'a str, strings: &mut Vec<Str<'a>>) -> Option<(Self::Given, At)>;

    /// What a line gave, its strings made (each taken once, `made`), into the turn's blocks: `at` the line's time
    fn apply(&mut self, given: Self::Given, at: At, strings: &mut [Option<JsString>]);
}

/// Reads a turn's lines, `lines`, into a side's `rules`, each line let go once it is read.
///
/// A line is read in two steps. While its text is read, what it gives the turn is noted with its strings still the
/// line's (`Rules::given`). Then the strings are made: the longest that is well formed in the line's own buffer, which
/// it then holds alone (`json::take`), the others copied. That longest string, a tool's long output say, is so held
/// once, in the line read or in the block that takes it as it is, never in both (session-view C2). Anything else a
/// block is given from the line is a copy held beside the line until the line is let go: a tool's input or a dispatch's
/// prompt, made as the line is read, say, or texts joined into one.
pub(crate) fn read_lines(lines: Vec<String>, rules: &mut impl Rules) {
    for line in lines {
        let (given, at, mut strings, longest) = {
            let mut noted: Vec<Str<'_>> = Vec::new();
            let Some((given, at)) = rules.given(&line, &mut noted) else { continue };
            let longest = (0..noted.len()).filter(|&i| noted[i].is_well_formed()).max_by_key(|&i| noted[i].written_len());
            let span = longest.map(|i| (i, noted[i].span(&line)));
            let made: Vec<Option<JsString>> = noted.iter().enumerate().map(|(i, s)| (Some(i) != longest).then(|| s.text())).collect();
            (given, at, made, span)
        };
        if let Some((i, span)) = longest {
            strings[i] = Some(JsString::Utf8(json::take(line, span)));
        }
        rules.apply(given, at, &mut strings);
    }
}

/// The string at `i` among a line's strings, made: each is taken once
pub(crate) fn made(strings: &mut [Option<JsString>], i: usize) -> JsString {
    strings.get_mut(i).and_then(Option::take).unwrap_or_default()
}

/// Notes `s` among a line's strings (`Rules::given`): its place there
pub(crate) fn place<'a>(strings: &mut Vec<Str<'a>>, s: Str<'a>) -> usize {
    strings.push(s);
    strings.len() - 1
}

/// A tool's input or output, or a dispatch's prompt, as shown (`inputText`): nothing by default
pub(crate) enum Text {
    /// One of the line's strings
    String(usize),
    /// Made already: nothing, or a value shown as `JSON.stringify(v, null, 2)` writes it
    Made(JsString),
}

impl Default for Text {
    fn default() -> Self {
        Text::Made(JsString::empty())
    }
}

impl Text {
    /// The text, one of the line's strings made (`made`)
    pub(crate) fn made(self, strings: &mut [Option<JsString>]) -> JsString {
        match self {
            Text::String(i) => made(strings, i),
            Text::Made(text) => text,
        }
    }
}
