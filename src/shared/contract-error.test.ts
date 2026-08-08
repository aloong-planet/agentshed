// 票 06:契约校验失败改为结构化(kind + path + 期望/取值),并映射到错误码。
//
// **为什么单开一个文件**:validate.test.ts 原有的 41 条只断言 `failure.path`,
// 对本次新增的 kind / expect / value 与载荷前缀**一条都没盯**——变异实测确认:
// 把 expect 写死成 'string'、或把载荷前缀去掉,那 41 条**全绿**。
// 这些用例补的正是那块空白。
import { describe, it, expect } from 'vitest'
import {
  contractError,
  validateSnapshot,
  validateSessionPage,
  type ValidateFailure
} from './validate'
import { ERR, decodeAppError } from './errors'
import { emptySnapshot } from './domain'

const failureOf = (r: ReturnType<typeof validateSnapshot>): ValidateFailure => {
  if (r.ok) throw new Error('期望校验失败,却通过了')
  return r.failure
}

describe('contractError:结构化失败 → 错误码', () => {
  it('三种 kind 各映射到自己的码', () => {
    const missing = decodeAppError(contractError('snapshot', { kind: 'missing', path: 'a.b' }))
    const type = decodeAppError(contractError('snapshot', { kind: 'type', path: 'a.b', expect: 'number' }))
    const enm = decodeAppError(contractError('snapshot', { kind: 'enum', path: 'a.b', value: 'x' }))
    expect(missing?.code).toBe(ERR.contractMissing)
    expect(type?.code).toBe(ERR.contractType)
    expect(enm?.code).toBe(ERR.contractEnum)
  })

  it('载荷名并进 path 前缀:定位信息里要看得出是哪份载荷', () => {
    // 措辞用的是泛称「载荷」,若前缀丢了就再也分不出这是快照还是会话页——
    // 变异实测:去掉前缀时 validate.test.ts 的 41 条全绿,只有这条会红
    const e = decodeAppError(contractError('sessionPage', { kind: 'missing', path: 'questions[0].at' }))
    expect(e?.params['path']).toBe('sessionPage.questions[0].at')
  })

  it('type 携带类型记法、enum 携带实际取值', () => {
    const t = decodeAppError(contractError('snapshot', { kind: 'type', path: 'p', expect: 'string|null' }))
    expect(t?.params['expect']).toBe('string|null')
    const e = decodeAppError(contractError('snapshot', { kind: 'enum', path: 'p', value: 'gemini' }))
    expect(e?.params['value']).toBe('gemini')
  })
})

describe('validate 产出的失败形态', () => {
  it('类型不符 → kind=type,且期望是该字段真正的类型记法', () => {
    // 写死成某一个类型的实现会在这里红(变异实测过)
    const f = failureOf(validateSnapshot({ ...emptySnapshot(1), scannedAt: 'nope' }))
    expect(f).toEqual({ kind: 'type', path: 'scannedAt', expect: 'number' })
  })

  it('容器缺失 → kind=type 且期望容器类型,不是笼统的"缺失"', () => {
    const f = failureOf(validateSnapshot({ ...emptySnapshot(1), projects: 'nope' }))
    expect(f).toEqual({ kind: 'type', path: 'projects', expect: 'array' })
  })

  it('枚举越界 → kind=enum,且带上**实际收到的值**', () => {
    // 带上实际值是这条的重点:只说"取值非法"不带值,排查时还得自己去翻数据
    const r = validateSessionPage({
      file: '/a.jsonl', side: 'gemini', title: 't', at: 1, tokens: 0, bytes: 0,
      forkState: 'none', forkPoints: [], forkParentTitle: null, forkParentFile: null, questions: []
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toEqual({ kind: 'enum', path: 'page.side', value: 'gemini' })
  })
})
