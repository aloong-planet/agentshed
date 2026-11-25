//! JSON text exactly as ECMAScript's `JSON.stringify` writes it, byte for byte, of a JavaScript value read through the
//! module's one reader of them (crate::exports::js): `JSON.stringify`'s rules for what JSON holds no form of
//! (`stringify`), then the text itself (`JsonText`), with strings as their UTF-16 code units and numbers as doubles.
//! The display copy written through it is the file a build that serialised in JavaScript would have written, so any
//! build reads it back as its own.

use napi::sys::napi_value;
use napi::{Error, Result, Status};

use crate::exports::js::{Js, Kind};

/// How deep a value may nest: far deeper than any display copy, so that a cycle fails the write, as `JSON.stringify`
/// throws on one, rather than overflowing the stack
const DEPTH: u32 = 1000;

/// The text `JSON.stringify(value)` gives, read off the value as it stands now, for what JSON holds — objects, arrays,
/// strings, numbers, booleans and null. An object member that is `undefined`, a function or a symbol is left out, and
/// such an array element is `null`; an object's members are its own enumerable string keys, in the engine's order
/// (`Object.keys`). A BigInt fails, and so does a value nesting deeper than `DEPTH`, which stands for a cycle: both
/// make `JSON.stringify` throw. A `toJSON` method is not called: none is in what the display copy holds
/// (src/shared/display-data.ts).
pub fn stringify(js: &Js, value: napi_value) -> Result<Vec<u8>> {
    let mut reader = Reader { js, text: JsonText::new(), units: Vec::new() };
    let kind = js.kind(value)?;
    reader.typed(value, kind, 0)?;
    Ok(reader.text.into_bytes())
}

struct Reader<'j> {
    js: &'j Js,
    text: JsonText,
    /// One buffer for every string read
    units: Vec<u16>,
}

impl Reader<'_> {
    fn typed(&mut self, value: napi_value, kind: Kind, depth: u32) -> Result<()> {
        match kind {
            Kind::Null => self.text.null(),
            Kind::Boolean => {
                let b = self.js.boolean_value(value)?;
                self.text.bool(b);
            }
            Kind::Number => {
                let n = self.js.number_value(value)?;
                self.text.number(n);
            }
            Kind::String => {
                self.js.units_into(value, &mut self.units)?;
                self.text.string(&self.units);
            }
            Kind::Object => {
                if depth >= DEPTH {
                    return Err(Error::new(Status::InvalidArg, format!("the display copy nests deeper than {DEPTH} levels, as a cycle would")));
                }
                // Each container's handles are let go once it is read, so a large copy holds only one path's worth
                let js = self.js;
                js.scoped(|| self.container(value, depth))?;
            }
            Kind::BigInt => return Err(Error::new(Status::BigintExpected, "the display copy holds a BigInt, which JSON cannot")),
            other => return Err(Error::new(Status::InvalidArg, format!("the display copy holds a value JSON cannot ({other:?})"))),
        }
        Ok(())
    }

    fn container(&mut self, value: napi_value, depth: u32) -> Result<()> {
        let js = self.js;
        if js.is_array(value)? {
            self.text.begin_array();
            for i in 0..js.length(value)? {
                let element = js.element(value, i)?;
                let kind = js.kind(element)?;
                if left_out(kind) {
                    self.text.null();
                } else {
                    self.typed(element, kind, depth + 1)?;
                }
            }
            self.text.end_array();
            return Ok(());
        }
        let keys = js.keys(value)?;
        self.text.begin_object();
        for i in 0..js.length(keys)? {
            let key = js.element(keys, i)?;
            let member = js.property(value, key)?;
            let kind = js.kind(member)?;
            if left_out(kind) {
                continue;
            }
            js.units_into(key, &mut self.units)?;
            self.text.key(&self.units);
            self.typed(member, kind, depth + 1)?;
        }
        self.text.end_object();
        Ok(())
    }
}

/// What `JSON.stringify` leaves out of an object, and writes as `null` in an array
fn left_out(kind: Kind) -> bool {
    matches!(kind, Kind::Undefined | Kind::Function | Kind::Symbol)
}

/// JSON text being written. A container's members are written between its `begin_` and `end_` calls, an object's
/// each after its key; separators are the writer's.
pub struct JsonText {
    out: Vec<u8>,
    /// One entry per container open, innermost last: whether a member has been written into it yet
    open: Vec<bool>,
    /// A key was just written, so the next value is its member's and takes no separator
    after_key: bool,
}

impl JsonText {
    pub fn new() -> Self {
        JsonText { out: Vec::new(), open: Vec::new(), after_key: false }
    }

    /// The text written so far
    pub fn into_bytes(self) -> Vec<u8> {
        self.out
    }

    pub fn null(&mut self) {
        self.member();
        self.out.extend_from_slice(b"null");
    }

    pub fn bool(&mut self, value: bool) {
        self.member();
        self.out.extend_from_slice(if value { b"true" } else { b"false" });
    }

    /// A number as ECMAScript's Number::toString writes it; one that is not finite is `null`, as `JSON.stringify` has it
    pub fn number(&mut self, value: f64) {
        self.member();
        write_number(&mut self.out, value);
    }

    pub fn string(&mut self, units: &[u16]) {
        self.member();
        write_string(&mut self.out, units);
    }

    pub fn begin_object(&mut self) {
        self.member();
        self.out.push(b'{');
        self.open.push(false);
    }

    /// An object member's key; its value comes next
    pub fn key(&mut self, units: &[u16]) {
        self.member();
        write_string(&mut self.out, units);
        self.out.push(b':');
        self.after_key = true;
    }

    pub fn end_object(&mut self) {
        self.open.pop();
        self.out.push(b'}');
    }

    pub fn begin_array(&mut self) {
        self.member();
        self.out.push(b'[');
        self.open.push(false);
    }

    pub fn end_array(&mut self) {
        self.open.pop();
        self.out.push(b']');
    }

    /// Before a member of the innermost container: the comma that separates it from the one before
    fn member(&mut self) {
        if self.after_key {
            self.after_key = false;
            return;
        }
        if let Some(written) = self.open.last_mut() {
            if *written {
                self.out.push(b',');
            }
            *written = true;
        }
    }
}

/// QuoteJSONString (ECMA-262, JSON.stringify): `"` and `\` escaped, the control characters as the short escapes or
/// `\u00xx`, a surrogate with no partner as `\udxxx`, everything else as UTF-8
pub(crate) fn write_string(out: &mut Vec<u8>, units: &[u16]) {
    out.push(b'"');
    let mut i = 0;
    while i < units.len() {
        let unit = units[i];
        i += 1;
        match unit {
            0x22 => out.extend_from_slice(b"\\\""),
            0x5C => out.extend_from_slice(b"\\\\"),
            0x08 => out.extend_from_slice(b"\\b"),
            0x0C => out.extend_from_slice(b"\\f"),
            0x0A => out.extend_from_slice(b"\\n"),
            0x0D => out.extend_from_slice(b"\\r"),
            0x09 => out.extend_from_slice(b"\\t"),
            0x00..=0x1F => unicode_escape(out, unit),
            0xD800..=0xDBFF if i < units.len() && (0xDC00..=0xDFFF).contains(&units[i]) => {
                let point = 0x10000 + ((u32::from(unit) - 0xD800) << 10) + (u32::from(units[i]) - 0xDC00);
                i += 1;
                utf8(out, point);
            }
            0xD800..=0xDFFF => unicode_escape(out, unit),
            _ => utf8(out, u32::from(unit)),
        }
    }
    out.push(b'"');
}

fn unicode_escape(out: &mut Vec<u8>, unit: u16) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    out.extend_from_slice(b"\\u");
    for shift in [12, 8, 4, 0] {
        out.push(HEX[usize::from((unit >> shift) & 0xF)]);
    }
}

fn utf8(out: &mut Vec<u8>, point: u32) {
    let c = char::from_u32(point).expect("a code point outside the surrogates");
    let mut buf = [0; 4];
    out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
}

/// Number::toString(10) (ECMA-262), as the module writes a double in its other text; a value that is not finite is
/// `null`, as `JSON.stringify` writes it
pub(crate) fn write_number(out: &mut Vec<u8>, value: f64) {
    if !value.is_finite() {
        out.extend_from_slice(b"null");
        return;
    }
    let mut buffer = ryu_js::Buffer::new();
    out.extend_from_slice(buffer.format_finite(value).as_bytes());
}
