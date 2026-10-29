# Project detail — test review: CONTEXT.md read from docs/ (project-detail::REQ-003)

No ticket: spec-driven work inside aloong-planet/agentshed#337. Scope: project-detail::REQ-003/AC-01 and AC-02 and
REQ-003's failure modes, plus the existing tests whose fixtures place CONTEXT.md at a project root.

## Design review

Date: 2026-10-29. Implementation version: cdf19b3 (the spec edit for REQ-003 uncommitted on top).

### Test design table

| Test | Spec item | Seam | Input that drives the branch | Assertion and source of the expected value | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|
| U1 new: both a root and a `docs/` CONTEXT.md | REQ-003/AC-01, failure mode "both files" | `readArtifacts(projectPath)` (providers, ADR-0002's fixture seam) | `docs/CONTEXT.md` titled "Docs glossary" and a root `CONTEXT.md` titled "Root glossary" | exactly one `context` entry, titled "Docs glossary", its path under `docs/`; literals from the fixture, per the AC's text | agentshed's own layout after the move (`docs/CONTEXT.md` beside `docs/adr/`, `docs/specs/`) | none (a temp directory, milliseconds) |
| U2 new: a root CONTEXT.md only | REQ-003/AC-01 second clause, failure modes "root only" and "no `docs/`" (B7) | same | a root `CONTEXT.md` and no `docs/` directory | `[]`; from B7 and the failure mode's text | the shape every project had before the move (the six other repositories today) | none |
| U3 modified: the six types | REQ-003/AC-01 and AC-02, B1, B3, B5, B6 | same | the existing fixture with CONTEXT.md moved to `docs/CONTEXT.md` | unchanged: type order by time, the context title "Glossary", README excluded | agentshed's layout | none |
| E1 modified: the demo project's CONTEXT.md and the config-card link probe (app.spec.ts) | REQ-003/AC-01 at the user path; R3 | e2e, existing case | the demo's CONTEXT.md under `docs/`; the CLAUDE.md link `./docs/CONTEXT.md` | unchanged: the reader opens with "Ladder h2"; "missing doc" still raises the notice | agentshed's layout | the case's existing Electron launch, unchanged |
| E2 modified: an artifact removed after the scan; an artifact reopened from cache (app.spec.ts) | B9 | e2e, existing cases | the fixture's CONTEXT.md under `docs/` | unchanged | agentshed's layout | existing launches, unchanged |
| E3 modified: startup restore (startup-restore.spec.ts) | REQ-001/AC-05; R1 | e2e, existing case | the fixture's CONTEXT.md under `docs/`, the symlink swap on the same path | unchanged | agentshed's layout | existing launch, unchanged |

### Dimension 1: Coverage

REQ-003's boundaries against the table: root only → U2; both files → U1; no `docs/` → U2 (B7, root file
included); a link to a root CONTEXT.md gets R3's notice → covered by composition: U2 shows a root file is not
listed, and E1's existing "missing doc" probe shows an unlisted relative link raises the notice without
navigating (the allow-list has no per-type branch); a page saved before the change lists a root entry until
revalidation → REQ-001/AC-03's existing restore case covers a restored page replaced by current data, and the
artifact list is replaced whole, with no artifact-specific branch. AC-02 → U3 and the existing prototype, README
and fallback-title cases. Result: no gap.

### Dimension 2: Case design

Each case runs through the public `readArtifacts` or the app's own UI, builds its state with real files in a
fresh temp directory, and asserts the returned entries or the visible reader. No bypass of the interface, no
state unreachable through the public path. Result: no finding.

### Dimension 3: False greens

Mutation testing: per the project capability declaration, mutation-testing is not enabled, so it is skipped.
When each goes red: U1 when the root file is read (two context entries, or the root title); U2 when the root
file is read (one entry instead of none); U3 when `docs/CONTEXT.md` is not read (no context entry, title
assertion fails). Expected values are fixture literals, not recomputed; `readArtifacts` is the live path the
detail provider calls. Result: no finding.

### Dimension 4: Resource reuse

The unit cases use one temp directory per case, built and removed in milliseconds: not an expensive resource.
The e2e cases keep their existing launches; no case and no launch is added. Result: no finding.

### Findings

No findings.
