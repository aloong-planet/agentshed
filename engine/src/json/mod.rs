//! A line read by the grammar of ECMAScript's `JSON.parse` and with its results, a value built only where a rule reads
//! it (token-stats, Implementation Decisions, The engine module).
//!
//! The whole line is checked, every value a rule skips included: `JSON.parse` refuses a line for a fault anywhere in
//! it, and such a line is a bad line (A8). So a side reads a line in one pass, keeping what its rules read, and uses
//! none of it unless the pass reaches the line's end. Where the reading follows `JSON.parse`'s results:
//! - text: a line is UTF-8 decoded with U+FFFD for an invalid sequence before it gets here, and a string's escapes
//!   decode to UTF-16 code units, so a lone surrogate escape stays that code unit (`Str::units`);
//! - numbers: correctly rounded to the nearest double, and a number beyond the double range is infinite (`number`);
//! - a repeated key: the reader hands each member to the side in order, and the side keeps the last value it is given;
//! - nesting: no depth limit, as V8's parser has none short of memory (`skip`, which keeps its own stack).
//!
//! Whitespace between tokens is the four `JSON.parse` allows: tab, line feed, carriage return and space.

use crate::text::{JsString, Units};

mod stringify;
pub(crate) use stringify::{Gap, stringify};

/// The line is not JSON: `JSON.parse` would throw on it
#[derive(Debug)]
pub(crate) struct Bad;

pub(crate) type Read<T> = Result<T, Bad>;

/// A string as the line writes it, checked against the grammar: what lies between its quotes
#[derive(Clone, Copy, Debug)]
pub(crate) struct Str<'a> {
    raw: &'a [u8],
    escaped: bool,
}

impl<'a> Str<'a> {
    /// Whether the string is `literal`
    pub(crate) fn is(&self, literal: &str) -> bool {
        if !self.escaped {
            return self.raw == literal.as_bytes();
        }
        self.units().iter().copied().eq(literal.encode_utf16())
    }

    /// Whether the string is empty
    pub(crate) fn is_empty(&self) -> bool {
        self.raw.is_empty()
    }

    /// The string's text when the line writes it with no escape: valid UTF-8 holding no quote, backslash or control
    /// character
    pub(crate) fn plain(&self) -> Option<&'a [u8]> {
        (!self.escaped).then_some(self.raw)
    }

    /// How many bytes the line writes the string in
    pub(crate) fn written_len(&self) -> usize {
        self.raw.len()
    }

    /// Whether the string is well formed, holding no lone surrogate, so that UTF-8 has a form of it: false only when an
    /// escape writes a surrogate that no escape of its partner follows or precedes
    pub(crate) fn is_well_formed(&self) -> bool {
        if !self.escaped {
            return true;
        }
        let mut i = 0;
        while let Some(at) = memchr::memchr(b'\\', &self.raw[i..]) {
            i += at;
            if self.raw[i + 1] != b'u' {
                i += 2;
                continue;
            }
            match escaped_unit(&self.raw[i + 2..i + 6]) {
                0xd800..=0xdbff => match self.raw.get(i + 6..i + 12) {
                    Some([b'\\', b'u', hex @ ..]) if (0xdc00..=0xdfff).contains(&escaped_unit(hex)) => i += 12,
                    _ => return false,
                },
                0xdc00..=0xdfff => return false,
                _ => i += 6,
            }
        }
        true
    }

    /// Where the string lies in `line`, the text it was read from
    pub(crate) fn span(&self, line: &str) -> Span {
        let start = self.raw.as_ptr() as usize - line.as_ptr() as usize;
        Span { start, end: start + self.raw.len(), escaped: self.escaped }
    }

    /// The string's code units, its escapes decoded
    pub(crate) fn units(&self) -> Units {
        if !self.escaped {
            // The raw bytes are valid UTF-8: the line was decoded before it was read
            return String::from_utf8_lossy(self.raw).encode_utf16().collect();
        }
        let mut out = Vec::with_capacity(self.raw.len());
        let mut i = 0;
        while i < self.raw.len() {
            let c = self.raw[i];
            if c != b'\\' {
                // A run of unescaped text up to the next escape
                let end = self.raw[i..].iter().position(|&b| b == b'\\').map_or(self.raw.len(), |p| i + p);
                out.extend(String::from_utf8_lossy(&self.raw[i..end]).encode_utf16());
                i = end;
                continue;
            }
            let unit = match self.raw[i + 1] {
                b'"' => 0x22,
                b'\\' => 0x5c,
                b'/' => 0x2f,
                b'b' => 0x08,
                b'f' => 0x0c,
                b'n' => 0x0a,
                b'r' => 0x0d,
                b't' => 0x09,
                // `u`: checked as four hex digits when the string was read
                _ => {
                    let unit = escaped_unit(&self.raw[i + 2..i + 6]);
                    i += 6;
                    out.push(unit);
                    continue;
                }
            };
            out.push(unit);
            i += 2;
        }
        out
    }

    /// The string as JavaScript holds it, its escapes decoded: as UTF-8 unless an escape writes a lone surrogate
    pub(crate) fn text(&self) -> JsString {
        // The raw bytes are valid UTF-8: the line was decoded before it was read
        fn plain(raw: &[u8]) -> std::borrow::Cow<'_, str> {
            String::from_utf8_lossy(raw)
        }
        if !self.escaped {
            return JsString::Utf8(plain(self.raw).into_owned());
        }
        let mut out = String::with_capacity(self.raw.len());
        let mut i = 0;
        while i < self.raw.len() {
            if self.raw[i] != b'\\' {
                let end = self.raw[i..].iter().position(|&b| b == b'\\').map_or(self.raw.len(), |p| i + p);
                out.push_str(&plain(&self.raw[i..end]));
                i = end;
                continue;
            }
            let c = match self.raw[i + 1] {
                b'"' => '"',
                b'\\' => '\\',
                b'/' => '/',
                b'b' => '\u{8}',
                b'f' => '\u{c}',
                b'n' => '\n',
                b'r' => '\r',
                b't' => '\t',
                // `u`: checked as four hex digits when the string was read
                _ => {
                    let unit = escaped_unit(&self.raw[i + 2..i + 6]);
                    i += 6;
                    let point = match unit {
                        0xd800..=0xdbff => match self.raw.get(i..i + 6) {
                            Some([b'\\', b'u', hex @ ..]) if (0xdc00..=0xdfff).contains(&escaped_unit(hex)) => {
                                i += 6;
                                0x10000 + ((u32::from(unit) - 0xd800) << 10) + (u32::from(escaped_unit(hex)) - 0xdc00)
                            }
                            _ => return JsString::Units(self.units()),
                        },
                        0xdc00..=0xdfff => return JsString::Units(self.units()),
                        _ => u32::from(unit),
                    };
                    out.push(char::from_u32(point).expect("a code point outside the surrogates"));
                    continue;
                }
            };
            out.push(c);
            i += 2;
        }
        JsString::Utf8(out)
    }
}

/// The number a number's text, checked against the grammar, gives `JSON.parse`: the nearest double, infinite beyond the
/// double range
pub(crate) fn number_value(text: &[u8]) -> Read<f64> {
    // An integer of up to 15 digits is exact as a double, and is most of what a line holds
    if text.len() <= 15 && text.iter().all(u8::is_ascii_digit) {
        return Ok(text.iter().fold(0u64, |v, &d| v * 10 + u64::from(d - b'0')) as f64);
    }
    // Rust's parse rounds correctly and gives an infinity beyond the range, as ECMA-262's StringToNumber does
    let s = std::str::from_utf8(text).map_err(|_| Bad)?;
    s.parse::<f64>().map_err(|_| Bad)
}

/// Where a string lies in the line it was read from: what lies between its quotes, and whether an escape is among it
#[derive(Clone, Copy)]
pub(crate) struct Span {
    start: usize,
    end: usize,
    escaped: bool,
}

/// The well formed string at `span` of `line`, made in the line's own buffer, which then holds nothing else: its text
/// moved to the buffer's start, each escape decoded where it is written, and the room past it given back. A string's
/// decoded text is never longer than the escapes and text that write it, so the text written never overtakes what is
/// still to be read. No allocation is made for it, but when the allocator moves the buffer to give room back.
pub(crate) fn take(line: String, span: Span) -> String {
    let mut bytes = line.into_bytes();
    let Span { start, end, escaped } = span;
    let mut w = 0;
    let mut r = start;
    while r < end {
        if !escaped || bytes[r] != b'\\' {
            let run = if escaped { memchr::memchr(b'\\', &bytes[r..end]).map_or(end, |p| r + p) } else { end };
            bytes.copy_within(r..run, w);
            w += run - r;
            r = run;
            continue;
        }
        let (c, written) = match bytes[r + 1] {
            b'"' => ('"', 2),
            b'\\' => ('\\', 2),
            b'/' => ('/', 2),
            b'b' => ('\u{8}', 2),
            b'f' => ('\u{c}', 2),
            b'n' => ('\n', 2),
            b'r' => ('\r', 2),
            b't' => ('\t', 2),
            _ => {
                let unit = escaped_unit(&bytes[r + 2..r + 6]);
                if (0xd800..=0xdbff).contains(&unit) {
                    // Well formed: the escape of its partner follows
                    let low = escaped_unit(&bytes[r + 8..r + 12]);
                    let point = 0x10000 + ((u32::from(unit) - 0xd800) << 10) + (u32::from(low).wrapping_sub(0xdc00) & 0x3ff);
                    (char::from_u32(point).unwrap_or('\u{fffd}'), 12)
                } else {
                    (char::from_u32(u32::from(unit)).unwrap_or('\u{fffd}'), 6)
                }
            }
        };
        let mut buf = [0; 4];
        let text = c.encode_utf8(&mut buf).as_bytes();
        bytes[w..w + text.len()].copy_from_slice(text);
        w += text.len();
        r += written;
    }
    bytes.truncate(w);
    bytes.shrink_to_fit();
    String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

/// The code unit a `\u` escape's four hex digits write, checked when the string was read
fn escaped_unit(hex: &[u8]) -> u16 {
    hex.iter().fold(0u16, |v, &h| v * 16 + u16::from(hex_value(h).unwrap_or(0)))
}

fn hex_value(h: u8) -> Option<u8> {
    match h {
        b'0'..=b'9' => Some(h - b'0'),
        b'a'..=b'f' => Some(h - b'a' + 10),
        b'A'..=b'F' => Some(h - b'A' + 10),
        _ => None,
    }
}

/// What a value is, as far as a rule asks of it before reading it
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Kind {
    Object,
    Array,
    String,
    Number,
    True,
    False,
    Null,
}

/// A cursor over one line's text
pub(crate) struct Reader<'a> {
    text: &'a [u8],
    at: usize,
    /// The open containers of the value `skip` is in, kept between calls so a line reuses one allocation
    open: Vec<u8>,
}

/// Bytes a string's fast scan stops at: a quote, a backslash, or a control character (which `JSON.parse` refuses inside
/// a string)
const fn special() -> [bool; 256] {
    let mut t = [false; 256];
    let mut i = 0;
    while i < 0x20 {
        t[i] = true;
        i += 1;
    }
    t[b'"' as usize] = true;
    t[b'\\' as usize] = true;
    t
}
const SPECIAL: [bool; 256] = special();

/// A byte's value in each of a word's eight bytes, and each byte's top bit
const EACH: u64 = 0x0101_0101_0101_0101;
const TOP: u64 = 0x8080_8080_8080_8080;

/// A string's fast scan: where the plain text that starts at `at` ends, at the first byte of `SPECIAL` or at the
/// text's end. It looks at eight bytes at a time, one word, and at the bytes short of a word one by one. In a word, a
/// byte below 0x20 and a byte equal to the quote or the backslash (one below 0x01 once the word is XORed with it) each
/// set their top bit in `(w - n) & !w & TOP`; a borrow can also set a top bit in a byte above one of them, never below,
/// so the lowest bit set marks the first such byte exactly.
fn plain_end(text: &[u8], mut at: usize) -> usize {
    while let Some(word) = text.get(at..at + 8) {
        let w = u64::from_le_bytes([word[0], word[1], word[2], word[3], word[4], word[5], word[6], word[7]]);
        let quote = w ^ (EACH * u64::from(b'"'));
        let backslash = w ^ (EACH * u64::from(b'\\'));
        let found = ((w.wrapping_sub(EACH * 0x20) & !w) | (quote.wrapping_sub(EACH) & !quote) | (backslash.wrapping_sub(EACH) & !backslash)) & TOP;
        if found != 0 {
            return at + (found.trailing_zeros() / 8) as usize;
        }
        at += 8;
    }
    while let Some(&c) = text.get(at) {
        if SPECIAL[c as usize] {
            break;
        }
        at += 1;
    }
    at
}

impl<'a> Reader<'a> {
    pub(crate) fn new(text: &'a str) -> Self {
        Reader { text: text.as_bytes(), at: 0, open: Vec::new() }
    }

    fn space(&mut self) {
        while let Some(b' ' | b'\t' | b'\n' | b'\r') = self.text.get(self.at) {
            self.at += 1;
        }
    }

    /// The kind of the value that starts here, after any whitespace; Bad when no value can start here
    pub(crate) fn kind(&mut self) -> Read<Kind> {
        self.space();
        Ok(match self.text.get(self.at).ok_or(Bad)? {
            b'{' => Kind::Object,
            b'[' => Kind::Array,
            b'"' => Kind::String,
            b'-' | b'0'..=b'9' => Kind::Number,
            b't' => Kind::True,
            b'f' => Kind::False,
            b'n' => Kind::Null,
            _ => return Err(Bad),
        })
    }

    /// Checks that nothing but whitespace is left: `JSON.parse` refuses a line with anything after its value
    pub(crate) fn end(&mut self) -> Read<()> {
        self.space();
        if self.at == self.text.len() { Ok(()) } else { Err(Bad) }
    }

    fn expect(&mut self, byte: u8) -> Read<()> {
        self.space();
        if self.text.get(self.at) == Some(&byte) {
            self.at += 1;
            Ok(())
        } else {
            Err(Bad)
        }
    }

    /// The text of the value that starts here, checked and skipped
    pub(crate) fn raw(&mut self) -> Read<&'a str> {
        self.space();
        let from = self.at;
        self.skip()?;
        // Between two token boundaries of valid UTF-8 text
        Ok(std::str::from_utf8(&self.text[from..self.at]).map_err(|_| Bad)?)
    }

    /// An object's members, in order: `member` is given each key with the reader at its value, and reads the value or
    /// skips it. The value here must be an object.
    pub(crate) fn members(&mut self, mut member: impl FnMut(Str<'a>, &mut Self) -> Read<()>) -> Read<()> {
        self.expect(b'{')?;
        self.space();
        if self.text.get(self.at) == Some(&b'}') {
            self.at += 1;
            return Ok(());
        }
        loop {
            self.space();
            let key = self.string()?;
            self.expect(b':')?;
            member(key, self)?;
            self.space();
            match self.text.get(self.at) {
                Some(b',') => self.at += 1,
                Some(b'}') => {
                    self.at += 1;
                    return Ok(());
                }
                _ => return Err(Bad),
            }
        }
    }

    /// An array's elements, in order: `element` is given the reader at each one, and reads it or skips it. The value
    /// here must be an array.
    pub(crate) fn elements(&mut self, mut element: impl FnMut(&mut Self) -> Read<()>) -> Read<()> {
        self.expect(b'[')?;
        self.space();
        if self.text.get(self.at) == Some(&b']') {
            self.at += 1;
            return Ok(());
        }
        loop {
            element(self)?;
            self.space();
            match self.text.get(self.at) {
                Some(b',') => self.at += 1,
                Some(b']') => {
                    self.at += 1;
                    return Ok(());
                }
                _ => return Err(Bad),
            }
        }
    }

    /// A string; the value here must be one
    pub(crate) fn string(&mut self) -> Read<Str<'a>> {
        self.expect(b'"')?;
        let from = self.at;
        let mut escaped = false;
        loop {
            self.at = plain_end(self.text, self.at);
            match self.text.get(self.at) {
                Some(b'"') => {
                    let raw = &self.text[from..self.at];
                    self.at += 1;
                    return Ok(Str { raw, escaped });
                }
                Some(b'\\') => {
                    escaped = true;
                    match self.text.get(self.at + 1) {
                        Some(b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't') => self.at += 2,
                        Some(b'u') => {
                            let hex = self.text.get(self.at + 2..self.at + 6).ok_or(Bad)?;
                            if !hex.iter().all(|&h| hex_value(h).is_some()) {
                                return Err(Bad);
                            }
                            self.at += 6;
                        }
                        _ => return Err(Bad),
                    }
                }
                // A control character, or the line's end before the closing quote
                _ => return Err(Bad),
            }
        }
    }

    /// A number's text, checked against the grammar: `-? (0 | [1-9][0-9]*) (. [0-9]+)? ([eE] [+-]? [0-9]+)?`
    fn number_text(&mut self) -> Read<&'a [u8]> {
        self.space();
        let from = self.at;
        let digits = |r: &mut Self| -> usize {
            let start = r.at;
            while let Some(b'0'..=b'9') = r.text.get(r.at) {
                r.at += 1;
            }
            r.at - start
        };
        if self.text.get(self.at) == Some(&b'-') {
            self.at += 1;
        }
        match self.text.get(self.at) {
            Some(b'0') => self.at += 1,
            Some(b'1'..=b'9') => {
                digits(self);
            }
            _ => return Err(Bad),
        }
        if self.text.get(self.at) == Some(&b'.') {
            self.at += 1;
            if digits(self) == 0 {
                return Err(Bad);
            }
        }
        if let Some(b'e' | b'E') = self.text.get(self.at) {
            self.at += 1;
            if let Some(b'+' | b'-') = self.text.get(self.at) {
                self.at += 1;
            }
            if digits(self) == 0 {
                return Err(Bad);
            }
        }
        Ok(&self.text[from..self.at])
    }

    /// A number, as `JSON.parse` gives it: the nearest double, infinite beyond the double range; the value here must be
    /// one
    pub(crate) fn number(&mut self) -> Read<f64> {
        number_value(self.number_text()?)
    }

    fn literal(&mut self, word: &[u8]) -> Read<()> {
        self.space();
        if self.text.get(self.at..self.at + word.len()) == Some(word) {
            self.at += word.len();
            Ok(())
        } else {
            Err(Bad)
        }
    }

    /// Checks the value that starts here and moves past it, building nothing
    pub(crate) fn skip(&mut self) -> Read<()> {
        let base = self.open.len();
        loop {
            // A value
            match self.kind()? {
                Kind::Object => {
                    self.at += 1;
                    self.space();
                    if self.text.get(self.at) == Some(&b'}') {
                        self.at += 1;
                    } else {
                        self.open.push(b'{');
                        self.string()?;
                        self.expect(b':')?;
                        continue;
                    }
                }
                Kind::Array => {
                    self.at += 1;
                    self.space();
                    if self.text.get(self.at) == Some(&b']') {
                        self.at += 1;
                    } else {
                        self.open.push(b'[');
                        continue;
                    }
                }
                Kind::String => {
                    self.string()?;
                }
                Kind::Number => {
                    self.number_text()?;
                }
                Kind::True => self.literal(b"true")?,
                Kind::False => self.literal(b"false")?,
                Kind::Null => self.literal(b"null")?,
            }
            // After a value: close what it ends, or move to the next member or element
            loop {
                if self.open.len() == base {
                    return Ok(());
                }
                let top = self.open[self.open.len() - 1];
                self.space();
                match (self.text.get(self.at), top) {
                    (Some(b','), b'{') => {
                        self.at += 1;
                        self.space();
                        self.string()?;
                        self.expect(b':')?;
                        break;
                    }
                    (Some(b','), _) => {
                        self.at += 1;
                        break;
                    }
                    (Some(b'}'), b'{') | (Some(b']'), b'[') => {
                        self.at += 1;
                        self.open.pop();
                    }
                    _ => {
                        self.open.truncate(base);
                        return Err(Bad);
                    }
                }
            }
        }
    }

    /// A string, or None when the value here is of another kind (`typeof v === 'string' ? v : undefined`)
    pub(crate) fn string_or_skip(&mut self) -> Read<Option<Str<'a>>> {
        if self.kind()? == Kind::String {
            return self.string().map(Some);
        }
        self.skip().map(|_| None)
    }

    /// The value's JavaScript truthiness, for a value a rule only tests (`if (!v)`): false, null, 0 and the empty string
    /// are falsy, and so is a number that rounds to zero
    pub(crate) fn truthy(&mut self) -> Read<bool> {
        Ok(match self.kind()? {
            Kind::String => !self.string()?.is_empty(),
            Kind::Number => self.number()? != 0.0,
            Kind::False | Kind::Null => {
                self.skip()?;
                false
            }
            Kind::True | Kind::Object | Kind::Array => {
                self.skip()?;
                true
            }
        })
    }
}

/// What `events` meets in a value, in the order the text writes it
pub(crate) enum Event<'a> {
    /// An object opens; its members follow, each a `Key` and the key's value, then `Close`
    Object,
    /// An array opens; its elements follow, then `Close`
    Array,
    Key(Str<'a>),
    /// The innermost open object or array closes
    Close,
    String(Str<'a>),
    /// A number, `true`, `false` or `null`: its text
    Scalar(&'a [u8]),
}

impl<'a> Reader<'a> {
    /// Checks the value that starts here and moves past it, as `skip` does, handing `on` each thing it meets: a
    /// value of any depth is read with no stack but `open`'s, as `skip` reads one
    pub(crate) fn events(&mut self, mut on: impl FnMut(Event<'a>)) -> Read<()> {
        let base = self.open.len();
        loop {
            // A value
            match self.kind()? {
                Kind::Object => {
                    self.at += 1;
                    on(Event::Object);
                    self.space();
                    if self.text.get(self.at) == Some(&b'}') {
                        self.at += 1;
                        on(Event::Close);
                    } else {
                        self.open.push(b'{');
                        let key = self.string()?;
                        self.expect(b':')?;
                        on(Event::Key(key));
                        continue;
                    }
                }
                Kind::Array => {
                    self.at += 1;
                    on(Event::Array);
                    self.space();
                    if self.text.get(self.at) == Some(&b']') {
                        self.at += 1;
                        on(Event::Close);
                    } else {
                        self.open.push(b'[');
                        continue;
                    }
                }
                Kind::String => on(Event::String(self.string()?)),
                Kind::Number => on(Event::Scalar(self.number_text()?)),
                Kind::True => {
                    self.literal(b"true")?;
                    on(Event::Scalar(b"true"));
                }
                Kind::False => {
                    self.literal(b"false")?;
                    on(Event::Scalar(b"false"));
                }
                Kind::Null => {
                    self.literal(b"null")?;
                    on(Event::Scalar(b"null"));
                }
            }
            // After a value: close what it ends, or move to the next member or element
            loop {
                if self.open.len() == base {
                    return Ok(());
                }
                let top = self.open[self.open.len() - 1];
                self.space();
                match (self.text.get(self.at), top) {
                    (Some(b','), b'{') => {
                        self.at += 1;
                        self.space();
                        let key = self.string()?;
                        self.expect(b':')?;
                        on(Event::Key(key));
                        break;
                    }
                    (Some(b','), _) => {
                        self.at += 1;
                        break;
                    }
                    (Some(b'}'), b'{') | (Some(b']'), b'[') => {
                        self.at += 1;
                        self.open.pop();
                        on(Event::Close);
                    }
                    _ => {
                        self.open.truncate(base);
                        return Err(Bad);
                    }
                }
            }
        }
    }
}

/// A value as a rule that asks its type reads it (`typeof v`, `v === null`): an object or an array is checked and skipped
#[derive(Clone, Copy, Debug)]
pub(crate) enum Value<'a> {
    Null,
    Bool(bool),
    Number(f64),
    String(Str<'a>),
    /// An object or an array
    Container,
}

impl<'a> Reader<'a> {
    /// The value here, as `Value` reads it
    pub(crate) fn value(&mut self) -> Read<Value<'a>> {
        Ok(match self.kind()? {
            Kind::Null => {
                self.literal(b"null")?;
                Value::Null
            }
            Kind::True => {
                self.literal(b"true")?;
                Value::Bool(true)
            }
            Kind::False => {
                self.literal(b"false")?;
                Value::Bool(false)
            }
            Kind::Number => Value::Number(self.number()?),
            Kind::String => Value::String(self.string()?),
            Kind::Object | Kind::Array => {
                self.skip()?;
                Value::Container
            }
        })
    }
}

/// The list here, when it is a list of rows of one tuple type, each row given to `row`: as many elements as `shape` has
/// letters, each of the type its letter names — `n` a number, `N` a number or null, `S` a string or null (`isRows` in
/// `src/main/providers/token-stats.ts`, rule for rule). None when it is not one; the value is read through either way.
pub(crate) fn rows<'a, T>(r: &mut Reader<'a>, shape: &str, mut row: impl FnMut(&[Value<'a>]) -> T) -> Read<Option<Vec<T>>> {
    if r.kind()? != Kind::Array {
        r.skip()?;
        return Ok(None);
    }
    let shape = shape.as_bytes();
    let mut out = Some(Vec::new());
    let mut cells = Vec::with_capacity(shape.len());
    r.elements(|r| {
        if out.is_none() || r.kind()? != Kind::Array {
            out = None;
            return r.skip();
        }
        cells.clear();
        r.elements(|r| {
            cells.push(r.value()?);
            Ok(())
        })?;
        let fits = cells.len() == shape.len()
            && cells.iter().zip(shape).all(|(cell, &letter)| match cell {
                Value::Null => letter != b'n',
                Value::Number(_) => letter != b'S',
                Value::String(_) => letter == b'S',
                Value::Bool(_) | Value::Container => false,
            });
        match &mut out {
            Some(rows) if fits => rows.push(row(&cells)),
            _ => out = None,
        }
        Ok(())
    })?;
    Ok(out)
}

/// A cell `rows` checked as a number
pub(crate) fn cell_number(cell: &Value<'_>) -> f64 {
    if let Value::Number(x) = cell { *x } else { f64::NAN }
}

/// A cell `rows` checked as a number or null
pub(crate) fn cell_number_or_null(cell: &Value<'_>) -> Option<f64> {
    if let Value::Number(x) = cell { Some(*x) } else { None }
}

/// A cell `rows` checked as a string or null
pub(crate) fn cell_text(cell: &Value<'_>) -> Option<Units> {
    if let Value::String(s) = cell { Some(s.units()) } else { None }
}

/// What a line holds, as the parse takes it: `typeof` of the value `JSON.parse` gives
pub(crate) enum Line<T> {
    /// An object: what the side read off it
    Object(T),
    /// An array, which is an object to `typeof`: the line counts as one that parsed, and has none of an object's fields
    Array,
    /// A string, a number, a boolean or null: not a line the parse is given
    Other,
}

/// The line, read: `object` reads an object's members, and every other value is checked and skipped. Bad when
/// `JSON.parse` would refuse the line.
pub(crate) fn line<'a, T>(text: &'a str, object: impl FnOnce(&mut Reader<'a>) -> Read<T>) -> Read<Line<T>> {
    let mut r = Reader::new(text);
    let read = match r.kind()? {
        Kind::Object => Line::Object(object(&mut r)?),
        Kind::Array => {
            r.skip()?;
            Line::Array
        }
        _ => {
            r.skip()?;
            Line::Other
        }
    };
    r.end()?;
    Ok(read)
}

/// `typeof v === 'number' && Number.isFinite(v) ? v : 0` over the value here
pub(crate) fn finite_or_zero(r: &mut Reader<'_>) -> Read<f64> {
    if r.kind()? == Kind::Number {
        let x = r.number()?;
        return Ok(if x.is_finite() { x } else { 0.0 });
    }
    r.skip().map(|_| 0.0)
}

/// The members of the object here, through `member`, as a rule reads a property of a value it takes for a record; a
/// value of another kind is skipped and gives none
pub(crate) fn record<'a>(r: &mut Reader<'a>, member: impl FnMut(Str<'a>, &mut Reader<'a>) -> Read<()>) -> Read<()> {
    if r.kind()? == Kind::Object { r.members(member) } else { r.skip() }
}

/// `Math.max(a, b)` over two numbers that are not NaN, as no number a line gives is: the larger, and +0 over -0
pub(crate) fn max(a: f64, b: f64) -> f64 {
    if a > b || (a == b && a.is_sign_positive()) { a } else { b }
}
