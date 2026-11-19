//! Which Codex line holds a human question, and what a line called (session-view B1, C3).

use super::line::{self, Line};
use crate::json;
use crate::question::Calls;
use crate::text::{self, Units};

/// A human question's raw text (session-view B1): the legacy `event_msg/user_message`, or its paginated replacement, the
/// completed-item event whose item is a user message, its text the `content` elements' `text` joined by a space.
/// `response_item/message` is never a source: it mixes in `<environment_context>` and injected instructions no human
/// wrote.
pub(super) fn question(line: &Line<'_>) -> Option<Units> {
    if !line.kind.is_some_and(|k| k.is("event_msg")) {
        return None;
    }
    let p = &line.payload;
    let kind = p.kind?;
    if kind.is("user_message") {
        return p.message.map(|m| m.units());
    }
    if !kind.is("item_completed") || !p.item.kind.is_some_and(|k| k.is("UserMessage")) {
        return None;
    }
    let texts = p.item.texts.as_ref()?;
    if texts.is_empty() {
        return None;
    }
    let mut joined = Vec::new();
    for (i, t) in texts.iter().enumerate() {
        if i > 0 {
            joined.push(0x20);
        }
        joined.extend(t.units());
    }
    Some(joined)
}

/// The question a range the index recorded holds, as the session page and both searches show it (session-view B1,
/// REQ-002): the range is the question's line, and its text the one the index took from that line, its noise stripped;
/// None when the line holds no question
pub(super) fn shown(range: &str) -> Option<Units> {
    let Ok(json::Line::Object(l)) = line::read(range) else { return None };
    question(&l).and_then(|raw| text::real_user_text(&raw))
}

/// The call records a turn's tools are counted from. Codex records a call on `response_item`; the `event_msg` side is
/// the interface's mirror of the same calls, with only their `*_end` events and no counterpart of `function_call`, so
/// reading one side alone counts each call once.
///
/// The three come from a full enumeration of the `response_item` types (278 files, 62,912 lines with a payload):
/// message 10,311, reasoning 6,075, custom_tool_call 3,400, function_call 1,883, agent_message 54 and tool_search_call
/// 25, each with its `*_output` counterpart. `tool_search_call` never appeared in a 120-file sample: it showed only
/// when the whole set was read. A turn's blocks draw a call of these types as its tool, or its subagent (`turn.rs`).
pub(super) const CALL_TYPES: [&str; 3] = ["custom_tool_call", "function_call", "tool_search_call"];

/// The `function_call` name that dispatches a subagent (the real sample's namespace is `collaboration`)
pub(super) const DISPATCH: &str = "spawn_agent";

/// What the line called: a call record is a tool, or a subagent when it dispatches one
pub(super) fn calls(line: &Line<'_>) -> Calls {
    if !line.kind.is_some_and(|k| k.is("response_item")) {
        return Calls::default();
    }
    let p = &line.payload;
    if !p.kind.is_some_and(|k| CALL_TYPES.iter().any(|t| k.is(t))) {
        return Calls::default();
    }
    if p.name.is_some_and(|n| n.is(DISPATCH)) {
        Calls { tools: 0, subagents: 1 }
    } else {
        Calls { tools: 1, subagents: 0 }
    }
}
