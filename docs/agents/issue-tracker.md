# Issue tracker

- **Tracker**: GitHub issues on this repository. `gh` infers the repository from the working directory;
  outside the checkout every command must carry `-R <owner>/<repo>`.
- **Agent-grabbable label**: `ready-for-agent`, applied to every ticket `/to-tickets` publishes; the
  label is removed when a ticket is taken.
- **Ticket shape**: `## Parent` (the umbrella issue, when there is one) · `## What to build` (the
  end-to-end behaviour, from the user's side) · `## Acceptance criteria` (each item names its
  guarantee: gate / test / evidence) · `## Blocked by` (issue references, or "None — can start
  immediately").
- **Blocking edges** are written as `#N` references under "Blocked by"; work the frontier — any ticket
  whose blockers are all closed. A feature cut into several tickets ends with a closeout ticket whose
  title opens with `Closeout:` (the repository's working language is English, ADR-0017, so the
  ticket skill's Chinese marker is rendered in English here), blocked by every other ticket of the feature.
- **Parent issues** are never closed or modified by ticket work; the closeout ticket comments on them.
- **No AI signatures** anywhere on the tracker (titles, bodies, comments), per the repository's
  GitHub conventions.
