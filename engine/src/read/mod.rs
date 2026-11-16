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
    let mut source = source(path, stored, from)?;
    // The line being assembled is buf[..held]. Each read fills buf[held..held + n], and only those n bytes join it;
    // past them the buffer keeps whatever an earlier read left there, which nothing reads. So the buffer is zeroed as
    // it is allocated and as it grows, not before every read: zeroing a chunk before each read took 3.1% of a cold
    // scan's parse workers' samples (#453).
    let mut buf: Vec<u8> = vec![0; CHUNK];
    let mut held = 0;
    // The stream offset of buf[0]
    let mut base = from;
    let mut last: Option<u8> = None;
    loop {
        if buf.len() < held + CHUNK {
            buf.resize(held + CHUNK, 0);
        }
        let n = take(&mut *source, stored, &mut buf[held..held + CHUNK])?;
        if n == 0 {
            break;
        }
        let filled = held + n;
        last = Some(buf[filled - 1]);
        // What was held has no line feed: only the new bytes are searched
        let mut start = 0;
        let mut search = held;
        while let Some(i) = memchr::memchr(b'\n', &buf[search..filled]) {
            let nl = search + i;
            line(&buf[start..nl], base + start as u64, base + nl as u64 + 1, true);
            start = nl + 1;
            search = start;
        }
        // The line not yet ended moves to the buffer's start
        if start > 0 {
            buf.copy_within(start..filled, 0);
            base += start as u64;
        }
        held = filled - start;
    }
    if held > 0 {
        line(&buf[..held], base, base + held as u64, false);
    }
    Ok(last)
}

/// The stream of `path` from byte `from` on: the file itself, or a cold rollout's zstd stream decompressed as it is
/// read, every frame of it in turn. Failed when the file cannot be opened, or a cold rollout is asked for from past its
/// start.
fn source(path: &str, stored: Stored, from: u64) -> Result<Box<dyn Read>, Failed> {
    let mut file = File::open(path).map_err(|_| Failed)?;
    match stored {
        Stored::Plain => {
            if from > 0 {
                file.seek(SeekFrom::Start(from)).map_err(|_| Failed)?;
            }
            Ok(Box::new(file))
        }
        // A cold rollout is never resumed: its stream can only be read from the start
        Stored::Zstd if from > 0 => Err(Failed),
        Stored::Zstd => Ok(Box::new(zstd::stream::read::Decoder::new(file).map_err(|_| Failed)?)),
    }
}

/// One read of the stream into `buf`: how many bytes it gave, 0 at the stream's end. A read interrupted by a signal is
/// taken again.
fn take(source: &mut dyn Read, stored: Stored, buf: &mut [u8]) -> Result<usize, Failed> {
    loop {
        match source.read(buf) {
            Ok(n) => return Ok(n),
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            // A zstd stream that stops inside a frame: the decoder has handed over every byte it could decode, and the
            // stream ends there. Whether it was cut is judged by the side from the bytes it ends with, not from the
            // decoder's report (token-stats B12).
            Err(e) if stored == Stored::Zstd && e.kind() == ErrorKind::UnexpectedEof => return Ok(0),
            Err(_) => return Err(Failed),
        }
    }
}

/// What a read of ranges served
pub(crate) struct Served {
    /// Each range's bytes, in the order the ranges were asked for: as much of the range as the stream holds
    pub(crate) bytes: Vec<Vec<u8>>,
    /// How far into the stream the read went, no further than the last range's end
    pub(crate) through: u64,
    /// The last byte the read took, None when it took none
    pub(crate) last: Option<u8>,
    /// Whether the read reached the stream's end, rather than stopping once the last range had passed
    pub(crate) ended: bool,
}

/// Reads the stream of `path` from its start, `CHUNK` bytes at a time, and serves each of `ranges`, `[start, end)` in
/// the stream's offsets, in one pass that stops once the last range's end has passed. What is held is the bytes served
/// and one chunk, not the stream: a range's bytes are joined into one buffer on this thread as the read ends. No ranges
/// open nothing. Whether a stream that ends short of a line feed is whole is for the side to judge, from `last` when
/// `ended`.
pub(crate) fn ranges(path: &str, stored: Stored, ranges: &[(u64, u64)]) -> Result<Served, Failed> {
    if ranges.is_empty() {
        return Ok(Served { bytes: Vec::new(), through: 0, last: None, ended: false });
    }
    crate::seams::before_range_read(path);
    let last_end = ranges.iter().map(|&(_, end)| end).max().unwrap_or(0);
    let mut source = source(path, stored, 0)?;
    let mut buf: Vec<u8> = vec![0; CHUNK];
    let mut pieces: Vec<Vec<Vec<u8>>> = ranges.iter().map(|_| Vec::new()).collect();
    let mut pos: u64 = 0;
    let mut last: Option<u8> = None;
    let mut ended = false;
    while pos < last_end {
        let n = take(&mut *source, stored, &mut buf)?;
        if n == 0 {
            ended = true;
            break;
        }
        last = Some(buf[n - 1]);
        let chunk_end = pos + n as u64;
        for (i, &(start, end)) in ranges.iter().enumerate() {
            let s = start.max(pos);
            let e = end.min(chunk_end);
            if s < e {
                pieces[i].push(buf[(s - pos) as usize..(e - pos) as usize].to_vec());
            }
        }
        pos = chunk_end;
    }
    let bytes = pieces
        .into_iter()
        .map(|mut p| if p.len() == 1 { p.pop().unwrap_or_default() } else { p.concat() })
        .collect();
    Ok(Served { bytes, through: pos.min(last_end), last, ended })
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
