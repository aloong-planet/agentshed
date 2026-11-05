# Test layers

> Related: ADR-0038 (test layers) · ADR-0040 (rendering branch tests) · ADR-0041 (which e2e file a case goes in)

## Problem Statement

Whoever writes a test here, usually an agent, had no rule for which layer it belongs at. The written
decision said the UI was covered by hand while the e2e suite had become its only automated coverage, and
nothing bounded what went into that suite. Nor did anything say which of its files a case goes in, so one file took
most of them, and a case that went elsewhere brought its own copy of the helpers.

## Solution

ADR-0038 decides what e2e is for and what it admits. Whether a layer below e2e should take renderer behaviour
over was measured rather than argued, and the layer was not adopted (see Out of Scope). ADR-0040 admits component
tests for one narrow case, the rendering branches nothing else checks. ADR-0041 decides which e2e file a case goes in
and where a helper lives.

## User Stories

### test-layers::US-001 Knowing where a new test goes

As someone writing a test for a behaviour, I want one place that says which layer admits it, so that I
do not default to appending to the largest e2e file.

- test-layers::US-001/AC-01: ADR-0038 names the seams and says what e2e admits: wiring, the application's
  lifecycle, reacting to files, real layout and paint, and one case per page through the real chain.
- test-layers::US-001/AC-02: ADR-0002 reads as superseded by ADR-0038, in its own status line and in the
  ADR index.
- test-layers::US-001/AC-03: No spec and no source comment cites ADR-0002 as the rule in force; only
  ADR-0002's own file, the ADR index and ADR-0038 name it.

### test-layers::US-002 A rendering branch fails a test when broken

As someone changing the session page, I want the branches it takes on less common data to fail a test when I
break them, so that a wrong row or banner on those sessions does not reach anyone unnoticed.

- test-layers::US-002/AC-01: A question whose turn dispatched no subagent shows no subagent count and nothing in
  its place, while one that dispatched some shows the count.
- test-layers::US-002/AC-02: A question with no timestamp shows a dash where its time would be.
- test-layers::US-002/AC-03: A Claude session with no branch points has no banner, while one with branch points
  says how many.
- test-layers::US-002/AC-04: In a session listed flat because a question has no timestamp, newest first, expanding
  a row shows that row's turn.
- test-layers::US-002/AC-05: A tool whose recorded output is empty shows an empty output, and one with no recorded
  output says so.

### test-layers::US-003 Knowing which e2e file a case goes in

As someone writing an e2e case, I want one rule for where it goes and where its helpers live, so that a feature's
cases stay together and helpers are not copied.

- test-layers::US-003/AC-01: A case goes in the file named after the `docs/features/` document whose rule it asserts,
  and that file is created if it does not exist yet.
- test-layers::US-003/AC-02: A case that moves between pages only to reach what it asserts goes with the feature it
  asserts on.
- test-layers::US-003/AC-03: A case whose rule is the move itself goes with the spec that states that rule, wherever
  the move starts.
- test-layers::US-003/AC-04: Where two specs each state part of a behaviour, each part's assertions go with their own
  spec.
- test-layers::US-003/AC-05: A case about how the application starts, refreshes or keeps its cache, rather than what
  a feature shows, goes in the one lifecycle file.
- test-layers::US-003/AC-06: A helper that cases of two or more features use lives in `e2e/support/`, and one that a
  single feature uses stays in that feature's file.
- test-layers::US-003/AC-07: A helper needed in a second file moves to `e2e/support/` and is not copied.
- test-layers::US-003/AC-08: A file is split only where part of it is a sub-topic that stands alone, and the new file's
  name starts with the feature's slug. Size alone is no reason.

> Pending: the update feature, the token statistics and the lifecycle cases each sit in several files, whose launchers
> and fixtures differ.

## Quality Requirements

### test-layers::QR-002 The cost of the gap tests

Scope: the component tests ADR-0040 admits, measured on one machine.

- test-layers::QR-002/AC-01: Each behaviour in test-layers::US-002, broken on purpose, fails the test naming it and
  no other, with the suite green before and after.
- test-layers::QR-002/AC-02: `vitest run` on the file takes under 2 s, by the median of 20 runs.
- test-layers::QR-002/AC-03: 20 consecutive runs without a failure.
- test-layers::QR-002/AC-04: The tests and their harness hold no more than 186 lines.

## Constraints

### test-layers::CON-005 Tests only (direct acceptance)

Scope: the gap tests. No shipped file changes, and no e2e case is moved, edited or removed.

### test-layers::CON-006 Moving a case only moves it (direct acceptance)

Scope: moving e2e cases and helpers to meet ADR-0041. `playwright test --list` names the same cases before and after,
and the text of each case and helper is unchanged, apart from `export`, import lines and comments that name the old
location.

## Failure modes and boundaries

- **A behaviour needs only the DOM and no pure function can be extracted from it.** A branch in what a component
  renders, chosen by the shape of the data, goes to a component test under ADR-0040. Anything else is written at
  e2e, as ADR-0038's consequences say. Extracting a pure function comes first where one exists.
- **A shape no provider produces.** Not tested, though the validators accept it: a sub block with inner steps, and
  a Codex page marked stripped with no parent file. The test file's header names them, for when a provider starts
  producing either.
- **A derivation in new code.** Kept in a pure function and unit tested, under ADR-0038. The branches in
  test-layers::US-002 are an existing gap, tested without changing shipped code.
- **A behaviour across several interactions.** Stays in e2e.
- **An existing case fails the criterion.** ADR-0038 moves no existing case by itself, so that case is not a
  defect.
- **One case proves wiring and also asserts details.** It belongs in e2e for the wiring. Details a pure function
  or the data layer can hold go there.
- **A behaviour seen on one page and ruled by another's spec.** The rule decides, not the page: leaving the Projects
  dimension for settings and coming back keeps the selection under project-detail's rule, so that assertion belongs there.
- **A case that names no spec identifier.** Most do not. It is placed by reading what it asserts, and two authors can
  reasonably differ. Nothing checks the placement; review does.
- **A case asserting several features' rules.** When moved, it goes with its main assertion and is not split, under
  test-layers::CON-006.
- **A rule no spec states.** The rule goes into the spec first, and that spec then gives the case its file.
- **A first case for a feature with no document.** The document comes with the feature, so the case takes its slug.
- **A test of the e2e harness itself.** It is no feature's, and stays beside what it tests.
- **A new case for a feature whose older cases still sit in another file.** It goes in the feature's own file under
  test-layers::US-003/AC-01, and the older cases join it when they are moved.
- **A file that keeps growing.** Nothing stops it. It is split only under test-layers::US-003/AC-08.

## Testing Decisions

Seams are ADR-0038's: the data layer, the contract, and e2e, with pure functions of the renderer unit tested.
ADR-0040 adds the renderer's boundary to the main process, for rendering branches only. A case's figures there are
chosen to differ from anything that could stand in for them: an index, a position, another count.

## Out of Scope

- **A component-test layer below e2e: measured and not adopted.** Six e2e cases (the session page's question
  list, expansion, day groups, Claude and Codex rich content, and the tab a project opens on) were moved on a
  branch to tests that mount the real component tree over a fake `window.agentshed` whose payloads pass the real
  contract, measured on one machine on 2026-11-05 against criteria set beforehand:
  - **Detection, passed as parity.** On 57 injected renderer bugs chosen knowing the assertions, and 24 chosen
    without seeing any test, the new tests and the old cases caught the same ones: all 57, and 5 of the 24.
  - **Stability, passed.** 20 consecutive runs without a failure.
  - **Time, failed.** 2.33 s against a limit of 2.05 s, one fifth of the 10.27 s of e2e replaced.
  - **Lines, failed.** 585 lines of tests and harness against the 451 of e2e replaced.
  - Real past changes went red as they should: the source from before #363 and before #357 failed the behaviours
    each introduced. The behaviours of #363 took 72 lines of the new tests, against +139 −31 in the e2e case.

  Reopened by a decision that sets new criteria, because most of the time and much of the lines are one-time
  costs (the jsdom start and the harness) rather than per case; the measurement stands as its evidence.
  ADR-0040's tests do not reopen it: they move no e2e case.
- Moving existing e2e cases to meet ADR-0038.
- A cap or budget on the size of test files: rejected under ADR-0041.
- Real-browser component tests.
- Running e2e in parallel, and the cases that have failed repeatedly in CI.

## Further Notes

The thresholds in the pilot's criteria were that pilot's own, not an industry standard. Those in
test-layers::QR-002 are this change's own, set after a spike had measured about the same figures, so they guard
against drift and prove nothing about the approach.
