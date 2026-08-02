// app:// 路径解析(清单 #18):把可读范围锁死在渲染产物目录。
// 移植自 Transfer 项目同名测试,按本项目的 host/根路径调整。
import { describe, it, expect } from 'vitest'
import { resolveAppPath, APP_HOST } from './app-protocol'

const ROOT = '/app/out/renderer'
const u = (p: string): string => `app://${APP_HOST}${p}`

describe('resolveAppPath', () => {
  it('常规路径映射到产物根之下', () => {
    expect(resolveAppPath(ROOT, u('/index.html'))).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(ROOT, u('/assets/x.js'))).toBe('/app/out/renderer/assets/x.js')
  })

  it('空路径回落 index.html;查询串与锚点不进路径', () => {
    expect(resolveAppPath(ROOT, u('/'))).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(ROOT, u('/index.html?v=1#top'))).toBe('/app/out/renderer/index.html')
  })

  it('明文 .. 由 URL 解析器在 URL 层钳掉,结果仍落在产物根内(安全,非拒绝)', () => {
    // WHATWG URL 规范:路径不能越过根,`..` 被规范化掉。故这里期望的是
    // "被钳进根内"(随后自然 404),而不是 null——写成期望 null 是假断言。
    expect(resolveAppPath(ROOT, u('/../../../etc/passwd'))).toBe('/app/out/renderer/etc/passwd')
  })

  it('**编码穿越必须拒绝**——这是显式前缀检查唯一真正拦住的向量', () => {
    // %2e%2e%2f 在 URL 层不被解码,decodeURIComponent 之后才变成 ../,
    // 此时已绕过 URL 的钳制,只剩 normalize + 前缀检查这道防线。
    for (const p of ['/%2e%2e%2f%2e%2e%2fetc/passwd', '/assets/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc']) {
      expect(resolveAppPath(ROOT, u(p)), p).toBeNull()
    }
  })

  it('host 不对即拒绝(不接受任意 app://<host>)', () => {
    expect(resolveAppPath(ROOT, 'app://evil/index.html')).toBeNull()
  })

  it('URL 不可解析 → null(上层回 404,不抛)', () => {
    expect(resolveAppPath(ROOT, 'not a url')).toBeNull()
  })

  it('中文/空格路径经 decode 后正确映射', () => {
    expect(resolveAppPath(ROOT, u('/%E4%B8%AD%E6%96%87%20a.html'))).toBe(
      '/app/out/renderer/中文 a.html'
    )
  })
})
