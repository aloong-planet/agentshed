# ADR-0012: Plugin skill preview decoupled from enablement; Codex plugin skills do not join the effective view

- Status: Accepted (2026-08-07)

## Context

skills-view shipped package preview for on-disk skills (file table + drawer + sanitised markdown
rendering + an exact path allow-list), and preview for plugin-sourced skills was left to another
ticket at the time. The requirement now is "see the contents of a plugin skill from the Plugins
view". Three forces are in play: the Skills section's inclusion rule is "only the skills of
effectively enabled plugins appear" (ADR-0010 / G1); Codex plugins have no enablement semantics
(plugins-view E8, whose probe-style rule is "manufacture no false signals"); and reviewing what a
plugin injects *before* enabling it is the original motivation for the Plugins view
(plugins-view User Story 3).

## Options

1. **Decouple preview from enablement; Codex plugin skills do not join the effective view** — every
   skill in the expanded Plugins area can be previewed in place (independent of enablement, since
   reviewing before enabling is the essential case; reading has no side effects and no false-signal
   risk); the Skills section's inclusion rule stays exactly as G1 defines it (effectively enabled
   only, Claude side only); Codex plugin rows gain an expansion listing skills only, previewable in
   place, and do not enter the Skills section.
2. Align Codex fully with Claude (join the Skills section + enablement) — rejected: it would require
   inventing enablement semantics for Codex, and E8 already established that those semantics are not
   wired up; joining would fabricate an "in effect" signal, violating the "manufacture no false
   signals" discipline.
3. Only enabled plugins' skills can be previewed (consistent with G1) — rejected: it shuts out the
   most valuable case, reviewing before enabling; G1 governs "what counts as in effect", which is a
   different question from "what can be read".
4. Click through to the row in the Skills section (the requirement's literal wording) — rejected:
   plugin namespace rows were not previewable before, so the information gained at the landing point
   is ≈0; and even once preview is unlocked, the user ruled that previewing in place preserves
   context better (2026-08-07, batch 2). Plugin rows in the Skills section are still unlocked for
   preview on equal footing with on-disk skills, but as an independent entry point rather than a
   click-through target.

## Decision

We choose **option 1**: we decouple a plugin skill's **readability** from its **enablement** — every
skill in an expanded Plugins area (Claude and Codex, global and detail) can be previewed in place;
**the effective view's inclusion rule is unchanged** (effectively enabled only, Claude side only,
ADR-0010); and Codex plugin skills never join the effective view unless their enablement semantics
are wired up officially in future (at which point a new ADR opens).

## Consequences

- Positive: a skill's full text can be reviewed before enabling it, taking the Plugins view from
  "see names" to "see contents"; zero false signals on the Codex side; the whole skills-view preview
  infrastructure and allow-list discipline are reused, with the increment concentrated in package
  root resolution and Codex skill enumeration.
- Negative: "the skills visible in Plugins" and "the skills listed in the Skills section" are no
  longer the same set (the former includes disabled ones and Codex), so the documentation and the UI
  copy have to make "readable ≠ in effect" clear, or a user may assume a disabled skill is also in
  effect.
- Neutral: the preview security container widens from "known skills roots" to "the set of plugin
  package roots registered by the scan" (an extension of the C9 family); Codex plugin rows gain an
  expansion area for this, and E8's "expansion not supported" narrows accordingly to "expansion not
  supported except for skills".

## Sources

The requirements alignment session of 2026-08-07 (three batches of decisions); plugins-view spec
E8 / G1 / User Story 3; skills-view spec Out of Scope, "plugin package preview in another ticket";
on-disk evidence that the Codex plugin cache directory convention is isomorphic to Claude's
(`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md`).
