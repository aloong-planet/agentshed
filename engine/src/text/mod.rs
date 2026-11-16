//! Text as JavaScript holds it, and the rules over it that more than one side shares: the normalisation, the noise
//! stripping, the title clipping, the fingerprints, a folder's merge key, `String(number)` and `Date.parse`.
//!
//! Text is a sequence of UTF-16 code units, as a JavaScript string is: a line's string can hold a lone surrogate (an
//! escape `JSON.parse` keeps as that code unit), and every rule here counts and compares what JavaScript counts and
//! compares, so it reads the same units JavaScript reads.

/// A string as JavaScript holds it: its UTF-16 code units
pub(crate) type Units = Vec<u16>;

/// The UTF-16 code units of a Rust string
pub(crate) fn units(s: &str) -> Units {
    s.encode_utf16().collect()
}

/// A session file's line as text, each invalid sequence becoming U+FFFD as `String::from_utf8_lossy` makes it. A line
/// that is valid UTF-8, nearly every one, is taken as it is once `std::str::from_utf8` has checked it, which looks at
/// plain ASCII a word at a time; only a line it refuses is decoded lossily, which looks at each byte (on a cold scan's
/// parse workers the lossy decode of every line took 15.8% of their samples, #453).
pub(crate) fn line_text(bytes: &[u8]) -> std::borrow::Cow<'_, str> {
    match std::str::from_utf8(bytes) {
        Ok(text) => std::borrow::Cow::Borrowed(text),
        Err(_) => String::from_utf8_lossy(bytes),
    }
}

/// Whether a code unit is in the set `String.prototype.trim` and the regular expression `\s` match: WhiteSpace and
/// LineTerminator (ECMA-262 §12.2, §12.3), every member a single unit
fn is_space(u: u16) -> bool {
    matches!(u, 0x09..=0x0d | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}

/// `raw.trim().replace(/\s+/g, ' ')`: how every side's question text reads wherever it is shown or matched
/// (session-view::REQ-002)
pub(crate) fn normalize(raw: &[u16]) -> Units {
    let mut out = Vec::with_capacity(raw.len());
    let mut space = false;
    for &u in trim(raw) {
        if is_space(u) {
            space = true;
            continue;
        }
        if space {
            out.push(0x20);
            space = false;
        }
        out.push(u);
    }
    out
}

/// `String.prototype.trim`
pub(crate) fn trim(s: &[u16]) -> &[u16] {
    let start = s.iter().position(|&u| !is_space(u)).unwrap_or(s.len());
    let end = s.iter().rposition(|&u| !is_space(u)).map_or(start, |i| i + 1);
    &s[start..end]
}

/// `s.trimStart()`: the text after its leading white space
pub(crate) fn trim_start(s: &[u16]) -> &[u16] {
    &s[s.iter().position(|&u| !is_space(u)).unwrap_or(s.len())..]
}

/// `s.startsWith(prefix)`
pub(crate) fn starts_with(s: &[u16], prefix: &str) -> bool {
    let p = units(prefix);
    s.len() >= p.len() && s[..p.len()] == p[..]
}

/// The first index at or after `from` where `needle` occurs
pub(crate) fn find(s: &[u16], needle: &[u16], from: usize) -> Option<usize> {
    if needle.is_empty() || s.len() < needle.len() {
        return None;
    }
    (from..=s.len() - needle.len()).find(|&i| s[i..i + needle.len()] == *needle)
}

/// `s.toLowerCase()`, by the full case mapping of the Unicode version Rust's standard library carries, the mapping
/// JavaScript's engine takes from ICU: each run of well-formed text lowercased by `str::to_lowercase`, which applies
/// the final sigma rule within the run, and each lone surrogate kept as it is, as `toLowerCase` keeps one. A lone
/// surrogate is neither cased nor case-ignorable, so no final sigma's context reaches across one, and the runs it
/// splits lower as the whole does. Whether the two mappings agree on every code point is checked against the
/// JavaScript of the Electron the app runs on (full-text.test.ts).
pub(crate) fn to_lower_case(s: &[u16]) -> Units {
    if s.iter().all(|&u| u < 0x80) {
        return s.iter().map(|&u| if (0x41..=0x5a).contains(&u) { u + 0x20 } else { u }).collect();
    }
    let mut out = Vec::with_capacity(s.len());
    let mut run = String::new();
    for c in char::decode_utf16(s.iter().copied()) {
        match c {
            Ok(c) => run.push(c),
            Err(lone) => {
                out.extend(run.to_lowercase().encode_utf16());
                run.clear();
                out.push(lone.unpaired_surrogate());
            }
        }
    }
    out.extend(run.to_lowercase().encode_utf16());
    out
}

/// One human message → the real question inside it; None when the whole of it is noise. The caller takes None as "this
/// is not a question", for the title and for whether the session is listed alike.
///
/// **The noise shapes come from real sampling, not from imagining a list** (2026-08-02, 297 real Claude Code sessions):
/// Warmup 188, `[cron:…]` 92, `<local-command-*>` 20, slash commands 2. `<local-command-stdout>` is a second layer of
/// noise that only surfaces once the earlier layers are stripped: sampling the first message cannot see it, and it was
/// found only by running the rule over the stripped results. The "Conversation info" the research-phase spec listed is
/// not in the sample but exists (6 files). It has no rule because it occurs only in unregistered projects, which
/// session-view A2 never lists, so a rule would be dead code (session-view A4; postmortem
/// `2026-08-02-noise-list-vs-real-data`). Two places intuition gets wrong, both corrected by real data: what follows
/// `[cron:…]` is the actual instruction, so only the bracket is stripped; and a slash command's user input is inside
/// `<command-args>`, not outside the tag.
pub(crate) fn real_user_text(raw: &[u16]) -> Option<Units> {
    let t = normalize(raw);
    // A warmup session's whole message is that one word; it is noise only on exact equality, so a real question that
    // holds the word is not caught
    if t.is_empty() || t == units("Warmup") {
        return None;
    }
    for noise in [
        // The trace the harness leaves when it wraps a `!` command from the input box, no member of the family written
        // by a human: caveat (13/297, the disclaimer before a command runs) and stdout (7/144, the command's output)
        // measured, matched by family, as the same mechanism makes sibling tags
        "<local-command-",
        // A skill body a slash command injects, which appears as the user but was not written by one
        "Base directory for this skill:",
        // Codex's harness speaking as the user, in the paginated format's user-message items (measured 2026-09-11 over
        // every rollout: 330 of 8285 items, each shape pure, none mixed with a human sentence): the guardian's
        // transcript preamble (328), a task notification (1), a delegation block (1). Matched by prefix, each a family
        // the same mechanism keeps making.
        "The following is the Codex agent history",
        "<task-notification>",
        "<codex_delegation>",
    ] {
        if starts_with(&t, noise) {
            return None;
        }
    }
    // A slash command: the input is only what `<command-args>` holds, and without it the line is the invocation alone.
    // `/<command-args>([\s\S]*?)<\/command-args>/` matches at the first opening tag that a closing one follows, which is
    // the first opening tag whenever any does
    if find(&t, &units("<command-name>"), 0).is_some() {
        let open = units("<command-args>");
        let inner = find(&t, &open, 0).and_then(|at| {
            let from = at + open.len();
            find(&t, &units("</command-args>"), from).map(|end| &t[from..end])
        });
        let v = inner.map(normalize).unwrap_or_default();
        return if v.is_empty() { None } else { Some(v) };
    }
    // `/^\[cron:[^\]]*\]\s*/`: the bracket the harness put before the instruction the user wrote
    let cron = units("[cron:");
    if starts_with(&t, "[cron:") {
        if let Some(close) = t[cron.len()..].iter().position(|&u| u == u16::from(b']')) {
            let rest = normalize(&t[cron.len() + close + 1..]);
            return if rest.is_empty() { None } else { Some(rest) };
        }
    }
    Some(t)
}

/// A folder's merge key, the key projects are merged by: its trailing slashes removed (`/` when nothing is left), then
/// lowercased by `lower`, JavaScript's own `String.prototype.toLowerCase` (the macOS file system is case-insensitive),
/// whose answer this answers. `mergeKey` in `src/shared/path-key.ts` is the same rule, for the keys made in TypeScript: a
/// change here is made there too.
pub(crate) fn merge_key<R>(path: &[u16], lower: impl FnOnce(&[u16]) -> R) -> R {
    let end = path.iter().rposition(|&u| u != u16::from(b'/')).map_or(0, |i| i + 1);
    if end == 0 {
        return lower(&units("/"));
    }
    lower(&path[..end])
}

/// The title cap, in code points as a string's iterator counts them: a surrogate pair is one, a lone surrogate is one
pub(crate) const TITLE_MAX: usize = 60;

/// A stripped question → a title, clipped at `TITLE_MAX` code points with `…` after the cut. It is kept apart from
/// `real_user_text` because stripping is not idempotent (`[cron:x] Warmup` strips to `Warmup`, then to nothing), so
/// what reaches here is never stripped again.
pub(crate) fn clip_title(t: &[u16]) -> Units {
    let mut points = 0;
    let mut i = 0;
    while i < t.len() {
        if points == TITLE_MAX {
            let mut out = t[..i].to_vec();
            out.push(0x2026);
            return out;
        }
        let pair = (0xd800..0xdc00).contains(&t[i]) && t.get(i + 1).is_some_and(|u| (0xdc00..0xe000).contains(u));
        i += if pair { 2 } else { 1 };
        points += 1;
    }
    t.to_vec()
}

/// The content fingerprint, FNV-1a over the UTF-16 code units (32-bit): the same text gives the same value, and it is
/// compared, entry by entry, to recognise a fork's replayed questions (session-view B2).
pub(crate) fn fingerprint(t: &[u16]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &u in t {
        h ^= u32::from(u);
        h = h.wrapping_mul(16_777_619);
    }
    h
}

/// `String(x)` for a finite number: the shortest digits that read back as `x`, laid out as ECMA-262's Number::toString
/// lays them out (`1e+21`, `0.000001`, `1e-7`, and `0` for both zeros)
pub(crate) fn number_string(x: f64) -> String {
    let mut buffer = ryu_js::Buffer::new();
    buffer.format_finite(x).to_owned()
}

/// `String(x)` for any number: `number_string`'s digits for a finite one, and `NaN`, `Infinity` or `-Infinity`
fn any_number_string(x: f64) -> String {
    if x.is_nan() {
        "NaN".to_owned()
    } else if x.is_infinite() {
        (if x > 0.0 { "Infinity" } else { "-Infinity" }).to_owned()
    } else {
        number_string(x)
    }
}

/// The day a time is filed under: its local date in the time zone the process runs in, `YYYY-MM-DD` as `localDay` in
/// `src/shared/format.ts` writes it, from `[getFullYear(), getMonth(), getDate()]` (`NaN-NaN-NaN` for a time no date
/// has, as `localDay` writes one). The date is asked of JavaScript's `Date` (`Js::local_dates`) rather than worked out
/// here, so the time zone, its rules and their data are the ones every other day in the app is cut by, and no time-zone
/// rule exists twice.
pub(crate) fn day([year, month, date]: [f64; 3]) -> Units {
    let two = |n: f64| {
        let s = any_number_string(n);
        if s.len() < 2 { format!("0{s}") } else { s }
    };
    units(&format!("{}-{}-{}", any_number_string(year), two(month + 1.0), two(date)))
}

/// `Date.parse(s)`, None for NaN: the forms `date_parse` reads here, any other by `fallback`, JavaScript's own
/// `Date.parse`
pub(crate) fn time_value(s: &[u16], fallback: &mut dyn FnMut(&[u16]) -> f64) -> Option<f64> {
    let ms = date_parse(s).unwrap_or_else(|| fallback(s));
    (!ms.is_nan()).then_some(ms)
}

/// `Date.parse(s)` for the forms read here; None for any other, which the caller hands to JavaScript's own `Date.parse`.
///
/// Read here: `YYYY-MM-DDTHH:mm:ssZ` and `YYYY-MM-DDTHH:mm:ss.sssZ`, the form Codex writes every timestamp in, with
/// each field inside its range. ECMA-262 §21.4.3.2 gives such a string one value, the same in every engine. A field out
/// of its range is not read here: V8 then reads some such strings by rules of its own (`2026-02-30` is the second of
/// March), and only V8 gives V8's answer.
pub(crate) fn date_parse(s: &[u16]) -> Option<f64> {
    let b: Vec<u8> = s.iter().map(|&u| u8::try_from(u).ok()).collect::<Option<_>>()?;
    let shape = match b.len() {
        20 => b[19] == b'Z',
        24 => b[19] == b'.' && b[23] == b'Z',
        _ => false,
    };
    if !shape || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let digits = |from: usize, len: usize| -> Option<i64> {
        b[from..from + len].iter().try_fold(0i64, |v, &c| c.is_ascii_digit().then(|| v * 10 + i64::from(c - b'0')))
    };
    let (year, month, day) = (digits(0, 4)?, digits(5, 2)?, digits(8, 2)?);
    let (hour, minute, second) = (digits(11, 2)?, digits(14, 2)?, digits(17, 2)?);
    let ms = if b.len() == 24 { digits(20, 3)? } else { 0 };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if !(1..=12).contains(&month) || day < 1 || day > month_days[(month - 1) as usize] || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    // Days from 1970-01-01 to the date in the proleptic Gregorian calendar (H. Hinnant's days_from_civil)
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let days = era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
    Some((((days * 24 + hour) * 60 + minute) * 60 + second) as f64 * 1000.0 + ms as f64)
}
