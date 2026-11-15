//! Which Claude Code line holds a human question, what a line called, and which questions stay once the session's
//! branches are resolved (session-view B1, B3, C3). The question index, a question's text on the session page and in
//! both searches, and the subagent dispatches the session page's turns draw all take these rules from here.

use std::collections::{HashMap, HashSet};

use super::line::{self, Content, Line};
use crate::json;
use crate::question::Calls;
use crate::text::{self, Units};

/// A human question's raw text (session-view B1): a `type=user` line that is no sidechain — a sidechain is a
/// subagent's own transcript, whose user message is the prompt its parent dispatched — whose content is a string, or
/// an array holding text segments, their texts joined by a space.
///
/// A tool result fed back in is left out by the "take text segments" rule itself: enumerating all 12,734 user content
/// arrays across the repository, the segment type combinations are only three — `(tool_result)` 12541, `(text)` 142,
/// `(image,text)` 51 — so a tool result never comes with text, and a tool result segment has no text of its own.
pub(super) fn question(line: &Line<'_>) -> Option<Units> {
    if !line.kind.is_some_and(|k| k.is("user")) || line.sidechain {
        return None;
    }
    match &line.message.content {
        Content::Text(t) => Some(t.units()),
        Content::Segments(segments) => {
            let mut joined: Option<Units> = None;
            for text in segments.iter().filter_map(|s| s.text) {
                match joined.as_mut() {
                    None => joined = Some(text.units()),
                    Some(out) => {
                        out.push(0x20);
                        out.extend(text.units());
                    }
                }
            }
            joined
        }
        Content::Other => None,
    }
}

/// The question a range the index recorded holds, as the session page and both searches show it (session-view B1,
/// REQ-002): the range is the question's line, and its text the one the index took from that line, its noise stripped;
/// None when the line holds no question
pub(super) fn shown(range: &str) -> Option<Units> {
    let Ok(json::Line::Object(l)) = line::read(range) else { return None };
    question(&l).and_then(|raw| text::real_user_text(&raw))
}

/// The tool names that dispatch a subagent. Measured across the repository: `Agent` 152 times, `Task` 4 — two
/// generations of the same tool's name, both taking description, prompt and subagent_type as arguments. The
/// seemingly more mechanism-based criterion "the arguments contain subagent_type" is not used: checked back across the
/// repository, it wrongly counts one `TaskCreate` and misses 5 `Agent` calls that omitted the optional parameter. A
/// future rename can only undercount, never miscount — what is displayed is a volume figure, and an undercount does
/// not pollute other turns.
pub(super) const DISPATCH: [&str; 2] = ["Agent", "Task"];

/// What the line called: each `tool_use` segment of its content is a tool, or a subagent when it dispatches one. A
/// sidechain line is a subagent's own transcript: what it did counts under the subagent, not again in the parent
/// turn's tools (expanding a subagent is session-view C3's).
pub(super) fn calls(line: &Line<'_>) -> Calls {
    let mut c = Calls::default();
    if line.sidechain {
        return c;
    }
    let Content::Segments(segments) = &line.message.content else { return c };
    for s in segments {
        if !s.kind.is_some_and(|k| k.is("tool_use")) {
            continue;
        }
        if s.name.is_some_and(|n| DISPATCH.iter().any(|d| n.is(d))) {
            c.subagents += 1;
        } else {
            c.tools += 1;
        }
    }
    c
}

/// The main chain's parent graph, for the last-leaf walk-back (session-view B3). Only lines that are no sidechain enter
/// it: a sidechain is a subagent's own transcript, whose parent is always null and whose children point only within
/// the sidechain, so letting it in would take the walk-back's starting point into the subagent's chain (measured: 69%
/// of files end on a sidechain line).
#[derive(Default)]
pub(super) struct Chain {
    /// A main-chain line's uuid → its parent, `parentUuid ?? logicalParentUuid`: a compaction boundary's (type=system,
    /// subtype=compact_boundary) `parentUuid` is broken, and `logicalParentUuid` is its bridge to the history before
    /// the compaction. Without the bridge, the worst measured case had 346 questions collapse to 44. A uuid met again
    /// takes its last line's parent.
    parent_of: HashMap<Units, Option<Units>>,
    /// The last main-chain line's uuid: where the walk-back starts
    last: Option<Units>,
}

impl Chain {
    /// One line that parsed, in the file's order
    pub(super) fn line(&mut self, line: &Line<'_>) {
        if line.sidechain {
            return;
        }
        let Some(uuid) = line.uuid else { return };
        let uuid = uuid.units();
        let parent = line.parent.or(line.logical_parent).map(|p| p.units());
        self.parent_of.insert(uuid.clone(), parent);
        self.last = Some(uuid);
    }

    /// The uuids on the chain from the last main-chain line back to its root; None when no main-chain line has a uuid
    /// (an old format), and then no question can be judged on or off the chain
    pub(super) fn walk(&self) -> Option<HashSet<Units>> {
        let mut on = HashSet::new();
        let mut cur = self.last.clone();
        while let Some(u) = cur {
            if on.contains(&u) {
                break;
            }
            cur = self.parent_of.get(&u).cloned().flatten();
            on.insert(u);
        }
        self.last.as_ref().map(|_| on)
    }

    /// The branch points on the main chain: the nodes two or more main-chain lines take as their parent (the banner's
    /// "this session has N branch points"). It counts branch points, not branches; a sidechain does not enter the graph
    /// and a compaction boundary's bridge is a single chain, so neither makes one.
    pub(super) fn fork_points(&self) -> usize {
        let mut children: HashMap<&Units, usize> = HashMap::new();
        for parent in self.parent_of.values().flatten() {
            *children.entry(parent).or_default() += 1;
        }
        children.values().filter(|&&n| n >= 2).count()
    }
}
