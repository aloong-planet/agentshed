# CI routing

## Problem Statement

Every pull request currently pays for application tests, website tests and Electron E2E even when its
changes affect only documentation or the website. Skipping the whole workflow would strand required
checks, while accepting every skipped job would hide failures in jobs that should have run.

## Solution

Classify a pull request's complete change set, run each affected product's checks, and report a stable
CI gate. A default-branch push runs both products' checks whatever it changed.
Repository policy checks remain unconditional. The online ruleset requires the stable `CI gate` and
the independent message-language check; conditional product jobs are enforced through the gate.

## Functional Requirements

### ci-routing::REQ-001 Select checks by impact

- ci-routing::REQ-001/AC-01: Changes confined to ordinary documentation, root READMEs, package READMEs
  or documentation prototypes skip application and website product tests, while repository policy
  checks still run.
- ci-routing::REQ-001/AC-02: Website implementation, assets, tests, configuration and its dependencies
  run website checks without application tests or Electron E2E.
- ci-routing::REQ-001/AC-03: Application implementation, tests, build tooling and application-specific
  configuration run application checks and Electron E2E without website checks.
- ci-routing::REQ-001/AC-04: The application's theme stylesheet also triggers website checks because
  the website tests compare the two palettes.
- ci-routing::REQ-001/AC-05: Mixed changes take the union of their scopes. Shared dependency/tooling
  configuration, CI definitions, the routing/gate implementation and unknown paths select both scopes.
- ci-routing::REQ-001/AC-06: A default-branch push selects both product scopes whatever it changed; only
  a pull request is routed by its changed paths.

### ci-routing::REQ-002 Classify the whole change set

- ci-routing::REQ-002/AC-01: A pull request compares its merge base with its head, including earlier
  commits in the same pull request.
- ci-routing::REQ-002/AC-02: Deletions and both sides of a move participate. Whitespace and newlines in
  filenames do not split or discard paths, and large diffs are not restricted to an API's file limit.
- ci-routing::REQ-002/AC-03: An unsupported event fails classification, and so do a pull request's
  missing commits, failed Git operations or malformed input.
- ci-routing::REQ-002/AC-04: Classification exposes explicit boolean strings and a readable explanation
  of the selected scopes, including unknown-path fallback.

### ci-routing::REQ-003 Report a reliable stable gate

- ci-routing::REQ-003/AC-01: The gate waits for classification, repository policy and every product job,
  and evaluates their results even after an upstream failure or skip.
- ci-routing::REQ-003/AC-02: Classification and repository policy must succeed. Classification outputs
  must be exactly the strings true or false; missing or malformed outputs fail the gate.
- ci-routing::REQ-003/AC-03: A selected product job must succeed. Failure, cancellation, missing results
  or an unexpected skip fail the gate. An unselected job may succeed or be skipped, but may not fail.

### ci-routing::REQ-004 Preserve the verification boundary

- ci-routing::REQ-004/AC-01: Application checks keep typechecking, application/tooling lint, unit and
  script tests, copy checks, and the build performed by Electron E2E. Website checks keep lint, Astro
  typechecking, tests and their fresh build. The two lint scopes together cover the existing full lint.
- ci-routing::REQ-004/AC-02: Repository language, raw-NUL and shared-piece/document/prototype checks
  remain unconditional. The full local verification command remains available.
- ci-routing::REQ-004/AC-03: Pull request and default-branch push triggers, cancellation of obsolete
  runs, the separate message-language workflow and release triggers retain their existing behavior.
- ci-routing::REQ-004/AC-04: The online ruleset requires `CI gate` and
  `message language (PR title, body, commits)`, with no legacy forwarding check or independently
  required product job. Removing the compatibility job follows successful verification of the gate
  and the online ruleset switch; opening an implementation PR alone does not change that ruleset.

## Failure modes and boundaries

- A code change followed by a documentation-only commit in the same pull request still selects
  application checks (ci-routing::REQ-002/AC-01).
- Moving code into documentation still selects its former product scope; deleting the last source
  file does not turn the change into an empty set (ci-routing::REQ-002/AC-02).
- Markdown used as application/site content or a fixture stays in its consumer's scope rather than
  receiving a repository-wide extension exemption (ci-routing::REQ-001/AC-02 and ci-routing::REQ-001/AC-03).
- A new directory is reported and selects both scopes rather than silently joining documentation
  (ci-routing::REQ-001/AC-05).
- A missing merge base, truncated/failed Git output, or absent classification output cannot turn into
  a green documentation-only result (ci-routing::REQ-002/AC-03; ci-routing::REQ-003/AC-02).
- A failed, cancelled or unexpectedly skipped selected job cannot make the final check pass by
  dependency skipping (ci-routing::REQ-003/AC-01 and ci-routing::REQ-003/AC-03).
- A pull request with a valid empty diff still runs policy checks and produces a gate result
  (ci-routing::REQ-004/AC-02).
- Editing only PR metadata retains the separate message-language recheck; it does not launch product
  tests (ci-routing::REQ-004/AC-03).
- An application merge followed, before its default-branch run finishes, by a documentation-only merge:
  the newer push cancels the unfinished run, and its own run checks both products, so the application
  change is still checked on the default branch. The same holds for any number of merges in a row: the
  last run checks both products (ci-routing::REQ-001/AC-06; ci-routing::REQ-004/AC-03).
- A default-branch run that failed is not hidden by the next merge: that push runs both products again,
  whatever it changed (ci-routing::REQ-001/AC-06).
- A change that breaks the other product through a file the routing rules do not list for it passes its
  pull request, where that product's checks are not selected; the default-branch run after the merge
  runs both products and fails there (ci-routing::REQ-001/AC-06).
- A default-branch push reads no comparison, so a push with no changed files, or one whose earlier commit
  cannot be read, still runs both products rather than failing or selecting none
  (ci-routing::REQ-001/AC-06).

## Implementation Decisions

For a pull request, use a complete local Git comparison with NUL-delimited paths and rename detection
disabled; a push reads no comparison. A default-branch push selects both scopes because a newer push
cancels the unfinished run on the same branch (ci-routing::REQ-004/AC-03): each run has to cover what
the run it cancels would have checked. Do not introduce another dependency or a privileged
pull-request event to classify changes.

## Out of Scope

Zero Actions runs for documentation, selecting checks by changed paths on a default-branch push,
business-module-level test selection, merge queue enablement,
Cloudflare account changes, release behavior changes, and automatic PR merging.
