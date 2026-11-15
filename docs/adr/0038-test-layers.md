# ADR-0038: Test layers: the data layer, the contract, e2e for what only the assembled app can show, and component tests for the rendering branches nothing else checks

- Status: Accepted (2026-11-05)

## Context

Whoever writes a test here, usually an agent, needs a rule for which layer a behaviour belongs at. No test can
reproduce the agents' real data directories, and the UI and the main process's assembly break where the data layer
and the contract do not look. E2E is by far the slowest layer, so what it admits must be bounded.

## Options

1. **Four layers: the data layer, the contract, e2e for only what the assembled app can show, and component tests
   for only the rendering branches nothing else checks**
2. Only the data layer and the contract, leaving the UI and the main process's assembly to the dev smoke run and
   hand acceptance — rejected: a startup crash neither could see got through.
3. The data layer alone — rejected: the contract has to be testable on its own (Transfer's IPC drift).
4. E2E as the primary approach — rejected: heavy, brittle and slow.
5. Layout kept out of e2e too, for a real-browser component layer — rejected: no such layer exists, and both layout
   postmortems needed real layout to show.
6. A component-test layer taking cases from e2e — deferred: a pilot matched e2e's detection but failed two criteria
   set in advance; the test-layers spec's Out of Scope holds its figures and what reopens it.
7. Rendering branches tested in e2e — rejected: each costs an application start, and none has a concern only the
   assembled app shows.
8. Rendering branches left untested — rejected: the reachable ones are one careless edit from users, and the tests
   cost little.
9. Testing pure functions extracted from components instead — rejected where the branch is a JSX condition that
   extracting leaves behind, or where extracting would change shipped code only to test it.
10. Reopening the component-test rule once those tests pass 500 lines — rejected by the owner, reason not recorded.

## Decision

We adopt **option 1**:

- **The data layer**: injecting `ScanRoots` drives it end to end from a temporary fixture directory; install and
  uninstall run against the real filesystem on fixtures.
- **The contract**: `validate` makes it testable independently of Electron.
- **E2E**: Playwright drives a real Electron build with a fixture home and its own user data, as the automated layer
  for the React UI and the main process's assembly. A case belongs here only when what it proves only the assembled
  app can show: wiring (IPC, the main process's handlers and what they enforce, the preload's checks), the lifecycle
  (startup, restoring after a restart, a cache from an older build, the menu, updates, quitting), reacting to files,
  and real layout and paint (geometry, overflow, scrolling, painted colours, themes). Each page also keeps one case
  reaching it from the app's own entry points with fixture data through the real chain.
- **Component tests**: one holds a branch in what a component renders, chosen by the shape of the data, only when no
  test exercises that shape, a provider can produce it (a shape only a fixture can build is not tested), and breaking
  the branch fails the test, shown once before it lands.

Everything else goes lower: a rule about agent data to the data layer, a rule about a payload to the contract, and a
derivation in the renderer to a unit test of a pure function, where new code keeps it first. Flows across
interactions stay in e2e, and React components are not otherwise unit tested. Hand acceptance covers what e2e cannot
reach. This decision moves no existing case.

## Consequences

- Positive: one rule says where a new test goes.
- Positive: data-layer and contract tests run without Electron, in milliseconds, reproducibly.
- Positive: a rendering branch on less common data fails a test when broken.
- Negative: e2e stays the slowest layer, and this decision bounds only new cases, not the suite.
- Negative: a UI behaviour with no chain or layout concern, no pure function to extract and no rendering branch to
  hold has no cheap home, so it stays in e2e.
- Negative: component tests add two development dependencies, and an author must tell a rendering branch from a
  flow, a line that will blur.
- Negative: a passing fake does not show that a provider can produce the shape, since the validators check shape, not
  reachability; hence the provider condition.
- Neutral: a component test proves the branch, not the chain behind the renderer's boundary to the main process.

## Sources

The [test-layers spec](../specs/test-layers.md). Postmortems `2026-07-30-cache-version-crash`,
`2026-08-11-a-rect-is-not-a-pixel` and `2026-08-16-prototype-copy-blindspot`. jsdom does no layout or rendering
(<https://github.com/jsdom/jsdom#unimplemented-parts-of-the-web-platform>). At commit `d38eb9f` e2e took 432 s in CI
run 41849387289, against 19 s for the other three test steps. Of the pilot's 24 renderer bugs, injected at
`3871985` blind to the tests, seven escaped every unit and e2e test, five of them reachable from what the providers
produce. The owner's rulings of 2026-11-05.
