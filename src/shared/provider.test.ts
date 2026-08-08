// 模型名 → provider 推断(趋势按 provider 分段的依据)
import { describe, it, expect } from 'vitest'
import { providerOf, PROVIDER_ORDER, PROVIDER_LABEL } from './provider'

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

  it('未知/空 → other', () => {
    expect(providerOf('')).toBe('other')
    expect(providerOf(null)).toBe('other')
    expect(providerOf('llama-4-70b')).toBe('other')
    // <synthetic>:取自真实会话数据的形态(Claude Code 给合成消息打的标记),
    // 尖括号包裹、不是常规模型名——想象 fixture 想不出这种写法,故单列一条
    expect(providerOf('<synthetic>')).toBe('other')
  })

  it('大小写不敏感', () => {
    expect(providerOf('Claude-Opus-5')).toBe('Anthropic')
    expect(providerOf('GPT-5.5')).toBe('OpenAI')
  })

  it('展示顺序固定(图例与堆叠顺序稳定,不随当日数据抖动)', () => {
    expect(PROVIDER_ORDER).toEqual(['Anthropic', 'OpenAI', 'Google', 'other'])
  })

  it('每个 provider 都有显示名,且顺序全集无遗漏', () => {
    // 值已脱敏为语言无关标识符,界面文字改由这张表提供。
    // 遍历 PROVIDER_ORDER 而非硬写几条:将来加 provider 却漏配显示名时这里会红。
    for (const p of PROVIDER_ORDER) {
      expect(PROVIDER_LABEL[p], `provider ${p} 缺显示名`).toBeTruthy()
    }
    expect(Object.keys(PROVIDER_LABEL).sort()).toEqual([...PROVIDER_ORDER].sort())
    expect(PROVIDER_LABEL.other).toBe('其他')
  })
})
