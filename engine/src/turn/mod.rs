//! A turn's body as the session page draws it (session-view, In-turn blocks): the blocks a side's rules assemble from
//! the lines the turn holds, and the rules those share — a block's time, a tool's input and its one-line summary, how a
//! value is named in the trace of unknown types, and the trace itself (session-view C8). What a side's lines mean is the
//! side's own (`sides/<side>/turn.rs`). A side whose turns the module does not assemble hands over the lines instead,
//! which TypeScript assembles; the sides move into the module one at a time, each side's turns assembled by one of the
//! two at any time (ADR-0054, ADR-0047).

use std::collections::HashSet;

use crate::json::{self, Gap, Kind, Read, Reader, Str};
use crate::text::{self, JsString, Units};

/// What a turn's read hands over for its body: the blocks, for a side the module assembles; the lines the turn holds,
/// for a side TypeScript assembles
pub(crate) enum TurnBody {
    Blocks(Vec<Block>),
    Lines(Vec<String>),
}

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
    /// A tool call and what it returned (`TurnToolBlock`): `name` None for a call that names no tool, `output` None for
    /// one nothing was returned for
    Tool { at: At, name: Option<JsString>, summary: JsString, input: JsString, output: Option<JsString>, truncated: bool },
    /// A subagent's dispatch and what it returned (`TurnSubBlock`), its steps none and its `unlinked` true: no provider
    /// gives a key joining a subagent's lines to its dispatch (session-view C3)
    Sub { at: At, name: JsString, prompt: JsString, result: Option<JsString> },
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
        out.truncate(SUMMARY_MAX);
        out.push(0x2026);
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
