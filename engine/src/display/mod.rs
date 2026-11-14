//! The display copy's writer (agents-overview::REQ-008, ADR-0044, ADR-0045): the main process hands over what the copy
//! holds at the moment it is written, and this module serialises it and writes it to its file. The main process decides
//! when it is written, and reads it at launch without the module; the copy's name and envelope are its own
//! (src/main/display-store.ts), so this module knows nothing of what the copy holds. It never branches on a side.

mod json;

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub use json::JsonText;

/// Replaces `file` with `text`, atomically: the text goes to a temporary file beside it, which is then renamed over it.
/// A write cut short leaves the previous copy whole (agents-overview, restart sequence item 6), and one that fails
/// leaves no temporary file behind. The directory is created when missing; the file is the user's alone.
pub fn write_atomically(file: &Path, text: &[u8]) -> io::Result<()> {
    let dir = file.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let temporary = temporary_beside(file, dir);
    let written = fs::create_dir_all(dir).and_then(|()| {
        let mut out = open_private(&temporary)?;
        out.write_all(text)?;
        drop(out);
        fs::rename(&temporary, file)
    });
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    written.map_err(|e| io::Error::new(e.kind(), format!("writing the display copy to {} failed: {e}", file.display())))
}

/// `.<name>.tmp-<pid>`: one process writes one copy at a time, so the process id keeps two runs' writes apart
fn temporary_beside(file: &Path, dir: &Path) -> PathBuf {
    let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    dir.join(format!(".{name}.tmp-{}", std::process::id()))
}

fn open_private(path: &Path) -> io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}
