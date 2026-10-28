# A guard read after the value it guards

**Date**: 2026-10-29 · **Surface**: the token cache's entries (`token-cache.json`), within one cache version

## What happened

Adding the Antigravity CLI side (#323), the plan for a conversation read `cached.agg.kind` to tell its variant and only
then asked `isWellFormedAgg` whether the entry was well formed; the session page's new guard did the same. A cache
entry gone `null` on disk, or one whose `agg` is `null`, threw a TypeError there. In the plan that is the whole scan
failing, on every launch, until the cache file is deleted — the upper escape the guard exists to prevent. Enumerating
every read of `this.cache.files` in the engine found the same order in two Codex readers already on main: the resume
check and the fork-parent lookup. Found in code review before #323's commit; no corrupt entry is known to have reached
the Codex readers.

## Why no test caught it

- The corrupt-entry cases wrote malformed objects — a field missing, a record one element short — through the generic
  plan, which calls the guard first. None wrote a `null` entry or a `null` agg, and none reached the readers that
  inspect an entry in their own code before handing it on.
- The guard's comment says what to add to it when a field is added, not where it must be called. The postmortems of
  2026-07-30 and 2026-08-02 made the guard check more; neither asked whether every reader consults it first.
- The new variant's own checks (`projectKey`, `unreadable`, the call's arity) were driven by no case either, until the
  post-implementation test review asked what goes red without each.

## What it settled

Every reader of a cached entry runs the guard over `cached?.agg` before reading any field: the Antigravity plan, the
session page's guard, the Codex resume check and the fork-parent lookup. Cases, each red against the unfixed code with
a TypeError at its site: a conversation's entry and a Codex rollout's entry rewritten as `{ sig, agg: null }` and as
`null`, through the build and the session page; a corrupt entry elsewhere in the cache before a Codex fork's session
page. Written later, after the post-implementation test review, and pinning the variant's own checks rather than the
order: a same-version Antigravity entry missing each checked field is recomputed, each after a control build showing
that a well-formed entry under the same signature is reused — each red when its check is removed, none red against
the unfixed order, since such an entry carries a `kind` to read.

## What remains

The defence is per site: a new reader of `this.cache.files` that reads a field before the guard is caught only if its
author writes a case. A single accessor that returns a well-formed entry or nothing would close the class; it is on
#323's refactor list for the owner's decision.
