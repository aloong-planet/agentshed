//! A Codex session's title (session-view A4): the session index's name for it first, as the name Codex gave the thread
//! summarises it better than a question; then its first real question, clipped; then its file name without the suffix.

use crate::text::{self, Units};

/// The clipped first question, for the title's fallback and the state: a resumed parse's index carries no question
/// text, so a rollout whose first question came before the resume keeps the title the earlier parse derived
pub(super) fn first_question_title(first: Option<&Units>, seeded: usize, earlier: Option<&Units>) -> Option<Units> {
    match first {
        Some(q) => Some(text::clip_title(q)),
        None if seeded > 0 => earlier.cloned(),
        None => None,
    }
}

/// The title: the thread name, else the first question's title, else the file name's stem
pub(super) fn title(thread_name: Option<&Units>, first: Option<&Units>, file: &str) -> Units {
    if let Some(t) = thread_name.or(first) {
        return t.clone();
    }
    // A cold rollout keeps its name under `.jsonl.zst` (token-stats B12)
    let name = file.rsplit('/').next().unwrap_or(file);
    let stem = name.strip_suffix(".jsonl.zst").or_else(|| name.strip_suffix(".jsonl")).unwrap_or(name);
    text::units(stem)
}
