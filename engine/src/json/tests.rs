//! The reader against `JSON.parse`'s grammar and results (token-stats, Implementation Decisions, The engine module;
//! A8), each expected value written by hand from ECMA-262's JSON grammar and from what V8 gives. The differential case
//! against `JSON.parse` itself is in `src/main/providers/token-stats.test.ts` ("how a whole line is read").

use super::*;

/// Whether the line is read through to its end, an object's members read as a side reads the ones it does not keep
fn accepts(text: &str) -> bool {
    line(text, |r| r.members(|_, r| r.skip())).is_ok()
}

#[test]
fn a_line_json_parse_takes_is_read_to_its_end() {
    for text in [
        "{}",
        "[]",
        "0",
        "-0",
        "1.5e+3",
        "2E-2",
        "-12.25e10",
        "\"a\"",
        "\"\"",
        "true",
        "false",
        "null",
        "{\"a\":[1,{\"b\":null}]}",
        "[[[]],{},[{}]]",
        " \t\r\n{ \t\r\n\"a\" \t\r\n: \t\r\n[ \t\r\n1 \t\r\n, \t\r\n2 \t\r\n] \t\r\n} \t\r\n",
        "{\"a\":1,\"a\":2}",
        "\"\\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\uD83D\\uDE00 \\ud800\"",
        "\"\u{e9}\u{1f600}\u{7f}\"",
    ] {
        assert!(accepts(text), "refused {text:?}");
    }
}

#[test]
fn a_line_json_parse_refuses_is_bad() {
    for text in [
        "",
        " ",
        "01",
        "-01",
        "1.",
        ".1",
        "1e",
        "1e+",
        "+1",
        "-",
        "- 1",
        "[1,]",
        "[,1]",
        "{\"a\":1,}",
        "{,}",
        "{a:1}",
        "{\"a\"}",
        "{\"a\" 1}",
        "{\"a\":}",
        "{1:1}",
        "'a'",
        "\"a",
        "\"\\x\"",
        "\"\\u12G4\"",
        "\"\\u12\"",
        "\"\\U0041\"",
        "\"a\u{1}b\"",
        "\"a\nb\"",
        "\"a\tb\"",
        "tru",
        "nul",
        "True",
        "[1 2]",
        "[1",
        "{\"a\":1",
        "]",
        "{}}",
        "{} x",
        "[] []",
        "\u{b}{}",
        "{}\u{c}",
        "\u{a0}{}",
        "NaN",
        "Infinity",
        "-Infinity",
        "undefined",
        "0x10",
    ] {
        assert!(!accepts(text), "accepted {text:?}");
    }
}

/// The number a line's only value gives
fn number_of(text: &str) -> f64 {
    let mut r = Reader::new(text);
    let x = r.number().unwrap_or_else(|_| panic!("refused {text:?}"));
    r.end().unwrap_or_else(|_| panic!("more after {text:?}"));
    x
}

#[test]
fn a_number_is_the_double_json_parse_gives() {
    // Each expected double by its bits or as an exact decimal, the value V8 gives for the text
    for (text, expected) in [
        ("0", 0.0),
        ("123456789012345", 123_456_789_012_345.0),
        ("9007199254740993", 9_007_199_254_740_992.0),
        ("9007199254740995", 9_007_199_254_740_996.0),
        ("1234567890123456789", 1_234_567_890_123_456_768.0),
        ("0.1", f64::from_bits(0x3fb9_9999_9999_999a)),
        ("1.5e+3", 1500.0),
        ("1.7976931348623157e308", f64::MAX),
        ("1.7976931348623158e308", f64::MAX),
        ("1.7976931348623159e308", f64::INFINITY),
        ("1e400", f64::INFINITY),
        ("-1e400", f64::NEG_INFINITY),
        ("2.5e-324", f64::from_bits(1)),
        ("2.4703282292062328e-324", f64::from_bits(1)),
        ("2.4703282292062327e-324", 0.0),
        ("1e-400", 0.0),
    ] {
        let x = number_of(text);
        assert_eq!(x.to_bits(), expected.to_bits(), "{text:?} gave {x:e}");
    }
    // A minus zero keeps its sign
    for text in ["-0", "-0.0e-0", "-1e-400"] {
        assert_eq!(number_of(text).to_bits(), (-0.0f64).to_bits(), "{text:?}");
    }
}

/// The only value of a line that holds one string
fn string_of(text: &str) -> Str<'_> {
    let mut r = Reader::new(text);
    let s = r.string().unwrap_or_else(|_| panic!("refused {text:?}"));
    r.end().unwrap_or_else(|_| panic!("more after {text:?}"));
    s
}

#[test]
fn a_string_is_its_escapes_decoded_to_code_units() {
    let escapes = string_of("\"\\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9\\u00E9\"");
    assert_eq!(escapes.units(), [0x22, 0x20, 0x5c, 0x20, 0x2f, 0x20, 0x08, 0x20, 0x0c, 0x20, 0x0a, 0x20, 0x0d, 0x20, 0x09, 0x20, 0xe9, 0xe9]);
    assert_eq!(escapes.text(), JsString::Utf8("\" \\ / \u{8} \u{c} \n \r \t \u{e9}\u{e9}".into()));
    assert!(escapes.is_well_formed());

    // A surrogate pair, escaped or written as it is, is one character of two code units
    for text in ["\"\\uD83D\\uDE00\"", "\"\\ud83d\\ude00\"", "\"\u{1f600}\""] {
        let s = string_of(text);
        assert_eq!(s.units(), [0xd83d, 0xde00], "{text:?}");
        assert_eq!(s.text(), JsString::Utf8("\u{1f600}".into()), "{text:?}");
        assert!(s.is_well_formed(), "{text:?}");
    }

    // A lone surrogate stays that code unit, and the string has no UTF-8 form
    for (text, units) in [
        ("\"a\\ud800b\"", vec![0x61, 0xd800, 0x62]),
        ("\"\\udc00\"", vec![0xdc00]),
        ("\"\\ud800\\u0041\"", vec![0xd800, 0x41]),
        ("\"\\ude00\\ud83d\"", vec![0xde00, 0xd83d]),
        ("\"\\ud83d\\ud83d\\ude00\"", vec![0xd83d, 0xd83d, 0xde00]),
        ("\"\\ud800\"", vec![0xd800]),
    ] {
        let s = string_of(text);
        assert_eq!(s.units(), units, "{text:?}");
        assert_eq!(s.text(), JsString::Units(units.clone()), "{text:?}");
        assert!(!s.is_well_formed(), "{text:?}");
    }

    // Text with no escape, and text between escapes, is its own code units
    let mixed = string_of("\"a\u{e9}\\nb\u{4e2d}\\u0041\"");
    assert_eq!(mixed.units(), [0x61, 0xe9, 0x0a, 0x62, 0x4e2d, 0x41]);
    assert_eq!(mixed.text(), JsString::Utf8("a\u{e9}\nb\u{4e2d}A".into()));

    // A string is a literal whether the line escapes it or not
    assert!(string_of("\"type\"").is("type"));
    assert!(string_of("\"\\u0074ype\"").is("type"));
    assert!(string_of("\"\\u00e9\"").is("\u{e9}"));
    assert!(!string_of("\"\\u0074ypes\"").is("type"));
    assert!(!string_of("\"typ\"").is("type"));
}

/// The string at the line's start, or the first member's value of the object there, taken out of the line
fn taken(line: &str) -> String {
    let mut r = Reader::new(line);
    let s = if r.kind().ok() == Some(Kind::Object) {
        let mut value = None;
        r.members(|_, r| {
            value = value.or(Some(r.string()?));
            Ok(())
        })
        .expect("an object of strings");
        value.expect("a member")
    } else {
        r.string().expect("a string")
    };
    let span = s.span(line);
    take(line.to_owned(), span)
}

#[test]
fn a_taken_string_is_its_text() {
    assert_eq!(taken("\"plain text\""), "plain text");
    assert_eq!(taken("\"\\\"q\\\" \\\\ \\/ \\b\\f\\n\\r\\t \\u00e9 \\uD83D\\uDE00 \\u4e2d\""), "\"q\" \\ / \u{8}\u{c}\n\r\t \u{e9} \u{1f600} \u{4e2d}");
    // Where the string lies after other text, and with text on both sides of its escapes
    assert_eq!(taken("{\"key\":\"a\\nb\\u0041c\",\"other\":\"z\"}"), "a\nbAc");
    assert_eq!(taken("{ \"key\" : \"\u{e9}\u{1f600}x\" }"), "\u{e9}\u{1f600}x");
}

#[test]
fn a_repeated_key_is_given_each_time_and_kept_once_with_its_last_value() {
    let mut given = Vec::new();
    line("{\"a\":1,\"b\":2,\"a\":3}", |r| {
        r.members(|key, r| {
            given.push((key.text(), r.number()?));
            Ok(())
        })
    })
    .expect("a line JSON.parse takes");
    let a = || JsString::Utf8("a".into());
    assert_eq!(given, [(a(), 1.0), (JsString::Utf8("b".into()), 2.0), (a(), 3.0)]);

    // Expected texts as V8 gives JSON.stringify(JSON.parse(line))
    for (text, expected) in [
        ("{\"a\":1,\"b\":2,\"a\":3}", "{\"a\":3,\"b\":2}"),
        ("{\"a\":1,\"\\u0061\":2}", "{\"a\":2}"),
        ("{\"a\":{\"x\":1},\"a\":[2]}", "{\"a\":[2]}"),
        ("{\"b\":1,\"1\":2,\"0\":3}", "{\"0\":3,\"1\":2,\"b\":1}"),
        ("{\"b\":1,\"4294967295\":2,\"4294967294\":3}", "{\"4294967294\":3,\"b\":1,\"4294967295\":2}"),
        ("{\"01\":1,\"1\":2}", "{\"1\":2,\"01\":1}"),
    ] {
        let mut r = Reader::new(text);
        let written = stringify(&mut r, Gap::None).unwrap_or_else(|_| panic!("refused {text:?}"));
        assert_eq!(written, expected, "{text:?}");
    }
}

#[test]
fn a_value_of_any_depth_is_read_and_one_left_open_is_bad() {
    let n = 100_000;
    let arrays = format!("{}{}", "[".repeat(n), "]".repeat(n));
    let objects = format!("{}1{}", "{\"a\":".repeat(n), "}".repeat(n));
    let mixed = format!("{}0{}", "[{\"a\":".repeat(n), "}]".repeat(n));
    for text in [&arrays, &objects, &mixed] {
        assert!(accepts(text));
        let mut events = 0;
        let mut r = Reader::new(text);
        r.events(|_| events += 1).expect("a value JSON.parse takes");
        r.end().expect("nothing after the value");
        assert!(events >= 2 * n);
        let mut r = Reader::new(text);
        assert_eq!(&stringify(&mut r, Gap::None).expect("a value JSON.parse takes"), text);
    }
    for text in [&arrays[..arrays.len() - 1], &objects[..objects.len() - 1], &mixed[..mixed.len() - 2]] {
        assert!(!accepts(text));
        assert!(Reader::new(text).events(|_| {}).is_err());
        assert!(stringify(&mut Reader::new(text), Gap::None).is_err());
    }
}
