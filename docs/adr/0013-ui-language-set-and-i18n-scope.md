# ADR-0013: The i18n scope is the app's copy, its menu and the README, every language left to right, with no RTL commitment

- Status: Accepted (2026-08-08)

## Context

A design for translating the product needs a defined reach: which texts are translated, and whether a
right-to-left language is among the languages. A right-to-left language demands a fully mirrored layout, while
the stylesheet uses physical properties throughout and the trend chart positions its axis labels in pixels
computed in JS. That cost exceeds the cost of all the left-to-right languages together.

## Options

1. **Every UI language left to right, with no RTL commitment; the scope is the app's user-visible copy, the
   application menu and the README**
2. The six official UN languages taken literally, Arabic included — rejected: RTL would mean converting the
   stylesheet to logical properties and mirroring the chart's pixel positioning, an investment the target users do
   not justify.
3. Arabic translated without RTL — rejected: Arabic text in a left-to-right layout is visibly broken, so claiming
   to support it would be untrue.
4. Translating the engineering documents under `docs/` into every UI language — rejected: they are kept strictly in
   step with the implementation, so each copy multiplies that cross-checking, and a lagging translation makes the
   documents lie. The README is a short public front door, so its cost is small and it is included.
5. Localising the application name — deferred: Agentshed is a brand name and stays the same in every language.
   Reopen if the product's positioning or its distribution channels change.

## Decision

We adopt **option 1**: every UI language is left to right, and the product makes no RTL commitment. The i18n scope
is the app's user-visible copy, failure information arriving across processes included, the application menu and
the README. The engineering documents under `docs/` are not translated, and the name Agentshed is the same in every
language. When the user has not chosen a language, the system's preferred languages resolve to a supported one,
falling back to English.

## Consequences

- Positive: with every language left to right, the stylesheet needs no logical properties, and the chart's pixel
  positioning stands as it is.
- Positive: the scope is fixed, so a request to translate the engineering documents as well can be refused with a
  citation.
- Negative: users of right-to-left languages, Arabic among them, are excluded, and adding one would be a round of
  independent engineering rather than a translation.
- Negative: the README has a copy in each UI language, so every change to the product's positioning is made in each.
- Neutral: the default language follows the system rather than Chinese, so a Chinese reader on an English system
  sees English on first launch and switches once.

## Sources

The requirements session of 2026-08-08. Which languages the UI has is ADR-0035's; the language the engineering
documents are written in is ADR-0017's. `src/renderer/src/theme.css` at commit `64d12a4`: 51 lines with a
directional physical property (`margin-left`, `border-left`, `border-right`, `text-align: left`, `left:` and the
like) and none with a logical one; `src/renderer/src/TokenViz.tsx` positions each axis label with a computed
`left` in pixels.
