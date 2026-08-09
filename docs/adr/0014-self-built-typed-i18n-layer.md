# ADR-0014: Self-built typed i18n layer (general-purpose i18n frameworks rejected)

- Status: Accepted (2026-08-08)

## Context

Six languages × roughly 400 copy keys (see ADR-0013), where Russian has four plural forms, French and
Spanish each have their own plural rules, and Japanese has no plural inflection. This repository's
existing type discipline is "constant array + derived union + type guard + hand-written contract
validation" (see ADR-0001 and `shared/appearance.ts`), and this round has an explicit requirement:
a missing translation must surface **at compile time**, with no silent runtime fallback accepted —
the same judgement as CONTEXT.md's existing "allow-list failures are invisible, so nothing may be
silently dropped".

## Options

1. **Build a typed i18n layer: Chinese as the source language, the other five aligned to it entry by
   entry in the type system, plurals handled by the platform's built-in `Intl.PluralRules`**
2. i18next 26.3.6 + react-i18next 17.0.11 — rejected: keys are string literals, and by default a
   typo or a missing translation goes down a silent fallback chain, which is the opposite of the
   "missing means compile error" requirement; even with `CustomTypeOptions` declaration merging for
   key type safety, what gets checked is "the key exists in the source", which does not cover "one
   language is missing an entry" — the very shape this round is meant to prevent
3. Lingui 6.6.0 — rejected: compile-time macro extraction and ICU plurals are genuinely a good fit,
   and it would even let the source write Chinese inline without inventing keys; but it needs a macro
   plugin wired into electron-vite plus two new build steps, `extract` and `compile`. Adding a build
   pipeline for 400 keys, where that pipeline itself becomes a new failure surface for the verify
   gate, is not worth it
4. react-intl 10.1.20 — rejected: the same key-string problem as option 2, and ICU syntax is no more
   economical than JSX for the many embedded `<b>` / `<code>` rich-text fragments this project has

## Decision

We choose **option 1**: we build our own i18n layer and add no i18n runtime dependency. Simplified
Chinese is the source language and the single source of truth; the other five languages' copy objects
must align to it entry by entry in the type system, and one missing entry fails `pnpm typecheck`.
Copy carrying a quantity is expressed as a function, and plural rules call the platform's built-in
`Intl.PluralRules` rather than a hand-rolled rule table. If a lookup somehow fails at runtime, we fall
back to English and warn — never silently blank.

## Consequences

- Positive: missing translations and mistyped keys go red at typecheck, without relying on human
  cross-checking or on discovery at runtime
- Positive: zero new runtime dependencies; accessing copy is an ordinary property read, so IDE
  completion and go-to-definition work out of the box
- Positive: tests need no provider wrapper — the copy layer is pure data and pure functions, matching
  this repository's existing test shape
- Negative: interpolation, plurals and the fallback chain are ours to maintain; what a general-purpose
  framework provides off the shelf is our own code here, and we fix our own bugs in it
- Negative: we lose the framework ecosystem (translation platform integrations, on-demand bundle
  splitting); if the language count or key count grows by an order of magnitude this may need
  re-evaluating
- Neutral: copy lives in TS modules rather than JSON, which buys functions and types at the cost of
  external translators not being able to edit it directly

## Sources

The requirements alignment session of 2026-08-08. Version facts measured against npm that day:
i18next 26.3.6, react-i18next 17.0.11, @lingui/react 6.6.0, react-intl 10.1.20. The existing
isomorphic pattern: `src/shared/appearance.ts:3-10` (constant array + derived union + type guard).

**Evidence closed (promoted from Proposed to Accepted on 2026-08-08)**: the type mapping works and
the design needs no changes.

The technique is to derive a mapped type from the source language's shape, rewriting property by
property — functions keep their original signature, nested objects recurse, and everything else is
widened to `string`, dropping the readonly modifiers that `as const` adds. The other five languages
just annotate with that type: the values can be their own language's text while the key set is
locked. **The function branch must come before the object branch**: a function also satisfies
`extends object` in the type system, so reversing the order would recurse into parameterised copy as
if it were a nested dictionary.

Three things were measured, and **mutations in both directions were confirmed to go red**: one
missing key reports `TS2741` (missing property), one extra key reports `TS2353` (unknown property),
and values can hold that language's own text rather than being forced to match the source language's
literal. Verifying only that "it passes once complete" is not evidence — that cannot distinguish
"the check works" from "there is no check at all", which is why the two mutations are the actual
criterion for whether this ADR holds.
