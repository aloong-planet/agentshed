// Reading the system's preferred languages: the test-only override, and a platform query that fails
// (i18n::REQ-002/AC-02).
//
// The failing query is real here, not mocked: under vitest `electron` is the empty stub
// (src/main/testing/electron-stub.ts), so `app` is undefined and the platform probe throws inside the
// module's try. That throw stands in for a platform query that fails; what the case asserts is that it
// degrades to an empty list, which the resolution layer turns into English.
import { describe, it, expect, afterEach } from 'vitest'
import { app } from 'electron'
import { effectiveLanguage } from '@shared/i18n'
import { systemPreferredLanguages } from './system-language'

const KEY = 'AGENTSHED_SYSTEM_LANGUAGES'
const before = process.env[KEY]

describe('systemPreferredLanguages', () => {
  afterEach(() => {
    if (before === undefined) delete process.env[KEY]
    else process.env[KEY] = before
  })

  it('the override is a comma-separated list, trimmed, with empty entries dropped', () => {
    process.env[KEY] = 'zh-Hans-CN, en-US'
    expect(systemPreferredLanguages()).toEqual(['zh-Hans-CN', 'en-US'])
    process.env[KEY] = ' , '
    expect(systemPreferredLanguages()).toEqual([])
    process.env[KEY] = ''
    expect(systemPreferredLanguages()).toEqual([])
  })

  it('a platform query that fails gives an empty list, and so English, without throwing', () => {
    // The premise: the stub exports no `app`, so the probe throws. Were the stub to grow one, this case would stop
    // reaching the catch, and this line says so
    expect(app).toBeUndefined()
    delete process.env[KEY]
    expect(systemPreferredLanguages()).toEqual([])
    expect(effectiveLanguage('system', systemPreferredLanguages())).toBe('en')
  })
})
