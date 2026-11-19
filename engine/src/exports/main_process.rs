//! What the main process calls: the display copy's write (crate::display), the read of a session file's ranges the
//! session page and global search make (each side's), the read of a turn the session page expands (each side's, over
//! crate::read), a project's question search and full-text search of a session file (each side's, over crate::search),
//! and the line rules a question's text is read by there (each side's).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, Buffer, FromNapiValue, Object, Unknown, Utf16String};
use napi::{Env, Error, JsValue, Result, Status, Task};
use napi_derive::napi;

use super::side;
use crate::read::Stored;
use crate::sides::Side;
use crate::display::{stringify, write_atomically};
use crate::exports::js::Js;
use crate::search::{Question, Questions, Turn};

/// The question `text` holds, as the session page and both searches show it: `text` is a question's range in a session
/// file of the side `kind`, as the question index recorded it, read; null when it holds no question
#[napi(catch_unwind)]
pub fn question_text<'env>(env: &'env Env, kind: String, text: String) -> Result<Unknown<'env>> {
    let answer = Js::new(env).text_or_null(side(&kind)?.question_text(&text).as_ref())?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}

/// The tool names whose call dispatches a subagent on the side `kind`, which a turn draws as one: the names its question
/// index counts a turn's subagents by
#[napi(catch_unwind)]
pub fn dispatches(kind: String) -> Result<Vec<String>> {
    Ok(side(&kind)?.dispatches().iter().map(|name| (*name).to_owned()).collect())
}

/// A range of a session file, `[start, end)` in the offsets its question index records
#[napi(object)]
pub struct ByteRange {
    pub start: f64,
    pub end: f64,
}

/// What a read of a session file's ranges gave: each range's bytes, in the order the ranges were asked for, and how far
/// into the file's stream the read went
#[napi(object)]
pub struct RangesRead {
    pub bufs: Vec<Buffer>,
    pub bytes_read: f64,
}

/// What settles a read's promise, on the main process's thread
type Settle = Box<dyn FnOnce(Env) -> Result<RangesRead> + Send>;

/// Reads `ranges` of the session file `file`, of the side `kind`, in one pass (session-view C2), on a thread of its own
/// rather than the calling one: the promise settles with each range's bytes, or rejects when the file cannot be read as
/// far as the read goes, what it read is not whole, or the read panicked; nothing else waits on it. Not on the thread
/// pool either: a cold rollout's read decompresses for as long as the file takes, seconds for the largest, and four at
/// once, as the global search reads its corpus, would hold every pool thread the main process's file reads wait on. A
/// thread that cannot be started throws, before any promise is handed out.
#[napi(catch_unwind)]
pub fn read_ranges<'env>(env: &'env Env, kind: String, file: String, ranges: Vec<ByteRange>) -> Result<Object<'env>> {
    let side = side(&kind)?;
    let ranges: Vec<(u64, u64)> = ranges.iter().map(|r| (r.start as u64, r.end as u64)).collect();
    let (deferred, promise) = env.create_deferred::<RangesRead, Settle>()?;
    let named = file.clone();
    std::thread::Builder::new()
        .name("agentshed-read".to_owned())
        .spawn(move || match catch_unwind(AssertUnwindSafe(|| side.read_ranges(&file, &ranges))) {
            Ok(Some(Ok(served))) => {
                let bufs = served.bytes.into_iter().map(Buffer::from).collect();
                let read = RangesRead { bufs, bytes_read: served.through as f64 };
                deferred.resolve(Box::new(move |_| Ok(read)));
            }
            Ok(Some(Err(_))) => {
                deferred.reject(Error::from_reason(format!("{file} could not be read as far as its ranges go")));
            }
            Ok(None) => {
                deferred.reject(Error::from_reason(format!("the engine module does not read {kind} files by range")));
            }
            Err(_) => deferred.reject(Error::from_reason(format!("reading {file} panicked"))),
        })
        .map_err(|e| Error::from_reason(format!("no thread could be started to read {named}: {e}")))?;
    Ok(promise)
}

/// What a read of a turn gave: its question's bytes, the lines of its body the turn holds, each as text, and how far
/// into the file's stream the read went from where it started (the question's start in a plain file, the stream's start
/// in a cold rollout)
#[napi(object)]
pub struct TurnLines {
    pub question: Buffer,
    pub lines: Vec<String>,
    pub bytes_read: f64,
}

type SettleTurn = Box<dyn FnOnce(Env) -> Result<TurnLines> + Send>;

/// What a turn's read hands over from the thread that read it: the question's bytes, the lines the turn holds, and how
/// far into the stream the read went from where it started
type Turned = (Vec<u8>, Vec<String>, u64);

/// Reads a turn of the session file `file` with `side` (`Side::read_turn`) and drops the lines the turn does not hold
/// (the side's `kept_lines`); or why the turn was not read, as the promise rejects with it
fn turned(side: &dyn Side, file: &str, question: (u64, u64), body: Option<(u64, u64)>) -> std::result::Result<Turned, String> {
    let read = catch_unwind(AssertUnwindSafe(|| {
        side.read_turn(file, question, body).map(|read| {
            let kept = side.kept_lines(&read.lines);
            let lines = read.lines.into_iter().zip(kept).filter_map(|(line, kept)| kept.then_some(line)).collect();
            (read.question, lines, read.through - read.started)
        })
    }));
    match read {
        Ok(Ok(turned)) => Ok(turned),
        Ok(Err(_)) => Err(format!("{file} could not be read as far as its turn goes")),
        Err(_) => Err(format!("reading {file} panicked")),
    }
}

fn turn_lines((question, lines, bytes_read): Turned) -> TurnLines {
    TurnLines { question: Buffer::from(question), lines, bytes_read: bytes_read as f64 }
}

/// Reads a turn of the session file `file`, of the side `kind`: its `question`'s range and, when `body` is given, its
/// body's, in one pass that stops at the turn's end (session-view C2). A cold rollout's read runs on a thread of its
/// own, as `read_ranges` reads it and for its reason. A plain file's runs on the thread pool, where the main process's
/// own reads of plain files run, so that it is one of the four plain reads at once session-view D2b bounds them to, as
/// the range read it replaced was. The body is read line by line, each line decoded as it is whole, and the lines the
/// turn does not hold (the side's `kept_lines`) are dropped on the reading thread, so that no allocation holds the
/// whole body but a line of it. The promise settles with the question's bytes and the body's lines, or rejects when the
/// file cannot be read as far as the turn goes, what it read is not whole, or the read panicked. A thread that cannot
/// be started throws, before any promise is handed out.
#[napi(catch_unwind, ts_return_type = "Promise<TurnLines>")]
pub fn read_turn<'env>(env: &'env Env, kind: String, file: String, question: ByteRange, body: Option<ByteRange>) -> Result<Unknown<'env>> {
    let side = side(&kind)?;
    let question = (question.start as u64, question.end as u64);
    let body = body.map(|b| (b.start as u64, b.end as u64));
    if side.stored(&file) == Stored::Plain {
        return Ok(env.spawn(ReadTurn { side, file, question, body })?.promise_object().to_unknown());
    }
    let (deferred, promise) = env.create_deferred::<TurnLines, SettleTurn>()?;
    let named = file.clone();
    std::thread::Builder::new()
        .name("agentshed-read".to_owned())
        .spawn(move || match turned(side, &file, question, body) {
            Ok(turned) => deferred.resolve(Box::new(move |_| Ok(turn_lines(turned)))),
            Err(reason) => deferred.reject(Error::from_reason(reason)),
        })
        .map_err(|e| Error::from_reason(format!("no thread could be started to read {named}: {e}")))?;
    Ok(promise.to_unknown())
}

/// A plain file's turn read, on the thread pool
struct ReadTurn {
    side: &'static dyn Side,
    file: String,
    question: (u64, u64),
    body: Option<(u64, u64)>,
}

impl Task for ReadTurn {
    type Output = Turned;
    type JsValue = TurnLines;

    fn compute(&mut self) -> Result<Turned> {
        turned(self.side, &self.file, self.question, self.body).map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: Env, turned: Turned) -> Result<TurnLines> {
        Ok(turn_lines(turned))
    }
}

/// A turn of a session file as its question index records it, in the offsets of the file's stream: its question's
/// range `[start, questionEnd)`, and the turn's `[start, end)`
#[napi(object)]
pub struct TurnRange {
    pub start: f64,
    pub question_end: f64,
    pub end: f64,
}

/// A turn with a hit in its body, by its index among the turns asked about, and the snippet of its first such hit
#[napi(object)]
pub struct BodyHit {
    pub turn: u32,
    pub snippet: Option<Utf16String>,
}

/// What the full-text search of a session file found: how many hits fall in no turn, and each turn with a hit in its
/// body, by index, ascending
#[napi(object)]
pub struct FullTextFound {
    pub folded: f64,
    pub body: Vec<BodyHit>,
}

type SettleFound = Box<dyn FnOnce(Env) -> Result<FullTextFound> + Send>;

/// Searches the session file `file`, of the side `kind`, for `needle` against its `turns` (session-view D2, D3), on a
/// thread of its own, as `read_ranges` reads (and for its reason): the stream is read line by line and never held
/// whole. The promise settles with what the search found, or rejects when the file cannot be read to its end, what it
/// read is not whole, or the search panicked; nothing found is then given. A thread that cannot be started throws,
/// before any promise is handed out.
#[napi(catch_unwind)]
pub fn search_full_text<'env>(env: &'env Env, kind: String, file: String, needle: Utf16String, turns: Vec<TurnRange>) -> Result<Object<'env>> {
    let side = side(&kind)?;
    let turns: Vec<Turn> = turns.iter().map(|t| Turn { start: t.start as u64, question_end: t.question_end as u64, end: t.end as u64 }).collect();
    let (deferred, promise) = env.create_deferred::<FullTextFound, SettleFound>()?;
    let named = file.clone();
    std::thread::Builder::new()
        .name("agentshed-search".to_owned())
        .spawn(move || match catch_unwind(AssertUnwindSafe(|| side.full_text(&file, &needle, &turns))) {
            Ok(Ok(found)) => {
                let body = found.body.into_iter().map(|(turn, snippet)| BodyHit { turn, snippet: snippet.map(Utf16String::from) }).collect();
                let found = FullTextFound { folded: found.folded as f64, body };
                deferred.resolve(Box::new(move |_| Ok(found)));
            }
            Ok(Err(_)) => deferred.reject(Error::from_reason(format!("{file} could not be searched to its end"))),
            Err(_) => deferred.reject(Error::from_reason(format!("searching {file} panicked"))),
        })
        .map_err(|e| Error::from_reason(format!("no thread could be started to search {named}: {e}")))?;
    Ok(promise)
}

/// A question the question search gave back: by its index among the questions asked about, its text as the question
/// list shows it, null when its range holds no question, and whether it holds the needle
#[napi(object)]
pub struct QuestionFound {
    pub question: u32,
    pub text: Option<Utf16String>,
    pub hit: bool,
}

type SettleQuestions = Box<dyn FnOnce(Env) -> Result<Vec<QuestionFound>> + Send>;

/// Searches the questions of the session file `file` with `side` (`Side::read_questions`, `search::Questions`); or why
/// they were not searched, as the promise rejects with it
fn searched(side: &dyn Side, file: &str, needle: &[u16], ranges: &[(u64, u64)], every: bool) -> std::result::Result<Vec<Question>, String> {
    let read = catch_unwind(AssertUnwindSafe(|| {
        let shown = |range: &str| side.question_text(range);
        let mut questions = Questions::new(needle, every, &shown);
        side.read_questions(file, ranges, &mut |i, range| questions.question(i, range)).map(|()| questions.found())
    }));
    match read {
        Ok(Ok(found)) => Ok(found),
        Ok(Err(_)) => Err(format!("{file} could not be read as far as its questions go")),
        Err(_) => Err(format!("searching {file} panicked")),
    }
}

fn questions_found(found: Vec<Question>) -> Vec<QuestionFound> {
    found.into_iter().map(|q| QuestionFound { question: q.index, text: q.text.map(Utf16String::from), hit: q.hit }).collect()
}

/// Searches the questions of the session file `file`, of the side `kind`, for `needle` (session-view D2, D4): each of
/// `questions`, a question's range, read, and its text, as the question list shows it, matched as global search matches
/// one. The promise settles with each question that hits, or with every question when `every`, ascending, with its text
/// and whether it hits; or rejects when the file cannot be read as far as its questions go, what it read is not whole,
/// or the search panicked. A plain file's ranges are read where they lie, on the thread pool, as a plain turn read is
/// (`read_turn`), so that it is one of the four plain reads at once session-view D2b bounds them to; a cold rollout's
/// in one pass of its stream, on a thread of its own, as `read_ranges` reads it and for its reason. A thread that
/// cannot be started throws, before any promise is handed out.
#[napi(catch_unwind, ts_return_type = "Promise<Array<QuestionFound>>")]
pub fn search_questions<'env>(env: &'env Env, kind: String, file: String, needle: Utf16String, questions: Vec<ByteRange>, every: bool) -> Result<Unknown<'env>> {
    let side = side(&kind)?;
    let ranges: Vec<(u64, u64)> = questions.iter().map(|r| (r.start as u64, r.end as u64)).collect();
    if side.stored(&file) == Stored::Plain {
        return Ok(env.spawn(SearchQuestions { side, file, needle, ranges, every })?.promise_object().to_unknown());
    }
    let (deferred, promise) = env.create_deferred::<Vec<QuestionFound>, SettleQuestions>()?;
    let named = file.clone();
    std::thread::Builder::new()
        .name("agentshed-read".to_owned())
        .spawn(move || match searched(side, &file, &needle, &ranges, every) {
            Ok(found) => deferred.resolve(Box::new(move |_| Ok(questions_found(found)))),
            Err(reason) => deferred.reject(Error::from_reason(reason)),
        })
        .map_err(|e| Error::from_reason(format!("no thread could be started to search {named}: {e}")))?;
    Ok(promise.to_unknown())
}

/// A plain file's question search, on the thread pool
struct SearchQuestions {
    side: &'static dyn Side,
    file: String,
    needle: Utf16String,
    ranges: Vec<(u64, u64)>,
    every: bool,
}

impl Task for SearchQuestions {
    type Output = Vec<Question>;
    type JsValue = Vec<QuestionFound>;

    fn compute(&mut self) -> Result<Vec<Question>> {
        searched(self.side, &self.file, &self.needle, &self.ranges, self.every).map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: Env, found: Vec<Question>) -> Result<Vec<QuestionFound>> {
        Ok(questions_found(found))
    }
}

/// Writes `copy` to `file` as the text `JSON.stringify(copy)` gives. The value is read here, on the calling thread, as
/// it stands now; the file is written on the thread pool, and the promise settles once it is replaced, or rejects with
/// why it was not.
#[napi(catch_unwind)]
pub fn write_display_copy(env: Env, file: String, copy: Unknown<'_>) -> Result<AsyncTask<WriteDisplayCopy>> {
    let text = stringify(&Js::new(&env), copy.value().value)?;
    Ok(AsyncTask::new(WriteDisplayCopy { file: PathBuf::from(file), text }))
}

pub struct WriteDisplayCopy {
    file: PathBuf,
    text: Vec<u8>,
}

impl Task for WriteDisplayCopy {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<()> {
        // A panic on the thread pool would end the application: it fails the write instead
        match catch_unwind(AssertUnwindSafe(|| write_atomically(&self.file, &self.text))) {
            Ok(written) => written.map_err(|e| Error::new(Status::GenericFailure, e.to_string())),
            Err(_) => Err(Error::new(Status::GenericFailure, format!("writing the display copy to {} panicked", self.file.display()))),
        }
    }

    fn resolve(&mut self, _env: Env, _output: ()) -> Result<()> {
        Ok(())
    }
}
