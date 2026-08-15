// A structured error → wording in the current language (ticket 05).
import { describe, it, expect } from 'vitest'
import { ERR, appError, encodeAppError } from './errors'
import { errorText } from './error-text'
import { LANGUAGES } from './i18n'

const wrap = (msg: string): string =>
  `Error invoking remote method 'agentshed:get-session-page': Error: ${msg}`

describe('errorText', () => {
  it('renders the same code according to the current language', () => {
    const raw = wrap(encodeAppError({ code: ERR.engineNotReady, params: {} }))
    expect(errorText('zh', raw)).toBe('扫描引擎未就绪,请稍候再试')
    expect(errorText('ja', raw)).toBe('スキャンエンジンの準備ができていません。少し待って再試行してください')
    expect(errorText('ru', raw)).toContain('сканирования')
  })

  it('a parameterised code interpolates its parameters into the wording', () => {
    const raw = wrap(encodeAppError({ code: ERR.turnOutOfRange, params: { i: 7, total: 3 } }))
    expect(errorText('zh', raw)).toBe('轮次下标越界:7(共 3 轮)')
    expect(errorText('en', raw)).toBe('Turn index out of range: 7 (of 3 turns)')
  })

  it('an absent optional parameter leaves no empty brackets in the wording', () => {
    const withField = wrap(encodeAppError({ code: ERR.badArgs, params: { channel: 'setMode', field: 'mode' } }))
    const noField = wrap(encodeAppError({ code: ERR.badArgs, params: { channel: 'setMode' } }))
    expect(errorText('zh', withField)).toBe('调用参数不合契约:setMode(字段 mode)')
    expect(errorText('zh', noField)).toBe('调用参数不合契约:setMode')
  })

  it('**every code renders in all six languages into wording that is non-empty and does not contain the code itself**', () => {
    // Typecheck catches a missing translation, but not "a placeholder string was filled in" or "the code
    // itself was used as the wording".
    // Iterating codes × languages is the only way to catch those two
    for (const lang of LANGUAGES) {
      for (const code of Object.values(ERR)) {
        const text = errorText(lang, appError(code, { channel: 'c', field: 'f', i: 1, total: 2 }))
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toContain(code)
        expect(text).not.toContain('agentshed-error:')
      }
    }
  })

  it('an old-style string error displays as is, without crashing or going blank', () => {
    // Ticket 05 migrated only the main process's main throw sites; preload and the contract layer were
    // left to ticket 06, so both coexist during migration
    expect(errorText('zh', new Error('收到不合契约的偏好'))).toBe('收到不合契约的偏好')
    expect(errorText('zh', '随便一句话')).toBe('随便一句话')
  })

  it('something neither an Error nor a string still produces output rather than throwing', () => {
    expect(errorText('zh', null)).toBe('null')
    expect(errorText('zh', undefined)).toBe('undefined')
    expect(errorText('zh', 42)).toBe('42')
  })
})
