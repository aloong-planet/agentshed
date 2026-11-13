//! The engine module (ADR-0045), loaded through Node-API by the scan worker, the parse workers and the main process.
//! It holds nothing of the accounting yet: each component moves in from TypeScript in a change of its own, proven
//! against the TypeScript implementation by the parity command (`pnpm engine:parity`).
//!
//! Every function it exports catches a panic where it crosses into the application (`#[napi(catch_unwind)]`): the
//! call throws an error naming the panic, and the thread and the process go on (token-stats, Scans and the window).

use napi_derive::napi;

mod seams;

/// The build this module belongs to: the digest of the module's sources that scripts/build-engine.mjs passes in, the
/// same digest the application's code is built with. A module built any other way reports none.
const BUILD: &str = match option_env!("AGENTSHED_ENGINE_BUILD") {
    Some(build) => build,
    None => "",
};

/// The build this module belongs to; the application refuses a module of another build before a scan's first parse
#[napi(catch_unwind)]
pub fn build() -> &'static str {
    BUILD
}
