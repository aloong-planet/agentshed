// 模型名 → provider(模型提供方)。趋势柱按 provider 分段的唯一判定处。
// 注意:provider 与 agent 侧不是一回事——同一 agent 未来可能接多家模型,
// 届时无需改图表逻辑,分段自然会跟着模型名走。
// 值是**语言无关标识符**,不是给人看的文字——界面文字见 PROVIDER_LABEL。
// 这个值同时充当 DayUsage.byProvider 的对象键,而那里的键类型是 Record<string, …>:
// 产生端(providerOf 的返回值)与消费端(PROVIDER_ORDER 的元素)不一致时
// **typecheck 不会报错**,趋势分段会静默变空。故改动本类型的值必须连
// PROVIDER_ORDER 一起改;trend.test.ts 有一条用 providerOf 产键的链路用例兜底。
export type Provider = 'Anthropic' | 'OpenAI' | 'Google' | 'other'

/** 图例与堆叠的固定顺序(不随当日数据抖动) */
export const PROVIDER_ORDER: Provider[] = ['Anthropic', 'OpenAI', 'Google', 'other']

/**
 * 界面显示名。三家厂商名是专有名词、各语言通用,故直接在此;
 * **只有 `other` 随界面语言变化**,故此处留 null,由渲染层从字典取(票 07)。
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
