// Inferring a provider from a model name (the basis for segmenting the trend by provider)
import { describe, it, expect } from 'vitest'
import { providerOf, PROVIDER_ORDER, PROVIDER_LABEL } from './provider'

describe('providerOf', () => {
  it('Anthropic: claude-* and vendor-prefixed variants', () => {
    expect(providerOf('claude-fable-5')).toBe('Anthropic')
    expect(providerOf('claude-opus-4-8')).toBe('Anthropic')
    expect(providerOf('claude-haiku-4-5-20251001')).toBe('Anthropic')
    expect(providerOf('anthropic.claude-sonnet-4')).toBe('Anthropic')
    expect(providerOf('us.anthropic.claude-opus-5')).toBe('Anthropic')
  })

  it('OpenAI: gpt-* / o1|o3-* / the codex family', () => {
    expect(providerOf('gpt-5.6-sol')).toBe('OpenAI')
    expect(providerOf('gpt-5.2-codex')).toBe('OpenAI')
    expect(providerOf('codex-auto-review')).toBe('OpenAI')
    expect(providerOf('o3-mini')).toBe('OpenAI')
  })

  it('Google:gemini-*', () => {
    expect(providerOf('gemini-3-pro')).toBe('Google')
  })

  it('unknown or empty → other', () => {
    expect(providerOf('')).toBe('other')
    expect(providerOf(null)).toBe('other')
    expect(providerOf('llama-4-70b')).toBe('other')
    // <synthetic>: a shape taken from real session data (the marker Claude Code puts on a synthetic
    // message),
    // wrapped in angle brackets and not a normal model name — an imagined fixture would never produce
    // this spelling, hence its own case
    expect(providerOf('<synthetic>')).toBe('other')
  })

  it('is case-insensitive', () => {
    expect(providerOf('Claude-Opus-5')).toBe('Anthropic')
    expect(providerOf('GPT-5.5')).toBe('OpenAI')
  })

  it('the display order is fixed (the legend and stacking order are stable and do not churn with the day\'s data)', () => {
    expect(PROVIDER_ORDER).toEqual(['Anthropic', 'OpenAI', 'Google', 'other'])
  })

  it('every provider has a display name, and the order covers them all', () => {
    // The values are now language-independent identifiers, with this table providing the UI text.
    // Iterating PROVIDER_ORDER rather than hard-writing a few: adding a provider without a display name
    // goes red here.
    for (const p of PROVIDER_ORDER) {
      // `other`'s display name varies with the UI language, so the table holds null and the renderer
      // takes it from the dictionaries (ticket 07);
      // what is asserted here is "the key is in the table", not "the value is non-empty" — the latter no
      // longer holds for other
      expect(PROVIDER_LABEL, `provider ${p} has no display name`).toHaveProperty(p)
    }
    expect(Object.keys(PROVIDER_LABEL).sort()).toEqual([...PROVIDER_ORDER].sort())
    expect(PROVIDER_LABEL.other).toBeNull()
  })
})
