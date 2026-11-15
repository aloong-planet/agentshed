//! The fields Grok's rules read off an update stream line, and nothing else: every other value is checked and skipped.
//! A field reads as JavaScript's property access on the parsed line reads it — a value of another kind than a rule
//! takes is undefined to it, and of a repeated key the last value counts, as `JSON.parse` keeps it.

use super::entry::Figures;
use crate::json::{self, Kind, Read, Reader, Str, record};
use crate::text::Units;

/// One line, read
#[derive(Default)]
pub(super) struct Line<'a> {
    /// The top-level timestamp when it is a number: epoch seconds (measured; `params._meta` carries the same instant in
    /// milliseconds)
    pub(super) timestamp: Option<f64>,
    /// `params.update`, as a record: empty when either is no object
    pub(super) update: Update<'a>,
}

/// An update record
#[derive(Default)]
pub(super) struct Update<'a> {
    /// `sessionUpdate`, the record's type
    pub(super) kind: Option<Str<'a>>,
    /// A completed turn's usage
    pub(super) usage: Usage,
    /// A user chunk's `content.text`, when a string
    pub(super) text: Option<Str<'a>>,
    /// A user chunk's `_meta.promptIndex`, when a number: the prompt the chunk belongs to
    pub(super) prompt_index: Option<f64>,
    /// A tool call's `title`, the tool's name
    pub(super) title: Option<Str<'a>>,
}

/// A completed turn's usage
#[derive(Default)]
pub(super) struct Usage {
    /// The value's truthiness: a turn whose usage is falsy gives no event
    pub(super) truthy: bool,
    /// The usage's own figures; zeros when it is no object
    pub(super) figures: Figures,
    /// The per-model map's entries in the order `Object.entries` gives them, each its key and its figures, None for a
    /// null value; empty when the map is no object or has no member, and then the turn falls back to `figures` (F3)
    pub(super) models: Vec<(Units, Option<Figures>)>,
}

/// The line, read; Bad when `JSON.parse` would refuse it
pub(super) fn read(text: &str) -> Read<json::Line<Line<'_>>> {
    json::line(text, |r| {
        let mut line = Line::default();
        r.members(|key, r| {
            if key.is("timestamp") {
                line.timestamp = number_or_skip(r)?;
            } else if key.is("params") {
                line.update = params(r)?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(line)
    })
}

/// A number, or None when the value here is of another kind (`typeof v === 'number' ? v : undefined`)
fn number_or_skip(r: &mut Reader<'_>) -> Read<Option<f64>> {
    if r.kind()? == Kind::Number {
        return r.number().map(Some);
    }
    r.skip().map(|_| None)
}

/// `params`, of which a rule reads only `update`
fn params<'a>(r: &mut Reader<'a>) -> Read<Update<'a>> {
    let mut update = Update::default();
    record(r, |key, r| {
        if key.is("update") {
            update = self::update(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(update)
}

fn update<'a>(r: &mut Reader<'a>) -> Read<Update<'a>> {
    let mut u = Update::default();
    record(r, |key, r| {
        if key.is("sessionUpdate") {
            u.kind = r.string_or_skip()?;
        } else if key.is("usage") {
            u.usage = usage(r)?;
        } else if key.is("content") {
            // `content?.['text']`, kept when a string
            let mut text = None;
            record(r, |key, r| {
                if key.is("text") {
                    text = r.string_or_skip()?;
                } else {
                    r.skip()?;
                }
                Ok(())
            })?;
            u.text = text;
        } else if key.is("_meta") {
            let mut index = None;
            record(r, |key, r| {
                if key.is("promptIndex") {
                    index = number_or_skip(r)?;
                } else {
                    r.skip()?;
                }
                Ok(())
            })?;
            u.prompt_index = index;
        } else if key.is("title") {
            u.title = r.string_or_skip()?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(u)
}

fn usage(r: &mut Reader<'_>) -> Read<Usage> {
    if r.kind()? != Kind::Object {
        // A usage that is no object has no figures and no map: a truthy one is a turn of zeros
        return Ok(Usage { truthy: r.truthy()?, ..Usage::default() });
    }
    let mut u = Usage { truthy: true, ..Usage::default() };
    r.members(|key, r| {
        if key.is("modelUsage") {
            u.models = models(r)?;
        } else {
            figure(&mut u.figures, key, r)?;
        }
        Ok(())
    })?;
    Ok(u)
}

/// One member of a usage figure: one of the three fields read, or a value skipped
fn figure(f: &mut Figures, key: Str<'_>, r: &mut Reader<'_>) -> Read<()> {
    if key.is("inputTokens") {
        f.input = json::finite_or_zero(r)?;
    } else if key.is("cachedReadTokens") {
        f.cached = json::finite_or_zero(r)?;
    } else if key.is("outputTokens") {
        f.output = json::finite_or_zero(r)?;
    } else {
        r.skip()?;
    }
    Ok(())
}

/// A per-model map's value: its figures, zeros when it is no object, and None for null, whose property access throws
fn model_figures(r: &mut Reader<'_>) -> Read<Option<Figures>> {
    match r.kind()? {
        Kind::Null => r.skip().map(|_| None),
        Kind::Object => {
            let mut f = Figures::default();
            r.members(|key, r| figure(&mut f, key, r))?;
            Ok(Some(f))
        }
        _ => r.skip().map(|_| Some(Figures::default())),
    }
}

/// The per-model map's entries as `Object.entries` gives them: an array's by index, an object's with the keys that are
/// array indices first, in ascending order, then the others in the order they were first written, a repeated key's
/// last value at its first place (ECMA-262 OrdinaryOwnPropertyKeys; `JSON.parse` sets a repeated key again); none for
/// a value of another kind
fn models(r: &mut Reader<'_>) -> Read<Vec<(Units, Option<Figures>)>> {
    let mut entries: Vec<(Units, Option<Figures>)> = Vec::new();
    match r.kind()? {
        Kind::Array => {
            r.elements(|r| {
                let key = crate::text::units(&entries.len().to_string());
                entries.push((key, model_figures(r)?));
                Ok(())
            })?;
        }
        Kind::Object => {
            r.members(|key, r| {
                let key = key.units();
                let value = model_figures(r)?;
                match entries.iter_mut().find(|e| e.0 == key) {
                    Some(held) => held.1 = value,
                    None => entries.push((key, value)),
                }
                Ok(())
            })?;
            // Stable: the keys that are no array index keep the order they were first written
            entries.sort_by_key(|(key, _)| array_index(key).map_or((1, 0), |i| (0, i)));
        }
        _ => r.skip()?,
    }
    Ok(entries)
}

/// The array index a key names: its canonical decimal form, from 0 to 2^32 - 2
fn array_index(key: &[u16]) -> Option<u32> {
    if key.is_empty() || key.len() > 10 || (key.len() > 1 && key[0] == u16::from(b'0')) {
        return None;
    }
    let mut value: u64 = 0;
    for &u in key {
        let digit = u8::try_from(u).ok().filter(u8::is_ascii_digit)?;
        value = value * 10 + u64::from(digit - b'0');
    }
    u32::try_from(value).ok().filter(|&i| i != u32::MAX)
}
