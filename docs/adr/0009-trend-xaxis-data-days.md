# ADR-0009: Trend x axis labels data days only, with hierarchical date labels

- Status: Accepted (2026-07-31)

## Context

The trend chart's x axis originally labelled every 5th slot by fixed index: the days it labelled had
nothing to do with the data, the last four days (including today) never got a label, in a narrow
window the equal-flex cells clipped labels into fragments, and the axis and the bar area had
different padding, offsetting the whole thing by half a bar width. We need a labelling scheme that
stays readable across sparse and dense data and across wide and narrow windows.

## Options

1. **Hierarchical day numbers, labelling data days only**: a label is emitted only for days with
   usage under the current view; the first visible label, and the first visible label after a month
   changes, use M/D, and the rest show the day number alone; when space runs out, thin from right to
   left; labels are pinned to bar centres and clamped at the ends (a combination of TradingView's
   day-granularity axis and ECharts' `hideOverlap`)
2. Two staggered rows of M/D (Highcharts `staggerLines`) — rejected: the strongest at preserving all
   labels in a narrow window (still labels 30 days at 415px), but it adds about 11px of axis height
   and two rows of text are visually noisy when dense; the user ruled against it after a side-by-side
   prototype comparison
3. M/D at 45° (the Highcharts / matplotlib classic fallback) — rejected: its unique advantage is that
   horizontal footprint is independent of text length, but it adds about 14px of axis height, looks
   jarring when everything is slanted even for sparse data, and thins the most of the three in a
   narrow window; the user ruled against it after the prototype comparison
4. Evenly spaced labels with empty days filled in (always labelling first and last) — rejected: the
   evenly spaced anchors have nothing to do with the data, reproducing the original "days with data
   have no date" problem; "label the window boundaries even on empty first/last days" was compared
   separately as a toggle and the user ruled against it
5. Keep labelling every 5th slot — rejected: that is the original defect itself

## Decision

We choose **option 1**. Which days count as data days follows the current view (after switching
between combined and single-side, the label set matches the bar set); the month-context rule
guarantees that after any thinning, the first surviving label in a new month is promoted back to M/D
so the cross-month meaning is never lost. The layout algorithm is a pure function (with measurement
injected), and the renderer measures real bar centres (converting the viewport rect relative to the
axis container, so it does not depend on `offsetParent`); a `ResizeObserver` re-lays out only the
axis as the width changes.

## Consequences

- Positive: all three original defects (labels unrelated to sparse data, the blind spot at the end,
  clipping and misalignment in a narrow window) are gone; the axis does not grow taller; the denser
  the data, the closer the axis is to a complete ruler
- Negative: at extreme narrowness adjacent data days get thinned (there is no first/last privilege,
  so even today can be dropped); reading a bare day number means looking left for the month context
- Neutral: the layout algorithm exists in two copies, one in the app (TS) and one in the prototype's
  shared piece (JS) — the prototypes' zero-build `file://` self-containment constraint makes
  importing from `src` impossible, so consistency is backstopped by `check:ui` and the confirmation
  gate, isomorphic to the existing precedent of the trend bar renderer also existing twice

## Sources

A side-by-side prototype comparison of three data shapes (sparse / clustered / dense × wide 640px /
narrow 415px, plus a width slider), and three rounds of the user's rulings (2026-07-31); industry
research: Chart.js `autoSkip`, ECharts `axisLabel.hideOverlap` (v5.2), TradingView lightweight-charts
tick-mark weighting, Highcharts `autoRotation` / `staggerLines`; and the physical arithmetic that at
the 800px minimum window width the detail page has about 415px usable (labelling every day as a
single row of horizontal M/D needs about 780px, so it is infeasible).
