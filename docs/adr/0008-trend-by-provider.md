# ADR-0008: Trend bars are segmented by provider, the model vendor inferred from the model name

- Status: Accepted (2026-07-30)

## Context

The trend chart's bars show each day's total, and the reader also needs to see where it came from. A bar could be
segmented by model, by agent side or by provider, and the wrong dimension either churns the colours or names something
other than what the segment holds.

## Options

1. **Segment by provider, inferred from the model name, in a fixed order** — chosen.
2. Segment by model — rejected: the models on one machine spanned five orders of magnitude, so most segments would be
   invisible slivers needing a "top N + other" rule, and models coming and going would churn the legend and colours.
   Which model was burning is the per-model breakdown's question.
3. Segment by agent side — rejected: a side is a tool and a provider a model vendor, and a side that runs more than
   one vendor's models, as Antigravity runs Gemini and Claude models, would blend providers into one segment.
4. No segmentation — rejected: the bar would not show where its total came from.

## Decision

We adopt **option 1**. A bar's height is the day's total and each segment is one provider's share of it: Anthropic,
OpenAI, Google, xAI and other, stacked and listed in that fixed order whatever the day's data. The legend lists only
the providers that appear within the window. In a single-side view the bar is one segment in that side's colour
(ADR-0021). One module infers the provider from the model name, and a model that no rule matches counts as other.

## Consequences

- Positive: the chart logic does not change when a side runs another vendor's models, and with at most five segments
  none is an invisible sliver and every colour stays fixed.
- Negative: the model mix within one provider is not visible; the per-model breakdown shows it.
- Neutral: inference matches the model name, so a new vendor's models count as other until a rule is added for it.

## Sources

The owner's ruling on the three segmentations, 2026-07-30. Measured on the development machine before that ruling:
nine models spanning five orders of magnitude, from claude-opus-4-8 at 3,072M tokens down to gpt-5.2-codex at 11k.
`src/shared/provider.ts`; the token-stats spec.
