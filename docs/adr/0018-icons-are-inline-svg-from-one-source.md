# ADR-0018: Icons are inline SVG from one icon module, Lucide first and a library drawn the same way where Lucide lacks the meaning

- Status: Accepted (2026-08-15)

## Context

The renderer drew its icons as emoji and Unicode characters, in JSX, inside the dictionaries' copy and in CSS
`content:` declarations. A character's shape comes from the system font, so glyphs on one row sit at different weights
and baselines, its colour cannot follow `currentColor` through a theme switch, and an emoji may be substituted per
locale. One glyph, 🤖, also meant both the Agents rail and a subagent, so neither could change without the other.

## Options

1. **Inline SVG through one `Icon` component, its elements copied from an icon library, Lucide first** — chosen.
2. Keep emoji and Unicode characters — rejected: their weight, baseline and colour follow the system font rather than
   the theme, and one glyph had come to carry two meanings.
3. A runtime dependency on an icon package — rejected: the app avoids a runtime dependency for a handful of glyphs, and
   the prototypes are zero-build pages opened by double-click.
4. Lucide alone — rejected: its whole set has one robot, `bot`, which the subagent takes, leaving the Agents rail
   nothing to be.

## Decision

We adopt **option 1**. Every icon is inline SVG wrapped by the `Icon` component in the renderer's icon module, its
inner elements copied from an icon library, with no whole `<svg>` tag pasted in, no colour on the paths and no runtime
icon dependency.

Lucide is the default source. A meaning Lucide has no glyph for takes one from a library drawn on the same 24×24 grid
with the same 2px stroke and round caps, so that one wrapper fits either: Tabler's outline set, which gives the Agents
rail its `robot-face`. Each icon records the library it came from, and a third library is admitted only once its
drawing convention is checked, not for its popularity.

## Consequences

- Positive: icons follow `currentColor` and sit at one weight and baseline, so a theme switch treats them like
  everything around them, and each meaning has its own glyph.
- Negative: a meaning Lucide lacks can only take a glyph from a library drawn on Lucide's grid, stroke and caps; one
  drawn otherwise would need the wrapper changed.
- Neutral: an icon that adds an affordance the words lack, such as the back control's chevron or the fork markers, is
  drawn by its component beside the copy, never written into a dictionary.

## Sources

The icon-selection comparison pages confirmed with the user, 2026-08-12. On 2026-08-15 the renderer drew 15 distinct
meanings as characters across about 27 slots, five more glued to copy in the dictionaries and two in CSS `content:`;
Lucide's set held 1852 icons. `src/renderer/src/icons.tsx`; ADR-0033 for the prototypes' own icons.
