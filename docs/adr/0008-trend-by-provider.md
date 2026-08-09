# ADR-0008: Trend bars segmented by provider

- Status: Accepted (2026-07-30)

## Context

The trend chart was originally single-colour bars answering only "how much in total today", not
"where did it come from". We need to show the composition as segments within each bar. There are
three candidate dimensions to segment by, and the wrong one brings either colour churn or a semantic
mismatch.

## Options

1. **Segment by provider (the model vendor)**: the provider is inferred from the model name
   (claude-* → Anthropic; gpt-/o1-/o3-/codex-* → OpenAI; gemini-* → Google; everything else → Other),
   in the fixed order Anthropic → OpenAI → Google → Other
2. Segment by model — rejected: measured on this machine there are 9 models spanning 5 orders of
   magnitude (3072M down to 11k), so stacking them directly produces invisible 1px slivers and would
   require a "top N + other" merge rule; models coming and going make the legend and the colours
   churn; and "which model was burning today" is already answered by the per-model breakdown bar chart
3. Segment by agent side (Claude Code / Codex) — rejected: a side is a tool and a provider is a model
   vendor; they happen to correspond one-to-one right now but mean different things, and the day an
   agent starts mixing in another vendor's models, segmenting by side would blend different providers
   into one segment
4. No segmentation (stay single-colour) — rejected: does not meet the requirement

## Decision

We choose **option 1**. Bar height = that day's total, segment height = that provider's share of the
day. The segment order and the legend order are fixed (they do not churn with the day's data), and
the legend lists only providers that actually appear within the window. In single-side filter mode it
degenerates to one segment. Provider inference lives in one place, `shared/provider.ts`.

## Consequences

- Positive: decoupled from the agent side — the day an agent adds another vendor's models, the chart
  logic does not change; the segment count stays between 1 and 4, so no invisible slivers; the
  colours are fixed and memorable
- Negative: the model mix within one provider is not visible (that is the per-model breakdown chart's
  job)
- Neutral: provider inference is heuristic matching on the model name, so a new vendor needs a rule
  added to `shared/provider.ts` or it falls into "Other"

## Sources

The user's ruling after reviewing the three options (2026-07-30); the model magnitude distribution
measured on this machine — 9 models spanning 5 orders of magnitude (claude-opus-4-8 at 3072M down to
gpt-5.2-codex at 11k), which is the evidence for "segmenting by model produces invisible slivers".
