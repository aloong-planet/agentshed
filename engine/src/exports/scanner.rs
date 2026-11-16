//! Called by the scanner (src/main/providers/scanner.ts), on the thread that runs the scan, and wherever else a scan's
//! steps run on their own (`scan()` and `TokenEngine.build` given no walk, the scan benchmark): the
//! session walk, and the memory of one run's walks.

use napi::bindgen_prelude::FromNapiValue;
use napi::{Env, JsValue, Result, Unknown};
use napi_derive::napi;

use crate::exports::js::Js;
use crate::sides;
use crate::walk::Held;

/// What one run's session walks keep from one walk to the next — the Codex rollouts' first-line readings
/// (token-stats::QR-002/AC-01) and the Antigravity conversations' folders — held by the run's scanner and never saved
#[napi]
pub struct SessionMemory {
    kept: sides::Kept,
}

#[napi]
impl SessionMemory {
    /// An empty memory: the first walk through it reads everything
    #[napi(constructor, catch_unwind)]
    pub fn new() -> Self {
        SessionMemory { kept: sides::Kept::default() }
    }
}

/// The session walk over the data roots `roots` (the TypeScript `ScanRoots`): the TypeScript `SessionWalk`. With `memory`,
/// a walk opens only what changed since the walk before it through that memory; without one, everything is read and
/// nothing kept. A copy a read needs is made under `tmpParent`, the system temporary directory when it is absent.
/// `held`, a function giving the paths the token store holds, is called at the first directory that is there but cannot
/// be listed; one that throws, or gives anything but strings, holds nothing.
#[napi(catch_unwind)]
pub fn walk_sessions<'env>(
    env: &'env Env,
    roots: Unknown<'env>,
    memory: Option<&mut SessionMemory>,
    tmp_parent: Option<String>,
    held: Option<Unknown<'env>>,
) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let mut none = sides::Kept::default();
    let kept = match memory {
        Some(memory) => &mut memory.kept,
        None => &mut none,
    };
    let ask = held.map(|f| {
        let f = f.raw();
        let js = &js;
        Box::new(move || -> Option<Vec<String>> {
            let paths = js.elements(js.call(f).ok()??).ok()??;
            paths.into_iter().map(|p| js.string(p).ok().flatten().map(|units| String::from_utf16_lossy(&units))).collect()
        }) as Box<dyn FnMut() -> Option<Vec<String>> + '_>
    });
    let walked = sides::walk(&js, roots.raw(), kept, &mut Held::new(ask), tmp_parent.as_deref())?;
    unsafe { Unknown::from_napi_value(env.raw(), walked) }
}
