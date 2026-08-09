// @vitest-environment jsdom
// Markdown render sanitising: scripts, event attributes and javascript: links are stripped; file:// images
// (what an artifact's relative image rewrites to) are admitted.
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './md'

describe('renderMarkdown', () => {
  it('ordinary markdown renders to HTML', () => {
    const html = renderMarkdown('# 标题\n\n**加粗**')
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>加粗</strong>')
  })

  it('strips <script>', () => {
    const html = renderMarkdown('hi\n\n<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('strips event attributes (onerror)', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('strips javascript: links', () => {
    const html = renderMarkdown('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('admits file:// images (the form an artifact\'s relative path rewrites to)', () => {
    const html = renderMarkdown('![图](file:///Users/x/docs/adr/img.png)')
    expect(html).toContain('src="file:///Users/x/docs/adr/img.png"')
  })

  it('admits https links and data: images', () => {
    const html = renderMarkdown('[a](https://example.com) ![b](data:image/png;base64,AAAA)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('YAML frontmatter is split into a key-value card before the body is rendered', () => {
    const html = renderMarkdown(
      '---\nname: github-ops\ndescription: "Rules"\nwhen_to_use: "Activate"\n---\n\n# 标题\n'
    )
    expect(html).toContain('md-fm')
    expect(html).toContain('md-fm-k')
    expect(html).toContain('name')
    expect(html).toContain('github-ops')
    expect(html).toContain('when_to_use')
    expect(html).toContain('<h1>')
  })
})
