// @vitest-environment jsdom
// Markdown 渲染消毒:script/事件属性/javascript: 链接剥除;file:// 图片(产物相对图重写产物)放行。
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './md'

describe('renderMarkdown', () => {
  it('正常 Markdown 渲染为 HTML', () => {
    const html = renderMarkdown('# 标题\n\n**加粗**')
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>加粗</strong>')
  })

  it('剥除 <script>', () => {
    const html = renderMarkdown('hi\n\n<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('剥除事件属性(onerror)', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('剥除 javascript: 链接', () => {
    const html = renderMarkdown('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('放行 file:// 图片(产物相对路径重写后的形态)', () => {
    const html = renderMarkdown('![图](file:///Users/x/docs/adr/img.png)')
    expect(html).toContain('src="file:///Users/x/docs/adr/img.png"')
  })

  it('放行 https 链接与 data: 图片', () => {
    const html = renderMarkdown('[a](https://example.com) ![b](data:image/png;base64,AAAA)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })
})
