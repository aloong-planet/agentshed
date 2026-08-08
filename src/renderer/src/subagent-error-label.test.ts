// 票 05:subagent 失败标签按**类别**判分支,不按措辞。
//
// 这条用例守的是 ADR-0015 点名的那处隐患:早先写的是 `error.includes('不可读')`,
// 措辞一改分支就静默失效、且没有任何测试会红。现在断言的是「类别 → 标签」,
// 措辞怎么改都不该影响分支归属——所以这里刻意**不**断言具体字面量,
// 而是断言两类各自取到了字典里对应的那一条。
import { describe, it, expect } from 'vitest'
import { dictOf, LANGUAGES } from '@shared/i18n'
import { errLabel } from './SubagentsView'

describe('errLabel(按类别判分支)', () => {
  it('unreadable 与 parse-failed 取到各自的措辞', () => {
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      expect(errLabel('unreadable', t)).toBe(t.subagentError.unreadable)
      expect(errLabel('parse-failed', t)).toBe(t.subagentError.parseFailed)
    }
  })

  it('两类标签互不相同(否则分支等于没分)', () => {
    for (const lang of LANGUAGES) {
      const t = dictOf(lang)
      expect(errLabel('unreadable', t)).not.toBe(errLabel('parse-failed', t))
    }
  })

  it('类别为 null 时落到解析失败一侧,与改造前的行为一致', () => {
    // 改造前 `includes('不可读')` 对任何不含该词的 error 都落「解析失败」,
    // 包含 error 非空但类别缺失的情况;这里保持同样的兜底,不改变用户所见
    const t = dictOf('zh')
    expect(errLabel(null, t)).toBe(t.subagentError.parseFailed)
  })
})
