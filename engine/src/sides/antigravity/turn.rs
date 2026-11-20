//! An Antigravity CLI turn's blocks (session-view::REQ-004/AC-04, session-view::REQ-004/AC-05,
//! session-view::REQ-004/AC-06, C3, C8, In-turn blocks), assembled from the lines the turn holds as the session page
//! draws them. Each line is a step of the conversation's full transcript; the
//! fields read here are the turn's own, read as JavaScript's property access on the parsed line reads them: a value of
//! another kind than a rule takes is undefined to it, an array has none of an object's fields, and of a repeated key the
//! last value counts, as `JSON.parse` keeps it. A line `JSON.parse` would refuse, or one holding no object or array, is
//! passed over. Lines a rewind undid inside the turn never reach here (`Side::kept_lines`); a rewind back to a question
//! does not either, the question index having ended the turn before it (`transcript.rs`).
//!
//! The rules rest on a full enumeration of this machine's transcripts (2026-10-28, 15 transcripts, 104 lines; the
//! AGENTS.md invariant that a set of shapes comes from one):
//! - Five line types (`KNOWN`), each known here; a line of any other type leaves the unknown trace (session-view C8):
//!   a shape outside an allow-list is never dropped silently. A question's line (`USER_INPUT`) renders in its own row.
//! - A response line (`PLANNER_RESPONSE`) is thinking, then prose, then its calls, in that order.
//! - The format carries no call id, and each measured call is followed by exactly one result line (`GENERIC`, 24 of 24),
//!   so results pair with calls in order, a failed or still-running call's result included.
//! - A dispatch (`invoke_subagent`) is a sub block. Its result only echoes the creation, naming the conversation it
//!   created; its return is the message that conversation sends back, a system message whose sender is that
//!   conversation's id, in this turn (session-view C3). Every other system message is the harness's noise.
//! - A failed model call's error line (`ERROR_MESSAGE`) is prose (owner's ruling 2026-10-28).

use std::collections::{HashMap, VecDeque};

use crate::json::{self, Kind, Read, Reader, Str};
use crate::text::{self, JsString};
use crate::turn::{self, At, Block, Unknowns};

/// The five line types of the enumeration
const KNOWN: [&str; 5] = ["USER_INPUT", "PLANNER_RESPONSE", "GENERIC", "SYSTEM_MESSAGE", "ERROR_MESSAGE"];

/// One line, as the turn reads it
#[derive(Default)]
struct Line<'a> {
    /// The value of `type`, as the line writes it; None when it has none
    kind: Option<&'a str>,
    created_at: Option<Str<'a>>,
    thinking: Option<Str<'a>>,
    content: Option<Str<'a>>,
    error: Option<Str<'a>>,
    /// `tool_calls`, when it is an array: each element's call, an element that is no object having none of the fields
    calls: Option<Vec<Call<'a>>>,
}

/// A response's call
#[derive(Default)]
struct Call<'a> {
    name: Option<Str<'a>>,
    /// The value of `args`, as the line writes it
    args: Option<&'a str>,
}

fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("type") {
                line.kind = Some(r.raw()?);
            } else if key.is("created_at") {
                line.created_at = r.string_or_skip()?;
            } else if key.is("thinking") {
                line.thinking = r.string_or_skip()?;
            } else if key.is("content") {
                line.content = r.string_or_skip()?;
            } else if key.is("error") {
                line.error = r.string_or_skip()?;
            } else if key.is("tool_calls") {
                line.calls = None;
                if r.kind()? != Kind::Array {
                    return r.skip();
                }
                let mut calls = Vec::new();
                r.elements(|r| {
                    let mut call = Call::default();
                    json::record(r, |key, r| {
                        if key.is("name") {
                            call.name = r.string_or_skip()?;
                        } else if key.is("args") {
                            call.args = Some(r.raw()?);
                        } else {
                            r.skip()?;
                        }
                        Ok(())
                    })?;
                    calls.push(call);
                    Ok(())
                })?;
                line.calls = Some(calls);
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

/// A value of the line, read again from its text: the line was read whole, so it reads
fn reread<'a, T>(text: &'a str, f: impl FnOnce(&mut Reader<'a>) -> Read<T>) -> T
where
    T: Default,
{
    f(&mut Reader::new(text)).unwrap_or_default()
}

/// The blocks of a turn whose lines are `lines`, each line let go once it is read (`turn::read_lines`), a tool's long
/// result held once; `dispatches` the tool names whose call dispatches a subagent
pub(super) fn blocks(lines: Vec<String>, dispatches: &[&str]) -> Vec<Block> {
    let mut turn = Turn { dispatches, ..Turn::default() };
    turn::read_lines(lines, &mut turn);
    let mut out = turn.out;
    out.extend(turn.unknowns.block());
    out
}

/// What a line gives a turn, a string by its place among the line's strings
enum Given {
    /// A response: its thinking and its prose, when each is a string, and its calls, in order
    Response { thinking: Option<usize>, prose: Option<usize>, calls: Vec<Made> },
    /// A result for the call awaiting one: its content, else its error, when either is a string
    Result(Option<usize>),
    /// A system message's content, while some dispatch's conversation may send one
    Message(usize),
    /// A failed call's error line: its error, else its content, when either is a string
    Error(Option<usize>),
}

/// A call as its block makes it
enum Made {
    /// A tool by its name, when it names one, and its input as shown
    Tool { name: Option<JsString>, input: Text },
    /// A subagent's dispatch: its name and its prompt
    Sub { name: JsString, prompt: Text },
}

/// A tool's input, or a dispatch's prompt, as shown (`inputText`)
enum Text {
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
    /// The value `args` here, as the line writes it, as shown
    fn of<'a>(args: Option<&'a str>, strings: &mut Vec<Str<'a>>) -> Text {
        let Some(raw) = args else { return Text::default() };
        reread(raw, |r| {
            Ok(match r.kind()? {
                Kind::String => Text::String(place(strings, r.string()?)),
                _ => Text::Made(turn::input_text(r)?),
            })
        })
    }

    fn made(self, strings: &mut [Option<JsString>]) -> JsString {
        match self {
            Text::String(i) => turn::made(strings, i),
            Text::Made(text) => text,
        }
    }
}

/// Notes `s` among the line's strings: its place there
fn place<'a>(strings: &mut Vec<Str<'a>>, s: Str<'a>) -> usize {
    strings.push(s);
    strings.len() - 1
}

/// A turn's blocks as its lines are read, with the calls a later line pairs with
#[derive(Default)]
struct Turn<'d> {
    /// The tool names whose call dispatches a subagent
    dispatches: &'d [&'d str],
    out: Vec<Block>,
    /// The calls awaiting their result line, by their places among the blocks, in the order they were made
    pending: VecDeque<usize>,
    /// The dispatches, by the id of the conversation each created as its result echoed it; of two echoing one id, the
    /// later
    subs: HashMap<JsString, usize>,
    unknowns: Unknowns,
}

impl turn::Rules for Turn<'_> {
    type Given = Given;

    fn given<'a>(&mut self, text: &'a str, strings: &mut Vec<Str<'a>>) -> Option<(Given, At)> {
        let line = match read(text) {
            Ok(json::Line::Object(l)) => l,
            // An array has none of an object's fields
            Ok(json::Line::Array) => Line::default(),
            Ok(json::Line::Other) | Err(_) => return None,
        };
        let at = turn::at_of(line.created_at);
        let kind = line.kind.map(|raw| reread(raw, turn::label)).unwrap_or_else(turn::undefined_label);
        let is = |name: &str| matches!(&kind, JsString::Utf8(k) if k.as_str() == name);
        let given = if is("PLANNER_RESPONSE") {
            let thinking = line.thinking.map(|s| place(strings, s));
            let prose = line.content.map(|s| place(strings, s));
            let calls = line.calls.iter().flatten().map(|c| self.call(c, strings)).collect();
            Given::Response { thinking, prose, calls }
        } else if is("GENERIC") {
            // A result no call awaits gives nothing
            if self.pending.is_empty() {
                return None;
            }
            Given::Result(line.content.or(line.error).map(|s| place(strings, s)))
        } else if is("SYSTEM_MESSAGE") {
            // No dispatch's conversation has been echoed yet, or the content is no string: the message is no return
            if self.subs.is_empty() {
                return None;
            }
            Given::Message(place(strings, line.content?))
        } else if is("ERROR_MESSAGE") {
            Given::Error(line.error.or(line.content).map(|s| place(strings, s)))
        } else {
            if !KNOWN.iter().any(|known| is(known)) {
                self.unknowns.note(kind);
            }
            return None;
        };
        Some((given, at))
    }

    fn apply(&mut self, given: Given, at: At, strings: &mut [Option<JsString>]) {
        match given {
            Given::Response { thinking, prose, calls } => {
                if let Some(body) = thinking.map(|i| turn::made(strings, i)).filter(|b| !b.is_blank()) {
                    self.out.push(Block::Think { at: at.clone(), body });
                }
                if let Some(body) = prose.map(|i| turn::made(strings, i)).filter(|b| !b.is_blank()) {
                    self.out.push(Block::Text { at: at.clone(), body });
                }
                for call in calls {
                    let block = match call {
                        Made::Tool { name, input } => {
                            let input = input.made(strings);
                            Block::Tool { at: at.clone(), name, summary: turn::summary(&input), input, output: None, truncated: false }
                        }
                        Made::Sub { name, prompt } => Block::Sub { at: at.clone(), name: Some(name), prompt: prompt.made(strings), result: None },
                    };
                    self.pending.push_back(self.out.len());
                    self.out.push(block);
                }
            }
            Given::Result(text) => {
                let Some(call) = self.pending.pop_front() else { return };
                let text = text.map(|i| turn::made(strings, i)).unwrap_or_default();
                match self.out.get_mut(call) {
                    Some(Block::Tool { output, .. }) => *output = Some(text),
                    Some(Block::Sub { .. }) => {
                        if let Some(id) = found(&text, Rule::Created) {
                            self.subs.insert(id, call);
                        }
                    }
                    _ => {}
                }
            }
            Given::Message(i) => {
                let content = turn::made(strings, i);
                let Some(&sub) = found(&content, Rule::Sender).and_then(|sender| self.subs.get(&sender)) else { return };
                let body = message_body(content);
                if let Some(Block::Sub { result, .. }) = self.out.get_mut(sub) {
                    *result = Some(match result.take() {
                        None => body,
                        Some(before) => JsString::join(vec![before, body], "\n\n"),
                    });
                }
            }
            Given::Error(text) => {
                let body = text.map(|i| turn::made(strings, i)).unwrap_or_default();
                if !body.is_blank() {
                    self.out.push(Block::Text { at, body });
                }
            }
        }
    }
}

impl Turn<'_> {
    /// A response's call `c`, each string it gives noted in `strings`: a dispatch when its name is a dispatch name, named
    /// by its `TypeName` and asked its `Prompt`, each when a string, else by its tool's name and its arguments as shown;
    /// any other a tool, by its name when a string, its input its arguments as shown
    fn call<'a>(&self, c: &Call<'a>, strings: &mut Vec<Str<'a>>) -> Made {
        let Some(name) = c.name.filter(|n| self.dispatches.iter().any(|d| n.is(d))) else {
            return Made::Tool { name: c.name.map(|n| n.text()), input: Text::of(c.args, strings) };
        };
        let (mut type_name, mut prompt) = (None, None);
        if let Some(raw) = c.args {
            reread(raw, |r| {
                json::record(r, |key, r| {
                    if key.is("TypeName") {
                        type_name = r.string_or_skip()?;
                    } else if key.is("Prompt") {
                        prompt = r.string_or_skip()?;
                    } else {
                        r.skip()?;
                    }
                    Ok(())
                })
            });
        }
        let prompt = match prompt {
            Some(p) => Text::String(place(strings, p)),
            None => Text::of(c.args, strings),
        };
        Made::Sub { name: type_name.unwrap_or(name).text(), prompt }
    }
}

/// A rule the assembly finds a piece of a string's text by, each one of the expressions it was written in
#[derive(Clone, Copy)]
enum Rule {
    /// `/"conversationId":\s*"([^"]+)"/`: the conversation a dispatch's result echoes the creation of
    Created,
    /// `/\bsender=(\S+)/`: the sender a system message names
    Sender,
    /// `/\[Message\][^\n]*?\bcontent=([\s\S]*?)\n<\/SYSTEM_MESSAGE>/`: a system message's body
    Body,
}

/// What `rule` finds in `text`, a copy of it
fn found(text: &JsString, rule: Rule) -> Option<JsString> {
    match text {
        JsString::Utf8(t) => locate(rule, t.as_bytes()).map(|(start, end)| JsString::Utf8(t[start..end].to_owned())),
        JsString::Units(units) => locate(rule, units).map(|(start, end)| JsString::from_units(units[start..end].to_vec())),
    }
}

/// A system message's return: the body `Rule::Body` finds in its content, made in the content's own buffer, or the
/// whole content when it finds none
fn message_body(content: JsString) -> JsString {
    match content {
        JsString::Utf8(mut t) => {
            if let Some((start, end)) = locate(Rule::Body, t.as_bytes()) {
                t.truncate(end);
                t.drain(..start);
            }
            JsString::Utf8(t)
        }
        JsString::Units(mut units) => match locate(Rule::Body, &units) {
            Some((start, end)) => {
                units.truncate(end);
                units.drain(..start);
                JsString::from_units(units)
            }
            None => JsString::Units(units),
        },
    }
}

/// A code of a string's text as the rules match it: a byte of a well-formed string's UTF-8, or a UTF-16 code unit of
/// one holding a lone surrogate. Every character a rule names is ASCII, so the two give the same matches, at places
/// each in its own codes.
trait Code: Copy {
    /// Whether this is the ASCII character `c`
    fn is(self, c: u8) -> bool;

    /// Whether this is a word character to `\b`, `[A-Za-z0-9_]`
    fn is_word(self) -> bool;

    /// How many codes the character at `i` of `s` takes
    fn width(s: &[Self], i: usize) -> usize;

    /// Whether the character at `i` of `s` is white space to `\s`
    fn is_space(s: &[Self], i: usize) -> bool;
}

impl Code for u8 {
    fn is(self, c: u8) -> bool {
        self == c
    }

    fn is_word(self) -> bool {
        self.is_ascii_alphanumeric() || self == b'_'
    }

    fn width(s: &[u8], i: usize) -> usize {
        let width = match s[i] {
            0xc0..=0xdf => 2,
            0xe0..=0xef => 3,
            0xf0..=0xf7 => 4,
            _ => 1,
        };
        width.min(s.len() - i)
    }

    fn is_space(s: &[u8], i: usize) -> bool {
        // Every character `\s` matches is in the Basic Multilingual Plane: one code unit
        let c = std::str::from_utf8(&s[i..i + Self::width(s, i)]).ok().and_then(|c| c.chars().next());
        c.is_some_and(|c| u16::try_from(u32::from(c)).is_ok_and(text::is_space))
    }
}

impl Code for u16 {
    fn is(self, c: u8) -> bool {
        self == u16::from(c)
    }

    fn is_word(self) -> bool {
        u8::try_from(self).is_ok_and(Code::is_word)
    }

    fn width(_: &[u16], _: usize) -> usize {
        1
    }

    fn is_space(s: &[u16], i: usize) -> bool {
        text::is_space(s[i])
    }
}

/// Where `rule` finds its piece of `s`, `[start, end)`: at the first place the expression matches, as `exec` finds it
fn locate<C: Code>(rule: Rule, s: &[C]) -> Option<(usize, usize)> {
    match rule {
        Rule::Created => created(s),
        Rule::Sender => sender(s),
        Rule::Body => body(s),
    }
}

/// Whether `s` holds `literal` at `i`
fn holds<C: Code>(s: &[C], i: usize, literal: &[u8]) -> bool {
    s.len() >= i + literal.len() && literal.iter().enumerate().all(|(k, &c)| s[i + k].is(c))
}

/// The first place at or after `from` where `s` holds `literal`
fn find<C: Code>(s: &[C], literal: &[u8], from: usize) -> Option<usize> {
    (from..(s.len() + 1).checked_sub(literal.len())?).find(|&i| holds(s, i, literal))
}

/// `/"conversationId":\s*"([^"]+)"/`. A match starts only where the key is written, and at each such place in turn
/// the white space runs to the quote, if one follows, and the id to the next quote, if one does and the id is not
/// empty: neither run gives back a character that would let the rest match.
fn created<C: Code>(s: &[C]) -> Option<(usize, usize)> {
    const KEY: &[u8] = b"\"conversationId\":";
    let mut from = 0;
    while let Some(at) = find(s, KEY, from) {
        from = at + 1;
        let mut i = at + KEY.len();
        while i < s.len() && C::is_space(s, i) {
            i += C::width(s, i);
        }
        if i >= s.len() || !s[i].is(b'"') {
            continue;
        }
        let start = i + 1;
        if let Some(end) = (start..s.len()).find(|&k| s[k].is(b'"')).filter(|&end| end > start) {
            return Some((start, end));
        }
    }
    None
}

/// `/\bsender=(\S+)/`: at the first place `sender=` is written at a word's start and followed by a character that is not
/// white space, the run of such characters
fn sender<C: Code>(s: &[C]) -> Option<(usize, usize)> {
    const KEY: &[u8] = b"sender=";
    let mut from = 0;
    while let Some(at) = find(s, KEY, from) {
        from = at + 1;
        if at > 0 && s[at - 1].is_word() {
            continue;
        }
        let start = at + KEY.len();
        let mut end = start;
        while end < s.len() && !C::is_space(s, end) {
            end += C::width(s, end);
        }
        if end > start {
            return Some((start, end));
        }
    }
    None
}

/// `/\[Message\][^\n]*?\bcontent=([\s\S]*?)\n<\/SYSTEM_MESSAGE>/`: after the first `[Message]` whose line holds
/// `content=` at a word's start, the text from the first such `content=` to the first close after it. When no close
/// follows that one, none follows a later header's either, whose `content=` is never earlier, so nothing matches.
fn body<C: Code>(s: &[C]) -> Option<(usize, usize)> {
    const HEAD: &[u8] = b"[Message]";
    const KEY: &[u8] = b"content=";
    const CLOSE: &[u8] = b"\n</SYSTEM_MESSAGE>";
    let mut from = 0;
    while let Some(at) = find(s, HEAD, from) {
        from = at + 1;
        let mut i = at + HEAD.len();
        let key = loop {
            if i >= s.len() || s[i].is(b'\n') {
                break None;
            }
            // `i - 1` is the header's `]` or a character after it
            if holds(s, i, KEY) && !s[i - 1].is_word() {
                break Some(i);
            }
            i += 1;
        };
        let Some(key) = key else { continue };
        let start = key + KEY.len();
        return find(s, CLOSE, start).map(|end| (start, end));
    }
    None
}
