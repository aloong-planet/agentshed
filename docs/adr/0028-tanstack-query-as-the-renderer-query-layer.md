# ADR-0028: TanStack Query is the renderer's on-demand read layer

- Status: Accepted (2026-09-13)

## Context and problem

Project detail and the session page are fetched on demand over IPC. Each pane holds its payload in
local state and clears it when its key (the project path, the session file) changes; the clear
unmounts the pane body, so every switch draws an empty frame and rebuilds the subtree, and every
revisit fetches again. The user ruled on 2026-09-12 that a switch must be atomic and a revisit
instant (the CONTEXT.md invariant of that date). React's documented mechanism for keeping the old
UI until the new one is ready is a Transition over a Suspense-enabled data source. This repository
runs React 18.3.1, where data read inside an effect never activates Suspense and `use()` does not
exist, so the official route needs either a Suspense-enabled query library or React 19 with a
hand-built cache. Nineteen renderer call sites go over IPC today — eight of them on-demand reads (the two this
decision moves, a turn's contents, the freshness check, the session search, skill package files at
two sites, artifact contents) — and the user intends to move the on-demand reads onto one layer
over time.

## Options

1. **@tanstack/react-query 5.102.8**: `useSuspenseQuery` for the page payloads, the selection change
   that alters a key wrapped in `startTransition`, revalidation on mount, `invalidateQueries` on
   every snapshot. Its peer range covers React 18 and 19; 13.8 kB gzip including query-core
   (bundlephobia, 2026-09-12); one provider at the root.
2. Upgrade to React 19.3.0 and hand-build the cache on `use(promise)` + `startTransition` —
   rejected: the upgrade is its own blast radius (the 19 types drop the global `JSX` namespace —
   89 uses across 25 files here — plus a full gate re-run) bundled into a feature that does not need
   it; and the cache would have to grow invalidation, deduplication and collection as the other read
   sites migrate — the "our own code, our own bugs" consequence ADR-0014 accepted for i18n, without
   the type-level reason that justified it there.
3. swr 2.5.1 (Vercel) — not chosen: it has a `keepPreviousData` option and a `suspense` switch, but
   invalidation and collection are coarser (a global `mutate`), and its Suspense mode is documented
   as experimental.
4. Keep the previous payload in state and key the subtree by path, without Suspense — rejected: not
   the documented mechanism; the header would switch while the body still shows the previous
   project, and nothing can hold the whole pane.

## Decision

We adopt **option 1**: @tanstack/react-query is the renderer's query layer for on-demand reads. A
page whose key follows the selection reads through `useSuspenseQuery`; the selection change that
alters the key runs inside a Transition; one Suspense boundary above the switching pane holds the
previous page; a new snapshot invalidates every query. This round moves project detail and the
session page; the remaining on-demand reads keep their effects until they are migrated (tracked as
an issue). React stays at 18 — the 19 upgrade is a separate decision. Errors stay in-band: a query
function resolves to a result value and never throws, so no error boundary is added and the pages'
own error states are unchanged.

## Consequences

- Positive: switching and revisiting follow React's documented mechanism rather than a hand-rolled
  cache, and invalidation, deduplication and collection exist on day one for the sites migrated later.
- Positive: returning from a session page to its project no longer refetches the detail — the cache
  answers it.
- Negative: one runtime dependency and a provider at the root; a component test that mounts a page
  needs the provider (none does today — the eight renderer unit tests mount nothing).
- Negative: until the remaining reads migrate, two fetching idioms coexist in the renderer.
  **Resolved 2026-09-13** (issue #177): all six named sites (a turn's contents, the session freshness
  check, the session search, skill package files at two call sites, artifact contents) now go through
  the query layer too; `rg` over `src/renderer` confirms none of the six IPC methods are called
  outside their `*-query.ts` module. The one sibling `readArtifact` call in `MemoryView.tsx` was never
  one of the six and stays on its own effect.
- Neutral, clarified 2026-09-13 (issue #177): the two page-level migrations (#174, #175) used
  `useSuspenseQuery`, since the whole page's content depended on the fetch and nothing else was worth
  showing meanwhile. The six widget-level sites migrated in #177 use plain `useQuery` instead — each
  already had its own in-place loading/error UI (a file table's own spinner, a turn's own "fetching"
  note), and forcing those under a Suspense boundary would have meant a fallback per widget for no
  benefit. ADR-0028's mechanism is "the query layer", not "Suspense everywhere"; which of the two a
  site uses follows from whether the page or the widget owns the loading state.
- Neutral: on React 18 the library's Suspense support rides the thrown-promise protocol; React 19
  changes nothing for it.
- Neutral, measured rather than assumed (2026-09-13, project-detail ticket): React 18's `createRoot`
  already holds an already-revealed Suspense boundary's content and preempts a stale in-flight
  render for a plain `setState`, not only one wrapped in `startTransition` — a mutation removing the
  Transition around the project selection change was rebuilt and run against the hold e2e case, and
  it stayed green. The Transition is kept for the documented pattern (React's own guidance recommends
  wrapping navigation-like updates in it) and as the seam that would matter against a competing
  high-priority update, which nothing here currently exercises; its necessity for the hold behaviour
  itself is not demonstrated by an e2e mutation, and the spec sections say so rather than repeating
  the original (assumed, wrong) claim.

## Sources

The design round of 2026-09-12. React reference documentation for useTransition (page navigations
as Transitions), Suspense (data fetched in an effect or event handler does not activate it) and
useDeferredValue (stale content while fresh content loads); the TanStack Query v5 Suspense guide
(`placeholderData` is absent on suspense queries; key changes go inside `startTransition`); the
React 19 upgrade guide (the global `JSX` namespace removal and its codemod). Measurements taken
2026-09-12: `rg` over `src` for global `JSX` uses (89 in 25 files) and for APIs removed in React 19
(none); npm versions react 19.3.0, @tanstack/react-query 5.102.8, swr 2.5.1; bundlephobia for
@tanstack/react-query@5.102.8: 50.7 kB minified, 13.8 kB gzip, one dependency (query-core).

**Evidence closed (promoted from Proposed to Accepted on 2026-09-13)**: all three tickets landed —
project detail (#174, PR #179), the session page (#175, PR #180) and the closeout (#176), which adds
the one case neither half could verify alone (leaving a project for a session page and coming back:
a cached visit landing on Sessions, then a transfusion refresh). 73 e2e cases and 673 unit tests pass
locally on the closeout's tree, including every hold, cached-revisit and rescan-refresh case across
both pages, run and re-run after two rounds of mutation testing (each mutation reverted by hand, not
`git checkout`). **CI itself did not confirm this**: GitHub Actions on this repository has been
blocked by an account billing issue since PR #173 (2026-09-11), unrelated to this feature's code, and
every PR in this feature (#178, #179, #180, and this closeout) was merged on the user's explicit
instruction to proceed without waiting on it. The promotion rests on the local gate, not on CI.

**Lifetime extension accepted 2026-09-14 (ADR-0029)**: independently persisted successful display
payloads hydrate this query layer after a full restart. The query mechanism remains this decision's;
cross-restart storage and validation belong to ADR-0029. Memory and skill-file drawers now also use
the query layer. A failed revalidation retains its last successful display copy; authoritative
absence retires an obsolete session. Query collection alone does not discard that display copy.
