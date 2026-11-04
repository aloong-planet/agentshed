// A structured error → wording in the current language (ticket 05).
import { describe, it, expect } from 'vitest'
import { ERR, appError, encodeAppError } from './errors'
import { errorText } from './error-text'
import { LANGUAGES, dictOf } from './i18n'

const wrap = (msg: string): string =>
  `Error invoking remote method 'agentshed:get-session-page': Error: ${msg}`

describe('errorText', () => {
  it('renders the same code according to the current language', () => {
    const raw = wrap(encodeAppError({ code: ERR.engineNotReady, params: {} }))
    expect(errorText('zh', raw)).toBe('扫描引擎未就绪,请稍候再试')
    expect(errorText('en', raw)).toBe('The scan engine is not ready yet — please try again shortly')
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

  it('**every code renders in both languages into wording that is non-empty and does not contain the code itself**', () => {
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

  // i18n Structured errors: each states the failure in a sentence, with no system error and no parser's text
  it('a registry that cannot be read and a corrupt one say different things, each with the file', () => {
    const unreadable = appError(ERR.registryUnreadable, { path: '/h/.claude.json' })
    const corrupt = appError(ERR.registryParseFailed, { path: '/h/.claude.json' })
    expect(errorText('en', unreadable)).toBe('The registry cannot be read: /h/.claude.json')
    expect(errorText('zh', unreadable)).toBe('注册表不可读:/h/.claude.json')
    expect(errorText('en', corrupt)).toBe('The registry is corrupt: /h/.claude.json')
    expect(errorText('zh', corrupt)).toBe('注册表已损坏:/h/.claude.json')
  })

  it('a failed skill copy and a failed skill delete', () => {
    expect(errorText('en', appError(ERR.skillCopyFailed))).toBe('Copy failed and was cleaned up')
    expect(errorText('zh', appError(ERR.skillCopyFailed))).toBe('复制失败,已清理')
    const del = appError(ERR.skillDeleteFailed, { path: '/p/.claude/skills/tidy' })
    expect(errorText('en', del)).toBe('It could not be fully deleted: /p/.claude/skills/tidy')
    expect(errorText('zh', del)).toBe('未能完全删除 /p/.claude/skills/tidy')
  })

  it('a landing\'s failure notice uses each language\'s punctuation', () => {
    expect(dictOf('en').agents.landingFailed('tidy', 'proj', 'claude', 'Copy failed and was cleaned up')).toBe('tidy → proj (claude): Copy failed and was cleaned up')
    expect(dictOf('zh').agents.landingFailed('tidy', 'proj', 'claude', '复制失败,已清理')).toBe('tidy → proj(claude):复制失败,已清理')
  })

  it('the uninstall notice names the skill around its reason', () => {
    expect(dictOf('en').detail.uninstallFailed('tidy', 'Invalid skill name')).toBe('Couldn’t uninstall tidy. Invalid skill name')
    expect(dictOf('zh').detail.uninstallFailed('tidy', '非法 skill 名')).toBe('卸载 tidy 失败:非法 skill 名')
  })

  it('a subagent toml that fails to parse, and a session in no supported format', () => {
    expect(errorText('en', appError(ERR.subagentTomlFailed))).toBe('Failed to parse the toml (corrupt or a syntax error); Codex itself will not load it either')
    expect(errorText('zh', appError(ERR.subagentTomlFailed))).toBe('toml 解析失败(损坏或语法错误);Codex 本身也不会加载它')
    expect(errorText('en', appError(ERR.sessionParseFailed))).toBe('The session file cannot be read (has its format changed?)')
    expect(errorText('zh', appError(ERR.sessionParseFailed))).toBe('会话文件不可读(格式已变更?)')
  })

  // The display cache keeps a side's error and a subagent's as the scan left them, and the contract admits any params
  // record, so a snapshot saved by an older version comes back holding `detail` until the first scan replaces it
  it('a saved snapshot still holding the old detail parameter shows the sentence alone', () => {
    const old = { detail: 'SyntaxError: Expected property name in JSON at position 1' }
    expect(errorText('en', appError(ERR.registryParseFailed, old))).toBe('The registry is corrupt')
    expect(errorText('zh', appError(ERR.registryParseFailed, old))).toBe('注册表已损坏')
    expect(errorText('en', appError(ERR.subagentTomlFailed, old))).toBe('Failed to parse the toml (corrupt or a syntax error); Codex itself will not load it either')
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
