//! A Grok session's title (session-view G2): the name its `summary.json` gives it first, as the side's own summary reads
//! better than a question (the priority rule Codex's thread name follows); then its first question, clipped; then the
//! name of the session's directory. `summary.json` is the file the walk already reads for the session's kind
//! (`src/main/providers/grok.ts`), not a second source for the conversation.

use crate::json::{Kind, Read, Reader, Str};
use crate::text::{self, Units};

/// The title: the summary's name, else the first question's title, else the directory's name
pub(super) fn title(file: &str, first: Option<&Units>) -> Units {
    if let Some(t) = summary_title(file) {
        return t;
    }
    if let Some(q) = first {
        return text::clip_title(q);
    }
    // The last segment of `dirname(file)`: the session's directory, named by the session's id
    text::units(directory(file).rsplit('/').next().unwrap_or_default())
}

/// The directory the stream is in, as `path.dirname` gives it for the walk's paths: absolute, joined from directory
/// names, and never ending with a slash (`sessions/<cwd>/<id>/updates.jsonl`)
fn directory(file: &str) -> &str {
    file.rsplit_once('/').map_or(".", |(dir, _)| dir)
}

/// A summary's member, as `p[key] ?? …` reads it
#[derive(Clone, Copy)]
enum Member<'a> {
    /// Absent, or null: `??` takes the next
    Missing,
    Text(Str<'a>),
    /// Any other kind of value, which titles nothing
    Other,
}

/// `session_summary ?? generated_title`, when that is a string other than the empty one; None when the summary is not
/// there, cannot be read, is not JSON, or is no object
fn summary_title(file: &str) -> Option<Units> {
    let bytes = std::fs::read(format!("{}/summary.json", directory(file))).ok()?;
    // Read as `readFileSync(…, 'utf8')` gives it: an invalid sequence is U+FFFD, and a byte order mark stays, which
    // `JSON.parse` refuses
    let text = String::from_utf8_lossy(&bytes);
    let mut r = Reader::new(&text);
    if r.kind().ok()? != Kind::Object {
        return None;
    }
    let (mut summary, mut generated) = (Member::Missing, Member::Missing);
    r.members(|key, r| {
        if key.is("session_summary") {
            summary = member(r)?;
        } else if key.is("generated_title") {
            generated = member(r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })
    .ok()?;
    r.end().ok()?;
    let chosen = if matches!(summary, Member::Missing) { generated } else { summary };
    match chosen {
        Member::Text(s) if !s.is_empty() => Some(s.units()),
        _ => None,
    }
}

fn member<'a>(r: &mut Reader<'a>) -> Read<Member<'a>> {
    match r.kind()? {
        Kind::Null => r.skip().map(|_| Member::Missing),
        Kind::String => r.string().map(Member::Text),
        _ => r.skip().map(|_| Member::Other),
    }
}
