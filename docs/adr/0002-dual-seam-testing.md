# ADR-0002: Dual-seam testing strategy (data-layer injection + IPC contract)

- Status: Accepted (2026-07-29, decided by the user during requirements analysis)

## Options

1. **Two seams: the data layer (root directories injected, fixtures feeding a fake directory tree)
   and the IPC contract (a schema validation round trip)**
2. The data layer as the single seam — rejected: the user explicitly required the contract layer to
   be independently testable (the lesson of Transfer's IPC drift)
3. Playwright end-to-end as the primary approach — rejected: heavy, brittle and slow; with a wide
   feature surface in the first release the maintenance cost is the highest of the three

## Context

The scan engine reads both agent sides' real data directories, and testing against real directories
is not reproducible; the UI layer changes too often to be worth unit testing. We need to decide which
two public boundaries the tests stand on.

## Decision

We choose **option 1**: all behavioural tests sit on two seams — injecting `ScanRoots` lets the data
layer be driven end to end from a temporary fixture directory (install and uninstall are measured
against the real filesystem on fixtures), and `validate` makes the contract testable independently of
Electron. The Electron shell and the React UI are not unit tested; they are covered by the dev smoke
run and by hand acceptance — the hand-acceptance items live in each spec's Testing Decisions section.

> **Amended (2026-08-25)**: this originally promised "a manual checklist", an artifact that was never
> created; the wording now points at where the hand-acceptance items actually live.

## Consequences

- Positive: tests have zero Electron dependency, run in milliseconds, and are reproducible; data
  behaviour is densely covered (61 cases)
- Negative: the UI and the main process's assembly layer (IPC handler wiring, refresh deduplication)
  have no automated coverage; regressions there are caught by hand
- Neutral: fixture construction is about half the volume of the test code

## Sources

The spec's Testing Decisions (chosen by the user); the seam rules in the tdd skill.
