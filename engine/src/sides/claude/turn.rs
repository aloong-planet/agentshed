//! A Claude Code turn's blocks (session-view C1, C3, C5–C9, In-turn blocks), assembled from the lines the turn holds as
//! the session page draws them. The fields read here are the turn's own, read as `line.rs` reads the scan's: a value of
//! another kind than a rule takes is undefined to it, an array has none of an object's fields, and of a repeated key
//! the last value counts, as `JSON.parse` keeps it. A line `JSON.parse` would refuse, or one holding no object or array,
//! is passed over.
//!
//! The rules rest on a full enumeration of this machine's 2131 transcripts (2026-08-05 and 2026-08-06, the AGENTS.md
//! invariant that a set of shapes comes from one):
//! - 18 top-level types (`KNOWN`): an assistant's and a user's line carry the content, and the other 16 are known noise,
//!   neither drawn nor traced. A type outside the 18 leaves the unknown trace (session-view C8): a shape outside an
//!   allow-list is never dropped silently.
//! - An assistant's segments are text, tool_use and thinking. Every one of the 3312 thinking segments on a main chain
//!   was empty, a signature alone: the think block is kept for a plain-text one, which the current data never gives.
//! - A tool_result pairs with its tool_use by `tool_use_id` (19,711 of 19,711 matched a tool_use already seen in the
//!   file).
//! - A subagent's own steps are not attributed to its dispatch (session-view C3): every candidate key failed —
//!   toolUseResult.agentId (7 digits) and a sidechain's agentId (17 digits) are different namespaces, 0 of 225 matched;
//!   a dispatch line has no promptId (0 of 202); outputFile names a background task's output, not a transcript; a
//!   sidechain's first text equals its dispatch's prompt in 0 of 1299. So a sub block is the dispatch, its return and
//!   the unattributed label, and a sidechain line is not drawn: its transcript is in the file or a nested one.
//! - A return is truncated when its text holds a path into `tool-results/`, the directory the harness puts an oversized
//!   original in (49 cases; session-view C7). The word "truncated" is too common to be the mark.

use std::collections::HashMap;

use crate::json::{self, Kind, Read, Reader, Str};
use crate::text::JsString;
use crate::turn::{self, At, Block, Unknowns};

/// The 18 top-level types of the enumeration
const KNOWN: [&str; 18] = [
    "assistant",
    "user",
    "attachment",
    "system",
    "ai-title",
    "last-prompt",
    "mode",
    "permission-mode",
    "queue-operation",
    "file-history-snapshot",
    "pr-link",
    "bridge-session",
    "file-history-delta",
    "relocated",
    "worktree-state",
    "started",
    "result",
    "frame-link",
];

/// What a return's text holds when the harness kept the original apart
const TRUNCATED_MARK: &str = "tool-results/";

/// One line, as the turn reads it
#[derive(Default)]
struct Line<'a> {
    /// The value of `type`, as the line writes it; None when it has none
    kind: Option<&'a str>,
    /// `isSidechain === true`: a subagent's own transcript
    sidechain: bool,
    timestamp: Option<Str<'a>>,
    /// The message's `content`, when the message is an object and its content an array: each element that is an object
    segments: Option<Vec<Segment<'a>>>,
}

/// An element of a message's content that is an object
#[derive(Default)]
struct Segment<'a> {
    kind: Option<Str<'a>>,
    thinking: Option<Str<'a>>,
    text: Option<Str<'a>>,
    id: Option<Str<'a>>,
    name: Option<Str<'a>>,
    /// The value of `input`, as the line writes it
    input: Option<&'a str>,
    tool_use_id: Option<Str<'a>>,
    content: Option<Returned<'a>>,
}

/// A tool_result's `content`
enum Returned<'a> {
    String(Str<'a>),
    /// An array: the string `text` of each element that is an object
    Texts(Vec<Str<'a>>),
    /// Any other value, as the line writes it
    Other(&'a str),
}

fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("type") {
                line.kind = Some(r.raw()?);
            } else if key.is("isSidechain") {
                line.sidechain = r.kind()? == Kind::True;
                r.skip()?;
            } else if key.is("timestamp") {
                line.timestamp = r.string_or_skip()?;
            } else if key.is("message") {
                line.segments = None;
                json::record(r, |key, r| {
                    if !key.is("content") {
                        return r.skip();
                    }
                    line.segments = None;
                    if r.kind()? != Kind::Array {
                        return r.skip();
                    }
                    let mut segments = Vec::new();
                    r.elements(|r| {
                        if r.kind()? != Kind::Object {
                            return r.skip();
                        }
                        segments.push(segment(r)?);
                        Ok(())
                    })?;
                    line.segments = Some(segments);
                    Ok(())
                })?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

fn segment<'a>(r: &mut Reader<'a>) -> Read<Segment<'a>> {
    let mut s = Segment::default();
    r.members(|key, r| {
        if key.is("type") {
            s.kind = r.string_or_skip()?;
        } else if key.is("thinking") {
            s.thinking = r.string_or_skip()?;
        } else if key.is("text") {
            s.text = r.string_or_skip()?;
        } else if key.is("id") {
            s.id = r.string_or_skip()?;
        } else if key.is("name") {
            s.name = r.string_or_skip()?;
        } else if key.is("input") {
            s.input = Some(r.raw()?);
        } else if key.is("tool_use_id") {
            s.tool_use_id = r.string_or_skip()?;
        } else if key.is("content") {
            s.content = Some(match r.kind()? {
                Kind::String => Returned::String(r.string()?),
                Kind::Array => {
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
                    Returned::Texts(texts)
                }
                _ => Returned::Other(r.raw()?),
            });
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(s)
}

/// A value of the line, read again from its text: the line was read whole, so it reads
fn reread<T>(text: &str, f: impl FnOnce(&mut Reader<'_>) -> Read<T>) -> T
where
    T: Default,
{
    f(&mut Reader::new(text)).unwrap_or_default()
}

/// The blocks of a turn whose lines are `lines`, each line let go once it is read; `dispatches` the tool names whose
/// call dispatches a subagent
pub(super) fn blocks(lines: Vec<String>, dispatches: &[&str]) -> Vec<Block> {
    let mut turn = Turn::default();
    for line in lines {
        match read(&line) {
            Ok(json::Line::Object(l)) => turn.line(&l, dispatches),
            // An array has none of an object's fields
            Ok(json::Line::Array) => turn.line(&Line::default(), dispatches),
            Ok(json::Line::Other) | Err(_) => {}
        }
    }
    let mut out = turn.out;
    out.extend(turn.unknowns.block());
    out
}

/// A turn's blocks as its lines are read, with the calls a return pairs with by id
#[derive(Default)]
struct Turn {
    out: Vec<Block>,
    tools: HashMap<JsString, usize>,
    subs: HashMap<JsString, usize>,
    unknowns: Unknowns,
}

impl Turn {
    fn line(&mut self, line: &Line<'_>, dispatches: &[&str]) {
        if line.sidechain {
            return;
        }
        let kind = line.kind.map(|raw| reread(raw, turn::label)).unwrap_or_else(turn::undefined_label);
        let is = |name: &str| matches!(&kind, JsString::Utf8(k) if k.as_str() == name);
        if is("assistant") {
            if let Some(segments) = &line.segments {
                self.assistant(segments, turn::at_of(line.timestamp), dispatches);
            }
        } else if is("user") {
            if let Some(segments) = &line.segments {
                self.user(segments);
            }
        } else if !KNOWN.iter().any(|known| is(known)) {
            self.unknowns.note(kind);
        }
    }

    /// An assistant's line: within it, thinking, then its prose, then its calls, the order its segments come in
    fn assistant(&mut self, segments: &[Segment<'_>], at: At, dispatches: &[&str]) {
        let mut texts = Vec::new();
        let mut calls: Vec<(JsString, Block)> = Vec::new();
        for s in segments {
            let kind = |name: &str| s.kind.is_some_and(|k| k.is(name));
            if kind("thinking") && s.thinking.is_some_and(|t| !t.text().is_blank()) {
                let body = s.thinking.map(|t| t.text()).unwrap_or_else(JsString::empty);
                self.out.push(Block::Think { at: at.clone(), body });
            } else if kind("text") && s.text.is_some() {
                texts.extend(s.text.map(|t| t.text()));
            } else if kind("tool_use") && s.id.is_some() {
                let id = s.id.map(|i| i.text()).unwrap_or_else(JsString::empty);
                let name = s.name.map(|n| n.text());
                let dispatch = matches!(&name, Some(JsString::Utf8(n)) if dispatches.contains(&n.as_str()));
                let block = match name {
                    Some(name) if dispatch => sub(name, s.input, at.clone()),
                    name => {
                        let input = s.input.map(|raw| reread(raw, turn::input_text)).unwrap_or_else(JsString::empty);
                        Block::Tool { at: at.clone(), name, summary: turn::summary(&input), input, output: None, truncated: false }
                    }
                };
                calls.push((id, block));
            }
        }
        let body = JsString::join(texts, "\n");
        if !body.is_blank() {
            self.out.push(Block::Text { at, body });
        }
        for (id, block) in calls {
            let calls = if matches!(block, Block::Sub { .. }) { &mut self.subs } else { &mut self.tools };
            calls.insert(id, self.out.len());
            self.out.push(block);
        }
    }

    /// A user's line: each tool_result fills in the call it returns for, a tool's before a subagent's
    fn user(&mut self, segments: &[Segment<'_>]) {
        for s in segments {
            if !s.kind.is_some_and(|k| k.is("tool_result")) {
                continue;
            }
            let Some(id) = s.tool_use_id.map(|i| i.text()) else { continue };
            let at = self.tools.get(&id).or_else(|| self.subs.get(&id)).copied();
            match at.and_then(|at| self.out.get_mut(at)) {
                Some(Block::Tool { output, truncated, .. }) => {
                    let text = returned(s.content.as_ref());
                    *truncated = text.includes(TRUNCATED_MARK);
                    *output = Some(text);
                }
                Some(Block::Sub { result, .. }) => *result = Some(returned(s.content.as_ref())),
                _ => {}
            }
        }
    }
}

/// A subagent's dispatch by the tool `name`: named by its `subagent_type`, the tool's name when it has none; its prompt
/// the `prompt`, the `description` when it has none, or nothing
fn sub(name: JsString, input: Option<&str>, at: At) -> Block {
    let (mut kind, mut prompt, mut description) = (None, None, None);
    if let Some(raw) = input {
        reread(raw, |r| {
            json::record(r, |key, r| {
                if key.is("subagent_type") {
                    kind = r.string_or_skip()?.map(|s| s.text());
                } else if key.is("prompt") {
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
    Block::Sub { at, name: kind.unwrap_or(name), prompt: prompt.or(description).unwrap_or_else(JsString::empty), result: None }
}

/// A return's text (`resultText`): a string as it is, an array's string texts each on a line of its own, nothing for
/// none or null, and any other value as its input would be shown
fn returned(content: Option<&Returned<'_>>) -> JsString {
    match content {
        None => JsString::empty(),
        Some(Returned::String(s)) => s.text(),
        Some(Returned::Texts(texts)) => JsString::join(texts.iter().map(|t| t.text()).collect(), "\n"),
        Some(Returned::Other(raw)) => reread(raw, turn::input_text),
    }
}
