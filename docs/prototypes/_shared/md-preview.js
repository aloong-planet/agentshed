// The shared md-preview block: a markdown raw/preview toggle, reusable across prototypes.
// Dependency: window.marked (UMD) is optional. Without it the preview degrades to escaped plain text.
// API:
//   MdPreview.isMarkdown(pathOrName) -> boolean
//   MdPreview.render(md) -> html string
//   MdPreview.mount(el, { name, text, mode? }) -> { set({name,text,mode?}), destroy() }
// A use site adds data-shared-block="md-preview" to its container.
;(function (global) {
  const MD_EXT = /\.(md|markdown|mdx)$/i

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function isMarkdown(name) {
    if (!name) return false
    const base = String(name).split('/').pop() || ''
    return MD_EXT.test(base)
  }

  /** Extremely light code block colouring (prototype-grade, not a full highlighter) */
  function colorCode(html) {
    return html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_, attrs, body) => {
      let s = body
      s = s.replace(/(^|\n)(\s*#(?!!).*|\/\/.*|<!--[\s\S]*?-->)/g, (m, a, b) => `${a}<span class="tok-c">${b}</span>`)
      s = s.replace(/(&quot;|&#39;|"|')(?:(?!\1)[^\\]|\\.)*\1/g, (m) => `<span class="tok-s">${m}</span>`)
      s = s.replace(
        /\b(function|const|let|var|return|if|else|for|while|import|export|from|class|async|await|true|false|null|undefined|name|on|jobs|runs-on|steps|uses|with|run|bash|pnpm|git|echo)\b/g,
        '<span class="tok-k">$1</span>'
      )
      return `<pre><code${attrs}>${s}</code></pre>`
    })
  }

  /** Split out YAML frontmatter (--- ... ---); common in a skill package's SKILL.md */
  function splitFrontmatter(src) {
    const m = String(src).match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/)
    if (!m) return { fields: null, body: src }
    return { fields: parseYamlFields(m[1]), body: m[2] }
  }

  /**
   * Prototype-grade YAML line parsing: enough for single-line keys such as name/description/when_to_use;
   * continuation lines merge into the previous entry, and one layer of quotes is stripped. Not full YAML.
   */
  function parseYamlFields(block) {
    const fields = []
    let cur = null
    const lines = String(block).split(/\r?\n/)
    for (const line of lines) {
      const kv = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
      if (kv) {
        if (cur) fields.push(cur)
        let val = kv[2]
        // Strip one layer of "..." or '...'
        if (
          (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
          (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
        ) {
          val = val.slice(1, -1)
        }
        cur = { key: kv[1], value: val }
      } else if (cur && line.trim() !== '') {
        cur.value += (cur.value ? ' ' : '') + line.trim()
      }
    }
    if (cur) fields.push(cur)
    return fields
  }

  function renderFrontmatter(fields) {
    if (!fields || !fields.length) return ''
    const rows = fields
      .map((f) => {
        return `<div class="md-fm-row">
          <div class="md-fm-k">${escapeHtml(f.key)}</div>
          <div class="md-fm-v">${escapeHtml(f.value)}</div>
        </div>`
      })
      .join('')
    return `<div class="md-fm" aria-label="frontmatter">${rows}</div>`
  }

  function render(md) {
    const src = md == null ? '' : String(md)
    const { fields, body } = splitFrontmatter(src)
    const marked = global.marked
    let html = null
    try {
      if (marked && typeof marked.parse === 'function') {
        html = marked.parse(body, { async: false, gfm: true, breaks: false })
      } else if (marked && typeof marked === 'function') {
        html = marked(body)
      }
    } catch (e) {
      return (
        renderFrontmatter(fields) +
        `<pre class="md-preview-empty">Markdown 解析失败:${escapeHtml(String(e))}</pre>`
      )
    }
    if (html == null) {
      return renderFrontmatter(fields) + `<pre>${escapeHtml(body)}</pre>`
    }
    return renderFrontmatter(fields) + colorCode(String(html))
  }

  function mount(el, opts) {
    if (!el) throw new Error('MdPreview.mount: el required')
    el.setAttribute('data-shared-block', 'md-preview')
    el.classList.add('md-preview')

    let name = (opts && opts.name) || ''
    let text = (opts && opts.text) != null ? String(opts.text) : ''
    let mode = opts && opts.mode === 'raw' ? 'raw' : 'preview'

    // The skeleton is built once; switching raw/preview only changes the body and the button state, so a
    // full rebuild never swallows the click
    el.innerHTML = ''
    const bar = document.createElement('div')
    bar.className = 'md-preview-bar'
    const nm = document.createElement('span')
    nm.className = 'md-preview-name'
    bar.appendChild(nm)

    const seg = document.createElement('div')
    seg.className = 'md-preview-seg'
    seg.hidden = true
    const bRaw = document.createElement('button')
    bRaw.type = 'button'
    // Uses data-md-mode to avoid colliding with the page's light/dark harness [data-mode]
    bRaw.setAttribute('data-md-mode', 'raw')
    bRaw.textContent = '原文'
    const bPrev = document.createElement('button')
    bPrev.type = 'button'
    bPrev.setAttribute('data-md-mode', 'preview')
    bPrev.textContent = '预览'
    bPrev.title = '渲染 Markdown'
    seg.appendChild(bRaw)
    seg.appendChild(bPrev)
    bar.appendChild(seg)
    el.appendChild(bar)

    const body = document.createElement('div')
    body.className = 'md-preview-body raw'
    el.appendChild(body)

    function paint() {
      const canPreview = isMarkdown(name)
      if (!canPreview) mode = 'raw'
      else if (mode !== 'raw' && mode !== 'preview') mode = 'preview'

      nm.textContent = name || '(未命名)'
      // Only markdown files show the toggle; other types hide the segment and stay raw
      seg.hidden = !canPreview
      bRaw.classList.toggle('on', mode === 'raw')
      bPrev.classList.toggle('on', canPreview && mode === 'preview')

      const showPreview = canPreview && mode === 'preview'
      body.className = 'md-preview-body ' + (showPreview ? 'preview' : 'raw')
      if (text === '') {
        body.innerHTML = '<div class="md-preview-empty">空文件</div>'
      } else if (showPreview) {
        body.innerHTML = render(text)
      } else {
        body.textContent = text
      }
    }

    function setMode(next) {
      if (!isMarkdown(name)) return
      if (next !== 'raw' && next !== 'preview') return
      if (next === mode) return
      mode = next
      paint()
    }
    // Bound directly to the buttons (steadier than delegation; with no full rebuild the handlers persist)
    bRaw.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      setMode('raw')
    })
    bPrev.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      setMode('preview')
    })

    paint()
    return {
      set(next) {
        if (next.name != null) name = next.name
        if (next.text != null) text = String(next.text)
        if (next.mode === 'raw' || next.mode === 'preview') mode = next.mode
        paint()
      },
      destroy() {
        el.innerHTML = ''
        el.classList.remove('md-preview')
      }
    }
  }

  global.MdPreview = { isMarkdown, render, mount }
})(typeof window !== 'undefined' ? window : globalThis)
