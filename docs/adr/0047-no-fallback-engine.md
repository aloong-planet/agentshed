# ADR-0047: No fallback engine: a module that will not load, or is another build, fails what needs it

- Status: Proposed

## Context

The engine module (ADR-0045) can be missing, damaged, built for another architecture, or another build than the
application's code was made with. Every token figure a scan makes, and every question index and question text the
app shows, comes from it.

## Options

1. **No fallback engine: such a module fails the scans and reads that need it** — chosen.
2. A TypeScript fallback for when the module will not load — rejected: every accounting rule would exist
   twice, held together by a parity check that never ends, and a module that will not load is a build or
   install defect the tests and smoke runs on every shipped target catch.

## Decision

We adopt **option 1**. No fallback engine exists: a module that will not load, or reports another build than the
application's code was made with, fails as token-stats' failure modes for scans and the window state.

## Consequences

- Positive: every accounting rule exists once, with no parity check to keep between two engines.
- Negative: where the module will not load, every scan and every question read fails for that run, and the
  window keeps what it restored (token-stats, Scans and the window).
- Neutral: a module that will not load is a build or install defect, and every build of the module loads what
  it built and checks the build it reports, the packaged one's included (Sources).

## Sources

`scripts/build-engine.mjs`, run by every build of the module, packaging's included (`build/engine-before-pack.cjs`):
it loads the library it built and refuses one that reports another build. `e2e/lifecycle.spec.ts`: the case for a
module that will not load, on the built app.
