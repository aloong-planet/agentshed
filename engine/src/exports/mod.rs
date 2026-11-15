//! Every function the module exports, one file per caller, and the conversions between JavaScript's values and the
//! module's (`js`), which the sides and the display copy's writer read JavaScript values through as the exports do:
//! no other file reads one, but for the arguments napi-rs converts at the call. An export converts and dispatches; it
//! holds no rule: the rules live in the modules it calls.

mod cache_entries;
pub(crate) mod js;
mod loader;
mod main_process;
mod parse_workers;
mod tests;
mod token_engine;

use crate::sides::{self, Side};

/// The side whose files `kind` names, for an export that reads them; a side the module does not read throws
fn side(kind: &str) -> napi::Result<&'static dyn Side> {
    sides::named(kind).ok_or_else(|| napi::Error::from_reason(format!("the engine module does not read {kind} files")))
}
