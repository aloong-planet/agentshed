# ADR-0013: UI language set and i18n scope boundary

- Status: Accepted (2026-08-08). The "`docs/` stays Chinese-only" clause was **superseded by
  ADR-0017** on 2026-08-09; the language set and the rest of the scope boundary remain in force.

## Context

The product was previously hard-coded in Chinese throughout (about 370 pieces of copy in the
renderer, about 40 error strings in main/preload/shared) with no i18n infrastructure at all. The
requirement as originally stated was "support the six official UN languages", but that set includes
Arabic, and Arabic demands a fully mirrored RTL layout: this repository's CSS uses physical
properties 100% of the time (about 40 directional declarations in `theme.css`, zero logical
properties), and the trend chart's axis labels are positioned in pixels computed in JS
(`TokenViz.tsx:157`) with e2e assertions pinning those pixel values. The engineering and verification
cost of RTL exceeds that of the other five languages combined, so the language set and the scope have
to be ruled on before a design has a definite target.

## Options

1. **Take the six as Simplified Chinese / English / French / Russian / Spanish / Japanese, all LTR;
   scope covers the app's UI copy, the custom Electron menu, and the README; `docs/` stays
   Chinese-only**
2. Take the six official UN languages literally (including Arabic) — rejected: RTL would require
   converting the CSS wholesale to logical properties and mirroring the chart's pixel positioning
   logic, and the target user base does not justify that investment; substituting Japanese keeps the
   count at six with everything left-to-right and reduces the RTL work to zero
3. Include Arabic but translate text only, without RTL — rejected: Arabic text stuffed into an LTR
   layout is an obviously broken experience, and "supports Arabic" would not be true; listing it
   would be worse than not listing it
4. Translate all of `docs/` into six languages — rejected: 1925 lines of engineering artifacts × 6,
   and step 8 of the eight-step process requires spec ↔ implementation ↔ features ↔ ADR to stay
   strictly in sync, so six copies would multiply the cross-regression cost by six and create a new
   failure mode where a lagging translation makes the docs lie. The README is only 5 lines and is a
   public-facing front door, so its cost is negligible and it is included separately
5. Localise the application name / window title — deferred: Agentshed stays the same in every
   language as a brand name; this can be revisited if the product positioning or distribution
   channels change

## Decision

We choose **option 1**: we support Simplified Chinese, English, French, Russian, Spanish and
Japanese, all left-to-right, and this product makes no RTL commitment. The i18n scope is all
user-visible copy inside the app (including failure information arriving across processes), the
Electron application menu, and the README; the specs / ADRs / features / postmortems / ops under
`docs/` are developer-facing engineering artifacts and stay Chinese-only. When the user has not
chosen manually, the system language maps to one of the six, falling back to English if it maps to
none.

> **Superseded in part (2026-08-09, ADR-0017)**: `docs/` no longer stays Chinese-only — the
> repository's working language is now English, covering `docs/`, source comments, test names and
> terminal output. The reasoning above (option 4) was aimed at translating into *six* languages and
> does not apply to a single-language switch. Everything else in this ADR stands.

## Consequences

- Positive: all six languages are LTR, so the CSS needs no conversion to logical properties and the
  chart's pixel positioning logic and its e2e assertions survive untouched
- Positive: the scope boundary is nailed down, so later scope creep of the "might as well translate
  the docs too" variety can be refused with a citation
- Negative: Arabic users are explicitly excluded, and adding them later would be a whole round of
  independent engineering rather than incremental translation
- Negative: with the README in six languages, every adjustment to the product positioning has to be
  made six times (acceptable: 5 lines, changed rarely)
- Neutral: the default language follows the system rather than being fixed to Chinese, so a Chinese
  user on an English system sees English on first launch and has to switch once
- Neutral: `docs/` being single-language means non-Chinese contributors cannot read the engineering
  artifacts; with this project being solo-developed that is not an actual obstacle
  (**this consequence was the trigger for ADR-0017**)

## Sources

The requirements alignment session of 2026-08-08 (the language set went through two revisions:
remove Arabic, add Japanese). Research evidence: a count of directional properties in `theme.css`
(margin-left ×6, border-left ×5, border-right ×3, text-align:left ×15, text-align:right ×6, logical
properties ×0), the JS pixel positioning at `TokenViz.tsx:157`, the corresponding pixel assertion at
`e2e/app.spec.ts:1554`, 1925 lines of markdown in `docs/`, and 5 lines in `README.md`.
