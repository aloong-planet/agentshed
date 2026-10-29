# Project detail — code review: CONTEXT.md read from docs/ (project-detail::REQ-003)

No ticket: spec-driven work inside aloong-planet/agentshed#337. Date: 2026-10-29. Implementation version: cdf19b3 with
the round's changes uncommitted on top. Scope: `src/main/providers/artifacts.ts`, its unit test, the five e2e fixture
sites, and the repository move of CONTEXT.md (README links, AGENTS.md).

## Underlying premises

- The other collectors read only `docs/adr`, `docs/specs`, `docs/features`, `docs/postmortems` and
  `docs/prototypes`, so `docs/CONTEXT.md` is not listed twice: confirmed by reading `readArtifacts` and by the unit
  case with both files, which lists exactly one context entry.
- The allow-list registers whatever paths the detail returns, so reading and the restore checks follow the new
  path without a change of their own: confirmed by the startup-restore e2e case (the `docs/CONTEXT.md` registration,
  its symlink swap refused), run after a fresh build.
- The new comment in `artifacts.ts` states the rule and its source only, no cause.

Result: no finding.

## Runnability

- `docs/` missing: `existsSync` is false and nothing is listed (unit case "root only").
- `docs/CONTEXT.md` unreadable or a directory: the title falls back to the filename and opening it fails into the
  existing toast — the same handling the root file had; the failure stays with that entry (self-only).
- A page saved before the change: it lists the root path until revalidation replaces the detail; reading that entry
  meanwhile goes through the restored registration and its current-target checks, unchanged.

Result: no finding.

## Security

The path is a fixed join under the project directory; no input reaches it. The allow-list mechanism is unchanged.
Result: no finding.

## Consistency

- Class-level check, "the CONTEXT artifact's location is computed in one place": enumerated by searching all of
  `src` for `'context'` and for `CONTEXT` outside comments and tests — `artifacts.ts` builds the path; `domain.ts`
  holds the type; `DetailPane.tsx` holds the chip label `CONTEXT.md`, which names the type and stays. No other
  instance.
- The e2e fixtures that placed CONTEXT.md at a project root: enumerated by searching `e2e/` for `CONTEXT.md`; all
  five moved, and the config-card probe links `./docs/CONTEXT.md`.
- Baseline smells against the changed lines: none.

Result: no finding.

## Findings

No findings. Refactoring list: empty.

## Hand-over self-check after the post-implementation findings (2026-10-29)

Item 1 (product code changed by the fix): not applicable — the fix for F1–F3 changes tests and records only.
