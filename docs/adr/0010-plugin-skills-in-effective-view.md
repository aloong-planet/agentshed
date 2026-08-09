# ADR-0010: Plugin-bundled skills join the effective view (namespace-isolated, filtered by enablement)

- Status: Accepted (2026-08-01, decided by the user during spec alignment)

## Context

A plugin can bundle its own skills, which take part in a session just like on-disk skills once the
plugin is enabled. The viewer previously showed only the on-disk skills directory, so plugin skills
were entirely invisible — there was nowhere to see the whole of "the skills available to this
session". Joining them into the effective view raises three questions: what happens when a name
collides with an on-disk skill, how enablement filters them, and whether the install/uninstall
boundary widens.

## Options

1. **Join the Skills section: namespaced entries + enablement filtering + read-only**
2. Show them only inside the expanded Plugins section and leave the Skills section as is — rejected:
   the same capability would be described two different ways in two places, and the user would
   inevitably ask "why isn't it in Skills"; "the complete set of effective skills" is the viewer's
   core value
3. Join them *and* let them take part in shadowing — rejected: the official semantics are namespaced
   (`plugin:skill`), so they cannot collide with on-disk names by construction, and manufacturing a
   shadowing signal would be manufacturing a false one

## Decision

We choose **option 1**: skills bundled with effectively enabled plugins join the Skills effective
view as namespaced entries, `pluginName:skillName`. Three boundaries:

- **Namespace isolation**: they do not take part in on-disk skills' same-name shadowing, and coexist
  with an on-disk skill of the same base name;
- **Enablement filtering**: by the page's own rule — the global page takes `enabledPlugins` at the
  user layer, project detail takes that project's effective enabled set (local > project > user
  layered merge); skills of a disabled plugin are visible only inside the expanded Plugins section;
- **Read-only**: plugin entries offer no install or uninstall (ADR-0004's install/uninstall covers
  only the global library, and this decision does not widen that boundary); `sides` is always the
  Claude side (the Codex plugin ecosystem is separate and is not merged across sides).

The section is renamed accordingly, from "Skills (global library)" to "Skills", with entries
distinguished by a source badge (global library / project-level / plugin).

## Consequences

- Positive: "the skills available to this session" can be seen whole in one place; enabling or
  disabling a plugin is reflected on the next refresh; install/uninstall semantics are untouched
- Negative: the Skills section is no longer synonymous with "global library", and the old mental
  model that relied on that needs the badges to correct it
- Neutral: showing plugin skills depends on resolving plugin enablement, so project detail performs
  one more layered settings read

## Sources

The subagents-memory-plugin spec (the G series); the prototype ruling of 2026-08-01; the namespace
semantics in the official plugins documentation; the implementation PR (G1–G4 tests plus e2e locks).
