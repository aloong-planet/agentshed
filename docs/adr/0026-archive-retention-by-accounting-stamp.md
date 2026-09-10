# ADR-0026: Archive retention by accounting stamp, liveness per (day, side)

- Status: Accepted (2026-09-09); supersedes the conflict rule of ADR-0007

## Context

ADR-0007 made the archive overwrite every live day with the live values, so that an accounting
fix corrects history automatically. That rule assumes a lower live figure is our doing. On
2026-09-09 Codex's paginated-history migration rewrote 1329 of 1335 rollouts on this machine into a
compacted format, the live Codex figures fell to between 1% and 74% of their real values for every
day from 2026-08-11 to 2026-09-08, and the next scan wrote that loss into the archive, keeping no
trace of the previous values (#161). Two mechanisms combined: liveness was judged per day, so
another side's activity on a day kept it "live" and let a side's vanished rows be replaced with
nothing; and the overwrite had no notion of cause, so a 99% loss and a 0.7% correction were treated
alike. The loss could be quantified only because a cache snapshot happened to exist.

The archive holds 871 rows over 76 days (176 KB). Measured over one afternoon of scans, only the
scan day's rows change; a past day's row changing is a rare event.

## Options

1. **Retain by accounting stamp, judge liveness per (day, side), keep superseded values for past
   days, and let project pages read archive rows** — chosen.
2. A magnitude threshold (retain the archive when the live figure falls by more than some
   percentage) — rejected: magnitude cannot tell a correction from a loss; a 30% fix and a 30% loss
   look the same, and the threshold itself would need a justification nobody can give.
3. Keep overwriting and rely on recovering superseded values afterwards — rejected: every upstream
   shrink would have to be noticed by a person; today's would not have been without the snapshot.
4. Version every row on every change, the scan day included — rejected: the scan day's rows change
   on every scan while a session is active (every 5 minutes plus focus), producing hundreds of
   meaningless intermediate versions a day.
5. Dated backups of the whole archive file — rejected: the interface cannot mark which day was
   altered, recovery is manual, and how many to keep for how long is a fresh decision with no
   grounding.
6. Compare per (day, side, project) rather than per (day, side), so that one project's loss cannot
   hide behind another's growth — rejected: a project whose rows move to a new key (a registry
   path change) would be retained under the old key and accepted under the new one at once,
   counting the day twice, a worse failure than a masked offsetting loss; and the measured shape
   of a loss (a whole side dropping at once) is one the per-side comparison catches.

## Decision

We adopt **option 1**, in four parts.

- **Liveness is a property of a (day, side)**: a side is live on a day when the current scan
  produced at least one row for that side on that day. A side with no rows on a day keeps its
  archived rows for that day regardless of the other sides' activity.
- **Every archive row carries an accounting stamp**: the application version and the cache
  structure version, combined. For a past day, a live figure lower than the archive's is accepted
  only when the current stamp differs from the row's; under the same stamp the archive's value is
  **retained** and the live figure is recorded as the **observed value**. Increases are always
  accepted. The scan's own day is rewritten freely, as before.
- **Superseded values are kept for past days**: an accepted change to a past day's row keeps the
  value it replaced, with the stamp and scan time that replaced it. No cap; the file's growth is
  bounded by how rarely past days change, and the threshold to revisit is about 5 MB.
- **Retained days carry their own marking**, distinct from archived-only, with a note, and the
  tooltip shows the retained and the observed value side by side. **A project's own page now reads
  archive rows** (archived-only and retained) with the same markings, closing the boundary spec G6
  left open — the rows carry a project key, and the two views would otherwise disagree on the same
  day as a matter of course.

A repository script restores past-day rows from a cache snapshot through the same aggregation the
scan uses, writing them as accepted changes under the current stamp.

Amendment of 2026-09-10, before any implementation, replacing the fourth part above: **retention
is accounting-only and has no marking.** A prototype of the marking (a screened segment with the
observed value drawn inside it, a second note sentence, and the tooltip carrying both figures) was
judged visually poor, and the ruling is that a retained day is drawn like any other day, with no
note and no tooltip annotation; the observed value is recorded in the archive for the stamp rule
and never shown. The existing archived-only marking and its note are unchanged. A project's own
page still reads archive rows, so the two views agree on a day's value. The consequence accepted
with this: a user cannot tell a retained day from a live one in the interface; the archive's
superseded values remain the only trace.

Clarification appended the same day as the decision, before any implementation: a new stamp
accepts a decrease only when the observed figure has moved. A retained row carries the observed value recorded under
the old stamp; if the first scan under the new stamp observes the same figure, our code produced
the same number on the same data, so nothing was corrected and the row stays retained. Without
this, every release would re-apply an upstream loss that had already been retained once, and the
restore would have to be repeated after each update.

## Consequences

- Positive: a past day's figure can no longer fall without either a new stamp or a kept superseded
  value, so an upstream rewrite is recoverable from the archive itself (not visible in the
  interface, per the 2026-09-10 amendment);
  one side's cleanup or loss no longer touches another side's rows; the cross-project view and a
  project page derive the same day from the same rows.
- Negative: the archive format gains a version, a stamp per row and a trail of superseded values;
  during development the application version does not change while code does, so a legitimate
  decrease produced by uncommitted accounting work is retained as if it were a loss until the
  version changes — a forced-accept override for developers is required; an upstream shrink that
  lands in the same window as an application update is accepted as a correction, and only the
  superseded values make it recoverable.
- Neutral: a project page that used to draw archived days as empty bars now shows their values;
  the correction-propagation property of ADR-0007 is kept, but now conditioned on the stamp.

## Sources

Issue #161 and its research comments (the migration mechanism read at source in `openai/codex`,
the before/after measurements from the cache snapshot of 2026-09-09 09:57, the archive churn
measurement of the same afternoon); ADR-0007; spec token-stats sequence C and G6.
