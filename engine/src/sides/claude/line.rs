//! The fields Claude Code's rules read off a session line, and nothing else: every other value is checked and skipped. A
//! field reads as JavaScript's property access on the parsed line reads it — a value of another kind than a rule takes
//! is undefined to it, an array has none of an object's fields, and of a repeated key the last value counts, as
//! `JSON.parse` keeps it.

use crate::json::{self, Kind, Read, Reader, Str};

/// One line, read
#[derive(Default)]
pub(super) struct Line<'a> {
    pub(super) timestamp: Option<Str<'a>>,
    pub(super) kind: Option<Str<'a>>,
    /// `isSidechain === true`: a subagent's own transcript
    pub(super) sidechain: bool,
    pub(super) uuid: Option<Str<'a>>,
    pub(super) parent: Option<Str<'a>>,
    /// The bridge a compaction boundary keeps to the history before it (session-view B3)
    pub(super) logical_parent: Option<Str<'a>>,
    pub(super) request_id: Option<Str<'a>>,
    pub(super) message: Message<'a>,
}

/// The line's `message`, as a record: empty when it is no object
#[derive(Default)]
pub(super) struct Message<'a> {
    pub(super) id: Option<Str<'a>>,
    pub(super) model: Option<Str<'a>>,
    /// None when the line carries no usage: `usage` is absent or falsy
    pub(super) usage: Option<Usage>,
    pub(super) content: Content<'a>,
}

/// A usage's figures, `num()` of each: a truthy usage that is no object reads as zeros
#[derive(Default, Clone, Copy)]
pub(super) struct Usage {
    pub(super) input: f64,
    pub(super) output: f64,
    pub(super) cache_read: f64,
    /// `cache_creation_input_tokens`, the flat figure
    pub(super) cache_creation_flat: f64,
    /// `cache_creation`'s ephemeral 5m and 1h figures, when it is an object (an array among them, which has neither)
    pub(super) cache_creation: Option<(f64, f64)>,
}

/// The message's `content`
#[derive(Default)]
pub(super) enum Content<'a> {
    /// Neither a string nor an array
    #[default]
    Other,
    Text(Str<'a>),
    Segments(Vec<Segment<'a>>),
}

/// One element of a content array, as a record: empty when it is no object
#[derive(Default)]
pub(super) struct Segment<'a> {
    pub(super) kind: Option<Str<'a>>,
    pub(super) text: Option<Str<'a>>,
    pub(super) name: Option<Str<'a>>,
}

/// The line, read; Bad when `JSON.parse` would refuse it
pub(super) fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("timestamp") {
                line.timestamp = r.string_or_skip()?;
            } else if key.is("type") {
                line.kind = r.string_or_skip()?;
            } else if key.is("isSidechain") {
                line.sidechain = r.kind()? == Kind::True;
                r.skip()?;
            } else if key.is("uuid") {
                line.uuid = r.string_or_skip()?;
            } else if key.is("parentUuid") {
                line.parent = r.string_or_skip()?;
            } else if key.is("logicalParentUuid") {
                line.logical_parent = r.string_or_skip()?;
            } else if key.is("requestId") {
                line.request_id = r.string_or_skip()?;
            } else if key.is("message") {
                line.message = message(r)?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

fn message<'a>(r: &mut Reader<'a>) -> Read<Message<'a>> {
    let mut m = Message::default();
    json::record(r, |key, r| {
        if key.is("id") {
            m.id = r.string_or_skip()?;
        } else if key.is("model") {
            m.model = r.string_or_skip()?;
        } else if key.is("usage") {
            m.usage = usage(r)?;
        } else if key.is("content") {
            m.content = content(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(m)
}

fn usage(r: &mut Reader<'_>) -> Read<Option<Usage>> {
    if r.kind()? != Kind::Object {
        return Ok(r.truthy()?.then(Usage::default));
    }
    let mut u = Usage::default();
    r.members(|key, r| {
        if key.is("input_tokens") {
            u.input = json::finite_or_zero(r)?;
        } else if key.is("output_tokens") {
            u.output = json::finite_or_zero(r)?;
        } else if key.is("cache_read_input_tokens") {
            u.cache_read = json::finite_or_zero(r)?;
        } else if key.is("cache_creation_input_tokens") {
            u.cache_creation_flat = json::finite_or_zero(r)?;
        } else if key.is("cache_creation") {
            u.cache_creation = cache_creation(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(Some(u))
}

/// `typeof detail === 'object' && detail !== null`: an object's two ephemeral figures, an array's none
fn cache_creation(r: &mut Reader<'_>) -> Read<Option<(f64, f64)>> {
    match r.kind()? {
        Kind::Object => {
            let (mut five_minutes, mut one_hour) = (0.0, 0.0);
            r.members(|key, r| {
                if key.is("ephemeral_5m_input_tokens") {
                    five_minutes = json::finite_or_zero(r)?;
                } else if key.is("ephemeral_1h_input_tokens") {
                    one_hour = json::finite_or_zero(r)?;
                } else {
                    r.skip()?;
                }
                Ok(())
            })?;
            Ok(Some((five_minutes, one_hour)))
        }
        Kind::Array => r.skip().map(|_| Some((0.0, 0.0))),
        _ => r.skip().map(|_| None),
    }
}

fn content<'a>(r: &mut Reader<'a>) -> Read<Content<'a>> {
    Ok(match r.kind()? {
        Kind::String => Content::Text(r.string()?),
        Kind::Array => {
            let mut segments = Vec::new();
            r.elements(|r| {
                let mut s = Segment::default();
                json::record(r, |key, r| {
                    if key.is("type") {
                        s.kind = r.string_or_skip()?;
                    } else if key.is("text") {
                        s.text = r.string_or_skip()?;
                    } else if key.is("name") {
                        s.name = r.string_or_skip()?;
                    } else {
                        r.skip()?;
                    }
                    Ok(())
                })?;
                segments.push(s);
                Ok(())
            })?;
            Content::Segments(segments)
        }
        _ => {
            r.skip()?;
            Content::Other
        }
    })
}
