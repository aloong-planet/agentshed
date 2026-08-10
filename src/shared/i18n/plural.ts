// Plural selection, kept in its own **leaf module** — it imports no dictionary, and nothing but a type from
// `./index`.
//
// That isolation is the point. Dictionaries need `plural()` in their own entries, and `index.ts` imports
// every dictionary, so putting `plural()` in `index.ts` makes any dictionary that uses it circular: loading
// that dictionary on its own re-enters `index.ts` and reads `DICTS` before the dictionary has initialised.
// It works only for as long as `index.ts` is the entry point every time — which is not a property anyone
// can see at the call site, and not one a type checker enforces. `./plural.test.ts` pins it.
import type { Language } from './index'

/**
 * Choose a word by the target language's plural rules.
 *
 * The rules come from the platform's built-in `Intl.PluralRules`, **never a hand-rolled rule table** — the
 * categories differ enormously between languages (four forms in Russian, French using the singular for 0,
 * no inflection in Japanese), so writing them by hand is bound to be wrong and cannot be exhaustive.
 * The caller supplies whichever forms that language needs, and a missing form falls back to `other`.
 *
 * The language code doubles as the locale tag. That is deliberate rather than a shortcut around each
 * dictionary's `htmlLang`: reading `htmlLang` would mean importing the dictionaries, which is the cycle
 * described above. CLDR keys plural rules off the **primary subtag**, so the two agree for every language
 * here — including `zh`, whose `htmlLang` is `zh-CN`. `./index.test.ts` asserts that agreement across the
 * whole language set rather than leaving it to hold by luck.
 */
export function plural(
  lang: Language,
  n: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
): string {
  const rule = new Intl.PluralRules(lang).select(n)
  // `other` is required by the type, so this fallback always finds a value — leaving no "if both are empty
  // return an empty string" silent failure surface, where the UI goes blank and nothing reports it.
  return forms[rule] ?? forms.other
}
