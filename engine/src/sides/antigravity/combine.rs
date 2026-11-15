//! Antigravity CLI's entries read back from the store, and a group of them combined (token-stats::REQ-003/AC-01, AC-03,
//! AC-07; session-view::REQ-003, REQ-005): each model call counted once across every conversation, the first in scan
//! order keeping it, since a fork's database can carry its parent's calls; a call without an identity counts where it
//! is. A group is linked by the call identities its conversations share. A conversation that cannot be read in the
//! supported format is counted and nothing more.

use std::collections::HashSet;

use napi::Result;

use crate::exports::js::LocalDates;
use crate::group::{self, Builder, Decoded, Fields, Fork, Member, Session};
use crate::json::{self, Value};
use crate::store::Facts;
use crate::text::{self, Units};

/// One model call as the aggregate keeps it: `[identity, time, input, output, cacheRead, cacheWrite, model]`
struct Call {
    identity: Option<Units>,
    at: Option<f64>,
    /// Input, output, cache reads, cache writes
    figures: [f64; 4],
    model: Option<Units>,
}

fn call(cells: &[Value<'_>]) -> Call {
    Call {
        identity: json::cell_text(&cells[0]),
        at: json::cell_number_or_null(&cells[1]),
        figures: [json::cell_number(&cells[2]), json::cell_number(&cells[3]), json::cell_number(&cells[4]), json::cell_number(&cells[5])],
        model: json::cell_text(&cells[6]),
    }
}

struct Agg {
    fields: Fields,
    unreadable: bool,
    calls: Vec<Call>,
    conversation_id: Units,
    fork_of: Option<Units>,
}

/// The aggregate, when it is well formed: the fields every side carries, `unreadable` and `subagent` booleans, the calls
/// rows of seven, `conversationId` a string, `forkOf` a string or null
fn read(agg: &str) -> Option<Agg> {
    let mut calls = None;
    let [mut unreadable, mut conversation, mut subagent, mut fork_of] = [None; 4];
    let common = group::read(agg, |key, r| {
        let slot = match () {
            () if key.is("calls") => {
                calls = Some(json::rows(r, "SNnnnnS", call)?);
                return Ok(());
            }
            () if key.is("unreadable") => &mut unreadable,
            () if key.is("conversationId") => &mut conversation,
            () if key.is("subagent") => &mut subagent,
            () if key.is("forkOf") => &mut fork_of,
            () => return r.skip(),
        };
        group::field(slot, r)
    })?;
    let fields = common.fields()?;
    group::boolean(subagent)?;
    Some(Agg {
        fields,
        unreadable: group::boolean(unreadable)?,
        calls: calls??,
        conversation_id: group::string(conversation)?,
        fork_of: group::string_or_null(fork_of)?,
    })
}

pub(super) fn decode(agg: &str) -> Option<Decoded> {
    let a = read(agg)?;
    let keys = if a.unreadable { Vec::new() } else { a.calls.into_iter().filter_map(|c| c.identity).collect() };
    let facts = Facts {
        kind: "antigravity".to_owned(),
        listed: a.fields.listed,
        project: String::from_utf16_lossy(&a.fields.project_key),
        // The id agy's titles and a fork's copied steps name the conversation by, when it could be read
        own: (!a.unreadable).then(|| String::from_utf16_lossy(&a.conversation_id)),
    };
    Some(Decoded { keys, facts })
}

pub(super) fn combine(dates: &LocalDates<'_>, members: &[Member<'_>], out: &mut Builder) -> Result<std::result::Result<(), u32>> {
    let mut aggs = Vec::with_capacity(members.len());
    for m in members {
        match read(m.agg) {
            Some(a) => aggs.push(a),
            None => return Ok(Err(m.index)),
        }
    }
    let mut seen: HashSet<Units> = HashSet::new();
    for (m, agg) in members.iter().zip(aggs) {
        if agg.unreadable {
            out.unreadable();
            continue;
        }
        let f = agg.fields;
        // The conversation's own usage: the calls it keeps after the match across databases
        let mut tokens = 0.0;
        let mut k = 0;
        for c in agg.calls {
            if let Some(identity) = c.identity
                && !seen.insert(identity)
            {
                continue;
            }
            // The four fields (AC-03): agy's input already leaves the cache reads out, and its output holds the thinking
            let [input, output, read, write] = c.figures;
            let total = input + output + read + write;
            tokens += total;
            let day = match c.at {
                Some(ts) => Some(text::day(dates.of(ts)?)),
                None => None,
            };
            out.row(m.index, k, day.as_deref(), "antigravity", &f.project_key, c.model.as_deref().unwrap_or_default(), [input, output, read, write, total]);
            k += 1;
            if !f.project_key.is_empty() {
                out.project(2, m.index, 0, &f.project_key);
            }
        }
        // A subagent, a conversation that asked nothing and one in an unregistered folder have no session; a fork is
        // marked as one, never uncertain (session-view::REQ-005/AC-05)
        if !f.project_key.is_empty() && f.listed {
            out.project(2, m.index, 0, &f.project_key);
            out.session(Session {
                member: m.index,
                project: f.project_key,
                side: text::units("antigravity"),
                // agy's own title for it, read beside it, before the first question's (session-view::REQ-003/AC-03)
                title: m.title.map(<[u16]>::to_vec).or(f.title),
                at: f.at,
                tokens,
                file: f.file,
                questions: f.questions.len() as f64,
                fork: if agg.fork_of.is_none() { Fork::None } else { Fork::Stripped },
                retitle: None,
            });
        }
    }
    Ok(Ok(()))
}
