# Plugins view

> Related: [features](../features/plugins-view.md) · [skills-view](skills-view.md) (preview infrastructure) · ADR-0012 (preview decoupled from enablement) · ADR-0010 (plugin skills join the effective view) · ADR-0004 (install/uninstall boundary) · ADR-0001 / ADR-0002

## Problem Statement

A plugin can be installed at the user level or only for one project, and its package bundles skills,
subagents, hooks, MCP servers and other components. The viewer previously treated plugins as a purely
global concept and could not see the bundled components, which caused two problems: a project-scope
plugin showed as "installed but disabled" in every project (reproduced with superpowers-demo); and
enabling a plugin was flying blind — no way to know what it injects. Even once the components became
visible, one blind spot remained: only the names of a plugin's bundled skills were visible, so there
was no reviewing what they instruct the agent to do before enabling.

## Solution

Group plugins by side. The Claude group reports every installation record and **each viewpoint's
effective enabled set** truthfully (the global page uses the user layer; project detail merges
local > project > user and states which layer the judgement came from). Enablement and installation
records appear inline on the plugin row; clicking a row expands into **category tabs**
(Skills/Subagents/Hooks/MCP; empty categories get no tab). **The Skills tab is a row list** (name +
description + file count · size): clicking a row expands the package's file table and clicking a file
opens a drawer to read it (reusing the skills-view preview infrastructure) — **readability is
independent of enablement** (ADR-0012, review before enabling). The Codex group is probe-style, with
only the Skills category expandable for preview, and it **does not join the Skills section** (there
are no enablement semantics, and we do not manufacture false signals — ADR-0012). The skills bundled
with effectively enabled plugins join the Skills section as namespaced entries (ADR-0010). Everything
is read-only.

## User Stories

1. As a user, I want the plugin list to show each installation record's scope and owning project
   truthfully, so that a project-scope install is no longer displayed as globally disabled.
2. As a user, I want project detail to show this project's effective enabled set and state which
   layer the judgement came from, so that what I see matches what the agent actually does and can be
   explained.
3. As a user, I want to expand a plugin and see **its bundled components** by category tab
   (skills/subagents/hooks/MCP), so that I know what it injects both before and after enabling, one
   category at a time rather than all at once.
4. As a user, I want to open a plugin's skill package and read `SKILL.md` and its referenced documents
   in full, so that I know what it instructs the agent to do **before enabling it** (ADR-0012).
5. As a user, I want Codex plugins' bundled skills to be enumerable and previewable too, so that both
   sides' plugins can be reviewed equally.
6. As a user, I want effectively enabled plugins' skills to appear in the Skills section as
   `pluginName:skillName` entries (with a source badge and no install/uninstall buttons), so that "the
   skills available to this session" can be seen whole in one place.
7. As a user, I want the two sides' plugins grouped separately with no cross-side merging by name, so
   that I know which side a plugin is installed on (the two sides' marketplaces and package formats
   are independent).
8. As a user, I want anomalies such as a cleaned-up install directory, a lost owning project, or a
   missing individual skill directory labelled truthfully (greyed out / a banner) rather than
   disappearing or crashing, so that I can decide what to clean up.

## Failure modes and boundaries

**Sequence E: global page → Plugins section (rows and the expansion skeleton)**
- E1 One plugin with several installation records (installed at both user and project) → show each
  record's scope and owner (**inline chips**), neither merged nor reduced to the first.
- E2 A project-scope record whose owning project directory no longer exists → shown as written and
  marked "project lost", not validated and not crashing.
- E3 A scope of local or an unknown value → labelled as written, with no guessing at the semantics; a
  record missing the scope field → labelled "(unknown)".
- E4 Enablement explicitly false and enablement absent → both display as not enabled (the global page
  uses the user layer).
- E5 Expansion: the directory convention and the manifest's declared fields (fields such as hooks
  support string / array / inline object forms) are merged and deduplicated, presented as **category
  tabs**; a missing category → **no tab for it**; every category missing → the expanded area shows
  only a status explanation; the default lands on the **first non-empty category**; a single corrupt
  bundled file (a SKILL.md that fails to parse, say) → that entry keeps its name with an empty
  description, without affecting the others in the same category.
- E6 The install directory does not exist (the cache was cleared) → the row is marked "install
  directory missing"; the expanded area shows an explanatory banner; skill rows are **greyed out and
  unclickable** (the reason is displayed in the row's stats slot).
- E7 The hooks summary = event name + matcher count; **command details are not rendered** (to prevent
  it being misread as an executable audit).
- E8 The CODEX group: enumerate the plugin cache's three directory levels (marketplace/plugin/version);
  a missing or empty cache root → the whole group is not displayed; several version directories for
  one plugin → display the highest version and note the cache version count; list existence only, with
  no enablement; **only the Skills category expands** (enumerated from the `skills` subdirectory under
  the highest version directory, the same directory convention as Claude; verified on disk
  2026-08-07), while the other categories' semantics are not wired up and neither expand nor
  manufacture a signal.
- E9 No merging by name between the two groups (a name present on both sides, such as superpowers,
  gets a row in each).
- E10 A single unreadable marketplace directory in the Codex cache → skip that directory only and
  enumerate the rest as usual (a single point of failure must not empty the whole group — see
  CONTEXT.md, "degradation may only hurt itself").
- E11 A manifest-declared relative path pointing outside the package (`../`) → refuse to read (closing
  the path escape hole).

**Sequence F: project detail → Plugins section**
- F1 The effective enabled set = the local > project > user three-layer merge, where the first layer
  mentioning the plugin decides its enablement; an explicit false at the project layer overrides a
  true at the user layer; not mentioned in any layer → not enabled.
- F2 A missing or corrupt project `settings.json` / `settings.local.json` → skip that layer and fall
  through to a lower one, no crash.
- F3 The acceptance scenario (an existing fixture): a project-scope plugin displays as not enabled in
  a non-owning project and on the global page, and as enabled in the owning project's detail, noting
  that it came from the project layer.
- F4 The detail page's CODEX group lists the same as the global page, labelled "globally in effect, no
  project-level enablement semantics".
- F5 The detail page's Skills tab has the same preview capability as the global page (the same
  component, the same package root rule).

**Sequence G: plugin entries joining the Skills section** (ADR-0010; the inclusion rule is
**unchanged by preview**, ADR-0012)
- G1 Only effectively enabled plugins' skills appear (by the page's own rule: the global page uses the
  user layer, the detail page uses that project's effective enabled set); after disabling and
  refreshing → the entry disappears (visible only in the Plugins expansion).
- G2 A namespaced entry `pluginName:skillName` does not take part in on-disk skills' shadowing
  judgement; it coexists with an on-disk skill of the same name as two independent entries (namespace
  isolation).
- G3 Plugin entries have no install/uninstall buttons (ADR-0004 confines install/uninstall to the
  global library); entries are distinguished by a source badge; they **expand and preview on equal
  footing with on-disk skills** (file table / inline stats / markdown preview, see the skills-view
  spec; unlocked 2026-08-07, overturning its v1 exclusion).
- G4 They do not take part in cross-side merging (the Codex plugin ecosystem is independent), and
  `sides` is always the Claude side; Codex plugin skills **do not join** (ADR-0012).

**Sequence H: plugin skill package preview** (inside the Plugins expansion's Skills tab; identical on
both pages and both sides)
- H1 The Skills tab is a row list: each row = name (in namespaced form) + the frontmatter description
  + "N files · size" on the right (the stats share their source and rules with skills-view's inline
  stats: stat-only, with identical extension / junk-directory / depth filtering).
- H2 Clicking a row expands the package's file table (headers: file / lines / size / modification
  date; a marker on the `SKILL.md` entry point; a notice at depth > 2 that deeper files are not
  listed) — the enumeration rules are exactly those of skills-view sequence C.
- H3 Clicking a file opens a drawer to read it: markdown previews by default (frontmatter as a
  key-value card) and can be switched to raw, non-markdown shows monospace raw only; truncation
  follows the artifact channel — the same rules as skills-view sequences C/D, including the
  **capability dimension of imported content** (a single sanitising exit, links never navigating the
  whole window, image paths confined to the package).
- H4 **Readability is independent of enablement** (ADR-0012): a disabled plugin's rows are clickable
  and readable as usual; reading changes no enablement state.
- H5 The package root rule = the `installPath` that is the **same source as the bundled component
  summary scan** (Claude; with several installation records, no further guessing) or the highest
  version directory in the cache (Codex) — guaranteeing that "the summary you see" and "the contents
  you open" are always the same package.
- H6 A row whose stats cannot be read is greyed out and unclickable, with the reason in the row's
  stats slot (**a defensive rule**, verified and written back during implementation 2026-08-08: under
  directory-convention enumeration an entry with a missing directory or entry point never enters the
  list at all, so greying out only appears under a race or anomaly such as the package changing after
  the scan; it fails before the click and no routinely reachable scenario is promised).
- H7 A readable package root with a missing `SKILL.md` → the file table lists the other text files as
  usual without fabricating an entry point (as in skills-view C5).
- H8 Security (an extension of the C9 family): the scan registers the **summary-source package roots**
  in an in-process set; the enumeration entry point must hit that set (fail-closed, the same pattern
  as openedProjects and the artifact allow-list); reading a file still goes through the exact path
  allow-list registered by the enumeration. The renderer cannot forge a package root outside the set.
- H9 Whether switching tabs in the expanded area preserves an already-expanded file table is not
  guaranteed (switch back and expand again; v1 promises no state preservation).
- H10 Expanding a row whose file table cannot be enumerated → an error toast. Switching the UI language
  while that failed result stands does **not** show the toast again, and the expanded area states the
  failure in the toast's sentence (both as skills-view A11). Gap (the no-second-toast rule only): no
  automated test (the renderer has no component-level test seam); the intent is recorded where the
  effect is written.

**Cross-cutting regression points**
- R1 The IPC contract (`validate`) must be extended along with any new domain type field (the same
  lesson as the cache-crash postmortem).
- R2 Existing skill install/uninstall is unaffected: it touches only the global library and the
  project's skills directory; plugin entries have two lines of defence (no button + a level guard).
- R3 Plugins are read once per scan and consumed in three places (plugins / the Skills join / MCP) to
  avoid duplicate directory scans; package root registration and stats happen in that same pass.
- R4 Snapshot size discipline as in skills-view: each skill carries only aggregate stats and its
  locating identity, with the file list and contents fetched on demand at expansion.

## Implementation Decisions

- **Types**: an installation record array (with scope / owning project / lost marker) + layered
  enablement (the user-layer rule for the global page / `enabledFrom` attribution for the detail page)
  + four kinds of bundled component summary. A bundled skill entry extends to name + description +
  **package stats (file count / bytes) + readability (a missing package root or subdirectory means
  unreadable, with the reason)**; plugin entries (global and detail) carry the **summary-source
  package root** identity. Codex plugin entries add bundled skills (that category only). ADR-0001's
  single type source, with contract validation extended in step.
- **Read layer**: injected through `ScanRoots`; bundled components are merged from two paths, the
  directory convention and manifest fields, with manifest relative paths confined to the package; the
  Codex side enumerates the cache's three directory levels plus the `skills` subdirectory under the
  highest version directory (the same directory convention as Claude), enumerating safely level by
  level. During the scan, each plugin skill gets stat-only package stats and its package root
  registered (H8).
- **Preview channel**: reuses skills-view's enumerate / read-file IPC channels and allow-list
  discipline, with the entry point extended to the "registered plugin package root + skill name" form;
  no new arbitrary-path read hole is opened.
- **UI**: two sections grouped by side; a row = name + version + enablement/source + installation
  record chips; the expansion = category tabs (a segmented control, distinct from page-level tabs) +
  one category panel; the Skills tab reuses skills-view's row / file table / drawer mechanism.

## Testing Decisions

Following ADR-0002's dual seam:
1. **The providers seam**: fixture unit tests covering sequences E/F/G/H — several installation
   records, layered settings merging and corruption degradation, merging the four bundled categories,
   refusing path escapes, Codex cache enumeration with one unreadable layer, the namespaced join and
   its non-participation in shadowing; **added**: Codex skill enumeration (highest version, directory
   convention), plugin skill package stats and readability (a missing package, a missing single
   directory), and the package root set refusing an unregistered entry point (a fail-closed negative
   case).
2. **The contract seam**: round-trip validation of the new fields (skill metadata / package root /
   Codex skills); a bad payload is rejected.
3. **e2e**: with a seeded fixture home — expanding a plugin shows category tabs; clicking a row in the
   Skills tab shows the file table and clicking a file shows the contents in a drawer; a disabled
   plugin is readable; a missing one is greyed out; the Codex group has only a Skills tab; the detail
   page's F3 scenario regresses in both directions.

A good test asserts only external behaviour (directory → the set of entries / stats / readability;
entry point → admitted or the reason for refusal), never the traversal implementation details.

## Out of Scope

- All write operations: installing, uninstalling, enabling or disabling plugins.
- Codex plugins' enablement semantics, marketplace index parsing, and expanding bundled components
  other than skills (ADR-0012's restart condition: the enablement semantics being wired up
  officially).
- Click-through or detail preview for subagent / hook / MCP entries (each its own ticket).
- Navigation or locate-and-highlight between the Plugins and Skills sections (ruled obsolete
  2026-08-07, ADR-0012 option 4).
- A dedicated hooks section (a merged view of the five sources) — the hooks summary inside a plugin's
  expansion does not count; that is a separate future item.
- Installation forms other than the cache, such as `plugins/repos`; interpreting local scope's
  semantics (labelled as written).

## Further Notes

- **Prototype gate: passed** (2026-08-07, finalised over four iterations: inline installation records
  and enablement, category tabs, the Skills row list with stats, the greyed-out missing state, and the
  Codex group's Skills-only tab).
- Implementation wrap-up (step 8) must update: `docs/features/plugins-view.md` (the expansion form and
  preview capability), and the wording about "plugins cannot be previewed" in
  `docs/features/skills-view.md` and `docs/features/agents-overview.md`.
