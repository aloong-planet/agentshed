//! What the fuzz targets in `engine/fuzz/` call, in fuzzing builds only (`cfg(fuzzing)`, which cargo-fuzz sets): the
//! module's items stay its own, and a target reaches them through here.

use crate::json::{Event, Gap, Reader, line, number_value, stringify, take};
use crate::text::JsString;

/// Reads `bytes` as a line is read, every way the module reads one: skipped, read event by event with each string's
/// code units, text and taken value and each number's value, read as a side reads a line, and written as
/// `JSON.stringify` writes its value. It panics where the module would, and where two of the reads disagree on whether
/// the line is JSON, or a string's taken value is not its text.
pub fn json_line(bytes: &[u8]) {
    // As a line is decoded before it is read: UTF-8, an invalid sequence becoming U+FFFD
    let text = crate::text::line_text_owned(bytes.to_vec());
    let text = text.as_str();

    let mut r = Reader::new(text);
    let skipped = r.skip().and_then(|_| r.end()).is_ok();

    let mut r = Reader::new(text);
    let mut strings = Vec::new();
    let mut numbers = Vec::new();
    let evented = r
        .events(|event| match event {
            Event::Key(s) | Event::String(s) => strings.push(s),
            Event::Scalar(t) if t.first().is_some_and(|b| *b == b'-' || b.is_ascii_digit()) => numbers.push(t),
            Event::Object | Event::Array | Event::Close | Event::Scalar(_) => {}
        })
        .and_then(|_| r.end())
        .is_ok();
    for s in strings {
        let units = s.units();
        let made = s.text();
        let _ = s.is("type");
        if s.is_well_formed() {
            assert!(matches!(made, JsString::Utf8(_)), "a well formed string has a UTF-8 form");
            let taken = take(text.to_owned(), s.span(text));
            assert_eq!(JsString::Utf8(taken), made, "a string taken out of its line is its text");
        } else {
            assert_eq!(made, JsString::Units(units), "a string with a lone surrogate is its code units");
        }
    }
    for t in numbers {
        number_value(t).expect("a number the grammar takes has a value");
    }

    let read = line(text, |r| r.members(|_, r| r.skip())).is_ok();
    let valued = line(text, |r| r.members(|_, r| r.value().map(|_| ()))).is_ok();
    let mut r = Reader::new(text);
    let written = stringify(&mut r, Gap::None).and_then(|_| r.end()).is_ok();
    let mut r = Reader::new(text);
    let indented = stringify(&mut r, Gap::Two).and_then(|_| r.end()).is_ok();
    assert!(
        [evented, read, valued, written, indented].iter().all(|&ok| ok == skipped),
        "the reads disagree on whether the line is JSON: skip {skipped}, events {evented}, line {read}, value {valued}, stringify {written}, indented {indented}"
    );
}
