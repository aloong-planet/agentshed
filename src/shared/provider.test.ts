// 模型名 → provider 推断(趋势按 provider 分段的依据)
import { describe, it, expect } from 'vitest'
import { providerOf, PROVIDER_ORDER } from './provider'

describe('providerOf', () => {
  it('Anthropic:claude-* 及带厂商前缀的变体', () => {
    expect(providerOf('claude-fable-5')).toBe('Anthropic')
    expect(providerOf('claude-opus-4-8')).toBe('Anthropic')
    expect(providerOf('claude-haiku-4-5-20251001')).toBe('Anthropic')
    expect(providerOf('anthropic.claude-sonnet-4')).toBe('Anthropic')
    expect(providerOf('us.anthropic.claude-opus-5')).toBe('Anthropic')
  })

  it('OpenAI:gpt-* / o1|o3-* / codex 系', () => {
    expect(providerOf('gpt-5.6-sol')).toBe('OpenAI')
    expect(providerOf('gpt-5.2-codex')).toBe('OpenAI')
    expect(providerOf('codex-auto-review')).toBe('OpenAI')
    expect(providerOf('o3-mini')).toBe('OpenAI')
  })

  it('Google:gemini-*', () => {
    expect(providerOf('gemini-3-pro')).toBe('Google')
  })

  it('未知/空 → 其他', () => {
    expect(providerOf('')).toBe('其他')
    expect(providerOf(null)).toBe('其他')
    expect(providerOf('llama-4-70b')).toBe('其他')
  })

  it('大小写不敏感', () => {
    expect(providerOf('Claude-Opus-5')).toBe('Anthropic')
    expect(providerOf('GPT-5.5')).toBe('OpenAI')
  })

  it('展示顺序固定(图例与堆叠顺序稳定,不随当日数据抖动)', () => {
    expect(PROVIDER_ORDER).toEqual(['Anthropic', 'OpenAI', 'Google', '其他'])
  })
})
