// Ticket 06: contract validation failures became structured (kind + path + expected/actual) and map to
// error codes.
//
// **Why a separate file**: validate.test.ts's existing 41 cases assert only `failure.path`,
// and watch **none** of the newly added kind / expect / value or the payload prefix — confirmed by
// mutation:
// hard-coding expect to 'string', or removing the payload prefix, leaves all 41 **green**.
// These cases fill exactly that gap.
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
  if (r.ok) throw new Error('expected validation to fail, but it passed')
  return r.failure
}

describe('contractError: a structured failure → an error code', () => {
  it('each of the three kinds maps to its own code', () => {
    const missing = decodeAppError(contractError('snapshot', { kind: 'missing', path: 'a.b' }))
    const type = decodeAppError(contractError('snapshot', { kind: 'type', path: 'a.b', expect: 'number' }))
    const enm = decodeAppError(contractError('snapshot', { kind: 'enum', path: 'a.b', value: 'x' }))
    expect(missing?.code).toBe(ERR.contractMissing)
    expect(type?.code).toBe(ERR.contractType)
    expect(enm?.code).toBe(ERR.contractEnum)
  })

  it('the payload name is folded into the path prefix: the locating information has to say which payload', () => {
    // The wording uses the generic word "payload", so losing the prefix makes a snapshot and a session
    // page indistinguishable —
    // measured by mutation: with the prefix removed, validate.test.ts's 41 cases are all green and only
    // this one goes red
    const e = decodeAppError(contractError('sessionPage', { kind: 'missing', path: 'questions[0].at' }))
    expect(e?.params['path']).toBe('sessionPage.questions[0].at')
  })

  it('type carries the type notation and enum carries the actual value', () => {
    const t = decodeAppError(contractError('snapshot', { kind: 'type', path: 'p', expect: 'string|null' }))
    expect(t?.params['expect']).toBe('string|null')
    const e = decodeAppError(contractError('snapshot', { kind: 'enum', path: 'p', value: 'gemini' }))
    expect(e?.params['value']).toBe('gemini')
  })
})

describe('the failure shapes validate produces', () => {
  it('a type mismatch → kind=type, with the expectation being that field\'s real type notation', () => {
    // An implementation that hard-codes one type goes red here (verified by mutation)
    const f = failureOf(validateSnapshot({ ...emptySnapshot(1), scannedAt: 'nope' }))
    expect(f).toEqual({ kind: 'type', path: 'scannedAt', expect: 'number' })
  })

  it('a missing container → kind=type with the container type expected, rather than a vague "missing"', () => {
    const f = failureOf(validateSnapshot({ ...emptySnapshot(1), projects: 'nope' }))
    expect(f).toEqual({ kind: 'type', path: 'projects', expect: 'array' })
  })

  it('an out-of-domain enum → kind=enum, carrying **the value actually received**', () => {
    // Carrying the actual value is the point: saying "invalid value" without it leaves the investigator
    // digging through the data
    const r = validateSessionPage({
      file: '/a.jsonl', side: 'gemini', title: 't', at: 1, tokens: 0, bytes: 0,
      forkState: 'none', forkPoints: [], forkParentTitle: null, forkParentFile: null, questions: []
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toEqual({ kind: 'enum', path: 'page.side', value: 'gemini' })
  })
})
