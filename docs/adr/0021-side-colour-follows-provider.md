# ADR-0021: One colour per agent side, taken from that side's provider colour

- Status: Accepted (2026-08-15)

## Context

An agent side has been showing up in two unrelated colours at once. The project list badges Claude
Code in purple and Codex in green, while the trend chart paints their volume in Anthropic orange and
OpenAI green — so "which side is this" is answered by one palette in a list and a different one in a
chart on the same screen. Nobody had decided this; the badge colours were chosen when badges were
added and the data colours when ADR-0008 introduced provider segmentation. Adding a third side forced
the question, because whatever Grok got would set the pattern.

Worse, the Claude badge purple is `#6b4f92`, which is **letter-for-letter the purple theme's
`--accent-deep`** — so "this row is Claude Code" and "this item is selected" were already the same
colour.

## Options

1. **One colour per side, taken from that side's provider colour** — badges, dots and chart segments
   all use the same value; Claude moves from purple to `#d97757`, Codex keeps green, Grok takes a
   purple derived from the old Claude badge
2. Keep the two palettes separate — rejected: it is defensible in principle (a side is a tool, a
   provider is a model vendor, see below) but it requires the user to learn two colour languages for
   one concept, and it leaves the badge purple colliding with the selection colour
3. Unify the other way, onto the badge palette — rejected: the chart's provider colours are load
   bearing in a way the badges are not. A stacked bar needs four or five mutually distinguishable
   hues; badge colours were picked for looking calm behind small text and do not survive being
   stacked 7px thin

## Decision

We adopt **option 1**. Each side has one colour, used wherever that side is identified, and its value
is the provider colour that side's models resolve to. Grok's is derived from the retired Claude badge
purple: **`#ad98d0` in light, `#c9b3ec` in dark**. The dark value is the old badge's dark foreground
unchanged; the light value is that same colour with its Lab lightness reduced by 10, because the
original sits at 1.88:1 against a white card — below the 2.64–3.56 range the other four data colours
occupy — and a 7px segment at that contrast reads as a smudge.

## Consequences

- Positive: one concept, one colour. The Claude badge also stops colliding with the selection colour,
  which it had done since badges existed.
- Negative, and the reason this entry exists: **in dark appearance Grok's `#c9b3ec` is exactly the
  purple theme's `--accent-deep` (ΔE = 0)** — "this segment is Grok" and the accent are the same
  colour there. The collision moved rather than disappeared. It is accepted deliberately: the user
  chose this hue family, and every purple that clears the accent by a comfortable margin stops
  reading as the Claude-adjacent purple that was the point.
- Negative: the light value's 2.57:1 remains just under the range the other four sit in. Measured
  alternatives were 2.26 / 2.41 / 2.73 at Lab lightness −6 / −8 / −12, where contrast and
  accent-distance move in opposite directions (23.5 / 21.4 / 18.3 respectively); −10 was chosen as
  the stopping point — close to the 2.64 floor while still holding 19.7 of accent distance.
- Neutral, and a tension worth naming: ADR-0008 rejected segmenting the chart by agent side precisely
  because a side is a tool and a provider is a model vendor, which correspond one-to-one only for now.
  This decision binds them **visually**, so the day a side starts mixing in another vendor's models,
  its badge colour will name a vendor it no longer exclusively uses. ADR-0008's segmentation logic is
  untouched — it still follows the model name — so the divergence would show up as a side whose
  segments are no longer all its badge colour, which is the honest outcome rather than a wrong one.
- Neutral: a side's colour now exists in more than one file (the chart stylesheet and each surface
  that badges a side), so the values need an executable assertion keeping them in step rather than a
  convention.

## Sources

Measured 2026-08-15 against the shipped palette: existing data colours contrast 2.64–3.56:1 on a
white card and 6.31–7.56:1 on a dark card; `#c9b3ec` gives 1.88:1 light and 8.56:1 dark; the
lightness-reduced ladder −6/−8/−10/−12 gives 2.26/2.41/2.57/2.73:1 with accent distances
23.5/21.4/19.7/18.3, of which −10 was chosen. Eight low-saturation purples were evaluated and all fell below an accent
distance of 16, because that band is occupied by the purple theme's accent on one side and by the
grey "other" data colour on the other. The user's rulings of 2026-08-15.
