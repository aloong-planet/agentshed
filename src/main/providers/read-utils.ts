// providers 共用的小读取件:截断读取与 frontmatter 行级字段提取。
// 此前 4 处各持一份副本(review-code 重构项 #2/#3),改截断口径只此一处。
import { existsSync, readFileSync } from 'node:fs'

export const MAX_TEXT_BYTES = 200_000

/** 读文本并按上限截断;文件缺失/不可读为 null */
export function readTextCapped(file: string, max = MAX_TEXT_BYTES): string | null {
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.length > max ? `${raw.slice(0, max)}\n…(已截断)` : raw
  } catch {
    return null
  }
}

/** frontmatter/行级字段提取(description/tools/model 等单行值;与 skills 既有口径一致) */
export function fmField(content: string | null, key: string): string | null {
  if (content === null) return null
  const m = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(content)
  return m ? m[1] : null
}
