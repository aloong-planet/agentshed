# Making the citation honest is not the same as making the guard run

**Date**: 2026-08-19 · **Surface**: the Codex accounting and its ccusage reconciliation

## What happened

The Codex side had been over-counting by a systematic 0.70% — 16.6M tokens across the days measured,
worst day 2.67%. Every affected day was over, never under. The cause was a single omission: the agent
re-reports the same turn (the per-turn figure repeats while the running cumulative stands still), and
the parser summed every occurrence.

The mechanism was **named in the code the whole time**. The file header said:

> take last_token_usage as a per-turn increment (one turn may be reported more than once, which fork
> stripping and **the difference rule** handle)

There was no difference rule. The comment described upstream's `subtract_codex_raw_usage` accurately —
whoever wrote it had read the source — and the implementation never had it.

## Why the guard that exists did not catch it

`ccusage-parity.test.ts` is exactly the guard for this: a day-by-day reconciliation against a
third-party meter. It has existed since the accounting was written. It has never caught anything,
because it could not run:

- it read its baseline from `/tmp/ccusage-until29.json` — a path in a directory that gets cleared, and
  a name carrying the date of the one sampling it was first written against;
- generating that file was a command in a comment, not a step anything performed;
- so every invocation since the original sitting failed on a missing file, and the failure looked
  identical to "not run today".

This file was **already the subject of a postmortem**.
[2026-08-02 §3](2026-08-02-guards-that-were-not-there.md) found it being cited as evidence when it had
never run, and its defence was: *rewrite the spec and the tickets to state that ccusage-parity is not
to be treated as a guard rail, and give a workable verification instead.*

That fixed the **citation**. It left the **guard** exactly as unrunnable as it found it — and the
drift it would have caught ran on for another seventeen days, growing past the ≤1.2% bound the ADR had
recorded as acceptable.

## What it cost, what it settled

Cost: seventeen days of a whole side's totals being 0.70% high, and a stale bound in ADR-0006 that
read as a live guarantee. Not shipped-and-noticed — nobody was reading the Codex figures that closely,
which is the point: an unrunnable reconciliation is invisible in exactly the cases it exists for.

Settled: the reconciliation now generates its own baseline (reusable via `CCUSAGE_BASELINE`), skips
the current day — which the very agents under measurement are still writing — and covers **all three**
sides, the third-party meter having gained the side that previously had no external baseline. It was
mutation-checked: removing the difference rule takes Codex to 16 mismatched days while the other two
stay at zero. With the rule in place, all three sides reconcile at **zero difference**.

## The rule to carry forward

**When a guard is found not to be running, "stop citing it" and "make it run" are different repairs,
and only one of them guards anything.** The honest-citation repair is cheap, feels responsible, and
leaves the hole open — worse than leaving the false citation, in one respect: the citation would at
least have kept drawing attention to a test somebody might eventually try to run.

The operative question when a guard turns out to be dead: *what would it take to run this, and is
that smaller than the thing it protects?* Here it was two lines — generate the baseline instead of
reading a fixed path, and drop the day still being written.

**Second, narrower: a fixture path named after the day it was sampled is a one-off, and a step that
exists only in a comment is not a step.** Both were visible in the original file. Neither was read as
a defect, because the file was already labelled "not a production-line test" — a label that explains
why it is skipped by default, and was allowed to explain away why it could not run at all.
