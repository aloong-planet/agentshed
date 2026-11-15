//! A Claude Code session's title (session-view A4): its first real question, clipped; then its file name without the
//! suffix, which only a session that is not listed falls back to (A3a).

use crate::text::{self, Units};

/// The title: the first question's, else the file name's stem. The first question is already stripped of its noise,
/// and stripping is not idempotent, so it is only clipped here.
pub(super) fn title(first: Option<&Units>, file: &str) -> Units {
    if let Some(q) = first {
        return text::clip_title(q);
    }
    let name = file.rsplit('/').next().unwrap_or(file);
    text::units(name.strip_suffix(".jsonl").unwrap_or(name))
}
