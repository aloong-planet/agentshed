// @vitest-environment jsdom
// Markdown render sanitising: scripts, event attributes and javascript: links are stripped; file:// images
// (what an artifact's relative image rewrites to) are admitted.
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './md'

describe('renderMarkdown', () => {
  it('ordinary markdown renders to HTML', () => {
    const html = renderMarkdown('# Heading\n\n**bold**')
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>bold</strong>')
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
    const html = renderMarkdown('![img](file:///Users/x/docs/adr/img.png)')
    expect(html).toContain('src="file:///Users/x/docs/adr/img.png"')
  })

  it('admits https links and data: images', () => {
    const html = renderMarkdown('[a](https://example.com) ![b](data:image/png;base64,AAAA)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('YAML frontmatter is split into a key-value card before the body is rendered', () => {
    const html = renderMarkdown(
      '---\nname: github-ops\ndescription: "Rules"\nwhen_to_use: "Activate"\n---\n\n# Heading\n'
    )
    expect(html).toContain('md-fm')
    expect(html).toContain('md-fm-k')
    expect(html).toContain('name')
    expect(html).toContain('github-ops')
    expect(html).toContain('when_to_use')
    expect(html).toContain('<h1>')
  })

  it('front matter opened with --- but never closed is not a card: its lines render as the body (memory-view E4)', () => {
    const view = rendered('---\nname: unclosed\ndescription: never closed\n\nBody text')
    expect(view.querySelector('.md-fm')).toBeNull()
    expect(view.textContent).toContain('name: unclosed')
    expect(view.textContent).toContain('Body text')
  })
})

/** The rendered HTML as a DOM, so assertions read what a reader sees rather than the markup's spelling */
function rendered(md: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderMarkdown(md)
  return host
}
/** The rendered text a reader sees, without the newlines that separate block markup */
const textOf = (md: string): string => (rendered(md).textContent ?? '').trim()

// memory-view::CON-002: text an agent writes stays text on every rendered surface — a [[…]] reference with
// whatever follows it, and a tag-like <name> whose name is not an HTML element. Shapes from real memory files.
describe('renderMarkdown keeps written text', () => {
  // A remark with no spaces — how Chinese prose writes one — is what makes it parse as a link destination
  it('[[name]] straight before a remark is text, the remark included, not a link', () => {
    expect(textOf('See [[pr-merge]](confirm-before-merging) here')).toBe('See [[pr-merge]](confirm-before-merging) here')
    expect(rendered('See [[pr-merge]](confirm-before-merging) here').querySelector('a')).toBeNull()
  })

  it('a [[name]] alone stays text; inside code nothing changes', () => {
    expect(textOf('A [[note]] here')).toBe('A [[note]] here')
    expect(rendered('Code `[[x]](y)` stays').querySelector('code')?.textContent).toBe('[[x]](y)')
  })

  it('an ordinary link is still a link', () => {
    const a = rendered('[text](https://example.com/t)').querySelector('a')
    expect(a?.textContent).toBe('text')
  })

  it('a placeholder whose name is not an HTML element shows as written, inline and on a line of its own', () => {
    expect(textOf('Records go to docs/.workings/<slug>/x.md')).toBe('Records go to docs/.workings/<slug>/x.md')
    expect(textOf('Use <spec-slug>::US-001 and <id>')).toBe('Use <spec-slug>::US-001 and <id>')
    expect(textOf('<slug>')).toBe('<slug>')
  })

  it('real HTML keeps rendering and is still sanitised; a placeholder named like an element is still taken as HTML', () => {
    expect(rendered('<b>bold</b> text').querySelector('b')?.textContent).toBe('bold')
    const scripted = rendered('hi\n\n<script>alert(1)</script>')
    expect(scripted.querySelector('script')).toBeNull()
    expect(scripted.textContent).not.toContain('alert(1)')
    expect(rendered('Type <input> here').textContent).not.toContain('<input>')
  })
})
