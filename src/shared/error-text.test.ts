// 结构化错误 → 当前语言的措辞(票 05)。
import { describe, it, expect } from 'vitest'
import { ERR, appError, encodeAppError } from './errors'
import { errorText } from './error-text'
import { LANGUAGES } from './i18n'

const wrap = (msg: string): string =>
  `Error invoking remote method 'agentshed:get-session-page': Error: ${msg}`

describe('errorText', () => {
  it('按当前语言渲染同一个码', () => {
    const raw = wrap(encodeAppError({ code: ERR.engineNotReady, params: {} }))
    expect(errorText('zh', raw)).toBe('扫描引擎未就绪,请稍候再试')
    expect(errorText('ja', raw)).toBe('スキャンエンジンの準備ができていません。少し待って再試行してください')
    expect(errorText('ru', raw)).toContain('сканирования')
  })

  it('带参数的码把参数插进措辞', () => {
    const raw = wrap(encodeAppError({ code: ERR.turnOutOfRange, params: { i: 7, total: 3 } }))
    expect(errorText('zh', raw)).toBe('轮次下标越界:7(共 3 轮)')
    expect(errorText('en', raw)).toBe('Turn index out of range: 7 (of 3 turns)')
  })

  it('可选参数缺席时措辞不出现空括号', () => {
    const withField = wrap(encodeAppError({ code: ERR.badArgs, params: { channel: 'setHidden', field: 'hidden' } }))
    const noField = wrap(encodeAppError({ code: ERR.badArgs, params: { channel: 'setHidden' } }))
    expect(errorText('zh', withField)).toBe('调用参数不合契约:setHidden(字段 hidden)')
    expect(errorText('zh', noField)).toBe('调用参数不合契约:setHidden')
  })

  it('**六语各自都能把每个码渲染成非空且不含码本身的措辞**', () => {
    // 漏译由 typecheck 拦,但"填了个占位串"或"把码原样当措辞"typecheck 拦不住。
    // 遍历码 × 语言是唯一能抓这两种的手段
    for (const lang of LANGUAGES) {
      for (const code of Object.values(ERR)) {
        const text = errorText(lang, appError(code, { channel: 'c', field: 'f', i: 1, total: 2 }))
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toContain(code)
        expect(text).not.toContain('agentshed-error:')
      }
    }
  })

  it('旧式字符串错误原样显示,不崩不空白', () => {
    // 票 05 只迁主进程主体抛出点;preload 与契约层留给票 06,迁移期两种并存
    expect(errorText('zh', new Error('收到不合契约的偏好'))).toBe('收到不合契约的偏好')
    expect(errorText('zh', '随便一句话')).toBe('随便一句话')
  })

  it('非 Error 非字符串也给得出东西,不抛', () => {
    expect(errorText('zh', null)).toBe('null')
    expect(errorText('zh', undefined)).toBe('undefined')
    expect(errorText('zh', 42)).toBe('42')
  })
})
