# Agentshed — project conventions

Domain vocabulary lives in `CONTEXT.md`; requirements and boundaries in `docs/specs/`; current
user-visible behaviour in `docs/features/`; architectural decisions in `docs/adr/`. This file holds only
the project-level facts that fit nowhere else.

Cross-skill project facts are declared in `capabilities.toml` at the repository root.

## Invariants

Constraints on anyone changing this code, one line each; the reason lives where the line points. Until
2026-10-29 these were the invariants of `CONTEXT.md`: an older document citing "the CONTEXT invariant"
means the line here.

### Reading agent data

- A rule that recognises, strips or admits a shape of agent-generated data rests on a real sample or an
  articulable mechanism, never on a name alone, and a set of shapes behind an allow-list, `Set` or
  `switch` comes from a full enumeration of the data directory (postmortem
  `2026-08-02-noise-list-vs-real-data`).
- Stripping may follow the sample strictly; admitting may not: a shape outside an allow-list leaves a
  discoverable trace and is never dropped silently, because a missed admission fails invisibly.
- When a read or parse fails, a judgement of whether something is enabled or in effect degrades to what
  the target agent itself does at that moment; nothing is salvaged from unparseable content.
- A failure reading one entry affects only that entry's display — never another entry (shadowing
  included), an aggregate view or a whole scan — and any such escape is fixed whatever its frequency.

### Token accounting

- `TokenTotals.input` and `cacheWrite` are never summed across sides, because their meaning differs per
  side; the cross-side comparable buckets are input + cache writes, output and cache reads (ADR-0023,
  ADR-0037).
- A metric not every side reports does not join `TokenTotals` unless the view showing it is explicitly
  single-side (ADR-0019, ADR-0023).
- A past (day, side) figure lower than the archive's is accepted only under a new accounting stamp,
  keeping what it replaces as a superseded value; increases and the scan's own day are exempt (ADR-0026).

### Product boundaries

- Agentshed's own code makes no outbound request except the update check and the download of the update
  it finds; with automatic checks off nothing starts unless the user asks, and a feature that needs the
  network needs its own decision (ADR-0032).
- A record that must describe the installed copy alone is never read or written by a development run,
  because `agentshed` and `Agentshed` resolve to one userData directory on a case-insensitive volume
  (app-update spec, Implementation Decisions).

### Navigation and rendering

- A page switch never shows an intermediate frame, a revisit draws the last shown page and then refreshes
  it by transfusion, and a saved page restores through the live contract, filling or converting any
  changed field (ADR-0028, ADR-0029, postmortem `2026-10-21-a-new-field-would-have-dropped-every-saved-page`).
- A link inside rendered content never navigates the window: it opens in the app when allow-listed, in
  the system browser when external, and otherwise shows a notice; the main process's navigation handlers
  are only the backstop.
- Every markdown render site renders through `MarkdownBody`, which owns sanitising, link interception,
  the text it keeps as written and the heading ladder of the appearance spec's sequence E.
- A floating layer over a clipped list is built on `FloatingBox` and `useAnchorInvalidation`, and a hover
  tooltip on it takes the surface's one tooltip form (reasons in those files' headers).

### Copy

- Copy that points at a control writes that control's own label, never its glyph, and names a control
  only when the reader must find it; `pnpm check:ui` fails when a rail control's label appears in other
  copy.
- User-facing copy never enumerates the agent sides as an exhaustive set; `pnpm check:ui` enforces it,
  with exceptions allow-listed by dictionary key.
- Sentence-shaped chrome renders the dictionary's own case with no uppercase transform; only
  `.settings-sec-t`, `.files-head`, `.turn .bb .lb` and the side brand chips are uppercase, by ruling.

### Engineering

- The decision layer of every host security guard is a pure function whose unit tests cover the bypass
  vectors; the per-item state is in `docs/ops/electron-security.md`.
- Non-printing characters are written as escapes in source, never as raw bytes; `pnpm check:nul`
  enforces the NUL case.
- A figure about reading files from the main process counts only when measured under Electron with
  `pnpm bench:scan` (the chunk-size reasoning is in `src/main/providers/jsonl.ts`).
- Every e2e case closes its app through `closeApp` (`e2e/close-app.ts`), and a teardown warning on an
  unloaded run is a defect.
- Every workflow action is pinned as `owner/repo@<40-hex commit> # v<x.y.z>`, at the same commit in every
  workflow; `scripts/workflow-actions.test.mjs` enforces the form.
