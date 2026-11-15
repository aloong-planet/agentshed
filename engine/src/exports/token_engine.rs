//! Called by `TokenEngine` (src/main/providers/token-stats.ts): the titles a side's agent keeps for its sessions apart
//! from their files, which a scan reads at every build; the combination of entries held in memory, for a build with no
//! store and for the restore; the replay strip of a fork's questions, for the session page; the title a fork whose
//! first questions were stripped takes from its first question left; and one session file's metadata, read as the
//! session walk reads it, for the session page's single-file rebuild.

use napi::bindgen_prelude::FromNapiValue;
use napi::sys::napi_value;
use napi::{Env, Error, JsValue, Result, Unknown};
use napi_derive::napi;

use super::side;
use crate::exports::cache_entries::summed;
use crate::exports::js::Js;
use crate::question::{self, Record};
use crate::text;

/// The session titles of the side `kind` keeps under its data root `home`, as the side gives them; a copy a read needs
/// is made under `tmpParent`, the system temporary directory when it is absent
#[napi(catch_unwind)]
pub fn session_titles<'env>(env: &'env Env, kind: String, home: String, tmp_parent: Option<String>) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let answer = side(&kind)?
        .titles(&js, &home, tmp_parent.as_deref())
        .unwrap_or_else(|| Err(Error::from_reason(format!("the engine module does not read {kind} session titles"))))?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}

/// Combines `entries` (`{ path, agg, admitted, title }`, in scan order) as one combination over them gives: the figures
/// a scan derives from them, as `TokenStore.scan` gives a scan's. An entry the combination cannot read is left out of
/// them and named in `leftOut`: in a build with no store, that file's failed read (token-stats A10, B12, F6).
#[napi(catch_unwind)]
pub fn combine_entries<'env>(env: &'env Env, entries: Unknown<'env>) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let mut held = Vec::new();
    for e in js.elements(entries.value().value)?.unwrap_or_default() {
        let path = String::from_utf16_lossy(&js.string(js.get(e, "path")?)?.unwrap_or_default());
        let agg = String::from_utf16_lossy(&js.string(js.get(e, "agg")?)?.unwrap_or_default());
        held.push((path, agg, js.truthy(js.get(e, "admitted")?)?, js.string(js.get(e, "title")?)?));
    }
    let dates = js.local_dates()?;
    let mut left_out = Vec::new();
    // Each round leaves out at least one entry, so the rounds end
    let answer = loop {
        let given: Vec<_> = held.iter().map(|(_, agg, admitted, title)| (agg.as_str(), *admitted, title.as_deref())).collect();
        match crate::group::combine_entries(&dates, &given)? {
            Ok(s) => break summed(&js, &s, &held.iter().map(|(path, ..)| path.as_str()).collect::<Vec<_>>(), None, &left_out)?,
            // In scan order, removed from the last so that the earlier places stand
            Err(bad) => {
                let mut out: Vec<String> = bad.iter().rev().map(|&i| held.remove(i).0).collect();
                out.reverse();
                left_out.extend(out);
            }
        }
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

/// The title the question `text` holds gives its session: `text` is a question's range in a session file of the side
/// `kind`, as the question index recorded it, read; null when it holds no question
#[napi(catch_unwind)]
pub fn question_title<'env>(env: &'env Env, kind: String, text: String) -> Result<Unknown<'env>> {
    let answer = Js::new(env).text_or_null(question::title(side(&kind)?, &text).as_ref())?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}

/// The metadata of the session file `file` of the side `kind`, read as the session walk reads it: the side's walk entry
/// for it, or null when the file gives none
#[napi(catch_unwind)]
pub fn session_meta<'env>(env: &'env Env, kind: String, file: String) -> Result<Unknown<'env>> {
    let js = Js::new(env);
    let answer = side(&kind)?
        .meta(&js, &file)
        .unwrap_or_else(|| Err(Error::from_reason(format!("the engine module does not read {kind} session metadata"))))?;
    unsafe { Unknown::from_napi_value(env.raw(), answer) }
}
