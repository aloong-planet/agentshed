//! The snippet a turn's first body hit shows: the first string in the JSON value of the hit's line that holds the
//! needle, cut to 20 code units before it and 60 after, as `extractSnippet` in search-sessions.ts cut it before #479,
//! quirk for quirk. The line is decoded as `Buffer.toString('utf8')` decodes it, each invalid sequence becoming
//! U+FFFD, and read by `JSON.parse`'s grammar: a line it would refuse gives no snippet. The strings are visited in the
//! order that function's walk visited them: an array's elements in order, an object's values in `Object.values`'
//! order, its array-index keys ascending and then its other keys in the order first written, a repeated key holding its
//! first place with its last value. A string holds the needle when its `toLowerCase()` holds the needle's; the cut is
//! made in the string itself at the offset found in the lowered one, and as long as the needle as typed, so a string
//! that lowers to another length is cut where those offsets land in it.

use std::collections::HashMap;

use crate::json::{Event, Reader};
use crate::text::{self, Units};

/// The snippet of a hit in `line`, the bytes of the line it falls in, for `needle`, the needle as typed
pub(super) fn snippet(line: &[u8], needle: &[u16]) -> Option<Units> {
    let text = text::line_text(line);
    let lowered = text::to_lower_case(needle);
    let mut walk = Walk { needle: &lowered, typed: needle.len(), open: Vec::new(), settled: 0, root: None };
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
    typed: usize,
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
                let found = if self.settled > 0 { None } else { cut(&s.units(), self.needle, self.typed) };
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

/// The snippet of `v` when its lowered text holds `needle`, the lowered needle, whose typed length is `typed`: 20 code
/// units before the offset found and `typed` + 60 from it, with an ellipsis on each side cut
fn cut(v: &[u16], needle: &[u16], typed: usize) -> Option<Units> {
    let idx = text::find(&text::to_lower_case(v), needle, 0)?;
    let from = idx.saturating_sub(20);
    let to = v.len().min(idx + typed + 60);
    let start = from.min(v.len());
    let mut out = Vec::with_capacity(to.saturating_sub(start) + 2);
    if from > 0 {
        out.push(0x2026);
    }
    if start < to {
        out.extend_from_slice(&v[start..to]);
    }
    if to < v.len() {
        out.push(0x2026);
    }
    Some(out)
}
