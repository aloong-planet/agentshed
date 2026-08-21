# ADR-0024: The composition bar uses blue / yellow / green, overlapping the provider palette

- Status: Accepted (2026-08-21)

## Context

The token overview gained a bar that cuts a total into its three cross-side comparable buckets —
uncached input, output, cache reads. The bar sits on the same screen as the trend chart, whose
segments are coloured by **provider** (ADR-0008, ADR-0021): Anthropic orange, OpenAI green, Google
blue, xAI purple, other grey.

So a colour on that screen already answers a question — "which vendor" — and the composition bar
needs colours that answer a different one: "which kind of token". The two are not the same dimension
and do not correspond; a reader who tries to map a bar segment onto a chart segment is asking a
question with no answer.

The first version avoided the problem by not competing: the three segments were one hue in three
steps, which encodes "parts of a whole" in the colour itself and sits outside every provider hue. The
user ruled against it and named the three colours: hit = blue, miss = yellow, output = green.

## Options

1. **Blue / yellow / green as ruled, with the values pushed as far from the provider palette as the
   hue names allow** — the user's semantics, the collision minimised but not removed
2. Sequential single-hue ramp — rejected by the user; it was the previous version
3. Blue / yellow / green taken to the point of maximum measured distance from the provider palette —
   rejected on measurement: an unconstrained search for maximum ΔE returns olive `#bba600`, lime
   `#75b726` and a violet-leaning blue, because the extremes of each hue band are the points furthest
   from everything. They are maximally distinct and do not belong to this interface. "Far from the
   palette" and "part of the same design" are two objectives, and optimising only the first produces
   colours that read as an error

## Decision

Option 1. Hue bands are chosen clear of the two the palette already owns — the blue sits at Lab hue
264° against Google's 284°, the green at 134° against OpenAI's 169° — with lightness and chroma held
inside the range the provider colours themselves occupy, so the bar reads as part of the same
interface rather than as a warning.

Measured against the shipped palette, 2026-08-21. Light appearance: distance to the nearest provider
colour is 27.4 (blue vs Google), 39.8 (yellow vs Anthropic), 37.2 (green vs OpenAI); the three
segments are at least 59.7 apart from each other. Dark appearance: the weakest pair is blue vs Google
at 18.8, and the segments are at least 46.4 apart. Every figure is well above the threshold at which
two colours stop being distinguishable.

## Consequences

- Positive: the semantics the user asked for. Hit/miss/output is a distinction people already hold in
  those colours, and it needs no legend to be guessed at.
- **Negative, and the reason this entry exists: two of the three hues now name a vendor elsewhere on
  the same screen.** No colour value fixes this, because the defect is dimensional, not chromatic — a
  reader may look for the correspondence between a bar segment and a chart segment however far apart
  the values sit. What the measured distances buy is that the two are never mistaken for *the same
  colour*; they do not buy that the reader will not look for a relationship. Accepted deliberately:
  the user chose these semantics with the collision stated.
- Neutral: the composition colours are **appearance-varying** — one value per light/dark, shared
  across colour schemes (CONTEXT.md's variable classes). They describe data, and a colour scheme
  changes the interface rather than the data. This is the same class the provider colours and the side
  badges sit in.
- Neutral: should a fifth provider ever be onboarded, the hue bands left free are narrower than they
  were, and the ADR-0008 rule that a new vendor is "just a rule in the provider inference module" now
  carries an unstated colour constraint. Naming it here is the whole mitigation; nothing enforces it.
