//! Called by the parse workers (`src/main/parse-worker.ts`, through `runParseJob`), by every other parse a thread runs
//! itself through the same function, and by the parity command (`pnpm engine:parity`): the module's one parse entry, for
//! every side it parses.

use std::panic::{AssertUnwindSafe, catch_unwind};

use napi::bindgen_prelude::FromNapiValue;
use napi::{Env, Error, JsValue, Result, Unknown};
use napi_derive::napi;

use crate::exports::js::Js;
use crate::{seams, sides};

/// Parses one session file. `job` is a TypeScript `ParseJob`; the answer is its `ParseResult`: the file's entry, or null
/// when the file cannot be read. A panic while the file is parsed is that file's failed read, under its side's rule
/// for a read that fails (token-stats, Scans and the window), and the call goes on to answer what that rule gives.
#[napi(catch_unwind)]
pub fn parse<'env>(env: &'env Env, job: Unknown<'env>) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let job = job.raw();
    let kind = js.string(js.get(job, "kind")?)?.map(|k| String::from_utf16_lossy(&k)).unwrap_or_default();
    let side = sides::named(&kind).ok_or_else(|| Error::from_reason(format!("the engine module does not parse {kind} files")))?;
    let file = String::from_utf16_lossy(&js.string(js.get(job, "file")?)?.unwrap_or_default());
    let parsed = catch_unwind(AssertUnwindSafe(|| {
        seams::before_parse(&file);
        side.parse(&js, job)
    }));
    let answer = match parsed {
        Ok(answer) => answer?,
        Err(_) => side.failed(&js, job)?,
    };
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}
