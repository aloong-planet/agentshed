# Project detail — Coverage and acceptance checklist

Spec: [project-detail](../../specs/project-detail.md)
Source commit: cdf19b3, with uncommitted changes to docs/specs/project-detail.md (this round's spec edit)
Scope: project-detail::REQ-003 (CONTEXT.md read from `docs/` only; B2 becomes REQ-003), B1's wording of what
CONTEXT.md holds, and the regressions it touches: B3, B4, B7, R1, R3, project-detail::REQ-001/AC-03. Every other
section (A, T, S, REQ-001, REQ-002) is unaffected: none of them names where an artifact is read from.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| Owner, 2026-10-29: move CONTEXT.md under `docs/` | Confirmed and in force | project-detail::REQ-003/AC-01 | covered: the artifact is read at `docs/CONTEXT.md` |
| Owner, 2026-10-29: the app looks in `docs/` only | Confirmed and in force | project-detail::REQ-003/AC-01 (second clause) and its failure modes | covered: a root CONTEXT.md is not an artifact; a project with only a root file lists none |
| Owner, 2026-10-29: every project follows the new location | Background | none in this spec | the convention lives in the domain-modeling and repo-scaffold skills, not in this product spec |
| Owner, 2026-10-29: the code change goes into the same pull request | Background | none | delivery, not a requirement |
| Owner, 2026-10-29: CONTEXT.md holds vocabulary only, invariants in AGENTS.md | Confirmed and in force | B1 (wording "terminology") | covered |
| Existing B2 (adr/specs/features/postmortems/prototypes sources) | Confirmed and in force | project-detail::REQ-003/AC-02 | unchanged behaviour; identity mapping B2 → REQ-003 |

## Spec → tickets → verification

No tickets: the change is implemented straight from the spec inside aloong-planet/agentshed#337; the spec
final check of `/implement` covers it.

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| project-detail::REQ-003/AC-01 | CONTEXT.md under `docs/`; root not an artifact | none (spec-driven) | Test: providers fixture — `docs/CONTEXT.md` listed as context, a root `CONTEXT.md` not listed, both present → only the `docs/` one |
| project-detail::REQ-003/AC-02 | other types unchanged | none (spec-driven) | Test: the existing providers fixture cases stay green |
| REQ-003 failure modes: link to a root CONTEXT.md | R3 notice | none (spec-driven) | Test: the e2e configuration link probe now targets `./docs/CONTEXT.md` and opens the reader |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-29, spec uncommitted on cdf19b3 | project-detail::REQ-003/AC-01 | Not run yet | Unverified |
| 2026-10-29, spec uncommitted on cdf19b3 | project-detail::REQ-003/AC-02 | Not run yet | Unverified |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
| Source → spec: every confirmed source has a coverage unit or is classed as background | the four owner rulings of 2026-10-29 | done, table above |
| Spec → source: every normative line of this round traces to a source | REQ-003/AC-01 ← the owner rulings on the location and on reading `docs/` only; AC-02 ← existing B2; failure modes ← consequences of AC-01 under B7, R3 and REQ-001/AC-03, no new behaviour | no unapproved expansion |
| Prototype gate | REQ-003 | no new visible state or form; exemption declared in Further Notes (data source only) |
| User operation sequences | open a project with root-only, docs-only, both, or no `docs/`; click a link to `./CONTEXT.md` in a configuration file; relaunch with a page saved before the change | each has a stated outcome in REQ-003's failure modes |
| Identity | B2 → project-detail::REQ-003 (AC-02 carries B2's unchanged sources); REQ-003 never used before (`git log --all -S`) | recorded |
