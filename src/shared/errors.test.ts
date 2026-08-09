// Encoding and decoding structured errors (ticket 05).
//
// **The carrier format was decided by measurement, not by preference**: when Electron sends an Error
// thrown by the main process back across IPC,
// its custom properties are all lost (measured: `Object.getOwnPropertyNames` leaves only `stack` /
// `message`),
// and the message is **wrapped** in a prefix of the form
//   `Error invoking remote method 'agentshed:get-project-detail': Error: <the original>`
// So the code and parameters can only be encoded into the message, and decoding has to extract the
// payload from **the wrapped** string —
// JSON.parse(message) directly does not work.
import { describe, it, expect } from 'vitest'
import { ERR, encodeAppError, decodeAppError, type AppError } from './errors'

/** The wrapping format as measured, copied into the fixture: it is data someone else (Electron) produces */
const wrap = (msg: string): string =>
  `Error invoking remote method 'agentshed:get-session-page': Error: ${msg}`

describe('encodeAppError / decodeAppError', () => {
  it('round trip: encoding then decoding gives back the same code and parameters', () => {
    const err: AppError = { code: ERR.turnOutOfRange, params: { i: 7, total: 3 } }
    expect(decodeAppError(encodeAppError(err))).toEqual(err)
  })

  it('can extract the payload from a message Electron has wrapped', () => {
    // This case is why this module exists. Decoding a bare string does not count — what reaches the
    // renderer in production is **always** wrapped
    const err: AppError = { code: ERR.sessionNotWhitelisted, params: {} }
    expect(decodeAppError(wrap(encodeAppError(err)))).toEqual(err)
  })

  it('paths and non-ASCII text in the parameters round-trip verbatim, undamaged by escaping', () => {
    const err: AppError = { code: ERR.badArgs, params: { channel: '会话/页 a"b\\c', field: 'i' } }
    expect(decodeAppError(wrap(encodeAppError(err)))).toEqual(err)
  })

  it('an old-style string error yields no payload and returns null (left to the caller to display as is)', () => {
    // Ticket 05 migrated only the main process's main throw sites, leaving preload and the contract layer
    // to ticket 06;
    // during migration the renderer has to cope with both, without crashing and without going blank
    expect(decodeAppError('会话打不开')).toBeNull()
    expect(decodeAppError(wrap('偏好存储未就绪'))).toBeNull()
    expect(decodeAppError('')).toBeNull()
  })

  it('a non-string input returns null without throwing', () => {
    // What the renderer catches is not guaranteed to be an Error; a type declaration is no runtime
    // guarantee
    expect(decodeAppError(null)).toBeNull()
    expect(decodeAppError(undefined)).toBeNull()
    expect(decodeAppError(123)).toBeNull()
    expect(decodeAppError({})).toBeNull()
  })

  it('bad JSON after the marker returns null rather than throwing', () => {
    // The escape surface: a parse failure should degrade to "display it as an old-style error", never blow
    // up a whole render
    expect(decodeAppError('agentshed-error:{不是 JSON')).toBeNull()
  })

  it('a code outside the enum returns null rather than passing an unknown code through', () => {
    // An unknown code reaching the renderer finds no wording and displays blank; falling back to the
    // original is better
    expect(decodeAppError('agentshed-error:{"code":"made-up","params":{}}')).toBeNull()
  })

  it('missing params is filled in as an empty object rather than producing undefined parameters', () => {
    expect(decodeAppError('agentshed-error:{"code":"engine-not-ready"}')).toEqual({
      code: ERR.engineNotReady,
      params: {}
    })
  })

  it('an Error instance decodes directly (from its message)', () => {
    const e = new Error(wrap(encodeAppError({ code: ERR.engineNotReady, params: {} })))
    expect(decodeAppError(e)).toEqual({ code: ERR.engineNotReady, params: {} })
  })
})
