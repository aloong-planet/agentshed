# ADR-0009: The trend x axis labels data days only, with the month shown where it is new

- Status: Accepted (2026-07-31)

## Context

The trend chart's x axis cannot label every day in a narrow pane, so it has to choose which days to label. The choice
must stay readable for sparse, clustered and dense data in wide and narrow panes, keep the month in view across a
month change, and put each label under the bar it names.

## Options

1. **Label only the days with usage in the current view: month and day on the first label and on the first after a
   month change, the day alone elsewhere, thinned from the right when labels collide** — chosen.
2. Two staggered rows of month and day — rejected: it keeps the most labels when narrow, but adds about 11px of axis
   height and two dense rows are visually noisy; the owner ruled against it after a side-by-side prototype comparison.
3. Month and day at 45° — rejected: it adds about 14px of axis height, looks jarring even for sparse data and thins
   the most of the three when narrow; the owner ruled against it after the same comparison.
4. Evenly spaced labels, with the window's first and last day always labelled — rejected: evenly spaced anchors ignore
   which days have data, so a day with usage can go unlabelled; labelling empty boundary days was compared as a
   toggle and ruled against.
5. A label on every fifth slot by index — rejected: the labelled days are unrelated to the data, the last days never
   get a label, and narrow cells clip the labels.

## Decision

We adopt **option 1**. A day is labelled only if it has usage under the current view, so switching between the
combined view and a single side changes the labels with the bars. The first visible label, and the first visible label
after a month change, show month and day; the others show the day alone, and after any thinning the first surviving
label of a new month shows its month again. Labels are centred under their bars, clamped at the axis ends and thinned
from right to left where they would overlap.

## Consequences

- Positive: every label names a day with data, the latest days are labelled when space allows, the axis keeps one
  row's height, and the denser the data the closer it comes to a full ruler.
- Negative: when narrow, adjacent data days are thinned with no privilege for the first or the last, so even today can
  lose its label; a bare day number sends the reader left for its month.
- Neutral: the prototypes' shared trend chart keeps its own copy of the layout, since a zero-build page opened from
  `file://` cannot import from `src`, and nothing compares the two copies (ADR-0033).

## Sources

The side-by-side prototype comparison of sparse, clustered and dense data at 640px and 415px with a width slider, and
the owner's three rounds of rulings, 2026-07-31. Chart.js `autoSkip`, ECharts `axisLabel.hideOverlap` (v5.2),
TradingView lightweight-charts tick-mark weighting, Highcharts `autoRotation` and `staggerLines`. At the 800px minimum
window width the detail page has about 415px for the chart, where two staggered rows still label all 30 days and a
single row of horizontal month-and-day labels on every day needs about 780px. `src/shared/axis.ts`.
