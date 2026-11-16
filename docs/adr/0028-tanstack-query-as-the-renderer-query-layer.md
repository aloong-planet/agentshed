# ADR-0028: TanStack Query is the renderer's on-demand read layer, and a display copy kept apart from the accounting cache restores it after a restart

- Status: Accepted (2026-09-14)

## Context

The renderer reads project detail, session pages and other data on demand over IPC, and a page switch must be atomic
and a revisit instant. React holds the old interface until the new one is ready with a Transition over a
Suspense-enabled source; on React 18, which this repository runs, data read in an effect never activates Suspense. A
restart must show the previous run's data and the pages viewed before while the first scan runs, also after an update
invalidated the accounting cache and with it the question index that opens sessions (ADR-0011).

## Options

1. **@tanstack/react-query for on-demand reads, refilled at a restart from a display copy apart from the accounting
   cache** — chosen.
2. React 19 with a hand-built cache on `use(promise)` — rejected: the upgrade is its own blast radius, and the cache
   would grow invalidation, deduplication and collection of our own, the cost ADR-0014 took only for a type-level gain.
3. swr — rejected: coarser invalidation and collection (a global `mutate`), and a Suspense mode documented as
   experimental.
4. Keep the previous payload in state and key the subtree by path, without Suspense — rejected: the header would switch
   while the body still shows the previous project, and nothing can hold the whole pane.
5. Restore only the snapshot and the main process's derived state — rejected: an invalid accounting cache has no
   question index, so a session cannot be opened.
6. Derive everything from the accounting cache at startup — rejected: the upgrade case invalidates that cache.
7. Tie the saved display data to the accounting stamp — rejected: it removes the previous data exactly when a full
   rescan makes it most useful.

## Decision

We adopt **option 1**.

- **On-demand reads go through the query layer.** A page whose content depends wholly on the fetch reads through
  `useSuspenseQuery`, the selection change that alters its key runs in a Transition, and one Suspense boundary above
  the switching pane holds the previous page; a widget that owns its loading state uses `useQuery`. A new snapshot
  invalidates every query, and a query function returns a result value and never throws. React stays at 18.
- **The main process keeps a display copy**, versioned on its own, of successful scan and read outputs, each with its
  identity and observation; the renderer fills the query layer from its validated entries before it presents a saved
  page. A failed refresh keeps the last successful copy, authoritative absence retires an obsolete
  session, and query collection alone discards nothing. The renderer cannot write a path or a blob to it.
- **A saved page answers a read-only presentation without the live index**; new source contents are still fetched
  through current registration and source validation. A restored exact-path registration takes extra target checks,
  never replaces the admission rules, and gives way to a current authoritative scan or enumeration.
- **The display copy is never a scan observation** and never rewrites history. A saved answer is tied to its page by
  the source question's identity, never by an ordinal; its text is neither ADR-0011's index nor a searchable corpus,
  and navigation and expansion state are not saved.

## Consequences

- Positive: switching and revisiting follow React's documented mechanism, and invalidation, deduplication and
  collection come from the library; returning from a session page to its project refetches nothing.
- Positive: a full restart shows the previous data and the pages read before, ahead of the first scan and across an
  accounting or index version bump; the source-read and accounting rules keep one owner each.
- Negative: one runtime dependency and a provider at the root, which a component test mounting a page supplies too.
- Negative: read content takes disk space and startup time, with no numeric retention limit, and its store needs
  atomic, ordered writes and schema validation.
- Negative: the display copy may be stale, so its startup status and later replacement must stay visible and coherent.
- Neutral: React 18's concurrent root holds a revealed boundary for a plain state update too; the Transition stays as
  the documented navigation pattern and against a competing urgent update.
- Neutral: the next successful scan or read follows the source; the saved copy recovers nothing never read and grants
  no access to a deleted or replaced target.

## Sources

The design round of 2026-09-12 and the restoration discussion of 2026-09-13. React's useTransition and Suspense
reference, TanStack Query v5's Suspense guide, React 19's upgrade guide. On 2026-09-12: 89 uses of the global `JSX`
namespace, which React 19 removes, in 25 files under `src`; @tanstack/react-query 5.102.8 peers React 18 and 19,
13.8 kB gzip (bundlephobia). On 2026-09-13 an accounting cache of another version loaded no files. Restoration: the
agents-overview, project-detail, session-view and token-stats specs.
