// 模型名 → provider(模型提供方)。趋势柱按 provider 分段的唯一判定处。
// 注意:provider 与 agent 侧不是一回事——同一 agent 未来可能接多家模型,
// 届时无需改图表逻辑,分段自然会跟着模型名走。
export type Provider = 'Anthropic' | 'OpenAI' | 'Google' | '其他'

/** 图例与堆叠的固定顺序(不随当日数据抖动) */
export const PROVIDER_ORDER: Provider[] = ['Anthropic', 'OpenAI', 'Google', '其他']

export function providerOf(model: string | null | undefined): Provider {
  if (!model) return '其他'
  const m = model.toLowerCase()
  if (m.includes('claude') || m.includes('anthropic')) return 'Anthropic'
  if (/(^|[.\-/])(gpt|o1|o3|codex)/.test(m) || m.includes('codex')) return 'OpenAI'
  if (m.includes('gemini')) return 'Google'
  return '其他'
}
