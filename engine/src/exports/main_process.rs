//! What the main process calls: the display copy's write (crate::display).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, Unknown};
use napi::{Env, Error, JsValue, Result, Status, Task};
use napi_derive::napi;

use crate::display::{stringify, write_atomically};
use crate::exports::js::Js;

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
