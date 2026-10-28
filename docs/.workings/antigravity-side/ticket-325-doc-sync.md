# Document sync checklist — #325 Antigravity components: skills, the shared skills directory, subagents, plugins and MCP

Ticket: [#325](https://github.com/aloong-planet/agentshed/issues/325) · feature checklist: [checklist.md](checklist.md)

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The component pages describe Antigravity's skills (three global directories, the copy agy uses), the shared skills directory group, the one shared install target and its uninstall warning, and the picker's stale and same-name rows — in this ticket's PR | [skills-view](../../features/skills-view.md), [skill-install](../../features/skill-install.md), [project-detail](../../features/project-detail.md) | Waiting — this ticket's implementation |
| Subagents, plugins and MCP pages describe the Antigravity groups — same trigger | [subagents-view](../../features/subagents-view.md), [plugins-view](../../features/plugins-view.md), [agents-overview](../../features/agents-overview.md) | Waiting — this ticket's implementation. Since #322 agents-overview's Skills bullet names the libraries merged (Claude Code, Codex and Grok) and its boundary on the Antigravity CLI side says skills, subagents, plugins and MCP servers are not read: rewrite both |
| CONTEXT.md's "Shared skills directory" entry stays true against the implemented group, target and uninstall — delivery check | [CONTEXT.md](../../../CONTEXT.md) | Waiting — this ticket's delivery check |
| Deviations written back — wrap-up | [skills-view spec](../../specs/skills-view.md), [skill-install spec](../../specs/skill-install.md), [subagents-view spec](../../specs/subagents-view.md), [plugins-view spec](../../specs/plugins-view.md), [agents-overview spec](../../specs/agents-overview.md) agents-overview::REQ-003/AC-04, [project-detail spec](../../specs/project-detail.md) project-detail::REQ-002/AC-03 | Waiting — this ticket's wrap-up |
| Cross regression for this ticket's range — step 8 | the documents above and the agents-page, project-detail, install and skills-preview prototypes | Waiting — this ticket's step 8 |
