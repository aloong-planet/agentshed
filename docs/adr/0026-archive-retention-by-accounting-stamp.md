# ADR-0026: Archive retention by accounting stamp, liveness per (day, side)

- Status: Accepted (2026-09-10)

## Context

The archive (ADR-0007) must take a lower live figure for a past day when it comes from an accounting fix of ours, and
keep what it holds when an agent rewrites or compacts its own files and the live figure falls with them; the figure
alone cannot tell the two apart. The sides are scanned together, so a day can be live for one side while another
side's rows for it are gone. A past day's rows change rarely, while the scan's own day changes at every scan of an
active session.

## Options

1. **Retain by accounting stamp, judge liveness per (day, side), keep superseded values for past days, and let a
   project's own page read the archive** — chosen.
2. A threshold on how far the live figure falls — rejected: a 30% fix and a 30% loss look the same, and nobody can
   justify the threshold itself.
3. Overwrite every live day with its live values, a day being live when any side has rows on it — rejected: one side's
   activity lets another side's vanished rows be replaced with nothing, and an upstream loss is overwritten as a
   correction is, recoverable only if someone notices it.
4. Version every row on every change, the scan day included — rejected: it makes hundreds of meaningless versions a
   day of the scan day's rows, which change every five minutes and on focus.
5. Dated backups of the whole archive file — rejected: nothing would show which day was altered, recovery would be
   by hand, and how many to keep is a decision with no grounding.
6. Compare per (day, side, project) — rejected: a project whose rows move to a new key would be retained under the old
   key and accepted under the new one, counting the day twice, worse than a masked offsetting loss. The loss measured,
   a whole side dropping at once, is one the per-side comparison catches.
7. Mark a retained day in the interface, showing its observed value — rejected: the marking, prototyped, was judged
   visually poor, and the observed value serves the stamp rule alone.
8. Accept every decrease under a new stamp — rejected: each release would re-apply an upstream loss already retained
   once, and the restore would have to be repeated after every update.

## Decision

We adopt **option 1**.

- **Liveness is per (day, side)**: a side with no live rows on a day keeps the rows the archive holds for it, whatever
  the other sides did.
- **Every row the archive holds carries its accounting stamp.** A past (day, side) whose live total is lower than the
  archive's is accepted only under a different stamp, and for a retained one only when the live figure differs from its
  observed value; otherwise the archive's rows are retained and the live total is recorded as the observed value.
  Increases are always accepted, and the scan's own day is rewritten freely.
- **An accepted change to a past day keeps what it replaced** as a superseded value, with no cap.
- **Retention is accounting-only**: a retained day is drawn like any other, and the observed value is never shown. A
  project's own page reads the archive as the cross-project view does.
- **A repository script restores** past-day rows from a snapshot of the token store through the scan's own
  aggregation, as accepted changes under the current stamp.

## Consequences

- Positive: a past (day, side) cannot fall without a new stamp, and what it replaced stays as a superseded value, so an
  upstream rewrite is recoverable from the archive itself; one side's loss or cleanup no longer touches another side's
  rows.
- Positive: an accounting fix of ours still corrects every past day whose files remain, once it ships under a new
  stamp, and the cross-project view and a project's own page give a day the same figure.
- Negative: the archive's format carries a version, a stamp per (day, side) and a trail of superseded values.
- Negative: a decrease made by accounting code that moves neither version component is retained as a loss, so a
  developer needs the forced-accept override (token-stats C15).
- Negative: an upstream shrink that lands in the same window as an application update is accepted as a correction,
  recoverable only through the superseded values.
- Negative: the interface cannot tell a retained day from a live one, so the superseded values are the only trace of a
  retained loss.
- Neutral: superseded values have no cap, so the file grows as often as past days change (token-stats C13).

## Sources

Issue #161: on 2026-09-09 a Codex history migration rewrote 1329 of 1335 rollouts on this machine into a compacted
format, and the live Codex figures fell to between 1% and 74% of their real values for every day from 2026-08-11 to
2026-09-08 (against the cache snapshot of 2026-09-09 09:57); over one afternoon of scans that day only the scan day's
rows changed, and the archive held 871 rows over 76 days (176 KB). The user's ruling of 2026-09-10 on the prototyped
marking. ADR-0007; token-stats sequence C and G6.
