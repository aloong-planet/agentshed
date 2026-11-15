//! Called by `TokenEngine` (src/main/providers/token-stats.ts): the titles a side's agent keeps for its sessions apart
//! from their files, which a scan reads at every build; the combination of entries held in memory, for a build with no
//! store and for the restore; and the replay strip of a fork's questions, for the session page.

use napi::bindgen_prelude::FromNapiValue;
use napi::sys::napi_value;
use napi::{Env, Error, JsValue, Result, Unknown};
use napi_derive::napi;

use crate::exports::cache_entries::summed;
use crate::exports::js::Js;
use crate::question::{self, Record};
use crate::sides;
use crate::text;

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

/// Combines `entries` (`{ path, agg, admitted, title }`, in scan order) as one combination over them gives: the figures
/// a scan derives from them, as `TokenStore.scan` gives a scan's. An entry the combination cannot read throws.
#[napi(catch_unwind)]
pub fn combine_entries<'env>(env: &'env Env, entries: Unknown<'env>) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let mut held = Vec::new();
    for e in js.elements(entries.value().value)?.unwrap_or_default() {
        let path = String::from_utf16_lossy(&js.string(js.get(e, "path")?)?.unwrap_or_default());
        let agg = String::from_utf16_lossy(&js.string(js.get(e, "agg")?)?.unwrap_or_default());
        held.push((path, agg, js.truthy(js.get(e, "admitted")?)?, js.string(js.get(e, "title")?)?));
    }
    let given: Vec<_> = held.iter().map(|(_, agg, admitted, title)| (agg.as_str(), *admitted, title.as_deref())).collect();
    let dates = js.local_dates()?;
    let answer = match crate::group::combine_entries(&dates, &given)? {
        Ok(s) => summed(&js, &s, &held.iter().map(|(path, ..)| path.as_str()).collect::<Vec<_>>(), None, &[])?,
        Err(bad) => return Err(Error::from_reason(format!("the entry for {} is not well formed", held[bad[0]].0))),
    };
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}

/// A question index as JavaScript holds it, `[start, end, turnEnd, at, tools, subagents, fingerprint]` for each question
fn records(js: &Js, list: napi_value) -> Result<Vec<Record>> {
    let mut out = Vec::new();
    for row in js.elements(list)?.unwrap_or_default() {
        let cells = js.elements(row)?.unwrap_or_default();
        let mut n = [None; 7];
        for (i, cell) in cells.into_iter().take(7).enumerate() {
            n[i] = js.number(cell)?;
        }
        let x = |v: Option<f64>| v.unwrap_or(f64::NAN);
        out.push(Record { start: x(n[0]), end: x(n[1]), turn_end: x(n[2]), at: n[3], tools: x(n[4]), subagents: x(n[5]), fingerprint: x(n[6]) });
    }
    Ok(out)
}

/// How many of a Codex fork's leading questions replay its parent's, and its fork state (session-view B2):
/// `{ stripped, state }`. `parent` is the parent's question index, or null when the parent is not in the scan set.
#[napi(catch_unwind)]
pub fn strip_replay_prefix<'env>(
    env: &'env Env,
    child: Unknown<'env>,
    parent: Unknown<'env>,
    forked_at: Option<f64>,
    is_fork: bool,
) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let child = records(&js, child.value().value)?;
    let parent_value = parent.value().value;
    let parent = if js.nullish(parent_value)? { None } else { Some(records(&js, parent_value)?) };
    let (stripped, state) = question::strip_replay_prefix(&child, parent.as_deref(), forked_at, is_fork);
    let answer = js.object(&[("stripped", js.num(stripped as f64)?), ("state", js.text(&text::units(state.name()))?)])?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}
