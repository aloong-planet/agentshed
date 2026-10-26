// #270 feedback loop: remove a page's real reference to a shared asset, run `check:ui`, record what it says, and
// restore the page byte for byte (verified by hash) whatever happens.
// Usage: node plant.mjs <worktree>   — runs every plant below in turn
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.argv[2]
const sha = (b) => createHash('sha256').update(b).digest('hex')

/** Each plant: the page, the exact line it removes (must occur once), and what the gate should then report */
const PLANTS = [
  {
    name: 'P1 global search page without its app-window.css link (its header comment names the file)',
    file: 'docs/prototypes/global-search/prototype-search.html',
    line: '<link rel="stylesheet" href="../_shared/app-window.css">\n',
    expect: 'declares app-window but does not reference _shared/app-window.css'
  },
  {
    name: 'P2 project list page without its project-side.js script (a script comment names the file)',
    file: 'docs/prototypes/project-list/prototype-list.html',
    line: '  <script src="../_shared/project-side.js"></script>\n',
    expect: 'declares project-side but does not reference _shared/project-side.js'
  }
]

let failures = 0
for (const p of PLANTS) {
  const abs = join(root, p.file)
  const original = readFileSync(abs)
  const before = sha(original)
  const text = original.toString('utf8')
  if (text.split(p.line).length !== 2) throw new Error(`${p.file}: the line to remove does not occur exactly once`)
  try {
    writeFileSync(abs, text.replace(p.line, ''))
    // Independent proof that the plant reached the file the gate reads
    const planted = readFileSync(abs, 'utf8')
    console.log(`\n## ${p.name}`)
    console.log(`planted: ${p.file} lost ${JSON.stringify(p.line.trim())}; occurrences left ${planted.split(p.line.trim()).length - 1}`)
    const r = spawnSync(process.execPath, ['scripts/check-shared-ui.mjs'], { cwd: root, encoding: 'utf8' })
    const out = `${r.stdout}${r.stderr}`
    const relevant = out.split('\n').filter((l) => l.includes(p.file) || /^✗|^✓ shared block (app-window|project-side)/.test(l))
    console.log(`$ node scripts/check-shared-ui.mjs   → exit ${r.status}`)
    for (const l of relevant) console.log(`  ${l}`)
    const reported = out.includes(`${p.file}: ${p.expect}`)
    console.log(`reports "${p.expect}": ${reported ? 'yes' : 'no'}`)
    if (!reported || r.status === 0) failures++
  } finally {
    writeFileSync(abs, original)
    const after = sha(readFileSync(abs))
    console.log(`restored: sha256 ${after === before ? 'equal to' : 'DIFFERENT FROM'} the original (${before.slice(0, 12)})`)
    if (after !== before) process.exitCode = 3
  }
}
console.log(`\nPLANTS_NOT_CAUGHT=${failures}`)
process.exitCode ||= failures ? 1 : 0
