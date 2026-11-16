# ADR-0021: One colour per agent side, taken from that side's provider colour

- Status: Accepted (2026-08-15)

## Context

An agent side is identified by colour in lists (badges, dots) and in the charts (segments, legend), and a reader should
not have to learn two palettes for one concept. The chart's colours must stay distinguishable stacked a few pixels
thin, and a side's colour should not read as the accent, which means "selected".

## Options

1. **One colour per side, its provider's colour, wherever the side is identified** — chosen.
2. Keep a badge palette apart from the data palette — rejected: a side is a tool and a provider a model vendor, but two
   colour languages for one concept make the reader learn both, and the badge palette's Claude purple was the purple
   theme's accent, so a Claude row read as selected.
3. Unify onto the badge palette — rejected: the badge colours were picked to sit calmly behind small text and do not
   stay distinguishable stacked 7px thin, which the chart needs of four or five hues.

## Decision

We adopt **option 1**. A side's colour is the provider colour its models resolve to: Anthropic's for Claude, OpenAI's
for Codex, xAI's for Grok and Google's for Antigravity. A dot, a legend swatch and a chart segment use that colour as
it is; a badge, a fill behind small bold text, takes a fill and text pair in that hue (token-stats spec). xAI's colour
is a pale purple, `#c9b3ec` in dark appearance and the same colour with its Lab lightness lowered by 10, `#ad98d0`, in
light, so that a thin segment clears a white card.

## Consequences

- Positive: a side reads the same in a list and in a chart, so "which side" has one answer on every screen.
- Negative: in dark appearance Grok's `#c9b3ec` is exactly the purple theme's `--accent-deep` (ΔE = 0), so "this is
  Grok" and the accent are the same colour there. Accepted: the owner chose this hue family, and every purple clearing
  the accent comfortably stops reading as the Claude-adjacent purple that was wanted.
- Negative: the light value's 2.57:1 on a white card stays just under the 2.64–3.56:1 of the other data colours, since
  contrast and distance from the accent move in opposite directions and the lightness step stops near the floor.
- Neutral: a side colour names one vendor while segments follow the model (ADR-0008), so Antigravity's Claude usage
  shows in Anthropic's colour in the combined chart while its badge is Google's blue.
- Neutral: each provider colour is one token per appearance, read by dots, swatches and segments, and `check:ui` fails
  on a copy of it hard-coded in a component; a badge pair is a token of its own, held in its hue by hand.

## Sources

Measured on 2026-08-15 against the palette then shipped: the data colours at 2.64–3.56:1 on a white card and
6.31–7.56:1 on a dark one; `#c9b3ec` at 1.88:1 light and 8.56:1 dark; lowering its Lab lightness by 6, 8, 10 or 12
gives 2.26, 2.41, 2.57 or 2.73:1 at accent distances 23.5, 21.4, 19.7 or 18.3; eight low-saturation purples all fell
below an accent distance of 16. The owner's rulings of 2026-08-15, and of 2026-08-16 on the Grok badge pair.
`src/renderer/src/theme.css`; `scripts/check-shared-ui.mjs`; the token-stats and agents-overview specs.
