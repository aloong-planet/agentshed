# ADR-0010: An enabled plugin's skills join the effective view under a namespace, and every plugin skill can be read, enabled or not

- Status: Accepted (2026-08-07)

## Context

A plugin can bundle skills, which take part in a session once the plugin is enabled, so a view of the skills available
to a session is incomplete without them. Showing them raises how a name colliding with an on-disk skill behaves, how
enablement filters them, whether install and uninstall reach them, and how Codex plugins, which have no enablement
semantics, take part. Reviewing what a plugin would inject before enabling it is the Plugins view's own purpose.

## Options

1. **An effectively enabled plugin's skills join the Skills section under a namespace, read-only; every plugin skill
   previews in place in the Plugins view, enabled or not; Codex plugin skills do not join** — chosen.
2. Show plugin skills only inside the Plugins view — rejected: the same capability would be described two ways in two
   places, and the complete set of effective skills is the viewer's core value.
3. Let plugin skills take part in on-disk shadowing — rejected: the official semantics namespace them
   (`plugin:skill`), so they cannot collide with an on-disk name, and a shadowing signal would be false.
4. Preview only an enabled plugin's skills — rejected: it shuts out the most valuable case, reviewing before enabling;
   what counts as in effect is a different question from what can be read.
5. Reach a plugin skill's contents by jumping to its row in the Skills section — rejected: the owner ruled that
   previewing in place keeps the context better.
6. Codex plugin skills join the Skills section with an enablement of their own — deferred: Codex has no enablement
   semantics, so joining would claim an "in effect" nobody can know; it restarts once Codex wires them up officially.

## Decision

We adopt **option 1**.

- **Join**: the skills of each effectively enabled plugin join the Skills section as `pluginName:skillName` entries on
  that plugin's own side, Claude's or Antigravity's, with enablement taken by each page's own rule (plugins-view spec,
  sequence G). A disabled plugin's skills appear only in the Plugins view.
- **Namespace**: a plugin entry takes no part in on-disk same-name shadowing and stands beside an on-disk skill of the
  same base name.
- **Read-only**: a plugin entry offers no install or uninstall, which stay with the global library (ADR-0004).
- **Readable whatever the enablement**: every skill listed in a plugin's expansion, on either page, previews in place,
  and a plugin entry in the Skills section previews on equal footing with an on-disk skill. Reading changes no
  enablement.
- **Codex**: a Codex plugin's skills never join the Skills section (option 6).

## Consequences

- Positive: the skills available to a session are seen whole in one place, enabling or disabling a plugin shows on the
  next refresh, and install and uninstall are untouched.
- Positive: a skill's full text can be reviewed before its plugin is enabled, and the Codex side claims no "in effect"
  it cannot know.
- Negative: the Plugins view's skills and the Skills section's are not the same set, the former including disabled
  plugins' and Codex's, so the copy must make "readable is not in effect" clear or a user may take a disabled skill
  for one in effect.
- Negative: the Skills section mixes the global library, the project and plugins, so each row relies on its source
  badge to say where it comes from.
- Neutral: project detail reads the layered settings once more to resolve plugin enablement, and the preview's
  allow-list admits the plugin package roots the scan registered (plugins-view spec, H8).

## Sources

The owner's rulings on the prototype, 2026-08-01, and in the requirements alignment of 2026-08-07. The plugins-view
spec (sequences G and H, REQ-001) and the skills-view spec; the namespace semantics of the official plugins
documentation. On disk, 2026-08-07: a Codex plugin's skills sit under
`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md`, the convention of Claude's cache.
