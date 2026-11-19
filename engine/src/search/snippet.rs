//! The snippet a turn's first body hit shows (session-view D5): the first string in the JSON value of the hit's line
//! that holds the needle, the string `extractSnippet` in search-sessions.ts took before #479, cut to 20 characters
//! before the hit and 60 after the needle. The line is decoded as `Buffer.toString('utf8')` decodes it, each invalid
//! sequence becoming U+FFFD, and read by `JSON.parse`'s grammar: a line it would refuse gives no snippet. The strings
//! are visited in the order that function's walk visited them: an array's elements in order, an object's values in
//! `Object.values`' order, its array-index keys ascending and then its other keys in the order first written, a
//! repeated key holding its first place with its last value. A string holds the needle when its `toLowerCase()` holds
//! the needle's; the hit is the characters of the string whose lowercase that first match falls in, so a character
//! that lowers to another length moves neither edge of the cut, where `extractSnippet` cut the string at the offsets
//! it found in the lowered one. A character is one as `Array.from` counts it: a surrogate pair, never split, or any
//! other code unit, a lone surrogate included.

use std::collections::HashMap;

use crate::json::{Event, Reader};
use crate::text::{self, Units};

/// The snippet of a hit in `line`, the bytes of the line it falls in, for `needle`, the needle as typed
pub(super) fn snippet(line: &[u8], needle: &[u16]) -> Option<Units> {
    let text = text::line_text(line);
    let lowered = text::to_lower_case(needle);
    let mut walk = Walk { needle: &lowered, open: Vec::new(), settled: 0, root: None };
    let mut reader = Reader::new(&text);
    reader.events(|event| walk.event(event)).ok()?;
    reader.end().ok()?;
    walk.root.flatten()
}

/// An object or an array being read, and what its values found
enum Open {
    Array { found: Option<Units> },
    Object { values: Vec<(Units, Option<Units>)>, at: HashMap<Units, usize>, key: Units },
}

struct Walk<'n> {
    needle: &'n [u16],
    open: Vec<Open>,
    /// How many open arrays already hold what they found: a value inside one finds nothing that is used
    settled: usize,
    /// What the line's value found, once it is read
    root: Option<Option<Units>>,
}

impl Walk<'_> {
    fn event(&mut self, event: Event<'_>) {
        match event {
            Event::Object => self.open.push(Open::Object { values: Vec::new(), at: HashMap::new(), key: Vec::new() }),
            Event::Array => self.open.push(Open::Array { found: None }),
            Event::Key(key) => {
                if let Some(Open::Object { key: current, .. }) = self.open.last_mut() {
                    *current = key.units();
                }
            }
            Event::String(s) => {
                let found = if self.settled > 0 { None } else { cut(&s.units(), self.needle) };
                self.value(found);
            }
            Event::Scalar(_) => self.value(None),
            Event::Close => {
                let found = match self.open.pop() {
                    Some(Open::Array { found }) => {
                        if found.is_some() {
                            self.settled -= 1;
                        }
                        found
                    }
                    Some(Open::Object { values, .. }) => first_in_values_order(values),
                    None => None,
                };
                self.value(found);
            }
        }
    }

    /// A value read whole, and what it found, given to the object or array it is in
    fn value(&mut self, found: Option<Units>) {
        match self.open.last_mut() {
            None => self.root = Some(found),
            Some(Open::Array { found: held }) => {
                if held.is_none() && found.is_some() {
                    *held = found;
                    self.settled += 1;
                }
            }
            Some(Open::Object { values, at, key }) => {
                let key = std::mem::take(key);
                match at.get(&key) {
                    Some(&i) => values[i].1 = found,
                    None => {
                        at.insert(key.clone(), values.len());
                        values.push((key, found));
                    }
                }
            }
        }
    }
}

/// What an object's values found, the first in `Object.values`' order
fn first_in_values_order(values: Vec<(Units, Option<Units>)>) -> Option<Units> {
    let mut indexed: Vec<(u32, usize)> = values.iter().enumerate().filter_map(|(i, (key, _))| array_index(key).map(|n| (n, i))).collect();
    indexed.sort_unstable();
    let mut values: Vec<Option<(Units, Option<Units>)>> = values.into_iter().map(Some).collect();
    for (_, i) in indexed {
        if let Some((_, found @ Some(_))) = values[i].take() {
            return found;
        }
    }
    values.into_iter().flatten().find_map(|(_, found)| found)
}

/// The key's value as an array index, an integer below 2^32 - 1 written as `String` writes it
fn array_index(key: &[u16]) -> Option<u32> {
    if key.is_empty() || key.len() > 10 || (key.len() > 1 && key[0] == u16::from(b'0')) {
        return None;
    }
    let mut n: u64 = 0;
    for &u in key {
        if !(u16::from(b'0')..=u16::from(b'9')).contains(&u) {
            return None;
        }
        n = n * 10 + u64::from(u - u16::from(b'0'));
    }
    u32::try_from(n).ok().filter(|&n| n != u32::MAX)
}

/// The snippet of `v` when its lowered text holds `needle`, the lowered needle: 20 characters before the hit and 60
/// after it, where it stands in `v`, with an ellipsis on each side cut
fn cut(v: &[u16], needle: &[u16]) -> Option<Units> {
    let idx = text::find(&text::to_lower_case(v), needle, 0)?;
    let (start, end) = in_string(v, idx, idx + needle.len());
    let from = back(v, start, 20);
    let to = forward(v, end, 60);
    let mut out = Vec::with_capacity(to - from + 2);
    if from > 0 {
        out.push(0x2026);
    }
    out.extend_from_slice(&v[from..to]);
    if to < v.len() {
        out.push(0x2026);
    }
    Some(out)
}

/// Where the units `idx..end` of `v`'s lowered text stand in `v`: from the start of the character whose lowercase holds
/// the first of them to the end of the one whose lowercase holds the last. Each character's share of the lowered text
/// is as long as what `char::to_lowercase` gives it, a capital sigma's final form included, as both of a sigma's
/// lowercase forms are one unit long; a lone surrogate stays itself.
fn in_string(v: &[u16], idx: usize, end: usize) -> (usize, usize) {
    let (mut at, mut lowered) = (0, 0);
    let mut start = None;
    for c in char::decode_utf16(v.iter().copied()) {
        let (units, lowers_to) = match c {
            Ok(c) => (c.len_utf16(), c.to_lowercase().map(char::len_utf16).sum()),
            Err(_) => (1, 1),
        };
        lowered += lowers_to;
        if start.is_none() && lowered > idx {
            start = Some(at);
        }
        at += units;
        if let Some(start) = start.filter(|_| lowered >= end) {
            return (start, at);
        }
    }
    (start.unwrap_or(v.len()), v.len())
}

/// Whether a surrogate pair starts at `i`, a high surrogate followed by a low one: one character, as `Array.from`
/// counts one, where any other code unit is one too
fn pair_at(v: &[u16], i: usize) -> bool {
    (0xd800..0xdc00).contains(&v[i]) && v.get(i + 1).is_some_and(|u| (0xdc00..0xe000).contains(u))
}

/// The offset `n` characters before `at` in `v`, or its start
fn back(v: &[u16], mut at: usize, n: usize) -> usize {
    for _ in 0..n {
        if at == 0 {
            break;
        }
        at -= if at >= 2 && pair_at(v, at - 2) { 2 } else { 1 };
    }
    at
}

/// The offset `n` characters after `at` in `v`, or its end
fn forward(v: &[u16], mut at: usize, n: usize) -> usize {
    for _ in 0..n {
        if at >= v.len() {
            break;
        }
        at += if pair_at(v, at) { 2 } else { 1 };
    }
    at
}
