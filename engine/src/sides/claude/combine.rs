//! Claude Code's entries read back from the store, and a group of them combined (token-stats A3–A6; ADR-0005): each
//! usage entry kept once across the group's files — the same message id and request id, or the same message id when
//! either entry is a sidechain's (a subagent replays its parent's messages under a new request id, A4) — the
//! non-sidechain copy kept, or else the one with the larger four-field sum; each session file listed in its project
//! with the usage it keeps. The key a group is linked by is the message id alone, which every one of those matches
//! shares.

use std::collections::HashMap;

use napi::Result;

use crate::exports::js::LocalDates;
use crate::group::{self, Builder, Decoded, Fields, Fork, Member, Session};
use crate::json::{self, Value};
use crate::store::Facts;
use crate::text::{self, Units};

/// One usage entry as the aggregate keeps it: `[id, requestId, sidechain, input, output, cacheRead, cacheWrite, model,
/// day]`
struct Entry {
    id: Option<Units>,
    request_id: Option<Units>,
    sidechain: f64,
    /// Input, output, cache reads, cache writes
    figures: [f64; 4],
    model: Option<Units>,
    day: Option<Units>,
}

impl Entry {
    /// The entry's total: the four fields
    fn total(&self) -> f64 {
        let [input, output, read, write] = self.figures;
        input + output + read + write
    }
}

fn entry(cells: &[Value<'_>]) -> Entry {
    Entry {
        id: json::cell_text(&cells[0]),
        request_id: json::cell_text(&cells[1]),
        sidechain: json::cell_number(&cells[2]),
        figures: [json::cell_number(&cells[3]), json::cell_number(&cells[4]), json::cell_number(&cells[5]), json::cell_number(&cells[6])],
        model: json::cell_text(&cells[7]),
        day: json::cell_text(&cells[8]),
    }
}

struct Agg {
    fields: Fields,
    entries: Vec<Entry>,
}

/// The aggregate, when it is well formed: the fields every side carries, the entries rows of nine, `forkPoints` a number
fn read(agg: &str) -> Option<Agg> {
    let (mut entries, mut fork_points) = (None, None);
    let common = group::read(agg, |key, r| {
        if key.is("entries") {
            entries = Some(json::rows(r, "SSnnnnnSS", entry)?);
        } else if key.is("forkPoints") {
            group::field(&mut fork_points, r)?;
        } else {
            r.skip()?;
        }
        Ok(())
    })?;
    let fields = common.fields()?;
    group::number(fork_points)?;
    Some(Agg { fields, entries: entries?? })
}

pub(super) fn decode(agg: &str) -> Option<Decoded> {
    let a = read(agg)?;
    let keys = a.entries.into_iter().filter_map(|e| e.id).collect();
    let facts = Facts {
        kind: "claude".to_owned(),
        listed: a.fields.listed,
        project: String::from_utf16_lossy(&a.fields.project_key),
        own: None,
    };
    Some(Decoded { keys, facts })
}

/// Whether `candidate` replaces the entry `held` keeps for their message: the non-sidechain one wins, otherwise the one
/// with the larger four-field sum
fn replaces(held: &Entry, candidate: &Entry) -> bool {
    if held.sidechain != candidate.sidechain {
        return held.sidechain == 1.0 && candidate.sidechain == 0.0;
    }
    candidate.total() > held.total()
}

/// An entry kept: which member's which entry, and where it was first kept, which is where its usage is touched
struct Kept {
    member: usize,
    entry: usize,
    first: (u32, u32),
}

pub(super) fn combine(_dates: &LocalDates<'_>, members: &[Member<'_>], out: &mut Builder) -> Result<std::result::Result<(), u32>> {
    let mut aggs = Vec::with_capacity(members.len());
    for m in members {
        match read(m.agg) {
            Some(a) => aggs.push(a),
            None => return Ok(Err(m.index)),
        }
    }
    let mut kept: Vec<Kept> = Vec::new();
    let mut by_exact: HashMap<Units, usize> = HashMap::new();
    let mut by_id: HashMap<Units, Vec<usize>> = HashMap::new();
    for (a, agg) in aggs.iter().enumerate() {
        for (k, e) in agg.entries.iter().enumerate() {
            let first = (members[a].index, k as u32);
            let Some(id) = &e.id else {
                kept.push(Kept { member: a, entry: k, first });
                continue;
            };
            // `${id}\x00${requestId ?? ''}`
            let mut exact = id.clone();
            exact.push(0);
            exact.extend_from_slice(e.request_id.as_deref().unwrap_or_default());
            let mut found = by_exact.get(&exact).copied();
            if found.is_none() {
                // The sidechain fallback: matched by the message id alone when either side is a sidechain
                found = by_id.get(id).into_iter().flatten().copied().find(|&i| {
                    let held = &aggs[kept[i].member].entries[kept[i].entry];
                    held.sidechain == 1.0 || e.sidechain == 1.0
                });
            }
            match found {
                None => {
                    by_exact.insert(exact, kept.len());
                    by_id.entry(id.clone()).or_default().push(kept.len());
                    kept.push(Kept { member: a, entry: k, first });
                }
                Some(i) => {
                    if replaces(&aggs[kept[i].member].entries[kept[i].entry], e) {
                        kept[i].member = a;
                        kept[i].entry = k;
                        by_exact.insert(exact, i);
                    }
                }
            }
        }
    }
    let mut tokens = vec![0.0; aggs.len()];
    for slot in &kept {
        let agg = &aggs[slot.member];
        let e = &agg.entries[slot.entry];
        let total = e.total();
        tokens[slot.member] += total;
        let [input, output, read, write] = e.figures;
        let model = e.model.as_deref().unwrap_or_default();
        out.row(slot.first.0, slot.first.1, e.day.as_deref(), "claude", &agg.fields.project_key, model, [input, output, read, write, total]);
        // Registers the project; its figures are derived from its rows
        if !agg.fields.project_key.is_empty() {
            out.project(0, slot.first.0, slot.first.1, &agg.fields.project_key);
        }
    }
    // A session per listed file, its tokens the sum of the entries it keeps
    for (a, agg) in aggs.into_iter().enumerate() {
        let f = agg.fields;
        if !f.listed || f.project_key.is_empty() {
            continue;
        }
        let member = members[a].index;
        out.project(1, member, 0, &f.project_key);
        out.session(Session {
            member,
            project: f.project_key,
            side: text::units("claude"),
            title: f.title,
            at: f.at,
            tokens: tokens[a],
            file: f.file,
            questions: f.questions.len() as f64,
            // Claude's branches are resolved by the last-leaf walk-back when it is indexed: no replay prefix
            fork: Fork::None,
            retitle: None,
        });
    }
    Ok(Ok(()))
}
