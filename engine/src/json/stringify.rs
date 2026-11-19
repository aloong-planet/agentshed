//! The text `JSON.stringify` gives of the value a line holds, as `JSON.parse` built it, with or without an indent: what
//! a rule that shows a value as JSON shows.
//!
//! Where the text follows V8's results rather than the source's: an object's members are its own keys in the engine's
//! order, the array index keys (`0`, and `[1-9][0-9]*` up to 2^32 - 2) first in ascending order and every other key in
//! the order the line first writes it, and a key the line repeats is a member once, at its first place, with its last
//! value, as `JSON.parse` keeps it; a number is written as Number::toString writes the double `JSON.parse` gives, one
//! beyond the double range as `null`; a string by QuoteJSONString. The value is built and written with stacks of their
//! own, so that a value of any depth is read as the reader reads one (`Reader::events`). V8 itself throws a RangeError
//! on a value nested some thousands deep; nothing a line holds nests near that.

use std::collections::HashMap;

use super::{Event, Read, Reader, Str, number_value};
use crate::display::{write_number, write_string};
use crate::text::JsString;

/// How the text is laid out: on one line, or indented by two spaces a level (`JSON.stringify(value, null, 2)`)
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Gap {
    None,
    Two,
}

/// A value of the line, as `JSON.parse` builds it; a container's members are other nodes, by their place in the arena
enum Node<'a> {
    /// A number, `true`, `false` or `null`: its text
    Scalar(&'a [u8]),
    String(Str<'a>),
    Array(Vec<usize>),
    Object(Vec<(Str<'a>, usize)>),
}

/// The value that starts here, read and moved past, as `JSON.stringify` writes it with `gap`
pub(crate) fn stringify<'a>(r: &mut Reader<'a>, gap: Gap) -> Read<String> {
    let mut nodes: Vec<Node<'a>> = Vec::new();
    // The open containers, innermost last, and the key the next member of an object takes
    let mut open: Vec<usize> = Vec::new();
    let mut key: Option<Str<'a>> = None;
    r.events(|event| {
        let node = match event {
            Event::Key(k) => {
                key = Some(k);
                return;
            }
            Event::Close => {
                if let Some(at) = open.pop() {
                    if let Node::Object(members) = &mut nodes[at] {
                        *members = engine_order(std::mem::take(members));
                    }
                }
                return;
            }
            Event::Object => Node::Object(Vec::new()),
            Event::Array => Node::Array(Vec::new()),
            Event::String(s) => Node::String(s),
            Event::Scalar(text) => Node::Scalar(text),
        };
        let at = nodes.len();
        let container = matches!(node, Node::Object(_) | Node::Array(_));
        nodes.push(node);
        if let Some(&parent) = open.last() {
            match &mut nodes[parent] {
                Node::Array(items) => items.push(at),
                Node::Object(members) => {
                    if let Some(k) = key.take() {
                        members.push((k, at));
                    }
                }
                Node::Scalar(_) | Node::String(_) => {}
            }
        }
        if container {
            open.push(at);
        }
    })?;
    let mut out = Vec::new();
    write(&nodes, gap, &mut out)?;
    // What the writer writes is UTF-8: the line's text and the escapes QuoteJSONString writes
    Ok(String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned()))
}

/// An object's members in the order the line writes them → its own keys as V8 holds them: each key once, at its first
/// place, with its last value; then the array index keys first, ascending, the others after them as they were
fn engine_order<'a>(members: Vec<(Str<'a>, usize)>) -> Vec<(Str<'a>, usize)> {
    let mut kept: Vec<(Str<'a>, usize)> = Vec::with_capacity(members.len());
    let mut first: HashMap<JsString, usize> = HashMap::new();
    for (key, value) in members {
        match first.entry(key.text()) {
            std::collections::hash_map::Entry::Occupied(at) => kept[*at.get()].1 = value,
            std::collections::hash_map::Entry::Vacant(slot) => {
                slot.insert(kept.len());
                kept.push((key, value));
            }
        }
    }
    let (mut indexed, named): (Vec<_>, Vec<_>) = kept.into_iter().map(|m| (array_index(&m.0), m)).partition(|(index, _)| index.is_some());
    indexed.sort_by_key(|(index, _)| *index);
    indexed.into_iter().chain(named).map(|(_, m)| m).collect()
}

/// The array index a key names (ECMA-262's CanonicalNumericIndexString below 2^32 - 1), when it names one
fn array_index(key: &Str<'_>) -> Option<u32> {
    let JsString::Utf8(text) = key.text() else { return None };
    let digits = text.as_bytes();
    if digits.is_empty() || digits.len() > 10 || !digits.iter().all(u8::is_ascii_digit) || (digits[0] == b'0' && digits.len() > 1) {
        return None;
    }
    let n: u64 = text.parse().ok()?;
    (n <= 4_294_967_294).then_some(n as u32)
}

/// The arena's first node, written with `gap`, one container's members after another, with a stack of its own
fn write(nodes: &[Node<'_>], gap: Gap, out: &mut Vec<u8>) -> Read<()> {
    let Some(root) = nodes.first() else { return Ok(()) };
    // Each open container, innermost last, and how many of its members are written
    let mut stack: Vec<(&Node<'_>, usize)> = Vec::new();
    let mut next = Some(root);
    loop {
        if let Some(node) = next.take() {
            match node {
                Node::Scalar(text) if text.first().is_some_and(|b| *b == b'-' || b.is_ascii_digit()) => write_number(out, number_value(text)?),
                Node::Scalar(text) => out.extend_from_slice(text),
                Node::String(s) => write_str(out, s),
                Node::Array(items) if items.is_empty() => out.extend_from_slice(b"[]"),
                Node::Object(members) if members.is_empty() => out.extend_from_slice(b"{}"),
                Node::Array(_) => {
                    out.push(b'[');
                    stack.push((node, 0));
                }
                Node::Object(_) => {
                    out.push(b'{');
                    stack.push((node, 0));
                }
            }
        }
        let depth = stack.len();
        let Some((container, written)) = stack.last_mut() else { return Ok(()) };
        let (len, close) = match container {
            Node::Array(items) => (items.len(), b']'),
            Node::Object(members) => (members.len(), b'}'),
            Node::Scalar(_) | Node::String(_) => (0, b' '),
        };
        if *written == len {
            stack.pop();
            new_line(out, gap, depth - 1);
            out.push(close);
            continue;
        }
        if *written > 0 {
            out.push(b',');
        }
        new_line(out, gap, depth);
        let member = match container {
            Node::Array(items) => items[*written],
            Node::Object(members) => {
                let (key, value) = &members[*written];
                write_str(out, key);
                out.push(b':');
                if gap == Gap::Two {
                    out.push(b' ');
                }
                *value
            }
            Node::Scalar(_) | Node::String(_) => 0,
        };
        *written += 1;
        next = Some(&nodes[member]);
    }
}

/// With an indent, a line feed and `depth` levels of it
fn new_line(out: &mut Vec<u8>, gap: Gap, depth: usize) {
    if gap == Gap::Two {
        out.push(b'\n');
        out.extend(std::iter::repeat_n(b' ', 2 * depth));
    }
}

/// A string as QuoteJSONString writes it. One the line writes with no escape holds no quote, backslash, control
/// character or lone surrogate, so its text is written as it is.
fn write_str(out: &mut Vec<u8>, s: &Str<'_>) {
    match s.plain() {
        Some(raw) => {
            out.push(b'"');
            out.extend_from_slice(raw);
            out.push(b'"');
        }
        None => write_string(out, &s.units()),
    }
}
