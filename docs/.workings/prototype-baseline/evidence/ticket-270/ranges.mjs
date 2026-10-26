// Count, per prototype page, the inline scripts' comment ranges the parser finds, how many start inside an earlier one
// (the `pos < at` branch), and how many are trailing (after code on the same line)
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const ts = createRequire(join(process.cwd(), 'package.json'))('typescript')
const pages = []
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === 'vendor' || e.name.startsWith('.')) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p) } }
walk('docs/prototypes')
let total = 0, overlapping = 0, trailing = 0, scripts = 0
for (const f of pages) {
  const html = readFileSync(f, 'utf8')
  for (const m of html.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi)) {
    const code = m[2]; if (!code.trim()) continue; scripts++
    const sf = ts.createSourceFile('inline.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const comments = new Map()
    const visit = (node) => { for (const r of [...(ts.getLeadingCommentRanges(code, node.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(code, node.getEnd()) ?? [])]) comments.set(r.pos, r.end); for (const c of node.getChildren(sf)) visit(c) }
    visit(sf)
    let at = 0
    for (const [pos, end] of [...comments].sort((a, b) => a[0] - b[0])) {
      total++
      if (pos < at) { overlapping++; continue }
      const lineStart = code.lastIndexOf('\n', pos - 1) + 1
      if (code.slice(lineStart, pos).trim() !== '') trailing++
      at = end
    }
  }
}
console.log(`pages ${pages.length}, inline scripts with code ${scripts}, comment ranges ${total}, starting inside an earlier one ${overlapping}, after code on their line ${trailing}`)
