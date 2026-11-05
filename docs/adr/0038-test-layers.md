# ADR-0038: Test layers: the data layer, the contract, and e2e as the UI's automated layer

- Status: Accepted (2026-11-05)

## Context

ADR-0002 stood all behavioural tests on two seams, the data layer and the IPC contract, rejected
Playwright as the primary approach, and left the Electron shell and the React UI to the dev smoke run
and hand acceptance. A day later a startup crash neither seam could see (postmortem
`2026-07-30-cache-version-crash`) brought in an e2e suite. It grew into the only automated coverage of
the UI and of the main process's assembly layer, with no decision saying so and none saying what
belongs in it.

By 2026-11-04 (commit `d38eb9f`) the suite held 185 cases and took 432 s in CI against 19 s for the
other three test steps together; one spec file held 7,775 lines, and 13 of the 18 specs mentioned
e2e. Whoever writes a test, usually an agent, had a written decision that contradicted the suite and
no rule for which layer a behaviour belongs at.

## Options

1. **Three seams, with e2e admitting only what the assembled app alone can show**
2. Keep ADR-0002 and treat e2e as an unwritten exception — rejected: the written decision goes on
   contradicting the suite, and a test's author still has no rule.
3. Supersede only ADR-0002's UI clause — rejected: the rule would have to be read across two entries.
   One entry holds all of it, at the cost of updating every citation of the old one.
4. Keep layout out of e2e as well, for a real-browser component layer — rejected: that layer does not
   exist, so layout cases would have nowhere to go, and both layout postmortems
   (`2026-08-11-a-rect-is-not-a-pixel`, `2026-08-16-prototype-copy-blindspot`) were problems only real
   layout can show.
5. E2E as the primary approach — rejected, as ADR-0002 rejected it: heavy, brittle and slow. Data
   behaviour stays at the data layer.
6. The data layer as the single seam — rejected, as ADR-0002 rejected it: the contract layer has to be
   independently testable (the lesson of Transfer's IPC drift).
7. A component-test layer below e2e — rejected for now: a pilot matched e2e's detection but failed two
   criteria set in advance, and its figures and what would reopen it are in the
   [test-layers spec](../specs/test-layers.md)'s Out of Scope.

## Decision

We choose **option 1**. Behavioural tests stand on three seams:

- **The data layer**: injecting `ScanRoots` drives it end to end from a temporary fixture directory, and
  install and uninstall are measured against the real filesystem on fixtures.
- **The contract**: `validate` makes the contract testable independently of Electron.
- **E2E**: Playwright drives a real Electron build with a fixture home and its own user data. It is the
  automated layer for the React UI and the main process's assembly layer.

A case belongs in e2e when what it proves only the assembled app can show:

1. **Wiring**: IPC, the main process's handlers and what they enforce, the preload's checks across the
   transport.
2. **The application's lifecycle**: startup, restoring after a restart, a cache from an older build,
   the menu, updates, quitting.
3. **Reacting to files**: what a page does after something changes on disk.
4. **Real layout and paint**: geometry, overflow, scrolling, painted colours, themes.

Each page also keeps one case that reaches it from the app's own entry points with fixture data through
the real chain.

Everything else goes lower: a rule about agent data to the data layer, a rule about a payload to the
contract, and a derivation in the renderer to a unit test of a pure function. React components themselves
are not unit tested. Hand acceptance covers what e2e cannot reach, and its items live in each spec's
Testing Decisions.

> **Amended (2026-11-05)**: ADR-0040 admits component tests for one narrow case, the rendering branches nothing
> else checks. Otherwise React components stay out of unit tests, and the rest of this decision stands.

This decision moves no existing case by itself.

## Consequences

- Positive: one rule says where a new test goes, and the written decision matches the suite.
- Positive: the two seams that work keep their tests and their reasoning.
- Negative: e2e stays the slowest layer, and this decision only bounds new cases; it does not shrink the
  suite.
- Negative: a UI behaviour with no chain or layout concern and no pure function to extract has no cheap
  home, so it stays in e2e.
  > **Amended (2026-11-05)**: apart from the rendering branches ADR-0040 admits.
- Neutral: every spec and source comment citing ADR-0002 now cites this entry.

## Sources

ADR-0002. Postmortems `2026-07-30-cache-version-crash`, `2026-08-11-a-rect-is-not-a-pixel` and
`2026-08-16-prototype-copy-blindspot`. jsdom's README on what it does not implement: it does no layout
or rendering (<https://github.com/jsdom/jsdom#unimplemented-parts-of-the-web-platform>). CI run
41849387289 and a count of the tree at commit `d38eb9f`. The owner's rulings of 2026-11-05.
