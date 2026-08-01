// Electron 宿主安全守卫的判定层(清单 #13/#14/#15/#12)。
// 为什么要有这套测试:调研(2026-08-02)确认——官方运行时 Security Warnings **不覆盖**
// 第 12~14 条(源码注释明标"未实现"),Electronegativity 已停更且在"只写了
// setWindowOpenHandler、没写 will-navigate"时**静默放行**(恰是本项目曾经的形态)。
// 即没有任何现成工具能守住这类回归,故判定层做成纯函数并在此固化。
import { describe, it, expect } from 'vitest'
import { isAppUrl, externalOpenTarget, assertTrustedSender, cspFor } from './security'

const DEV = 'http://localhost:5173'

describe('isAppUrl(导航放行判定 · #13)', () => {
  it('dev:同 origin 放行,含子路径与查询串', () => {
    expect(isAppUrl(`${DEV}/index.html`, DEV)).toBe(true)
    expect(isAppUrl(`${DEV}/index.html?x=1#a`, DEV)).toBe(true)
  })

  it('dev:**前缀相同但 origin 不同**必须拒绝(官方点名的 startsWith 绕过)', () => {
    expect(isAppUrl('http://localhost:5173.attacker.com/x', DEV)).toBe(false)
    expect(isAppUrl('http://localhost:51730/x', DEV)).toBe(false)
    expect(isAppUrl('https://localhost:5173/x', DEV)).toBe(false) // 协议不同即不同 origin
  })

  it('prod(无 dev base):放行 app://(#18 起的渲染页)与 file:,其余一律拒绝', () => {
    expect(isAppUrl('app://bundle/index.html', undefined)).toBe(true)
    expect(isAppUrl('file:///app/out/renderer/index.html', undefined)).toBe(true)
    expect(isAppUrl('https://example.com', undefined)).toBe(false)
    expect(isAppUrl('http://localhost:5173/', undefined)).toBe(false)
  })

  it('URL 解析失败 → 拒绝(不放行不可解析的输入)', () => {
    expect(isAppUrl('not a url', DEV)).toBe(false)
    expect(isAppUrl('', DEV)).toBe(false)
  })
})

describe('externalOpenTarget(交系统浏览器的白名单 · #15)', () => {
  it('http/https 放行,返回规范化后的 href', () => {
    expect(externalOpenTarget('https://code.claude.com/docs')).toBe('https://code.claude.com/docs')
    expect(externalOpenTarget('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })

  it('**协议白名单而非黑名单**:非 http(s) 一律拒绝', () => {
    for (const u of [
      'file:///etc/passwd',
      'smb://server/share',
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'vscode://x',
      'mailto:a@b.c'
    ]) {
      expect(externalOpenTarget(u), u).toBeNull()
    }
  })

  it('大小写与畸形不得绕过(官方警告的字符串比较陷阱)', () => {
    expect(externalOpenTarget('HTTPS://example.com/')).toBe('https://example.com/')
    expect(externalOpenTarget('JaVaScRiPt:alert(1)')).toBeNull()
    // userinfo 里塞可信域名:真实 host 是 evil.com,放行但必须以真实 origin 打开
    const u = externalOpenTarget('https://code.claude.com@evil.com/x')
    expect(u === null || new URL(u).hostname === 'evil.com').toBe(true)
  })

  it('不可解析 → 拒绝', () => {
    expect(externalOpenTarget('')).toBeNull()
    expect(externalOpenTarget('://x')).toBeNull()
  })
})

describe('cspFor(内容安全策略 · #7)', () => {
  it('prod:不放 unsafe-eval / unsafe-inline script,外联被 default-src self 挡住', () => {
    const p = cspFor(false)
    expect(p).toContain("script-src 'self'")
    expect(p).not.toContain('unsafe-eval')
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(p).toContain("default-src 'self'")
  })

  it('两档都禁 object/frame/base-uri/form-action(消除子框架与表单外发面)', () => {
    for (const p of [cspFor(true), cspFor(false)]) {
      expect(p).toContain("object-src 'none'")
      expect(p).toContain("frame-src 'none'")
      expect(p).toContain("base-uri 'none'")
      expect(p).toContain("form-action 'none'")
    }
  })

  it('img-src 不含 http(s):markdown 里的外部追踪图不得外联(隐私)', () => {
    for (const p of [cspFor(true), cspFor(false)]) {
      const img = /img-src ([^;]*)/.exec(p)?.[1] ?? ''
      expect(img).toContain("'self'")
      expect(img).toContain('data:')
      expect(img).not.toMatch(/https?:/)
    }
  })

  it('dev:放宽给 vite HMR(inline+eval+ws),否则开发环境跑不起来', () => {
    const d = cspFor(true)
    expect(d).toContain('unsafe-eval')
    expect(d).toContain('ws:')
  })
})

describe('assertTrustedSender(IPC 调用方校验 · #17)', () => {
  it('本 app 页面放行', () => {
    expect(() => assertTrustedSender(`${DEV}/index.html`, DEV)).not.toThrow()
    expect(() => assertTrustedSender('file:///app/out/renderer/index.html', undefined)).not.toThrow()
  })

  it('外部页面抛错(被导航走的 renderer 仍持通道 → 这层挡住)', () => {
    expect(() => assertTrustedSender('https://evil.com/', DEV)).toThrow(/不可信/)
  })

  it('无 sender(frame 已销毁等)按不可信处理', () => {
    expect(() => assertTrustedSender(undefined, DEV)).toThrow(/不可信/)
  })
})
