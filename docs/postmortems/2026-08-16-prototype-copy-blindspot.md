# A prototype's width readout was blind to the copy it hard-coded

**Date**: 2026-08-16 · **Surface**: the project list's filter row (ticket #123, spec C5)

## What happened

The project-list prototype was built to answer, among other things, whether the side-filter row
survives the six UI languages in the 272px sidebar. It carried a live width readout for exactly
that, and the design was confirmed against it. During implementation, the six-language e2e —
constructed for the worst reachable state (longest side name on the trigger, stale counter
visible) — went red in **every** language: the row wrapped in all six, and Russian overflowed the
column horizontally by 37px.

## Why the prototype could not see it

The row has three occupants. Only one of them — the filter's "All" label and the side names — was
wired to the prototype's language switcher. The stale toggle label and the stale counter were
hard-coded in Chinese, which happens to be the **shortest** of the six languages. So the readout
faithfully measured a row two-thirds of which never changed language, and the confirmation it
earned covered a state that does not exist in the product.

The causal chain: demo scaffolding hard-codes copy → the measurement instrument sits on top of that
scaffolding → the instrument's numbers are real but the state they measure is not → confirmation
attaches to the wrong state.

## What it cost, what it settled

Found by the e2e before shipping, so the cost was one mid-implementation design ruling (2026-08-16:
the stale counter yields first, ellipsizing with its full sentence on the title; the toggle label
wraps only past its own natural width — recorded in spec C5) rather than a shipped defect.

## The rule to carry forward

**A prototype answering a copy-width question must route every piece of copy in the measured
container through its language switcher — or the readout must say which parts it cannot see.**
Hard-coded copy in a measured container is not neutral scaffolding; it is the blind spot, and it
biases the answer toward whichever language was hard-coded. When wiring all of it is not worth it,
the honest fallback is a visible caveat on the readout naming the unwired parts, so confirmation
cannot silently extend to them.
