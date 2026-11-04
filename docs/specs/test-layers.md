# Test layers

> Related: ADR-0038 (test layers) · [session-view](session-view.md) · [project-detail](project-detail.md) · ADR-0028 (query layer)

> Pending: no component test exists in the repository and the pilot below has no recorded outcome.

## Problem Statement

Whoever writes a test here, usually an agent, had no rule for which layer it belongs at. The written
decision said the UI was covered by hand while the e2e suite had become its only automated coverage, and
nothing bounded what went into that suite. Whether a layer below e2e could take renderer behaviour over,
and what it would cost, was an opinion with no measurement behind it.

## Solution

ADR-0038 decides what e2e is for and what it admits. The second question is answered by measurement: on a
branch, six e2e cases move to component tests, old and new run against the same injected bugs and against
real past changes, and the layer is adopted only if criteria set in advance all pass.

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

## Functional Requirements

### test-layers::REQ-001 The pilot's cases (direct acceptance)

The pilot moves exactly these six e2e cases: the session page's question list and its fields; expanding
and collapsing a turn; day groups and sort order; Claude rich content; Codex rich content; and the tab a
project opens on.

### test-layers::REQ-002 What a component test stands on (direct acceptance)

A component test mounts the real component tree with the app's real query client options and real
dictionaries, and fakes nothing below the renderer's one boundary to the main process, `window.agentshed`.

### test-layers::REQ-003 Fake payloads pass the real contract (direct acceptance)

A payload the fake returns goes through the same contract validation the preload applies to it, and a
payload that fails it fails the test.

### test-layers::REQ-004 Old and new compared against the same bugs

Applies to: each of the six cases, before its e2e case is deleted.

- test-layers::REQ-004/AC-01: The same injected renderer bugs run against the old e2e case and the new
  tests, and each result is recorded per bug and per case.
- test-layers::REQ-004/AC-02: The e2e case is deleted only if the new tests catch every injected renderer
  bug the old case catches.
- test-layers::REQ-004/AC-03: Where the new tests miss such a bug, or the case cannot be mounted, the e2e
  case stays and the reason is recorded.

### test-layers::REQ-005 Maintenance measured

Applies to: the six cases.

- test-layers::REQ-005/AC-01: A baseline is recorded before any case moves: each old case's lines, the
  commits that changed it, and its time.
- test-layers::REQ-005/AC-02: The new tests run on the source as it stood before each of #355, #357 and
  #363, and the behaviours each change introduced go red.
- test-layers::REQ-005/AC-03: For those behaviours, the test lines each layer needs are compared.

### test-layers::REQ-006 What stays in e2e of the tab case (direct acceptance)

The steps of the tab case in which a change on disk reaches the page through a scan stay in a thin e2e
case, because ADR-0038 admits reacting to files. Its lines and time do not count as replaced.

### test-layers::REQ-007 The outcome

Applies to: the pilot as a whole, judged by test-layers::QR-001.

- test-layers::REQ-007/AC-01: If every criterion passes, the layer is adopted: ADR-0039 becomes Accepted,
  and the new tests, their dependencies and the deletions merge.
- test-layers::REQ-007/AC-02: If any criterion fails, the layer is not adopted: the new tests, their
  dependencies and the deletions do not merge, every e2e case stays, ADR-0039 is deleted, and this spec's
  Out of Scope states the rejection and why, with its figures.

## Quality Requirements

### test-layers::QR-001 The pilot's pass criteria

Applies to: the six cases taken together. Every criterion must pass; a case left in e2e counts as a failure
of AC-01. The figures are the owner's rulings of 2026-11-05.

- test-layers::QR-001/AC-01: The new tests catch every injected renderer bug.
- test-layers::QR-001/AC-02: The new tests' total time is at most one fifth of the replaced e2e cases',
  both measured on the same machine.
- test-layers::QR-001/AC-03: The new tests pass 20 consecutive runs with no failure.
- test-layers::QR-001/AC-04: The new tests and their harness total at most as many lines as the replaced
  e2e cases.

## Constraints

### test-layers::CON-001 Production code stays as it is (direct acceptance)

Applies to: the pilot; no file the app ships changes. What jsdom lacks is supplied in the test harness. A
case that cannot be tested without a production change stays in e2e under test-layers::REQ-004/AC-03.

### test-layers::CON-002 Dependencies (direct acceptance)

Applies to: the pilot; it adds `@testing-library/react` and its peer `@testing-library/dom` as development
dependencies, and no other.

### test-layers::CON-003 The decision and the pilot merge separately (direct acceptance)

Applies to: this spec's delivery; ADR-0038 and its citations merge independently of the pilot, whose
outcome they do not depend on.

### test-layers::CON-004 The mutation-testing capability stays off (direct acceptance)

Applies to: the pilot; the injected bugs are its own acceptance, and `capabilities.toml` still declares
`mutation-testing` not enabled.

## Failure modes and boundaries

In the order the pilot meets them:

- **A case will not mount in jsdom.** jsdom lacks APIs the mounted tree uses (`ResizeObserver`,
  `matchMedia`, `scrollIntoView`). The harness supplies inert stand-ins for them, and none of the six cases
  asserts what they would compute. If a case needs real behaviour from one, it stays in e2e
  (test-layers::REQ-004/AC-03).
- **The app needs more than the page.** The session cases mount the session page; the tab case mounts the
  whole app, as the app's entry mounts it, because the tab's memory is what mounting and unmounting do.
- **A fake payload drifts.** Validation fails and so does the test; a test cannot go green on a shape the
  contract refuses (test-layers::REQ-003).
- **A payload is valid and wrong.** The new tests cannot see it: a stripped fork titled with the replayed
  question is well formed. That class stays with the data layer's tests and the e2e cases that remain, and
  it is not in the injected set, which holds renderer bugs only.
- **The main process logs an error along the way.** Each moved e2e case also asserted that none was logged.
  The new tests cannot; the e2e cases that remain on the same pages still do.
- **An injected bug never takes effect.** e2e reads the build, so each injection rebuilds first, and a bug
  that changes nothing observable, or a failure elsewhere than at the injected behaviour, makes that
  injection invalid. It is replaced and recorded rather than counted.
- **The old case misses a bug the new tests catch.** It is recorded as a gain and is not required.
- **The new tests miss a bug the old case catches.** The case stays and the layer is not adopted
  (test-layers::REQ-004/AC-03, test-layers::QR-001).
- **A test is flaky.** One failure in the 20 runs fails test-layers::QR-001/AC-03.
- **Timing differs across machines.** Both sides are timed on one machine; CI's figures are the baseline's
  background and are not compared.
- **The tab case changes on main during the pilot.** Other work touches it often. Before the outcome is
  judged the branch takes the latest main, and any behaviour main added is moved or the comparison is re-run
  for it.
- **The outcome is mixed.** Five cases passing and one left in e2e is a failure: the tab case is the sample
  of where e2e is growing (test-layers::QR-001).
- **A jsdom run affects the other tests.** Only the files that need it run under jsdom; every other test
  stays in the node environment.

## Implementation Decisions

- Component tests sit beside the renderer's other tests and run in the existing unit step. Each declares the
  jsdom environment for itself, as the existing markdown test does.
- A small harness supplies the fake `window.agentshed`, typed from the preload's API, the providers the app's
  entry uses, and the stand-ins for what jsdom lacks.
- Fixtures are hand-written literals whose shapes are copied from payloads captured from the real app on the
  e2e fixtures, so they do not inherit the blind spots of imagining the data.
- The tab case mounts the whole app and drives a scan by emitting a snapshot through the fake, which is the
  renderer's real input. The thin e2e case keeps one real change on disk.
- The injected bugs are listed before the first injection and cover every behaviour each case asserts. The
  replays of #355, #357 and #363 use the real source from before each change.
- Results live in ADR-0039 if the layer is adopted, or in this spec's Out of Scope if not.

## Testing Decisions

Seams: the renderer's boundary to the main process, `window.agentshed`, for the component tests; the e2e seam
for what ADR-0038 admits. Good tests here assert what a user sees and does, in the app's own copy and
structure, and not how components hold their state.

Prior art: the jsdom markdown sanitising test and the static render of rich text. Neither mounts a page with
a query client, which is the new part.

These cases stay in e2e and are not in the pilot: a fork session's question list, which guards the title's
data path; a long question's truncation, which needs layout; and the allow-list refusal, which needs the real
channel. The file-append case, the paginated and cold rollout cases and the Grok case keep the path from a
click to a real answer covered.

## Out of Scope

- Moving any e2e case beyond the six, or moving existing cases to meet ADR-0038.
- A budget on test file sizes, a rule for which e2e file a new case goes in, and splitting the largest spec.
- Real-browser component tests.
- Extracting navigation into a pure module.
- Running e2e in parallel, and the cases that have failed repeatedly in CI.
- Running deleted e2e cases in a non-blocking job for a period.

## Further Notes

- test-layers::CON-004 was stated as a premise of the decision on deleting e2e cases (2026-11-05), not asked
  as a question of its own.
- The time and line budgets in test-layers::QR-001 are this pilot's own thresholds, not an industry standard.
