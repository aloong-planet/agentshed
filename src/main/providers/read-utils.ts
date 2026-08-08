// providers 共用的小读取件:截断读取与 frontmatter 行级字段提取。
// 此前 4 处各持一份副本(review-code 重构项 #2/#3),改截断口径只此一处。
import { existsSync, readFileSync } from 'node:fs'
import type { CappedText } from '@shared/domain'

export const MAX_TEXT_BYTES = 200_000

/** 读文本并按上限截断;文件缺失/不可读为 null */
/**
 * 读文本并限长。**只报告是否被截断,不拼任何标记**——标记是界面文案,
 * 由渲染层按当前语言追加(票 07)。
 */
export function readCapped(file: string, max = MAX_TEXT_BYTES): CappedText | null {
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.length > max ? { text: raw.slice(0, max), truncated: true } : { text: raw, truncated: false }
  } catch {
    return null
  }
}

/** 只要正文的场景(喂正则、取 frontmatter 字段等),截断与否不影响解析 */
export function readTextCapped(file: string, max = MAX_TEXT_BYTES): string | null {
  return readCapped(file, max)?.text ?? null
}

/** frontmatter/行级字段提取(description/tools/model 等单行值;与 skills 既有口径一致) */
export function fmField(content: string | null, key: string): string | null {
  if (content === null) return null
  const m = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(content)
  return m ? m[1] : null
}
