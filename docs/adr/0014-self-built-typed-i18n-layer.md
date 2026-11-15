# ADR-0014: A self-built typed i18n layer; general-purpose i18n frameworks rejected

- Status: Accepted (2026-08-08)

## Context

The UI's copy is about 400 entries in each UI language, some carrying a quantity that needs the language's plural
rules. A missing translation has to surface at compile time, with no silent runtime fallback. The repository's
existing type discipline is a constant array, a derived union, a type guard and hand-written contract validation
(ADR-0001).

## Options

1. **A typed layer of our own: Chinese the source language, every other language aligned to it entry by entry in the
   type system, plurals from the platform's `Intl.PluralRules`**
2. i18next 26.3.6 with react-i18next 17.0.11 — rejected: keys are string literals, and a typo or a missing
   translation goes down a silent fallback chain by default. Even with `CustomTypeOptions` for key safety, what is
   checked is that a key exists in the source, not that every language has it.
3. Lingui 6.6.0 — rejected: its compile-time extraction and ICU plurals fit, but it needs a macro plugin in
   electron-vite and two new build steps, `extract` and `compile`, a new failure surface not worth it at this
   number of keys.
4. react-intl 10.1.20 — rejected: the same key-string problem as option 2, and ICU syntax is no more economical
   than JSX for the many embedded `<b>` and `<code>` fragments.

## Decision

We adopt **option 1**: we build our own i18n layer and add no i18n runtime dependency. Simplified Chinese is the
source language and the single source of truth; every other language's copy object aligns to it entry by entry in
the type system, so one missing or one extra entry fails `pnpm typecheck`. Copy carrying a quantity is a function,
and plural rules come from the platform's `Intl.PluralRules`, never a hand-rolled table.

## Consequences

- Positive: missing translations and mistyped keys go red at typecheck, without a person cross-checking and without
  discovery at runtime.
- Positive: no new runtime dependency; copy is an ordinary property read, so IDE completion and go-to-definition
  work as they are.
- Positive: tests need no provider wrapper, since the copy layer is pure data and pure functions.
- Negative: interpolation, plurals and fallbacks are ours to maintain, and we fix our own bugs in them.
- Negative: no framework ecosystem (translation platform integrations, on-demand bundle splitting); growth in the
  languages or the keys by an order of magnitude may call for re-evaluating.
- Neutral: copy lives in TypeScript modules rather than JSON, which buys functions and types at the cost of
  external translators not editing it directly.

## Sources

The requirements session of 2026-08-08. Versions read from npm that day: i18next 26.3.6, react-i18next 17.0.11,
@lingui/react 6.6.0, react-intl 10.1.20. How the type mapping is built, and why its function branch comes before
its object branch, is in the header of `src/shared/i18n/types.ts`. The surface: six languages and about 400 keys
when this was decided; two languages and 404 leaf entries in the source dictionary at commit `64d12a4`.
