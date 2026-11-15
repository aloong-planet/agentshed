//! What the main process calls: the display copy's write (crate::display), and the line rules a question's text and a
//! turn's contents are read by on the session page and in both searches (each side's).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, FromNapiValue, Unknown};
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
