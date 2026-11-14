//! Every function the module exports, one file per caller, and the conversions between JavaScript's values and the
//! module's (`js`). An export converts and dispatches; it holds no rule: the rules live in the modules it calls.

mod cache_entries;
pub(crate) mod js;
mod loader;
mod main_process;
mod parse_workers;
mod tests;
