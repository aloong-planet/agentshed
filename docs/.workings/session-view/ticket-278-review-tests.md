# Test review — #278

Ticket: [#278](https://github.com/aloong-planet/agentshed/issues/278) · feature `session-view` · branch
`fix/stripped-fork-title`. Scope: the tests that reproduce the stripped fork's title mismatch and hold the fix.

## Design review

Checked 2026-10-20. Implementation version: a1b04b5 (main, where the work began). Requirement source: the
session-view spec A4 and B2's re-titling of a stripped fork, as #278 states them.

### Test design table

Seams: the token engine (its build and its session questions) and the project search over a fixture home, the
seams of the existing fork cases; and e2e under the built app over `mkForkHome` (a Codex parent asking "Parent first
question", a fork replaying it and asking "Child new question", an orphan fork).

| # | Test (file · case) | Spec units | Seam | Input that drives the branch | Assertion and where the expected value comes from | Fixture shape source | Expensive resources and provision |
|---|---|---|---|---|---|---|---|
| U1 (changed; reproduces the bug) | token-stats.test · a prefix-stripped legacy fork with no `thread_name` is re-titled | A4, B2 | the engine | a parent asking "parent question one" and a fork replaying it then asking "child new question", no `thread_name`; the fork's session questions after the build | the session questions' title is "child new question", the listed title the case already asserts — literal | the existing case's Codex rollout lines, in the real `user_message` shape | none |
| U2 (changed) | token-stats.test · a prefix-stripped fork with a `thread_name` keeps it | A4 | the engine | the same pair with the fork's `thread_name` "fork thread name" in the session index | the session questions' title is "fork thread name" — literal | the existing case | none |
| U3 (new; reproduces the bug) | search-sessions.test · a stripped fork's card carries its own title | A4, B2 | the project search | the D3 case's pair (a parent asking "magicword in the parent session", the fork replaying it then asking "child new question"); a question-mode search for "child new" | one group, the fork's, titled "child new question" — literal | the D3 case's lines | none |
| E1 (changed; reproduces the bug) | app.spec · the session page banner | B2 | e2e | the stripped child opened, then its banner's parent link, sampled inside the 600 ms delay while the child page stays | the header reads "Child new question", where the case read "Parent first question" — the child's own title, so the sample now tells the child page from the parent's | `mkForkHome` | one launch, unchanged |
| E2 (changed; reproduces the bug) | app.spec · a fork session shows only the questions left after stripping | A4, B2 | e2e | the stripped child opened from the Sessions tab | the header reads "Child new question" — literal | `mkForkHome` | one launch, unchanged |

Red first: U1, U3, E1 and E2 reproduce the bug, so each must fail on the unfixed code at its title assertion
before the fix (`/tdd`'s rule for a bug's reproducing test). U2 guards A4 against the fix and passes before and
after. Per the project's capability declaration, `mutation-testing` is not enabled, so mutation testing is skipped.

### Dimension 1: Coverage

The surfaces that take the engine's title, found by `rg -n "sessionQuestions\(" src` and following each caller's use
of `title`: the session page (`getSessionPage`) and the project search (`searchProjectSessions`) — U1, E1, E2 and
U3. The global search corpus also calls it but takes its card titles from the scan's listed sessions, which already
carry the re-title (#271's cases). The boundaries: a fork whose title came from its first question (U1, U3, E1, E2);
one with a `thread_name` (U2); a fork not stripped (uncertain, or paginated) keeps its title, as nothing is
re-titled when nothing is stripped — held by the existing paginated case's listed title and unchanged by the fix.
Each claimed boundary names its input above.

Fixture: the existing cases' lines, already in the real rollout shape the scan reads.

### Dimension 2: Case design

No red flag: the engine and the search are driven through their public calls; the e2e cases through the window.
E1's change also removes a false green: both pages carried the same title before, so the sample could not tell them
apart.

### Dimension 3: False greens (the three judged on the design)

- Constant truth: each title assertion compares a literal that differs between the parent and the fork.
- Tautology: the expected titles are literals from the fixtures.
- Stale path: E1's old expectation was the bug's value; it is replaced.

### Dimension 4: Resource reuse

The unit cases build a temporary home each, as every case in their files does (well under a second); the e2e cases
keep their one launch each.
