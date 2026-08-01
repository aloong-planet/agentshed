// 渲染出的 markdown 链接的归宿判定(bug: 点击相对链接会让整窗导航、app state 全丢)。
// 纯函数 seam:给定 href + 当前文档目录 + 可读文件清单 → 归宿裁决;点击拦截本身在 UI 层。
import { describe, it, expect } from 'vitest'
import { resolveMdLink } from './md-links'

const READABLE = [
  '/p/.claude/projects/enc/memory/pr-merge.md',
  '/p/.claude/projects/enc/memory/verify-exit.md',
  '/p/docs/specs/memory-view.md',
  '/p/docs/features/memory-view.md'
]
const MEM_DIR = '/p/.claude/projects/enc/memory'

describe('resolveMdLink', () => {
  it('同目录相对链接 → 解析为可读文件,交 app 内打开', () => {
    expect(resolveMdLink('pr-merge.md', MEM_DIR, READABLE)).toEqual({
      kind: 'internal',
      file: '/p/.claude/projects/enc/memory/pr-merge.md'
    })
  })

  it('跨目录相对链接(../)在可读清单内 → 同样 app 内打开', () => {
    expect(resolveMdLink('../features/memory-view.md', '/p/docs/specs', READABLE)).toEqual({
      kind: 'internal',
      file: '/p/docs/features/memory-view.md'
    })
  })

  it('http(s) 外链 → 交系统浏览器,绝不在 app 窗口内导航', () => {
    expect(resolveMdLink('https://code.claude.com/docs', MEM_DIR, READABLE)).toEqual({
      kind: 'external',
      url: 'https://code.claude.com/docs'
    })
  })

  it('目标不在可读清单 → 明确拒绝(不静默无反应,也不放行导航)', () => {
    expect(resolveMdLink('missing.md', MEM_DIR, READABLE)).toEqual({
      kind: 'unresolved',
      reason: '目标不在可读范围'
    })
  })

  it('路径穿越:解析结果超出可读清单即拒绝(白名单是唯一放行依据)', () => {
    expect(resolveMdLink('../../../../etc/passwd', MEM_DIR, READABLE).kind).toBe('unresolved')
  })

  it('非 http 的危险协议一律拒绝(不当外链、更不导航)', () => {
    for (const h of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) {
      expect(resolveMdLink(h, MEM_DIR, READABLE).kind).toBe('unresolved')
    }
  })

  it('页内锚点 → 不做处理(交浏览器默认行为,不属于导航逃逸)', () => {
    expect(resolveMdLink('#section', MEM_DIR, READABLE)).toEqual({ kind: 'anchor' })
  })

  it('带锚点的相对链接 → 按去锚点后的路径解析', () => {
    expect(resolveMdLink('pr-merge.md#why', MEM_DIR, READABLE).kind).toBe('internal')
  })
})
