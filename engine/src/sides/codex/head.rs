//! The fields the session walk reads off a rollout's first line, its `session_meta`, and nothing else: every other value
//! is checked and skipped. A field reads as JavaScript's property access on the parsed line reads it — a value of another
//! kind than a rule takes is undefined to it, and of a repeated key the last value counts, as `JSON.parse` keeps it.

use crate::json::{self, Kind, Line, Read, Reader, Str, record};

/// The first line, read
#[derive(Default)]
pub(super) struct Head<'a> {
    pub(super) timestamp: Option<Str<'a>>,
    /// Whether `ordinal` is a number: the paginated format writes one
    pub(super) ordinal: bool,
    pub(super) payload: Payload<'a>,
}

/// The line's `payload`, as a record: empty when it is no object
#[derive(Default)]
pub(super) struct Payload<'a> {
    pub(super) cwd: Option<Str<'a>>,
    pub(super) thread_source: Option<Str<'a>>,
    pub(super) id: Option<Str<'a>>,
    pub(super) forked_from_id: Option<Str<'a>>,
    /// `source.subagent.thread_spawn.parent_thread_id`
    pub(super) spawn_parent: Option<Str<'a>>,
}

/// The first line, read; None when it holds no object (an array, a string, a number, a boolean or null), and Bad when
/// `JSON.parse` would refuse it
pub(super) fn read(text: &str) -> Read<Option<Head<'_>>> {
    let line = json::line(text, |r| {
        let mut head = Head::default();
        r.members(|key, r| {
            if key.is("timestamp") {
                head.timestamp = r.string_or_skip()?;
            } else if key.is("ordinal") {
                head.ordinal = r.kind()? == Kind::Number;
                r.skip()?;
            } else if key.is("payload") {
                head.payload = payload(r)?;
            } else {
                r.skip()?;
            }
            Ok(())
        })?;
        Ok(head)
    })?;
    Ok(match line {
        Line::Object(head) => Some(head),
        Line::Array | Line::Other => None,
    })
}

fn payload<'a>(r: &mut Reader<'a>) -> Read<Payload<'a>> {
    let mut p = Payload::default();
    record(r, |key, r| {
        if key.is("cwd") {
            p.cwd = r.string_or_skip()?;
        } else if key.is("thread_source") {
            p.thread_source = r.string_or_skip()?;
        } else if key.is("id") {
            p.id = r.string_or_skip()?;
        } else if key.is("forked_from_id") {
            p.forked_from_id = r.string_or_skip()?;
        } else if key.is("source") {
            p.spawn_parent = member(r, "subagent", |r| member(r, "thread_spawn", |r| member(r, "parent_thread_id", Reader::string_or_skip)))?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(p)
}

/// `value?.[key]`, read by `read`, of the value here: None when it is no object or has no such member
fn member<'a, T>(r: &mut Reader<'a>, key: &str, mut read: impl FnMut(&mut Reader<'a>) -> Read<Option<T>>) -> Read<Option<T>> {
    let mut found = None;
    record(r, |k, r| {
        if k.is(key) {
            found = read(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    Ok(found)
}
