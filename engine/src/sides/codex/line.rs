//! The fields Codex's rules read off a rollout line, and nothing else: every other value is checked and skipped. A field
//! reads as JavaScript's property access on the parsed line reads it — a value of another kind than a rule takes is
//! undefined to it, and of a repeated key the last value counts, as `JSON.parse` keeps it.

use crate::json::{self, Kind, Read, Reader, Str, record};

/// One line, read
#[derive(Default)]
pub(super) struct Line<'a> {
    pub(super) timestamp: Option<Str<'a>>,
    pub(super) kind: Option<Str<'a>>,
    pub(super) payload: Payload<'a>,
}

/// The line's `payload`, as a record: empty when it is no object
#[derive(Default)]
pub(super) struct Payload<'a> {
    pub(super) kind: Option<Str<'a>>,
    /// A turn context's model
    pub(super) model: Option<Str<'a>>,
    /// A usage record's response id
    pub(super) response_id: Option<Str<'a>>,
    /// A usage record's own usage
    pub(super) usage: Tokens,
    /// A usage event's figures
    pub(super) info: Info<'a>,
    /// A legacy user message's text
    pub(super) message: Option<Str<'a>>,
    /// A completed item, which a paginated rollout writes a user message as
    pub(super) item: Item<'a>,
    /// A call's name
    pub(super) name: Option<Str<'a>>,
}

/// A usage figure's fields, `num()` of each, with the value's truthiness: a value that is no object reads as zeros
#[derive(Default, Clone, Copy)]
pub(super) struct Tokens {
    pub(super) truthy: bool,
    pub(super) input: f64,
    pub(super) cached: f64,
    pub(super) output: f64,
    pub(super) total: f64,
}

/// A usage event's `info`, as a record
#[derive(Default)]
pub(super) struct Info<'a> {
    pub(super) last: Tokens,
    pub(super) total: Tokens,
    /// `total_token_usage` as the line writes it, whatever kind of value it is: the running total a later event is
    /// measured against, kept with the parse state as `JSON.parse` gives it
    pub(super) total_text: Option<&'a str>,
}

/// A completed item, as a record
#[derive(Default)]
pub(super) struct Item<'a> {
    pub(super) kind: Option<Str<'a>>,
    /// The `text` strings of `content`'s elements, in order; None when `content` is no array
    pub(super) texts: Option<Vec<Str<'a>>>,
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
    record(r, |key, r| {
        if key.is("type") {
            p.kind = r.string_or_skip()?;
        } else if key.is("model") {
            p.model = r.string_or_skip()?;
        } else if key.is("response_id") {
            p.response_id = r.string_or_skip()?;
        } else if key.is("usage") {
            p.usage = tokens(r)?;
        } else if key.is("info") {
            p.info = info(r)?;
        } else if key.is("message") {
            p.message = r.string_or_skip()?;
        } else if key.is("item") {
            p.item = item(r)?;
        } else if key.is("name") {
            p.name = r.string_or_skip()?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(p)
}

fn tokens(r: &mut Reader<'_>) -> Read<Tokens> {
    if r.kind()? != Kind::Object {
        return Ok(Tokens { truthy: r.truthy()?, ..Tokens::default() });
    }
    let mut t = Tokens { truthy: true, ..Tokens::default() };
    r.members(|key, r| {
        if key.is("input_tokens") {
            t.input = json::finite_or_zero(r)?;
        } else if key.is("cached_input_tokens") {
            t.cached = json::finite_or_zero(r)?;
        } else if key.is("output_tokens") {
            t.output = json::finite_or_zero(r)?;
        } else if key.is("total_tokens") {
            t.total = json::finite_or_zero(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(t)
}

fn info<'a>(r: &mut Reader<'a>) -> Read<Info<'a>> {
    let mut i = Info::default();
    record(r, |key, r| {
        if key.is("last_token_usage") {
            i.last = tokens(r)?;
        } else if key.is("total_token_usage") {
            // Read twice: once for its fields, once for its text; the second pass costs a running total's few bytes
            let text = r.raw()?;
            let mut again = Reader::new(text);
            i.total = tokens(&mut again)?;
            i.total_text = Some(text);
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(i)
}

fn item<'a>(r: &mut Reader<'a>) -> Read<Item<'a>> {
    let mut it = Item::default();
    record(r, |key, r| {
        if key.is("type") {
            it.kind = r.string_or_skip()?;
        } else if key.is("content") {
            it.texts = if r.kind()? == Kind::Array {
                let mut texts = Vec::new();
                r.elements(|r| {
                    // `asRecord(s)?.['text']`, kept when a string; the last `text` of an element counts
                    let mut text = None;
                    record(r, |key, r| {
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
                Some(texts)
            } else {
                r.skip()?;
                None
            };
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(it)
}
