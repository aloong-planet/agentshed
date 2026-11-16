# ADR-0024: The composition bar colours cache reads blue, uncached input yellow and output green, overlapping the provider palette

- Status: Accepted (2026-08-21)

## Context

The token overview's composition bar cuts a total into its three cross-side comparable buckets: uncached input, output
and cache reads. It shares the screen with the trend chart, whose colours already answer "which vendor" (ADR-0008,
ADR-0021), while the bar's colours answer "which kind of token", a dimension that has no correspondence with it.

## Options

1. **Blue, yellow and green as the owner named them, each placed clear of the provider colour nearest its hue** —
   chosen.
2. One hue in three steps, which says "parts of a whole" and sits outside every provider hue — rejected by the owner,
   who named the colours of hit, miss and output.
3. Blue, yellow and green at the greatest measured distance from the provider palette — rejected: the search returns
   olive, lime and a violet-leaning blue, the extremes of each hue band, which are distinct but read as an error in
   this interface.

## Decision

We adopt **option 1**: cache reads blue, uncached input yellow, output green. The blue and the green take hue bands
clear of Google's blue and OpenAI's green, and all three keep their lightness and chroma inside the range the provider
colours occupy, so the bar reads as part of the interface rather than as a warning.

## Consequences

- Positive: hit, miss and output take colours people already hold for them, so the bar needs no legend to be guessed
  at.
- Negative: two of the three hues name a vendor elsewhere on the same screen, and no value fixes it, because the
  defect is dimensional: the distance keeps a segment from being taken for the same colour, not the reader from looking
  for a relation. Accepted: the owner chose these semantics with the collision stated.
- Neutral: the composition colours vary with appearance, one value in light and one in dark across every colour
  scheme, as the provider colours do: they describe data, and a colour scheme changes the interface, not the data.
- Neutral: a fifth named vendor would find narrower hue bands free, so adding one is a rule in the provider inference
  (ADR-0008) plus a colour constraint that nothing enforces.

## Sources

Measured on 2026-08-21 against the palette then shipped, in Lab: the blue at hue 264° against Google's 284°, the green
at 134° against OpenAI's 169°. Light appearance: distance to the nearest provider colour 27.4 (blue to Google), 39.8
(yellow to Anthropic) and 37.2 (green to OpenAI), the three segments at least 59.7 apart; dark appearance: the weakest
pair blue to Google at 18.8, the segments at least 46.4 apart; each well above the distance at which two colours stop
being told apart. An unconstrained search for the greatest distance returned olive `#bba600` and lime `#75b726`. The
owner's ruling naming the three colours. `src/renderer/src/theme.css`; the token-stats spec.
