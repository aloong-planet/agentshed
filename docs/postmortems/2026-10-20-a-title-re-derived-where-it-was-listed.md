# A title re-derived where it was listed, and nowhere else

**Date**: 2026-10-20 · **Surface**: a stripped Codex fork's title — the list, global search, the session page,
a project's own session search, the fork banner

## What happened

A legacy Codex fork replays its parent's history at its start, and the display strips that prefix (session-view
B2). A fork titled from its first question would then be titled by a question it no longer shows, so its title is
re-derived from the first question left. That re-derivation was written as a rewrite of the **listed session's
metadata** at the end of the scan. Every surface that reads the listed metadata — the Sessions list, the overview
card, and later global search — showed the fork's own title. The session page and a project's own session search
take their title from the engine's per-session call, which returned the title as parsed: the parent's first
question. One session, two titles, depending on where you looked. It surfaced while building global search, whose
e2e fixture opened a card titled one thing onto a page titled another.

Fixing those two surfaces, an independent check of the tests found a third: the fork banner named the parent by the
parent's parsed title, wrong whenever the parent is itself a stripped fork.

## Why no test caught it

- The re-derivation's cases asserted the listed title only. They were true of the value they checked, and nothing
  checked another surface against it.
- The spec said how the title is derived (A4, B2) and not where it holds, so the requirement read as complete with
  one surface done.
- The rewrite landed on a copy (the listed metadata) rather than at the source the other surfaces read, so whether a
  surface was right depended on which carrier it happened to read.
- The e2e case for the banner asserted, on the child's page during a pending jump, the parent's question — the bug's
  own value. Both pages carried that title, so the sample could not tell them apart: a false green.
- When the fix was first scoped, the surfaces were enumerated by the callers of the function being changed. The
  banner's parent title is a different field of the same result, and the enumeration did not follow it.

## What it cost, what it settled

Cost: legacy forks only, none in this machine's data today; but a session showing two titles is the inconsistency
the session view exists to remove.

Settled: one engine method derives a Codex session's shown questions and title; the session page, the project search
and the banner's parent title all go through it, and the list's build-time rewrite uses the same read. Spec B2 now
states that the re-derived title holds on every surface that names the session, and that a failed read keeps the
parsed title on that surface alone. The cases assert the listed title and the page's title together — for a
verified strip, an uncertain one, a `thread_name`, a fork of a fork — and drive the list's and the banner's
fallback on a failed read.

## The rule to carry forward

**A value derived for display is one value: derive it where every surface reads it, or assert every surface against
it.** The product rule now lives in spec B2. Finding the surfaces is a negative conclusion ("there are no others"),
and the project's standing rule applies: it needs a means that does not depend on coverage. Follow the field to every
consumer, not the callers of the function at hand.

**Second, narrower: "this path cannot be driven" is a negative conclusion too.** It was reached three times about the
same fallback here and was wrong each time, each time by reasoning from a check that looked like it closed the
window — a signature that turned out to be mtime and size, a build that turned out to parse through an injectable
runner. The argument was never the evidence; an attempt to drive the path would have been.
