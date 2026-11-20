//! A Grok turn's blocks (session-view C1, C3, C5, C8, C9, In-turn blocks), assembled from the lines the turn holds as
//! the session page draws them. Each line is a record of the agent's update stream: its update is `params.update`, and
//! the update's type its `sessionUpdate`. The fields read here are the turn's own, read as `line.rs` reads the scan's:
//! a value of another kind than a rule takes is undefined to it, an array has none of an object's fields, and of a
//! repeated key the last value counts, as `JSON.parse` keeps it. A line `JSON.parse` would refuse, or one holding no
//! object or array, is passed over.
//!
//! The rules rest on a full enumeration of this machine's update streams (2026-08-16, 17 update types; the AGENTS.md
//! invariant that a set of shapes comes from one):
//! - One assistant message is split across `agent_message_chunk` records mid-word, with state records between the
//!   fragments. So the chunks of the prose, and of the thinking likewise, join as they were written, with no separator,
//!   and the ten state types (`STATE`) break no join: only a chunk of the other kind or a tool call ends the open block.
//! - The state types are neither drawn nor traced. A user chunk is drawn in the question's own row, or is an injected
//!   notice drawn nowhere. A type outside the 17 leaves the unknown trace (session-view C8), as a record with no update
//!   does, named by its method: a shape outside an allow-list is never dropped silently.
//! - A tool call whose title is a dispatch name dispatches a subagent. Its record names no agent type: the
//!   `subagent_spawned` record pairing with it does, the spawned records pairing with the dispatches in the order they
//!   were made, and its `subagent_finished` record gives the result. The dispatch's own updates are its "started in
//!   background" echo, never the result. The subagent's own steps are not attributed to its dispatch (session-view C3):
//!   its stream is not read.
//! - Any other call is a tool, its updates paired with it by `toolCallId`.

use std::collections::{HashMap, HashSet, VecDeque};

use crate::json::{self, Kind, Read, Reader, Str};
use crate::text::{self, JsString, Units};
use crate::turn::{self, place, At, Block, Unknowns};

/// The ten state types of the enumeration, neither drawn nor traced
const STATE: [&str; 10] = [
    "turn_completed",
    "plan",
    "session_recap",
    "retry_state",
    "task_backgrounded",
    "task_completed",
    "current_mode_update",
    "auto_compact_started",
    "auto_compact_completed",
    "compaction_checkpoint",
];

/// How the trace names a record with no update and no method
const NO_UPDATE: &str = "<no-update>";

/// One line, as the turn reads it
#[derive(Default)]
struct Line<'a> {
    /// `timestamp`, when a number: epoch seconds
    timestamp: Option<f64>,
    /// The value of `method`, as the line writes it; None when it has none
    method: Option<&'a str>,
    /// `params.update`, as a record: empty when either is no object
    update: Update<'a>,
}

/// An update record
#[derive(Default)]
struct Update<'a> {
    /// `sessionUpdate`, the record's type
    kind: Option<Str<'a>>,
    /// A chunk's text: `content.text`, when `content` is an object
    text: Option<Str<'a>>,
    /// A tool update's texts: `content`, when an array, and of each element that is an object and whose own `content`
    /// is one, its `text`
    texts: Option<Vec<Str<'a>>>,
    /// `toolCallId`
    id: Option<Str<'a>>,
    title: Option<Str<'a>>,
    /// The tool's name, `_meta['x.ai/tool'].name`
    tool: Option<Str<'a>>,
    /// The value of `rawInput`, as the line writes it
    input: Option<&'a str>,
    subagent_type: Option<Str<'a>>,
    subagent_id: Option<Str<'a>>,
    output: Option<Str<'a>>,
    error: Option<Str<'a>>,
}

fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("timestamp") {
                line.timestamp = if r.kind()? == Kind::Number { Some(r.number()?) } else { r.skip().map(|()| None)? };
            } else if key.is("method") {
                line.method = Some(r.raw()?);
            } else if key.is("params") {
                line.update = Update::default();
                json::record(r, |key, r| if key.is("update") { update(r).map(|u| line.update = u) } else { r.skip() })?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

/// The string `text` of the record here, when it is one (`v?.['text']`)
fn text_of<'a>(r: &mut Reader<'a>) -> Read<Option<Str<'a>>> {
    let mut text = None;
    json::record(r, |key, r| if key.is("text") { r.string_or_skip().map(|t| text = t) } else { r.skip() })?;
    Ok(text)
}

fn update<'a>(r: &mut Reader<'a>) -> Read<Update<'a>> {
    let mut u = Update::default();
    json::record(r, |key, r| {
        if key.is("sessionUpdate") {
            u.kind = r.string_or_skip()?;
        } else if key.is("content") {
            u.texts = None;
            u.text = None;
            if r.kind()? == Kind::Array {
                let mut texts = Vec::new();
                r.elements(|r| {
                    let mut text = None;
                    json::record(r, |key, r| if key.is("content") { text_of(r).map(|t| text = t) } else { r.skip() })?;
                    texts.extend(text);
                    Ok(())
                })?;
                u.texts = Some(texts);
            } else {
                u.text = text_of(r)?;
            }
        } else if key.is("toolCallId") {
            u.id = r.string_or_skip()?;
        } else if key.is("title") {
            u.title = r.string_or_skip()?;
        } else if key.is("_meta") {
            u.tool = None;
            json::record(r, |key, r| {
                if !key.is("x.ai/tool") {
                    return r.skip();
                }
                u.tool = None;
                json::record(r, |key, r| if key.is("name") { r.string_or_skip().map(|n| u.tool = n) } else { r.skip() })
            })?;
        } else if key.is("rawInput") {
            u.input = Some(r.raw()?);
        } else if key.is("subagent_type") {
            u.subagent_type = r.string_or_skip()?;
        } else if key.is("subagent_id") {
            u.subagent_id = r.string_or_skip()?;
        } else if key.is("output") {
            u.output = r.string_or_skip()?;
        } else if key.is("error") {
            u.error = r.string_or_skip()?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(u)
}

/// A value of the line, read again from its text: the line was read whole, so it reads
fn reread<T>(text: &str, f: impl FnOnce(&mut Reader<'_>) -> Read<T>) -> T
where
    T: Default,
{
    f(&mut Reader::new(text)).unwrap_or_default()
}

/// The blocks of a turn whose lines are `lines`, each line let go once it is read (`turn::read_lines`), a tool's long
/// output held once; `dispatches` the tool names whose call dispatches a subagent
pub(super) fn blocks(lines: Vec<String>, dispatches: &[&str]) -> Vec<Block> {
    let mut turn = Turn { dispatches, ..Turn::default() };
    turn::read_lines(lines, &mut turn);
    turn.done()
}

/// What a line gives a turn, a string by its place among the line's strings
enum Given {
    /// A chunk of the assistant's prose: its text, None when it carries none
    Prose(Option<usize>),
    /// A chunk of the assistant's thinking: its text, None when it carries none
    Thought(Option<usize>),
    /// A tool's call, by its id when it has one
    Tool(Option<JsString>, Block),
    /// A subagent's dispatch, by its call's id when it has one
    Dispatch(Option<JsString>, Block),
    /// An update's texts for the tool at a place among the turn's blocks, none of them empty and at least one
    Output(usize, Vec<usize>),
    /// A subagent spawned: its type, when the record names one, and its id
    Spawned(Option<JsString>, Option<JsString>),
    /// A subagent finished, for the dispatch at a place among the turn's blocks: the string its result is, None for none
    Finished(usize, Option<usize>),
}

/// A turn's blocks as its lines are read, with the open blocks a chunk joins and the calls a later record pairs with
#[derive(Default)]
struct Turn<'d> {
    /// The tool names whose call dispatches a subagent
    dispatches: &'d [&'d str],
    out: Vec<Block>,
    /// The open prose block and the open thought, by their places among the blocks: the ones the next chunk of each kind
    /// joins
    prose: Option<usize>,
    thought: Option<usize>,
    /// The tools' calls, by id
    tools: HashMap<JsString, usize>,
    /// The ids of the dispatches' calls, whose own updates are their echo
    dispatched: HashSet<JsString>,
    /// The dispatches no spawned record has paired with yet, in the order they were made
    unpaired: VecDeque<usize>,
    /// The dispatches, by the id their spawned record gave the subagent
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
        // `typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp * 1000 : null`
        let at = line.timestamp.filter(|t| t.is_finite()).map_or(At::None, |t| At::Ms(t * 1000.0));
        let given = self.gives(&line, &at, strings)?;
        Some((given, at))
    }

    fn apply(&mut self, given: Given, at: At, strings: &mut [Option<JsString>]) {
        match given {
            Given::Prose(text) => {
                let text = text.map(|i| turn::made(strings, i)).unwrap_or_default();
                self.thought = None;
                if let Some(Block::Text { body, .. }) = self.prose.and_then(|i| self.out.get_mut(i)) {
                    append(body, text);
                } else {
                    self.prose = Some(self.out.len());
                    self.out.push(Block::Text { at, body: text });
                }
            }
            Given::Thought(text) => {
                let text = text.map(|i| turn::made(strings, i)).unwrap_or_default();
                self.prose = None;
                if let Some(Block::Think { body, .. }) = self.thought.and_then(|i| self.out.get_mut(i)) {
                    append(body, text);
                } else {
                    self.thought = Some(self.out.len());
                    self.out.push(Block::Think { at, body: text });
                }
            }
            Given::Tool(id, block) => {
                self.close();
                if let Some(id) = id {
                    self.tools.insert(id, self.out.len());
                }
                self.out.push(block);
            }
            Given::Dispatch(id, block) => {
                self.close();
                if let Some(id) = id {
                    self.dispatched.insert(id);
                }
                self.unpaired.push_back(self.out.len());
                self.out.push(block);
            }
            Given::Output(call, texts) => {
                let text = JsString::join(texts.into_iter().map(|i| turn::made(strings, i)).collect(), "");
                if let Some(Block::Tool { output, .. }) = self.out.get_mut(call) {
                    *output = Some(text);
                }
            }
            Given::Spawned(named, id) => {
                let Some(sub) = self.unpaired.pop_front() else { return };
                if let (Some(named), Some(Block::Sub { name, .. })) = (named, self.out.get_mut(sub)) {
                    *name = Some(named);
                }
                if let Some(id) = id {
                    self.subs.insert(id, sub);
                }
            }
            Given::Finished(sub, text) => {
                if let Some(Block::Sub { result, .. }) = self.out.get_mut(sub) {
                    *result = text.map(|i| turn::made(strings, i));
                }
            }
        }
    }
}

impl Turn<'_> {
    /// What `line` gives the turn, each string it gives by its place in `strings`; `at` the line's time. None for a line
    /// that gives no block, a record traced as unknown among them.
    fn gives<'a>(&mut self, line: &Line<'a>, at: &At, strings: &mut Vec<Str<'a>>) -> Option<Given> {
        let u = &line.update;
        let Some(kind) = u.kind else {
            let named = line.method.filter(|raw| !reread(raw, |r| Ok(r.kind()? == Kind::Null)));
            self.unknowns.note(named.map_or_else(|| JsString::Utf8(NO_UPDATE.to_owned()), |raw| reread(raw, turn::label)));
            return None;
        };
        let mut string = |s: Str<'a>| place(strings, s);
        if kind.is("agent_message_chunk") {
            return Some(Given::Prose(u.text.map(&mut string)));
        }
        if kind.is("agent_thought_chunk") {
            return Some(Given::Thought(u.text.map(&mut string)));
        }
        if kind.is("tool_call") {
            let id = u.id.map(|i| i.text());
            if u.title.is_some_and(|t| self.dispatches.iter().any(|d| t.is(d))) {
                return Some(Given::Dispatch(id, dispatch(u.input, at.clone())));
            }
            let name = u.tool.or(u.title).map(|n| n.text());
            let input = u.input.map(|raw| reread(raw, turn::input_text)).unwrap_or_else(JsString::empty);
            // `oneLine(`${name ?? ''} ${input}`.trim())`
            let shown = name.iter().flat_map(JsString::units).chain(std::iter::once(0x20)).chain(input.units());
            let summary = turn::one_line(shown.skip_while(|&u| text::is_space(u)));
            return Some(Given::Tool(id, Block::Tool { at: at.clone(), name, summary, input, output: None, truncated: false }));
        }
        if kind.is("tool_call_update") {
            let id = u.id?.text();
            if self.dispatched.contains(&id) {
                return None;
            }
            let &call = self.tools.get(&id)?;
            // The texts joined with no separator; an update whose texts join into nothing changes nothing
            let texts: Vec<usize> = u.texts.as_deref()?.iter().filter(|t| !t.is_empty()).map(|t| string(*t)).collect();
            return (!texts.is_empty()).then_some(Given::Output(call, texts));
        }
        if kind.is("subagent_spawned") {
            let named = u.subagent_type.filter(|t| !t.is_empty()).map(|t| t.text());
            return Some(Given::Spawned(named, u.subagent_id.map(|i| i.text())));
        }
        if kind.is("subagent_finished") {
            let &sub = self.subs.get(&u.subagent_id?.text())?;
            let result = u.output.filter(|o| !o.is_empty()).or(u.error);
            return Some(Given::Finished(sub, result.map(&mut string)));
        }
        if !kind.is("user_message_chunk") && !STATE.iter().any(|s| kind.is(s)) {
            let mut label = text::units("update/");
            label.extend(kind.units());
            self.unknowns.note(JsString::from_units(label));
        }
        None
    }

    /// A call ends the open prose block and the open thought
    fn close(&mut self) {
        self.prose = None;
        self.thought = None;
    }

    /// The turn's blocks, the trace of unknown types last. A body a chunk holding a lone surrogate was joined to is held
    /// as UTF-8 again when the join made it well formed.
    fn done(self) -> Vec<Block> {
        let mut out = self.out;
        for block in &mut out {
            if let Block::Text { body, .. } | Block::Think { body, .. } = block {
                if let JsString::Units(units) = body {
                    *body = JsString::from_units(std::mem::take(units));
                }
            }
        }
        out.extend(self.unknowns.block());
        out
    }
}

/// `body += more`, as JavaScript joins two strings: a lone surrogate that ends one and its partner that starts the other
/// join into the pair. A body that holds a lone surrogate, or is joined to one, is held as its code units until the
/// turn is done (`Turn::done`), so that each chunk joined to it costs only its own length.
fn append(body: &mut JsString, more: JsString) {
    match (body, more) {
        (JsString::Utf8(body), JsString::Utf8(more)) => body.push_str(&more),
        (JsString::Units(body), more) => body.extend(more.units()),
        (body, more) => {
            let mut units: Units = body.units().collect();
            units.extend(more.units());
            *body = JsString::Units(units);
        }
    }
}

/// A subagent's dispatch, `input` its call's input as the line writes it: named by none until a spawned record names
/// it; its prompt the `prompt`, the `description` when it has none, or nothing
fn dispatch(input: Option<&str>, at: At) -> Block {
    let (mut prompt, mut description) = (None, None);
    if let Some(raw) = input {
        reread(raw, |r| {
            json::record(r, |key, r| {
                if key.is("prompt") {
                    prompt = r.string_or_skip()?.map(|s| s.text());
                } else if key.is("description") {
                    description = r.string_or_skip()?.map(|s| s.text());
                } else {
                    r.skip()?;
                }
                Ok(())
            })
        });
    }
    Block::Sub { at, name: None, prompt: prompt.or(description).unwrap_or_else(JsString::empty), result: None }
}
