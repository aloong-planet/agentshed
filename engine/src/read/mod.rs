//! A session file read as lines, each with its byte range: the file itself, or for a cold rollout (`.jsonl.zst`) its
//! zstd stream decompressed as it is read (token-stats B12), its offsets then offsets in that stream (session-view C2).
//!
//! A line ends at a line feed, which never occurs inside a UTF-8 character, so the bytes are split there and a line is
//! decoded only once it is whole. A line's range runs from its first byte to after its line feed, or to the stream's end
//! for a last line without one, so adjacent lines meet with no gap. One buffer holds the line being assembled, and grows
//! to the longest line of the file.

use std::fs::File;
use std::io::{ErrorKind, Read, Seek, SeekFrom};

/// How much of the file one read takes: 1 MB, the size the TypeScript line reader this one replaced settled on
/// (`eachJsonlLine`, through `fs.ReadStream`, #157), kept as it was. Its figures were taken on that reader, under
/// Electron, on 2026-09-09. Each 64 KB stream chunk, the stream's default, cost about 3 ms more under Electron than
/// under Node: an 839 MB Codex session already in the page cache read in 44.6 s in the Electron main process against
/// 3.5 s under Node, and a worker thread in the same process paid the same (the mechanism was not profiled). The size
/// was chosen on the whole cold scan, not on that file, because `fs.ReadStream` allocated a chunk-sized buffer for every
/// read, so a scan over thousands of small files paid for a large chunk on each: the big file alone kept getting faster
/// up to 8 MB (2.0 s at 1 MB, 1.4 s at 8 MB), while the whole set (3.3 GB in 3947 files) read in 15.5 s at 256 KB,
/// 12.5 s at 512 KB, 11.3 s at 1 MB, 12.5 s at 2 MB, 17.6 s at 4 MB and 49.8 s at 16 MB, against 90.5 s at the default.
/// This reader holds one buffer per file and reads into it directly, so those per-read costs were not measured on it: a
/// figure for a size of its own is taken under Electron with `pnpm bench:scan` (the AGENTS.md invariant on such
/// figures), its `file` mode reading through this function.
const CHUNK: usize = 1024 * 1024;

/// How a file's bytes are stored
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stored {
    Plain,
    /// zstd-compressed, read from its start only
    Zstd,
}

/// The file could not be read to its end: it could not be opened or read, or its stream could not be decompressed.
/// What its lines gave is then not used.
#[derive(Debug)]
pub(crate) struct Failed;

/// Reads `path` from byte `from` on, calling `line` with each line's bytes (its line feed left off), its range, and
/// whether a line feed ends it, which only the stream's last line can lack. Offsets count from the start of the
/// stream, `from` included. Answers the stream's last byte, None when it held none after `from`. Whether a line or a
/// stream that stops short of a line feed is whole is for the side to judge, by how its agent writes the file.
pub(crate) fn each_line(path: &str, stored: Stored, from: u64, mut line: impl FnMut(&[u8], u64, u64, bool)) -> Result<Option<u8>, Failed> {
    let mut file = File::open(path).map_err(|_| Failed)?;
    let mut source: Box<dyn Read> = match stored {
        Stored::Plain => {
            if from > 0 {
                file.seek(SeekFrom::Start(from)).map_err(|_| Failed)?;
            }
            Box::new(file)
        }
        // A cold rollout is never resumed: its stream can only be read from the start
        Stored::Zstd if from > 0 => return Err(Failed),
        Stored::Zstd => Box::new(zstd::stream::read::Decoder::new(file).map_err(|_| Failed)?),
    };
    let mut buf: Vec<u8> = Vec::with_capacity(CHUNK);
    // The stream offset of buf[0]
    let mut base = from;
    let mut last: Option<u8> = None;
    loop {
        let held = buf.len();
        buf.resize(held + CHUNK, 0);
        let n = match source.read(&mut buf[held..]) {
            Ok(n) => n,
            Err(e) if e.kind() == ErrorKind::Interrupted => {
                buf.truncate(held);
                continue;
            }
            // A zstd stream that stops inside a frame: the decoder has handed over every byte it could decode, and the
            // stream ends there. Whether it was cut is judged by the side from the bytes it ends with, not from the
            // decoder's report (token-stats B12).
            Err(e) if stored == Stored::Zstd && e.kind() == ErrorKind::UnexpectedEof => 0,
            Err(_) => return Err(Failed),
        };
        buf.truncate(held + n);
        if n == 0 {
            break;
        }
        last = Some(buf[buf.len() - 1]);
        // What was held has no line feed: only the new bytes are searched
        let mut start = 0;
        let mut search = held;
        while let Some(i) = memchr::memchr(b'\n', &buf[search..]) {
            let nl = search + i;
            line(&buf[start..nl], base + start as u64, base + nl as u64 + 1, true);
            start = nl + 1;
            search = start;
        }
        if start > 0 {
            buf.drain(..start);
            base += start as u64;
        }
    }
    if !buf.is_empty() {
        let len = buf.len() as u64;
        line(&buf, base, base + len, false);
    }
    Ok(last)
}
