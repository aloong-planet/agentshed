# ADR-0040: Component tests hold only the rendering branches nothing else checks

- Status: Accepted (2026-11-05)

## Context

ADR-0038 keeps React components out of unit tests, its option 7 having rejected a component-test layer: on six
e2e cases moved down, component tests matched e2e's detection but failed the time and line criteria. The same
pilot injected 24 renderer bugs chosen without seeing any test. Seven escaped all 1,166 unit tests and 192 e2e
cases at commit `3871985`. Checked against what the providers can produce, five are reachable: a stray `0` on
rows with no subagents, a made-up time on a question with none, a banner on sessions with no branch points, a
flat newest-first list opening the wrong turn, and an empty tool output shown as not recorded. Each is a branch
in what a component renders for a shape of data the suite's fixtures do not take.

## Options

1. **Component tests admitted for these branches only, moving no e2e case**
2. Write them in e2e — rejected: each costs an application start, and none has a chain, lifecycle, file or
   layout concern, so ADR-0038 would not admit it.
3. Leave the gap and record it — rejected: the bugs are one careless edit from users, and five tests cost little.
4. Extract pure functions and test those — rejected for these five: three are conditions in JSX, where extracting
   leaves the branch that matters in the component, and the other two (a private time format and an inline
   ordering) would change shipped code to test what the harness already reaches. New code still keeps a
   derivation in a pure function first, under ADR-0038.
5. Adopt the component-test layer ADR-0038 rejected — rejected: nothing here changes that measurement, which was
   about replacing e2e. Reopening it stays a separate decision.

## Decision

We choose **option 1**. A component test is admitted when all of these hold:

- It holds a branch in what a component renders, chosen by the shape of the data.
- No test exercises that shape today.
- A provider can produce the shape. A shape only a fixture can build is not tested.
- It fails when that branch is broken, shown once by breaking it before the test lands.

New code keeps a derivation in a pure function first, under ADR-0038. Flows across interactions, what e2e already
asserts, and everything ADR-0038 admits to e2e stay where they are. No e2e case moves on account of this decision.

The tests mount the real component tree over a fake `window.agentshed`, whose payloads pass the real `validate`
functions and which throws on a method it was not told to expect.

## Consequences

- Positive: the five branches fail a test when broken, in under 2 s for the file, with no shipped file changed.
- Negative: two development dependencies, and an author now has to tell a rendering branch from a flow, a line
  that will blur.
- Negative: a passing fake does not show a provider can produce the shape, since the validators check shape and
  not reachability. This is why the third condition exists: two of the seven bugs needed states no provider
  produces, and the validators accepted them.
- Neutral: reopen this entry when component tests pass 500 lines in total, since that would be a layer in fact,
  which ADR-0038 rejected on evidence.

## Sources

ADR-0038 and the [test-layers spec](../specs/test-layers.md). The pilot's bug injection against commit `3871985`,
and the same five bugs injected again on 2026-11-05 on top of commit `67a3598`. Producers read at `67a3598`:
`stripReplayPrefix`, `codexShown`, and the four `kind: 'sub'` sites in `turn-content.ts`. The owner's ruling of
2026-11-05.
