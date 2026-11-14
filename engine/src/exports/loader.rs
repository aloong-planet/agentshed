//! Called by the loader on every thread that loads the module (`src/main/engine-module.ts`) and by the build script that
//! checks a module it built (`scripts/build-engine.mjs`).

use napi_derive::napi;

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
