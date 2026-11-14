//! Which Codex line holds a human question, and what a line called (session-view B1, C3).

use super::line::Line;
use crate::question::Calls;
use crate::text::Units;

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

/// The call records a turn's tools are counted from, from a full enumeration of the `response_item` types (the
/// reasoning is in `src/main/providers/question-index.ts`); the `event_msg` side mirrors the same calls and is not read
const CALL_TYPES: [&str; 3] = ["custom_tool_call", "function_call", "tool_search_call"];

/// The call that dispatches a subagent
const DISPATCH: &str = "spawn_agent";

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
