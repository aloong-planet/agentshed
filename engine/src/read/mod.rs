//! A session file read as lines, each with its byte range: the file itself, or for a cold rollout (`.jsonl.zst`) its
//! zstd stream decompressed as it is read (token-stats B12), its offsets then offsets in that stream (session-view C2).
//!
//! A line ends at a line feed, which never occurs inside a UTF-8 character, so the bytes are split there and a line is
//! decoded only once it is whole. A line's range runs from its first byte to after its line feed, or to the stream's end
//! for a last line without one, so adjacent lines meet with no gap. One buffer holds the line being assembled, and grows
//! to the longest line of the file.

use std::fs::File;
use std::io::{ErrorKind, Read, Seek, SeekFrom};

/// How much of the file one read takes
const CHUNK: usize = 1024 * 1024;

/// How a file's bytes are stored
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stored {
    Plain,
    /// zstd-compressed, read from its start only
    Zstd,
}

/// The file could not be read to its end: it could not be opened or read, its stream could not be decompressed, or a
/// decompressed stream did not end with a line feed. What its lines gave is then not used.
#[derive(Debug)]
pub(crate) struct Failed;

/// Reads `path` from byte `from` on, calling `line` with each line's bytes (its line feed left off) and its range.
/// Offsets count from the start of the stream, `from` included.
pub(crate) fn each_line(path: &str, stored: Stored, from: u64, mut line: impl FnMut(&[u8], u64, u64)) -> Result<(), Failed> {
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
            // A zstd stream that stops inside a frame: the decoder has handed over every byte it could decode. Whether
            // the stream was cut is judged by the recorder's mechanism, below, not by the decoder (B12).
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
            line(&buf[start..nl], base + start as u64, base + nl as u64 + 1);
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
        line(&buf, base, base + len);
    }
    // Every rollout line ends with a line feed and a cold rollout is never mid-write, so a decompressed stream that does
    // not end with one was cut short (B12). A cut that lands exactly on a line end escapes this and reads as a shorter
    // session.
    if stored == Stored::Zstd && last.is_some_and(|b| b != b'\n') {
        return Err(Failed);
    }
    Ok(())
}
