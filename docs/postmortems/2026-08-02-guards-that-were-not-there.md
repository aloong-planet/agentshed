# Three defences we thought existed and that were not defending anything (2026-08-02)

The review of session-view ticket 01 turned up three places in a row where "we thought there was a
guard rail and there wasn't". The three happened independently and are different in kind, but they
are all the same self-deception: **citing a name without verifying it was actually working.** Two of
them land on `CACHE_VERSION` — the same constant as
[the 2026-07-30 cache structure crash](2026-07-30-cache-version-crash.md), so this is a repeat.

## 1. An algorithm change without a version bump → a false green (worse than a crash)

### Symptom

Codex's `SessionMeta.at` was changed from "the first timestamp" to "the largest timestamp in the
file", and the fixture tests were all green. But for **existing users** this fix would never take
effect.

### Root cause

The token cache hits on (path, mtime, size). What changed this time was not `FileAgg`'s **structure**
but **how one field is computed** — the signature still hits, the shape is still valid,
`isWellFormedAgg` still lets it through, and so an unchanged file keeps returning the old value
computed by the old algorithm.

The 2026-07-30 incident was a structure change without a bump, and it manifested as a **crash** —
loud, exposed on the spot. This one was an algorithm change without a bump, and it manifested as
**nothing happening at all**: green tests, a normal UI, plausible-looking numbers, and a fix that
simply never reached users.

### Why no test caught it

The comment next to `CACHE_VERSION` said only "changing the **shape** of `FileAgg` requires bumping
this at the same time" — read literally, an algorithm change is not covered. Both existing cache
tests were structural too (an old structure does not crash; garbage content is recomputed), and
neither covered "valid structure, stale value".

And every fixture uses a temporary `cacheDir`, so **the cache is always empty** — the same blind spot
as 2026-07-30: unit tests inherently only cover cold start.

### Defences put in place

- A second trigger condition was added to the comment: "changing **how a field in `FileAgg` is
  computed** also requires a bump", stating that the failure mode is a false green rather than a
  crash.
- A test was added: construct a **previous version's** cache whose structure is identical to the
  current one and whose `at` was merely computed by the old algorithm, and assert it must be judged
  invalid and recomputed. The test was mutation-checked — rolling the version number back one notch
  does make it red.

## 2. A new cache field missed by the same-version guard

### Symptom

`SessionMeta` gained `file` (session identity), `FileAgg` gained it on both sides, and the version
was bumped. But `isWellFormedAgg` was not updated.

### Root cause

`isWellFormedAgg` is the defence left over from the 2026-07-30 incident, and its job is to catch
manual corruption and field drift **within one version** (the version number only catches across
versions). Adding a required field without adding it to this guard means the new field is not
protected by it.

The consequence is not self-harm: no `file` → `SessionMeta.file` is undefined → contract validation
throws → **the whole of `getProjectDetail` dies**, taking skills, subagents, memory, plugins, MCP,
configuration and artifacts with it. **Upward escape.**

### Defences put in place

- `isWellFormedAgg` now checks `file`, with a comment stating "**when adding a required field to
  `FileAgg`, add a line here at the same time**" — turning an implicit convention into a written one.
- A test was added: an entry missing `file` in a same-version cache must be judged invalid and
  recomputed. Mutation-checked and effective.

## 3. Citing a test that never runs as a guard rail

### Symptom

The spec's cross-cutting regression point R2 says "the existing token statistics parsing and caching
must not be broken", and the ticket's acceptance criterion said "the ccusage alignment tests are all
green". During implementation I repeatedly cited it as evidence that R2 was held.

It had never run.

### Root cause

`ccusage-parity.test.ts` is `describe.skipIf(!run)`, needing `PARITY=1` **and** an externally
generated ccusage baseline JSON. In `pnpm verify` it always shows as skipped. The very first line of
the file says "not a production-line test; skipped by default" — I had not read that line when citing
it.

"The test file exists" had been taken for "the test is running".

### Defences put in place

- The spec's R2 and the related tickets were rewritten to state explicitly that `ccusage-parity` is
  not to be treated as a guard rail, and to give a workable verification instead: **run before and
  after against real data and compare** `byDay` / `bySide` / archive row counts.
- That verification was actually carried out: `git worktree` checked out master and the same script
  was run on each. The results were **identical once the current day is excluded**; the current day's
  data grew monotonically because this very session was writing to disk (three samples: 4534300163 →
  4535088766 → 4536996108), and detecting that noise was itself part of the result — otherwise it
  would have been misread as a regression.

## Lesson

**The name of a guard rail is not a guard rail.** The shape shared by all three is: a protection
exists that can be named (a version number, a guard function, a reconciliation test), and so the
question of whether it actually works under *this* change stops being asked.

Three actionable criteria:

1. **When changing what is stored in a cache, first ask "did I change the shape or the value"** —
   both need a bump, but only the former crashes loudly; the latter fails silently and needs the test
   more.
2. **When adding a required field to a persisted structure, list everything that validates that
   structure** — the version number and the shape guard are two independent nets, and a new field
   must pass through both.
3. **Before citing a test as evidence, confirm it actually ran this time** — look at whether the run
   report says passed or skipped, not at whether the file exists.

One more, about facts: this review also overturned two "facts" written into the spec during research
(that activity would be affected as a side effect, and that the Claude side's `at` semantics were
already correct). **A research-phase conclusion with no file:line or measurement behind it must be
re-verified at implementation time** — it looks exactly like a verified one.
