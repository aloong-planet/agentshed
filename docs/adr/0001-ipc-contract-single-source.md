# ADR-0001: Single type source for the IPC contract, with runtime validation on both sides

- Status: Accepted (2026-07-30)

## Context

When the main process and the renderer each hold their own copy of a message shape, contract drift
shows up at runtime as silently undefined rendering (the Transfer project once spent a whole
convergence round on exactly this). Agentshed's snapshot structure will keep growing with feature
tickets, so drift needs to surface at the boundary, immediately.

## Options

1. **Three shared pieces: types (domain) + channel names (ipc) + hand-written structural validators
   (validate), asserted on the way out of the main process and checked on the way in at the preload
   — a gate on each side**
2. Bring in a schema library such as zod — rejected: the surface to validate is one snapshot and a
   handful of parameters; a runtime dependency plus a duplicated schema definition is not worth it
3. Rely on TypeScript types alone with no runtime validation — rejected: IPC crosses the type
   boundary (structured clone yields `unknown`), so drift passes silently

## Decision

We choose **option 1**: IPC channel names, domain types and structural validators all live in
`src/shared/` and both ends import only from there. Snapshots are asserted before the main process
sends them and checked when the preload receives them; a validation failure throws with the field
path included.

## Consequences

- Positive: a broken contract blows up at the boundary at the first opportunity, with a location;
  there is exactly one copy of the types, so drift has nowhere to hide
- Negative: every snapshot extension requires a matching change to `validate` (hand-written
  validation has a maintenance cost)
- Neutral: validation is structural (fields and types), not semantic (value ranges)

## Sources

The lesson from Transfer's ADR "converge the message domain model onto a single source of truth";
this repository's spec, Implementation Decisions.
