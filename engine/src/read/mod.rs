//! A session file read as lines, each with its byte range: the file itself, or for a cold rollout (`.jsonl.zst`) its
//! zstd stream decompressed as it is read (token-stats B12), its offsets then offsets in that stream (session-view C2).
//! Or its first line alone, read no further than its line feed.
//!
//! A line ends at a line feed, which never occurs inside a UTF-8 character, so the bytes are split there and a line is
//! decoded only once it is whole. A line's range runs from its first byte to after its line feed, or to the stream's end
//! for a last line without one, so adjacent lines meet with no gap. One buffer holds the line being assembled, and grows
//! to the longest line of the file.

use std::fs::File;
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::os::unix::fs::FileExt;

/// How much of the file one read takes
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

/// The stream's first line, its line feed left off: the file read `step` bytes at a time up to its first line feed and
/// no further, a cold rollout's bytes decompressed after each step as far as they go. The whole stream when it holds no
/// line feed; None when it is empty, or when `max` bytes of it hold no line feed — given up rather than eating memory.
/// Failed when the file cannot be opened or read, or its stream cannot be decompressed.
pub(crate) fn first_line(path: &str, stored: Stored, step: usize, max: usize) -> Result<Option<Vec<u8>>, Failed> {
    let file = File::open(path).map_err(|_| Failed)?;
    let mut buf = vec![0u8; step];
    let mut offset: u64 = 0;
    match stored {
        Stored::Plain => {
            let mut held: Vec<u8> = Vec::new();
            loop {
                let n = read_at(&file, &mut buf, offset)?;
                if n == 0 {
                    return Ok(if held.is_empty() { None } else { Some(held) });
                }
                let got = &buf[..n];
                if let Some(nl) = memchr::memchr(b'\n', got) {
                    held.extend_from_slice(&got[..nl]);
                    return Ok(Some(held));
                }
                held.extend_from_slice(got);
                offset += n as u64;
                if offset >= max as u64 {
                    return Ok(None);
                }
            }
        }
        Stored::Zstd => {
            let mut decoder = zstd::stream::raw::Decoder::new().map_err(|_| Failed)?;
            let mut out: Vec<u8> = Vec::new();
            loop {
                let n = read_at(&file, &mut buf, offset)?;
                if n > 0 {
                    decompress(&mut decoder, &buf[..n], &mut out)?;
                    offset += n as u64;
                }
                if let Some(nl) = memchr::memchr(b'\n', &out) {
                    out.truncate(nl);
                    return Ok(Some(out));
                }
                // A stream that stops inside a frame gives what it decoded, as its last line does to `each_line`
                if n == 0 {
                    return Ok(if out.is_empty() { None } else { Some(out) });
                }
                if out.len() >= max {
                    return Ok(None);
                }
            }
        }
    }
}

/// Reads at `offset` as `readSync` with a position does, a read interrupted by a signal taken again
fn read_at(file: &File, buf: &mut [u8], offset: u64) -> Result<usize, Failed> {
    loop {
        match file.read_at(buf, offset) {
            Ok(n) => return Ok(n),
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            Err(_) => return Err(Failed),
        }
    }
}

/// Decompresses all of `input` onto `out`, as far as the stream it continues can be decoded; a frame that ends is
/// followed by the next, a skippable one passed over
fn decompress(decoder: &mut zstd::stream::raw::Decoder<'_>, input: &[u8], out: &mut Vec<u8>) -> Result<(), Failed> {
    use zstd::stream::raw::{InBuffer, Operation, OutBuffer};
    let mut input = InBuffer::around(input);
    let mut chunk = vec![0u8; 128 * 1024];
    loop {
        let before = input.pos();
        let mut output = OutBuffer::around(&mut chunk[..]);
        decoder.run(&mut input, &mut output).map_err(|_| Failed)?;
        let produced = output.pos();
        out.extend_from_slice(&chunk[..produced]);
        // Done once every byte is taken and the output had room to spare; libzstd always moves while it has room
        if input.pos() == input.src.len() && produced < chunk.len() {
            return Ok(());
        }
        if input.pos() == before && produced == 0 {
            return Err(Failed);
        }
    }
}
