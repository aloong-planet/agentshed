//! What the main process calls: the display copy's write (crate::display), the read of a session file's ranges the
//! session page and both searches make (each side's), and the line rules a question's text and a turn's contents are
//! read by there (each side's).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, Buffer, FromNapiValue, Object, Unknown};
use napi::{Env, Error, JsValue, Result, Status, Task};
use napi_derive::napi;

use super::side;
use crate::display::{stringify, write_atomically};
use crate::exports::js::Js;

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

/// Which lines of `text` the turn holds, one flag per line as `text` splits at its line feeds: `text` is a turn's range
/// in a session file of the side `kind`, as the question index recorded it, read
#[napi(catch_unwind)]
pub fn kept_lines(kind: String, text: String) -> Result<Vec<bool>> {
    Ok(side(&kind)?.kept_lines(&text))
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
