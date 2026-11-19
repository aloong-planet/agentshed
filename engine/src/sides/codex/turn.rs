//! A Codex turn's blocks (session-view C1, C3, C6, C8, In-turn blocks), of a legacy rollout or a paginated one,
//! assembled from the lines the turn holds as the session page draws them. The fields read here are the turn's own,
//! read as `line.rs` reads the scan's: a value of another kind than a rule takes is undefined to it, a payload, an item
//! or an element that is no object has none of an object's fields (an array none either), and of a repeated key the
//! last value counts, as `JSON.parse` keeps it. A line `JSON.parse` would refuse, or one holding no object or array, is
//! passed over.
//!
//! The rules rest on full enumerations of this machine's rollouts (the AGENTS.md invariant that a set of shapes comes
//! from one):
//! - 296 files, 2026-08-05 and 2026-08-06: 7 top-level types; 9 `response_item` types, a call's arguments on
//!   custom_tool_call.input, function_call.arguments or tool_search_call.arguments, and its output paired by `call_id`,
//!   always present; 15 `event_msg` types, the prose taken from agent_message. reasoning.summary is
//!   `[{type:'summary_text',text}]`, a plain-text sub-heading, empty in 64%, and an empty one gives no block; the body,
//!   encrypted_content, is never to be had (session-view C6). agent_reasoning mirrors reasoning and is not drawn, lest
//!   it count twice. spawn_agent's output holds no thread id, so a subagent's own lines are not attributed to its
//!   dispatch and the sub block is unlinked (ruled 2026-08-06 against a heuristic pairing; session-view C3).
//! - The paginated format (ADR-0027): its completed-item event carries a typed item in place of the legacy events
//!   (60,245 events over 1391 rollouts, 2026-09-10). AgentMessage is the prose — no paginated rollout carries the
//!   legacy agent_message beside it (0 of 1367, 2026-09-11) — and UserMessage is the question, its own row and never a
//!   block. The other items give no block: Reasoning, CommandExecution, DynamicToolCall and FileChange go with
//!   `response_item` records drawn already, while McpToolCall and WebSearch carry calls whose legacy records, the
//!   mcp_tool_call_end and web_search_end events, were never drawn either. In 31 of 1367 paginated rollouts the
//!   tool-like items outnumber the `response_item` calls, so they are no mirrors: a known gap on both formats, stated in
//!   the spec (2026-09-11). The accounting record, token_usage_record, is usage and never drawn; the compaction marker
//!   on the response path, `response_item/compaction`, is an encrypted body and nothing else (78 records over 1391
//!   rollouts, 2026-09-11, found by the unknown trace rather than the item enumeration).
//! - A type outside these leaves the unknown trace (session-view C8): a shape outside an allow-list is never dropped
//!   silently. A type is one of these only as its name is written.

use std::collections::HashMap;

use super::question::CALL_TYPES;
use crate::json::{self, Kind, Read, Reader, Str};
use crate::text::JsString;
use crate::turn::{self, At, Block, Unknowns};

/// The top-level types of the enumerations
const TOP_KNOWN: [&str; 8] = [
    "event_msg",
    "response_item",
    "turn_context",
    "session_meta",
    "world_state",
    "inter_agent_communication_metadata",
    "compacted",
    "token_usage_record",
];

/// The `event_msg` types of the enumeration, but the completed-item event, which carries an item of its own type
const EVENT_KNOWN: [&str; 15] = [
    "token_count",
    "agent_message",
    "agent_reasoning",
    "task_started",
    "user_message",
    "task_complete",
    "thread_settings_applied",
    "mcp_tool_call_end",
    "patch_apply_end",
    "web_search_end",
    "sub_agent_activity",
    "context_compacted",
    "turn_aborted",
    "thread_rolled_back",
    "image_generation_end",
];

/// The types of the completed-item event's item
const ITEM_KNOWN: [&str; 13] = [
    "Reasoning",
    "AgentMessage",
    "UserMessage",
    "FileChange",
    "McpToolCall",
    "WebSearch",
    "DynamicToolCall",
    "CommandExecution",
    "SubAgentActivity",
    "ContextCompaction",
    "Extension",
    "CollabAgentToolCall",
    "ImageView",
];

/// The `response_item` types
const RESPONSE_KNOWN: [&str; 10] = [
    "message",
    "reasoning",
    "custom_tool_call",
    "custom_tool_call_output",
    "function_call",
    "function_call_output",
    "agent_message",
    "tool_search_call",
    "tool_search_output",
    "compaction",
];

/// The `response_item` types that return a call's output, one for each of the call types (`CALL_TYPES`); an output
/// fills in the call its `call_id` names, whichever type that call is
const OUTPUT_TYPES: [&str; 3] = ["custom_tool_call_output", "function_call_output", "tool_search_output"];

/// One line, as the turn reads it
#[derive(Default)]
struct Line<'a> {
    /// The value of `type`, as the line writes it; None when it has none
    kind: Option<&'a str>,
    timestamp: Option<Str<'a>>,
    payload: Payload<'a>,
}

/// The line's `payload`, as a record: empty when it is no object
#[derive(Default)]
struct Payload<'a> {
    /// The value of `type`, as the line writes it
    kind: Option<&'a str>,
    /// An agent message's text
    message: Option<Str<'a>>,
    /// A completed item
    item: Item<'a>,
    call_id: Option<Str<'a>>,
    name: Option<Str<'a>>,
    input: Option<Value<'a>>,
    arguments: Option<Value<'a>>,
    output: Option<Value<'a>>,
    /// A reasoning's summary: its elements' texts
    summary: Option<Vec<Str<'a>>>,
}

/// A completed item, as a record
#[derive(Default)]
struct Item<'a> {
    /// The value of `type`, as the line writes it
    kind: Option<&'a str>,
    /// Its content's elements' texts
    content: Option<Vec<Str<'a>>>,
}

/// A value a tool's input or output is shown from (`inputText`)
#[derive(Clone, Copy)]
enum Value<'a> {
    String(Str<'a>),
    Null,
    /// Any other value, as the line writes it
    Other(&'a str),
}

fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("type") {
                line.kind = Some(r.raw()?);
            } else if key.is("timestamp") {
                line.timestamp = r.string_or_skip()?;
            } else if key.is("payload") {
                line.payload = payload(r)?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

fn payload<'a>(r: &mut Reader<'a>) -> Read<Payload<'a>> {
    let mut p = Payload::default();
    json::record(r, |key, r| {
        if key.is("type") {
            p.kind = Some(r.raw()?);
        } else if key.is("message") {
            p.message = r.string_or_skip()?;
        } else if key.is("item") {
            p.item = item(r)?;
        } else if key.is("call_id") {
            p.call_id = r.string_or_skip()?;
        } else if key.is("name") {
            p.name = r.string_or_skip()?;
        } else if key.is("input") {
            p.input = Some(value(r)?);
        } else if key.is("arguments") {
            p.arguments = Some(value(r)?);
        } else if key.is("output") {
            p.output = Some(value(r)?);
        } else if key.is("summary") {
            p.summary = texts(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(p)
}

fn item<'a>(r: &mut Reader<'a>) -> Read<Item<'a>> {
    let mut it = Item::default();
    json::record(r, |key, r| {
        if key.is("type") {
            it.kind = Some(r.raw()?);
        } else if key.is("content") {
            it.content = texts(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(it)
}

/// The `text` of each element of the array here, kept when a string, an element that is no object having none; None
/// when the value is no array
fn texts<'a>(r: &mut Reader<'a>) -> Read<Option<Vec<Str<'a>>>> {
    if r.kind()? != Kind::Array {
        r.skip()?;
        return Ok(None);
    }
    let mut texts = Vec::new();
    r.elements(|r| {
        let mut text = None;
        json::record(r, |key, r| {
            if key.is("text") {
                text = r.string_or_skip()?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        texts.extend(text);
        Ok(())
    })?;
    Ok(Some(texts))
}

fn value<'a>(r: &mut Reader<'a>) -> Read<Value<'a>> {
    Ok(match r.kind()? {
        Kind::String => Value::String(r.string()?),
        Kind::Null => {
            r.skip()?;
            Value::Null
        }
        _ => Value::Other(r.raw()?),
    })
}

/// A type as the line writes it, named as the trace names it; `undefined` when the line has none. The line was read
/// whole, so the value reads again.
fn label_of(raw: Option<&str>) -> JsString {
    raw.map_or_else(turn::undefined_label, |raw| turn::label(&mut Reader::new(raw)).unwrap_or_default())
}

/// Whether `label` is one of `types`, as written
fn one_of(types: &[&str], label: &JsString) -> bool {
    matches!(label, JsString::Utf8(l) if types.contains(&l.as_str()))
}

/// A payload's or an item's type as the trace names it: under the type of what carries it
fn under(carrier: &str, label: JsString) -> JsString {
    JsString::join(vec![JsString::Utf8(carrier.to_owned()), label], "/")
}

/// The blocks of a turn whose lines are `lines`, each line let go once it is read; `dispatches` the tool names whose
/// call dispatches a subagent.
///
/// A line is read in two steps, as a Claude Code turn's is (`sides/claude/turn.rs`): what it gives the turn is noted
/// with its strings still the line's, and then the strings are made, the longest that is well formed taken from the
/// line's own buffer (`json::take`), so that a line's long text — a call's output, say — is held once, in the line read
/// or in its block, and never twice over (session-view C2).
pub(super) fn blocks(lines: Vec<String>, dispatches: &[&str]) -> Vec<Block> {
    let mut turn = Turn::default();
    for line in lines {
        let (given, at, mut strings, longest) = {
            let parsed = match read(&line) {
                Ok(json::Line::Object(l)) => l,
                // An array has none of an object's fields
                Ok(json::Line::Array) => Line::default(),
                Ok(json::Line::Other) | Err(_) => continue,
            };
            let at = turn::at_of(parsed.timestamp);
            let mut strings: Vec<Str<'_>> = Vec::new();
            let given = turn.given(&parsed, dispatches, &mut strings);
            let longest = (0..strings.len()).filter(|&i| strings[i].is_well_formed()).max_by_key(|&i| strings[i].written_len());
            let span = longest.map(|i| (i, strings[i].span(&line)));
            let made: Vec<Option<JsString>> = strings.iter().enumerate().map(|(i, s)| (Some(i) != longest).then(|| s.text())).collect();
            (given, at, made, span)
        };
        if let Some((i, span)) = longest {
            strings[i] = Some(JsString::Utf8(json::take(line, span)));
        }
        turn.apply(given, at, &mut strings);
    }
    let mut out = turn.out;
    out.extend(turn.unknowns.block());
    out
}

/// What a line gives a turn, a string by its place among the line's strings: a Codex line gives one thing at most
enum Given {
    Nothing,
    /// An assistant's prose: these texts, but those only white space
    Prose(Vec<usize>),
    /// A reasoning's sub-headings: these texts, but those only white space
    Reason(Vec<usize>),
    /// A call by the tool `name`, a subagent's dispatch when `sub`, and its id when it has one that is not empty
    Call { id: Option<JsString>, name: JsString, sub: bool, input: Text },
    /// An output for the call at a place among the turn's blocks
    Output(usize, Text),
}

/// A tool's input or output as shown (`inputText`)
enum Text {
    /// One of the line's strings
    String(usize),
    /// Made already: nothing, or a value shown as `JSON.stringify(v, null, 2)` writes it
    Made(JsString),
}

impl Text {
    fn of<'a>(value: Option<Value<'a>>, strings: &mut Vec<Str<'a>>) -> Text {
        match value {
            None | Some(Value::Null) => Text::Made(JsString::empty()),
            Some(Value::String(s)) => Text::String(place(strings, s)),
            Some(Value::Other(raw)) => Text::Made(turn::input_text(&mut Reader::new(raw)).unwrap_or_default()),
        }
    }

    fn made(self, strings: &mut [Option<JsString>]) -> JsString {
        match self {
            Text::String(i) => made(strings, i),
            Text::Made(text) => text,
        }
    }
}

/// Notes `s` among the line's strings: its place there
fn place<'a>(strings: &mut Vec<Str<'a>>, s: Str<'a>) -> usize {
    strings.push(s);
    strings.len() - 1
}

/// Notes each of `texts` among the line's strings: their places there
fn places<'a>(strings: &mut Vec<Str<'a>>, texts: &Option<Vec<Str<'a>>>) -> Vec<usize> {
    texts.iter().flatten().map(|&t| place(strings, t)).collect()
}

/// A string of the line's, made: each is taken once
fn made(strings: &mut [Option<JsString>], i: usize) -> JsString {
    strings.get_mut(i).and_then(Option::take).unwrap_or_default()
}

/// The texts at `places`, made, but those only white space
fn kept(strings: &mut [Option<JsString>], places: Vec<usize>) -> Vec<JsString> {
    places.into_iter().map(|i| made(strings, i)).filter(|t| !t.is_blank()).collect()
}

/// A turn's blocks as its lines are read, with the calls an output pairs with by id
#[derive(Default)]
struct Turn {
    out: Vec<Block>,
    /// Each call id, with the place among the blocks of the call last made with it
    calls: HashMap<JsString, usize>,
    unknowns: Unknowns,
}

impl Turn {
    /// What `line` gives the turn, each string it gives by its place in `strings`
    fn given<'a>(&mut self, line: &Line<'a>, dispatches: &[&str], strings: &mut Vec<Str<'a>>) -> Given {
        let top = label_of(line.kind);
        let p = &line.payload;
        if one_of(&["event_msg"], &top) {
            let kind = label_of(p.kind);
            if one_of(&["agent_message"], &kind) {
                return p.message.map_or(Given::Nothing, |m| Given::Prose(vec![place(strings, m)]));
            }
            if one_of(&["item_completed"], &kind) {
                let item = label_of(p.item.kind);
                if one_of(&["AgentMessage"], &item) {
                    return Given::Prose(places(strings, &p.item.content));
                }
                if !one_of(&ITEM_KNOWN, &item) {
                    self.unknowns.note(under("item_completed", item));
                }
            } else if !one_of(&EVENT_KNOWN, &kind) {
                self.unknowns.note(under("event_msg", kind));
            }
            return Given::Nothing;
        }
        if one_of(&["response_item"], &top) {
            let kind = label_of(p.kind);
            if one_of(&CALL_TYPES, &kind) {
                // `input ?? arguments`: a null input is none
                let input = p.input.filter(|v| !matches!(v, Value::Null)).or(p.arguments);
                let name = p.name.map_or(kind, |n| n.text());
                let sub = matches!(&name, JsString::Utf8(n) if dispatches.contains(&n.as_str()));
                // An empty id is none (`if (callId)`): Codex writes one on a call a Chat Completions provider gave no
                // id, and on an output answering a call it did not run
                let id = p.call_id.filter(|id| !id.is_empty()).map(|id| id.text());
                return Given::Call { id, name, sub, input: Text::of(input, strings) };
            }
            if one_of(&OUTPUT_TYPES, &kind) {
                return match p.call_id.and_then(|id| self.calls.get(&id.text()).copied()) {
                    Some(call) => Given::Output(call, Text::of(p.output, strings)),
                    None => Given::Nothing,
                };
            }
            if one_of(&["reasoning"], &kind) {
                return Given::Reason(places(strings, &p.summary));
            }
            if !one_of(&RESPONSE_KNOWN, &kind) {
                self.unknowns.note(under("response_item", kind));
            }
            return Given::Nothing;
        }
        if !one_of(&TOP_KNOWN, &top) {
            self.unknowns.note(top);
        }
        Given::Nothing
    }

    /// What a line gives, its strings made, into the turn's blocks: `at` the line's time
    fn apply(&mut self, given: Given, at: At, strings: &mut [Option<JsString>]) {
        match given {
            Given::Nothing => {}
            Given::Prose(places) => {
                let texts = kept(strings, places);
                if !texts.is_empty() {
                    self.out.push(Block::Text { at, body: JsString::join(texts, "\n\n") });
                }
            }
            Given::Reason(places) => {
                let titles = kept(strings, places);
                if !titles.is_empty() {
                    self.out.push(Block::Reason { at, titles });
                }
            }
            Given::Call { id, name, sub, input } => {
                let input = input.made(strings);
                let block = if sub {
                    Block::Sub { at, name, prompt: input, result: None }
                } else {
                    Block::Tool { at, name: Some(name), summary: turn::summary(&input), input, output: None, truncated: false }
                };
                if let Some(id) = id {
                    self.calls.insert(id, self.out.len());
                }
                self.out.push(block);
            }
            Given::Output(call, text) => {
                let text = text.made(strings);
                match self.out.get_mut(call) {
                    Some(Block::Tool { output, .. }) => *output = Some(text),
                    Some(Block::Sub { result, .. }) => *result = Some(text),
                    _ => {}
                }
            }
        }
    }
}
