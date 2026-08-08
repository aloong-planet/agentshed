// 结构化错误的编解码(票 05)。
//
// **载体形态由实测决定,不是设计偏好**:Electron 把主进程抛出的 Error 跨 IPC 回传时,
// 自定义属性一律丢失(实测 `Object.getOwnPropertyNames` 只剩 `stack` / `message`),
// 且 message 会被**包一层**前缀,形如
//   `Error invoking remote method 'agentshed:get-project-detail': Error: <原文>`
// 所以码与参数只能编进 message,并且解码必须能从**被包裹的**串里把载荷抠出来——
// 直接 JSON.parse(message) 是行不通的。
import { describe, it, expect } from 'vitest'
import { ERR, encodeAppError, decodeAppError, type AppError } from './errors'

/** 实测得到的包裹形态,照抄进 fixture:它是他方(Electron)产生的数据 */
const wrap = (msg: string): string =>
  `Error invoking remote method 'agentshed:get-session-page': Error: ${msg}`

describe('encodeAppError / decodeAppError', () => {
  it('往返:编码后再解码得到同一个码与参数', () => {
    const err: AppError = { code: ERR.turnOutOfRange, params: { i: 7, total: 3 } }
    expect(decodeAppError(encodeAppError(err))).toEqual(err)
  })

  it('能从 Electron 包裹后的 message 里解出载荷', () => {
    // 这条是本模块存在的理由。裸串能解不算数——生产里到达渲染层的**永远**是包裹过的
    const err: AppError = { code: ERR.sessionNotWhitelisted, params: {} }
    expect(decodeAppError(wrap(encodeAppError(err)))).toEqual(err)
  })

  it('参数里的路径与中文原样往返,不被转义破坏', () => {
    const err: AppError = { code: ERR.badArgs, params: { channel: '会话/页 a"b\\c', field: 'i' } }
    expect(decodeAppError(wrap(encodeAppError(err)))).toEqual(err)
  })

  it('旧式字符串错误解不出载荷,返回 null(交给调用方原样显示)', () => {
    // 票 05 只迁主进程主体抛出点,preload / 契约层留给票 06;
    // 迁移期渲染层必须能同时应付两种,且不得崩、不得空白
    expect(decodeAppError('会话打不开')).toBeNull()
    expect(decodeAppError(wrap('偏好存储未就绪'))).toBeNull()
    expect(decodeAppError('')).toBeNull()
  })

  it('非字符串输入不抛,返回 null', () => {
    // 渲染层 catch 到的东西不保证是 Error;类型声明不构成运行时保证
    expect(decodeAppError(null)).toBeNull()
    expect(decodeAppError(undefined)).toBeNull()
    expect(decodeAppError(123)).toBeNull()
    expect(decodeAppError({})).toBeNull()
  })

  it('标记后面跟着坏 JSON 时返回 null,不抛', () => {
    // 逃逸面:解析失败只该退化成"当旧式错误显示",不该把渲染整段炸掉
    expect(decodeAppError('agentshed-error:{不是 JSON')).toBeNull()
  })

  it('码不在枚举内时返回 null,不透传未知码', () => {
    // 未知码到了渲染层会取不到措辞、显示空白;宁可退回原样显示
    expect(decodeAppError('agentshed-error:{"code":"made-up","params":{}}')).toBeNull()
  })

  it('缺 params 时补成空对象,不产生 undefined 参数', () => {
    expect(decodeAppError('agentshed-error:{"code":"engine-not-ready"}')).toEqual({
      code: ERR.engineNotReady,
      params: {}
    })
  })

  it('Error 实例可直接解(取其 message)', () => {
    const e = new Error(wrap(encodeAppError({ code: ERR.engineNotReady, params: {} })))
    expect(decodeAppError(e)).toEqual({ code: ERR.engineNotReady, params: {} })
  })
})
