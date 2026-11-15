//! Called by `TokenEngine` (src/main/providers/token-stats.ts), on the thread that runs the scan: the titles a side's
//! agent keeps for its sessions apart from their files, which a scan reads at every build.

use napi::bindgen_prelude::FromNapiValue;
use napi::{Env, Error, Result, Unknown};
use napi_derive::napi;

use crate::exports::js::Js;
use crate::sides;

/// The session titles of the side `kind` keeps under its data root `home`, as the side gives them; a copy a read needs
/// is made under `tmpParent`, the system temporary directory when it is absent
#[napi(catch_unwind)]
pub fn session_titles<'env>(env: &'env Env, kind: String, home: String, tmp_parent: Option<String>) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let side = sides::named(&kind).ok_or_else(|| Error::from_reason(format!("the engine module does not read {kind} files")))?;
    let answer = side
        .titles(&js, &home, tmp_parent.as_deref())
        .unwrap_or_else(|| Err(Error::from_reason(format!("the engine module does not read {kind} session titles"))))?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}
