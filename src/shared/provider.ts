// Model name → provider (the model vendor). The single place that decides the trend bars' segmentation.
// Note: a provider is not the same thing as an agent side — one agent may connect to several vendors in
// future,
// at which point the chart logic needs no change and the segmentation follows the model name naturally.
// The values are **language-independent identifiers**, not text for people — for UI text see PROVIDER_LABEL.
// This value also serves as DayUsage.byProvider's object key, whose key type there is Record<string, …>:
// when the producer (providerOf's return value) and the consumer (PROVIDER_ORDER's elements) disagree,
// **typecheck does not report it** and the trend segmentation silently goes empty. So changing this
// type's values means changing
// PROVIDER_ORDER with it; trend.test.ts has a pipeline case that builds keys with providerOf as a backstop.
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
