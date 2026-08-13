// Model name → provider (the model vendor). The single place that decides the trend bars' segmentation.
// Note: a provider is not the same thing as an agent side — one agent may connect to several vendors in
// future,
// at which point the chart logic needs no change and the segmentation follows the model name naturally.
// The values are **language-independent identifiers**, not text for people — for UI text see PROVIDER_LABEL.
// This type also supplies DayUsage.byProvider's key type, so **typecheck now owns that agreement**:
// writing a key this type does not list, or reading one, is a compile error at either end.
//
// That is worth stating because of what the alternative cost: while the key type was `string`, the two
// sides were free to drift with nothing reporting it, and the resulting failure was invisible — a trend
// chart whose totals, bar heights and legend all stayed correct while the segments inside every bar
// quietly vanished.
//
// Changing this type's values still means changing PROVIDER_ORDER with it (that one is a separate
// list, not derived), and trend.test.ts keeps a pipeline case for the question types cannot answer:
// whether an unrecognised model's volume reaches a segment at all.
export type Provider = 'Anthropic' | 'OpenAI' | 'Google' | 'other'

/** The fixed order for the legend and the stacking (it does not churn with the day's data) */
export const PROVIDER_ORDER: Provider[] = ['Anthropic', 'OpenAI', 'Google', 'other']

/**
 * Display names. The three vendor names are proper nouns common to every language, so they live here;
 * **only `other` varies with the UI language**, so it is left null here and the renderer takes it from
 * the dictionaries (ticket 07).
 */
export const PROVIDER_LABEL: Record<Provider, string | null> = {
  Anthropic: 'Anthropic',
  OpenAI: 'OpenAI',
  Google: 'Google',
  other: null
}

export function providerOf(model: string | null | undefined): Provider {
  if (!model) return 'other'
  const m = model.toLowerCase()
  if (m.includes('claude') || m.includes('anthropic')) return 'Anthropic'
  if (/(^|[.\-/])(gpt|o1|o3|codex)/.test(m) || m.includes('codex')) return 'OpenAI'
  if (m.includes('gemini')) return 'Google'
  return 'other'
}
