# Agentshed

A desktop overview and management tool for Claude Code, Codex, Grok and Antigravity CLI: see what each
project has installed, how many tokens it has burned and which artifacts it has accumulated, and install
or remove skills from the global library. This file is the domain glossary; the invariants are in
`AGENTS.md`.

## Contents

- **Language**
  - Projects and sides: Project, Stale project, Agent side, Side colour, Application icon
  - Components: Global library, Compatibility-borrowed component, Shared skills directory,
    Project install, Effective view, Subagent, Memory, Effective enabled plugins, Artifact
  - Sessions and search: Activity, Session, Question, Session ID, Turn, Filtering and searching,
    Global search
  - Codex data: Paginated rollout, Usage record, Usage boundary, Compacted window, Cold rollout
  - Usage and the archive: Usage row, Live (day, side), Archived-only (day, side),
    Retained (day, side), Observed value, Superseded value, Accounting stamp, Time window, Trend span
  - Interface: Rail, Transfusion, Supported language, Language preference, Effective language,
    Source language, Appearance, Theme, Theme variable classes
  - Updates: App update, Update check
- **Flagged ambiguities**

## Language

### Projects and sides

**Project**:
Any working directory recorded in an agent side's **registry**, the sides unioned one directory to one
project; a registry is the per-project record a side keeps because the user decided something about that
directory (ADR-0019). A directory with sessions but no registry record is not a project, though its
tokens still count toward global totals.
_Avoid_: repository, workspace

**Stale project**:
A project still recorded in a registry whose directory no longer exists on disk.
_Avoid_: dead project, invalid project

**Agent side**:
A data source: Claude Code, Codex, Grok or Antigravity CLI (ADR-0037). Documents name the side
"Antigravity CLI" and use its command name `agy` only where the tool itself acts; the interface labels
the side "Antigravity".
_Avoid_: tool, CLI, platform; `grok-build` (a profile inside the Grok side); "Gemini" (Gemini CLI is a
different tool); "Antigravity" bare in documents (it names a product family whose desktop app and IDE this
product does not read)

**Side colour**:
The single colour that identifies one agent side wherever it is named — a badge, a legend swatch, a
stacked segment — and is that side's provider colour (ADR-0021). It is distinct from the accent, which
means "selected" rather than "which side".
_Avoid_: badge colour (names one of its uses), brand colour (these are ours, not the vendors')

**Application icon**:
The native macOS identity of Agentshed, fixed across themes and appearances: a raster brand asset,
distinct from the interface's control icons (ADR-0018).
_Avoid_: theme icon (it does not follow the selected theme)

### Components

**Global library**:
The skills at an agent side's global layer, meaning what lives under that side's own configuration
root, and the only source of a project install. Read-only to this product: nothing in it is added,
changed or removed through the app.
_Avoid_: marketplace, store

**Compatibility-borrowed component**:
A skill, subagent, plugin or MCP server that one side loads at runtime from another side's
configuration. It belongs to the side that owns it on disk and never joins the borrowing side's lists
(ADR-0019).
_Avoid_: shared component (nothing is shared — one side reads the other's files); inherited

**Shared skills directory**:
A project-level skills directory that more than one side loads as its own — `.agents/skills`, loaded by
Codex and Antigravity CLI — and so belongs to no single side (ADR-0037). It is always project-level: the global directory agy labels
"Shared skills" is one of Antigravity CLI's global libraries.
_Avoid_: compatibility-borrowed (each side loads it natively); Codex skills, Antigravity skills (each
names only one of its owners)

**Project install**:
Landing a skill from the global library in the project's own directory as a full copy (ADR-0004).
_Avoid_: symlink, sync

**Effective view**:
The components in effect for a project on one side: its project-level entries together with the
entries in effect from that side's global layer, the skills of effectively enabled plugins included.
_Avoid_: installed list

**Subagent**:
A specialised assistant, described by an agent definition file, that runs in its own context when
delegated a subtask. It is a kind of component within a side, never the side itself.
_Avoid_: agent (bare — confusable with agent side)

**Memory**:
Cross-session notes an agent generates on its own, which this product only displays: per project on the
Claude side, one global directory on the Codex side.
_Avoid_: notes (too general); `CLAUDE.md` (human-authored instructions — that is configuration)

**Effective enabled plugins**:
The plugins in effect from one project's point of view: those resolving to true once `enabledPlugins` is
merged across the local, project and user layers, the global page using the user layer.
_Avoid_: installed (installed ≠ enabled)

**Artifact**:
One of the five kinds of document a project accumulates under the eight-step process: ADRs,
`CONTEXT.md`, the feature catalogue, postmortems and prototypes. Working documents are not artifacts.
_Avoid_: docs (too general)

### Sessions and search

**Activity**:
The default sort of the project list, from its most recent session file's modification time and its
count of sessions. That time is not a session's last activity time, which is the largest timestamp
inside the file (session-view spec).
_Avoid_: treating the two times as one

**Session**:
One conversation record on an agent side, identified by the absolute path of its source file: for a side
that stores a session as a directory, the one file carrying the conversation, the tool calls and the
per-turn usage together, and on the Antigravity CLI side the conversation's database (ADR-0019,
ADR-0037). A record with no question at all — a warmup the agent opened itself, or a replay fork stripped
empty — is not a session one can browse, though its tokens still count.
_Avoid_: chat log

**Question**:
A user entry in a session that the noise rules do not strip, including text an agent tool writes as the
user, such as a compaction summary or a message from another session (ADR-0036). Each counts once in a
session; fork replay prefixes and abandoned branches add none.

**Session ID**:
The identifier an agent side gives a session and that side's own resume takes. It is not the session's
identity here: one Codex thread written in segments is several sessions sharing one session ID.
_Avoid_: session key, conversation id; "session id" for the source file path

**Turn**:
Everything recorded from one question up to the next — assistant prose, tool calls and returns,
subagent dispatches — identified by a byte range of the source file (on the Antigravity CLI side, of its
transcript).
_Avoid_: message pair, question-answer pair

**Filtering and searching**:
Filtering narrows a list already in hand, entirely in the renderer; searching reads file contents in the
main process and returns hits, snippets and groups. The distinction holds in specs, ADRs and code;
user-facing copy may say "search" for both.
_Avoid_: treating the two as one mechanism because they look alike

**Global search**:
Searching the questions of every project's sessions at once, stale projects included. "Global" means
across projects, not an agent side's global layer; answers and tool output are searched only by a
project's own session search.
_Avoid_: cross-project search; session search (bare — a project's own search is a session search too)

### Codex data

**Paginated rollout**:
A Codex session file in the paginated-history format: its first line carries an ordinal, its
per-response usage comes in usage records, and the human's messages in completed-item events. A
**legacy rollout** is one still in the earlier format.
_Avoid_: new format, migrated file (both say when, not what)

**Usage record**:
Codex's per-response accounting entry, identified by its response id and carrying that response's usage
with the turn's and the thread's running totals; it is never copied into a fork or a subagent thread. It
is the primary usage source wherever it exists, the per-turn usage event being the legacy one (ADR-0027).
_Avoid_: token record; usage event (that is the legacy per-turn event)

**Usage boundary**:
The first usage record in a rollout by line order: usage events before it count under the legacy rule,
and from it on only usage records count.
_Avoid_: cutover, switch point

**Compacted window**:
A span of a Codex thread the agent has replaced by a summary: the rollout keeps the summary and the
span's messages but has lost the span's usage records for good. A thread can carry several, each
repeating the whole summarised history so far.
_Avoid_: compaction (the act, not the span), truncated history

**Cold rollout**:
A rollout Codex has compressed into a `.jsonl.zst` file after seven days without writes, deleting the
plain file. It is the same session under the same identity.
_Avoid_: archived session (Codex's own `archived_sessions` root is a different thing), compressed session

### Usage and the archive

**Usage row**:
One day's usage at the finest grain the aggregation produces — day × side × project × model, with all
four token fields — and the single source every token figure derives from (ADR-0007, ADR-0025).
_Avoid_: archive row (names one of its roles), usage event (an event is per turn; a row is per day)

**Live (day, side)**:
A day on which the current scan produced at least one usage row for that side. Liveness is judged per
side, never per day alone (ADR-0026).
_Avoid_: live day (the retired per-day reading, see Flagged ambiguities)

**Archived-only (day, side)**:
A (day, side) the archive holds rows for but the current scan produced none for, so the archive's values
stand in for source files that are gone.
_Avoid_: historical day, hatched day, cleaned-up day

**Retained (day, side)**:
A past (day, side) whose live rows add up to less than the archive holds under the same accounting
stamp, so the archive's values are kept and the live figure is recorded only as the observed value. It
is an accounting state, never a display state.
_Avoid_: frozen, protected, locked (all suggest a manual act; retention is the rule's own verdict)

**Observed value**:
The live figure a scan produced for a retained (day, side), recorded so that a later stamp change can
tell a moved figure from the same figure under new rules.
_Avoid_: actual value, real value (both imply the retained value is the wrong one)

**Superseded value**:
A past day's archive value that an accepted change replaced, kept with the stamp and scan time that
replaced it; the trail a restore works from.
_Avoid_: history row, backup, old value

**Accounting stamp**:
The identity of the accounting code behind a figure — the application version and the cache structure
version — written on every archive row (ADR-0026).
_Avoid_: version (bare — ambiguous between its two components and the archive file's own format version)

**Time window**:
The span a token figure is scoped to — all history, today, the last 7 days or the last N days, N being
the trend span. It is cut against the
trend's display-time anchor, so "today" is always the trend chart's last bar.
_Avoid_: date range (suggests arbitrary endpoints), period (ambiguous between this and the chart's span)

**Trend span**:
The number of consecutive local calendar days the daily trend chart draws — 30, 60 or 90, ending on the
current display day; it is also the N of the time window.

### Interface

**Rail**:
The vertical strip of icon buttons down the window's left edge; an internal name, since nothing in the
interface is labelled "rail".
_Avoid_: "rail" in user-facing copy (describe the position instead); sidebar (that is the project list
beside it)

**Transfusion**:
A refresh of a page already on screen: the new data replaces the old in place, and what the user did on
the page — a section's expansion, a search keyword, the scroll position — survives. It never empties
the page first.
_Avoid_: reload, refetch (they name the fetch, not what the page does with its result)

**Supported language**:
A language the interface can be switched to: Simplified Chinese and English, both left-to-right, with no
RTL commitment (ADR-0035, ADR-0013).
_Avoid_: the six languages (retired, see Flagged ambiguities); locale (too general)

**Language preference**:
The persisted setting: "follow system" (the default) or one supported language. Following the system is
a continuously applied policy, not a snapshot, so the interface follows a later change of the system
language.
_Avoid_: current language, selected language (neither tells the preference from its resolution)

**Effective language**:
The supported language the interface is using now, never persisted: the one the preference names, or
else the first supported language in the system's preference list, with English as the fallback.
_Avoid_: default language

**Source language**:
Simplified Chinese: the language all interface copy is authored in first and every other language is
derived from.
_Avoid_: default language, primary language

**Appearance**:
The preference for a light or dark interface: "follow system" (the default), light or dark, orthogonal
to the theme. Like the language preference, following the system is a continuously applied policy, and
the effective appearance it resolves to is never persisted.
_Avoid_: dark mode (states only half of it), theme (that names the other axis), day/night

**Theme**:
Which palette the interface renders in: purple (the default), mist blue or amber brown, orthogonal to
the appearance.
_Avoid_: colour scheme (in CSS and SwiftUI it means light/dark, the other axis), skin, palette (fine in
prose, but it is the contents of a theme, not the choice)

**Theme variable classes**:
Every theme variable is **theme-varying** (it constitutes the surface or the text on it; one value per
theme × appearance), **appearance-varying** (it sits on a surface and must stay legible against it; one
value per appearance) or **static** (an opaque block carrying its own ground; one value throughout).
_Avoid_: judging by how many places a variable is defined in; "functional colour" for static (a functional colour can
be appearance-varying)

### Updates

**App update**:
A newer version of Agentshed itself, published as a release and offered to an installed copy. A rescan
or a transfusion changes what the app shows; an app update changes the app (ADR-0032).
_Avoid_: update (bare — it also reads as a rescan or a transfusion), upgrade

**Update check**:
Asking the release source whether an app update exists for this installation (app-update spec).
_Avoid_: refresh, sync, polling

## Flagged ambiguities

- **Antigravity's own "project" and "workspace" are not a Project**: Antigravity groups folders into
  projects shared with its desktop app and calls a folder a workspace; on the Antigravity CLI side a
  Project is a folder in its trust ledger, as on the other sides (ADR-0037).
- **"Live day" is retired**: liveness belongs to a (day, side), not a day; ADR and spec text written
  before 2026-09-09 uses "live day" in the old sense.
- **"AgentDex" is retired**: it was the name while the product was a read-only catalogue; the product is
  Agentshed, positioned as an overview, not a catalogue.
- **"Six languages" and "the six official UN languages" are retired**: the supported set is Simplified
  Chinese and English (ADR-0035); text written before 2026-10-19 uses the old sets (ADR-0013).
- **Cross-project artifact aggregation is retired**: artifacts are shown only within project detail;
  cross-project retrieval belongs to global search, which searches session questions only.
- **Codex same-name semantics differ per component**: two same-name skills across layers coexist, while
  two same-name subagents shadow at the project level. Those are runtime semantics; how each list
  presents a same-name pair is that view's own rule (skills-view, subagents-view).
