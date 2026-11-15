//! An entry's per-file aggregate as the combination reads it back from the store, its text as `JSON.stringify` wrote it:
//! its side, and what every side's aggregate carries, checked as `isWellFormedAgg` (src/main/providers/token-stats.ts)
//! checks it before its side's own fields. A side reads its own fields through `read` and checks them itself.
//!
//! The text is read as `JSON.parse` reads it (`json`): a repeated key keeps its last value, so each field is the last
//! one given.

use crate::json::{self, Read, Reader, Str, Value};
use crate::question::Record;
use crate::text::Units;

/// The aggregate's side: its `kind` member, when the text is a JSON object and the member a string
pub(crate) fn kind(agg: &str) -> Option<Units> {
    let mut kind = None;
    let read = json::line(agg, |r| {
        r.members(|key, r| {
            if key.is("kind") {
                kind = Some(r.value()?);
            } else {
                r.skip()?;
            }
            Ok(())
        })
    });
    match (read, kind) {
        (Ok(json::Line::Object(())), Some(Value::String(s))) => Some(s.units()),
        _ => None,
    }
}

/// The fields every side's aggregate carries, as last given; a field not given is none
#[derive(Default)]
pub(crate) struct Common<'a> {
    file: Option<Value<'a>>,
    questions: Option<Option<Vec<Record>>>,
    project_key: Option<Value<'a>>,
    listed: Option<Value<'a>>,
    title: Option<Value<'a>>,
    at: Option<Value<'a>>,
}

/// The fields every side's aggregate carries, each of the type it requires
pub(crate) struct Fields {
    /// The session's identity, never empty
    pub(crate) file: Units,
    pub(crate) questions: Vec<Record>,
    pub(crate) project_key: Units,
    pub(crate) listed: bool,
    pub(crate) title: Option<Units>,
    pub(crate) at: Option<f64>,
}

/// A question record, `[start, end, turnEnd, at, tools, subagents, fingerprint]`, from a row `json::rows` checked
fn record(cells: &[Value<'_>]) -> Record {
    Record {
        start: json::cell_number(&cells[0]),
        end: json::cell_number(&cells[1]),
        turn_end: json::cell_number(&cells[2]),
        at: json::cell_number_or_null(&cells[3]),
        tools: json::cell_number(&cells[4]),
        subagents: json::cell_number(&cells[5]),
        fingerprint: json::cell_number(&cells[6]),
    }
}

impl<'a> Common<'a> {
    /// Reads the member `key` when it is one of these fields; false when it is not, the reader still at its value
    fn member(&mut self, key: Str<'a>, r: &mut Reader<'a>) -> Read<bool> {
        if key.is("questions") {
            self.questions = Some(json::rows(r, "nnnNnnn", record)?);
            return Ok(true);
        }
        let slot = if key.is("file") {
            &mut self.file
        } else if key.is("projectKey") {
            &mut self.project_key
        } else if key.is("listed") {
            &mut self.listed
        } else if key.is("title") {
            &mut self.title
        } else if key.is("at") {
            &mut self.at
        } else {
            return Ok(false);
        };
        *slot = Some(r.value()?);
        Ok(true)
    }

    /// The fields, when each is of the type it requires (`isWellFormedAgg`): `file` a string that is not empty, the
    /// question index rows of seven, `projectKey` a string, `listed` a boolean, `title` a string or null, `at` a number or
    /// null — a field not given being none of these
    pub(crate) fn fields(self) -> Option<Fields> {
        let file = match self.file {
            Some(Value::String(s)) if !s.is_empty() => s.units(),
            _ => return None,
        };
        let project_key = match self.project_key {
            Some(Value::String(s)) => s.units(),
            _ => return None,
        };
        let listed = match self.listed {
            Some(Value::Bool(b)) => b,
            _ => return None,
        };
        let title = match self.title {
            Some(Value::Null) => None,
            Some(Value::String(s)) => Some(s.units()),
            _ => return None,
        };
        let at = match self.at {
            Some(Value::Null) => None,
            Some(Value::Number(x)) => Some(x),
            _ => return None,
        };
        Some(Fields { file, questions: self.questions??, project_key, listed, title, at })
    }
}

/// Reads the aggregate `agg`: the fields every side carries, and every other member through `member`, which reads a
/// field its side requires and skips any other. None when the text is no JSON object.
pub(crate) fn read<'a>(agg: &'a str, mut member: impl FnMut(Str<'a>, &mut Reader<'a>) -> Read<()>) -> Option<Common<'a>> {
    let mut common = Common::default();
    let read = json::line(agg, |r| {
        r.members(|key, r| {
            if !common.member(key, r)? {
                member(key, r)?;
            }
            Ok(())
        })
    });
    match read {
        Ok(json::Line::Object(())) => Some(common),
        _ => None,
    }
}

/// A field a side requires, as last given
pub(crate) fn field<'a>(slot: &mut Option<Value<'a>>, r: &mut Reader<'a>) -> Read<()> {
    *slot = Some(r.value()?);
    Ok(())
}

/// A boolean field
pub(crate) fn boolean(v: Option<Value<'_>>) -> Option<bool> {
    if let Some(Value::Bool(b)) = v { Some(b) } else { None }
}

/// A number field
pub(crate) fn number(v: Option<Value<'_>>) -> Option<f64> {
    if let Some(Value::Number(x)) = v { Some(x) } else { None }
}

/// A string field
pub(crate) fn string(v: Option<Value<'_>>) -> Option<Units> {
    if let Some(Value::String(s)) = v { Some(s.units()) } else { None }
}

/// A field that is a string or null: Some(None) for null, None for anything else
pub(crate) fn string_or_null(v: Option<Value<'_>>) -> Option<Option<Units>> {
    match v {
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) => Some(Some(s.units())),
        _ => None,
    }
}

/// A field that is a number or null: Some(None) for null, None for anything else
pub(crate) fn number_or_null(v: Option<Value<'_>>) -> Option<Option<f64>> {
    match v {
        Some(Value::Null) => Some(None),
        Some(Value::Number(x)) => Some(Some(x)),
        _ => None,
    }
}
