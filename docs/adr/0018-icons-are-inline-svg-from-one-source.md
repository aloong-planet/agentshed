# ADR-0018: Icons are inline SVG from a single source, and the prototypes derive theirs from it

- Status: Accepted (2026-08-15)

## Context

Until this decision the renderer drew its icons as emoji and Unicode characters written straight into
JSX — 15 distinct meanings across roughly 27 slots, plus five more glued to the front of copy inside
the six language dictionaries, plus two living only in CSS `content:` declarations.

Characters make poor icons for reasons that are individually small and collectively decisive: a
glyph's shape is decided by the system font, so different characters on one row sit at different
weights and baselines; colour cannot follow `currentColor`, so a theme switch treats them differently
from everything around them; and an emoji may be substituted per locale, which interacts badly with a
six-language product.

The failure that forced the issue was sharper than any of those. `🤖` meant **both** the Agents rail
and a subagent — one glyph carrying two meanings, so neither could change without dragging the other
along. That is not a rendering problem, it is a naming collision that the character form made
invisible.

A second, separate problem surfaced while fixing the first. The prototypes under `docs/prototypes/`
had kept drawing emoji for weeks after the product moved on, and **nothing reported it**. A prototype that disagrees with the product is worse than no prototype: anyone reading it
reasons about behaviour that no longer exists.

## Options

1. **One icon library, hand-copied paths in both the app and the prototypes.** Simplest to start.
   Rejected on the second problem: two hand-kept lists of the same thing are equal only for as long as
   somebody remembers, which is precisely the arrangement that had just failed.

2. **Runtime dependency on an icon package in both places.** Rejected: the prototypes are zero-build,
   self-contained HTML opened by double-click (prototype skill, general rule 2), and the app avoids a
   runtime icon dependency for a handful of glyphs.

3. **One source in the app; the prototypes hold a generated view of it, with a gate.** Chosen.

## Decision

**Every icon is inline SVG, wrapped by the `Icon` component in the renderer's icon module.** Internal
elements are copied from an icon library; no whole `<svg>` tags pasted in, no hard-coded colours on
the paths, no runtime icon dependency.

**Lucide is the default source. A second library may be used where Lucide has no glyph for the
meaning, and each icon records which library it came from.** This is not open-ended: mixing is safe
only because Tabler's outline set draws on the same 24×24 grid with the same 2px stroke and round
caps, so one wrapper fits either without adjustment. **Check that before adding a third source** —
the criterion is the drawing convention, not the library's popularity.

The concrete case: Lucide's entire 1852-icon set contains exactly one robot (`bot`), and that one had
to be the subagent. The Agents rail would have had nothing left to be, so it takes Tabler's
`robot-face`.

**The prototypes do not keep their own copy.** `docs/prototypes/_shared/icons.js` is generated from
the renderer's icon module by `sync-icons.mjs`, carries a "do not edit by hand" header, and is
checked by a `--cross` rule in `check-shared-ui.mjs` that fails when it drifts.

## Consequences

- Adding an icon is a two-step operation: edit the icon module, re-run `node
  docs/prototypes/sync-icons.mjs`. Forgetting the second step fails `pnpm check:ui --cross` rather
  than being discovered later by eye.
- The prototypes gain a dependency on a shared script. That is the same kind of dependency they
  already had (`trend-chart.js`, `model.mmd.js`) and works under `file://` for the same reason —
  a `<script src>` is not subject to the CORS rule that blocks ES module imports.
- **Two hand-written implementations of the same glyph list no longer exist**, which is what makes
  the gate checkable at all. A gate comparing prototype and product logic for *equivalence* was proposed earlier and closed as
  undecidable; this one compares generated text against its own
  generator's output, which is structural. The dividing line is worth remembering: a static check can
  decide whether two artefacts are the same, never whether two programs mean the same.
- Icons that are still glued to copy inside the language dictionaries were removed rather than
  converted where they were decoration (three of five), and moved into the component where they carry
  an affordance the words do not (the back control's chevron, the fork markers).

## Sources

- The icon-selection comparison pages confirmed with the user (2026-08-12)
- `src/renderer/src/icons.tsx`, `docs/prototypes/sync-icons.mjs`, `scripts/check-shared-ui.mjs`
- The closing rationale of the rejected equivalence-gate proposal, for the checkable/undecidable boundary
