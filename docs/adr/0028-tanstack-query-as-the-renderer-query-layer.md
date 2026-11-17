# ADR-0028: TanStack Query is the renderer's on-demand read layer

- Status: Accepted (2026-09-14)

## Context

The renderer reads project detail, session pages and other data on demand over IPC, and a page switch must be atomic
and a revisit instant. React holds the old interface until the new one is ready with a Transition over a
Suspense-enabled source; on React 18, which this repository runs, data read in an effect never activates Suspense.

## Options

1. **@tanstack/react-query for on-demand reads** — chosen.
2. React 19 with a hand-built cache on `use(promise)` — rejected: the upgrade is its own blast radius, and the cache
   would grow invalidation, deduplication and collection of our own, the cost ADR-0014 took only for a type-level gain.
3. swr — rejected: coarser invalidation and collection (a global `mutate`), and a Suspense mode documented as
   experimental.
4. Keep the previous payload in state and key the subtree by path, without Suspense — rejected: the header would switch
   while the body still shows the previous project, and nothing can hold the whole pane.

## Decision

We adopt **option 1**. A page whose content depends wholly on the fetch reads through `useSuspenseQuery`, the
selection change that alters its key runs in a Transition, and one Suspense boundary above the switching pane holds the
previous page; a widget that owns its loading state uses `useQuery`. A new snapshot invalidates every query, and a
query function returns a result value and never throws. React stays at 18. After a restart the query layer is refilled
from the display copy (ADR-0053).

## Consequences

- Positive: switching and revisiting follow React's documented mechanism, and invalidation, deduplication and
  collection come from the library; returning from a session page to its project refetches nothing.
- Negative: one runtime dependency and a provider at the root, which a component test mounting a page supplies too.
- Neutral: React 18's concurrent root holds a revealed boundary for a plain state update too; the Transition stays as
  the documented navigation pattern and against a competing urgent update.

## Sources

The design round of 2026-09-12. React's useTransition and Suspense reference, TanStack Query v5's Suspense guide,
React 19's upgrade guide. On 2026-09-12: 89 uses of the global `JSX` namespace, which React 19 removes, in 25 files
under `src`; @tanstack/react-query 5.102.8 peers React 18 and 19, 13.8 kB gzip (bundlephobia).
