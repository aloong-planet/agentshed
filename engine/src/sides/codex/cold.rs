//! A cold rollout (token-stats B12, session-view C2): Codex compresses a rollout untouched for seven days into
//! `<name>.jsonl.zst` and deletes the plain file (its compression.rs, read 2026-09-09). The same session, its offsets
//! those of the decompressed stream. Its name says how it is stored, and the bytes its stream ends with whether the
//! stream was cut short. The parse, the walk and a read of a rollout's ranges for the session page and both searches
//! each take both from here.

use crate::read::{self, Failed, Served, Stored};

/// How a rollout of this name is stored: zstd-compressed under `.jsonl.zst`, plain otherwise
pub(super) fn stored(file: &str) -> Stored {
    if file.ends_with(".jsonl.zst") { Stored::Zstd } else { Stored::Plain }
}

/// Whether a stream that ended on `last` was cut short. Every rollout line ends with a line feed and a cold rollout is
/// never mid-write, so a decompressed stream that does not end with one was cut short (B12). A cut that lands exactly
/// on a line end escapes this and reads as a shorter session. A plain rollout's last line may still be being written.
pub(super) fn cut_short(stored: Stored, last: Option<u8>) -> bool {
    stored == Stored::Zstd && last.is_some_and(|b| b != b'\n')
}

/// Each of `ranges` of the rollout `file`, in its stream's offsets (`read::ranges`). Failed as well when the read went
/// to the stream's end and found it cut short; a read that stopped once its last range had passed did not see the
/// end, so it is not judged.
pub(super) fn ranges(file: &str, ranges: &[(u64, u64)]) -> Result<Served, Failed> {
    let stored = stored(file);
    let served = read::ranges(file, stored, ranges)?;
    if served.ended && cut_short(stored, served.last) {
        return Err(Failed);
    }
    Ok(served)
}
