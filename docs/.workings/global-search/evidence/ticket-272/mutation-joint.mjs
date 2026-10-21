import { readFileSync, writeFileSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const W = '/Users/loong_zhou/CascadeProjects/agentshed-wt/gs-exits'
const APP = `${W}/src/renderer/src/App.tsx`, SP = `${W}/src/renderer/src/SessionPane.tsx`
const I = (n) => ' '.repeat(n)
const M = [
  ['M11 the origin is never cleared on the way into the project (M2, M9 and M10 together)', APP, null, null, 'E9']
]
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const before = { [APP]: hash(APP), [SP]: hash(SP) }
const results = []
for (const [name, file, from, to, expect] of M) {
  const orig = readFileSync(file)
  const text = orig.toString('utf8')
  const edits = [
    [`setBackToSessions(false)\n${I(24)}setFromSearch(false)\n${I(22)}})\n${I(20)}}}\n${I(18)}/>\n${I(16)}) : (`, `setBackToSessions(false)\n${I(22)}})\n${I(20)}}}\n${I(18)}/>\n${I(16)}) : (`],
    [`setBackToSessions(false)\n${I(6)}setFromSearch(false)\n${I(4)}})`, `setBackToSessions(false)\n${I(4)}})`],
    [`setBackToSessions(true)\n${I(32)}setFromSearch(false)`, `setBackToSessions(true)`]
  ]
  let mutated = text
  let bad = null
  for (const [a, b] of edits) { const n = mutated.split(a).length - 1; if (n !== 1) bad = `anchor matched ${n} times: ${a.slice(0, 40)}`; else mutated = mutated.replace(a, b) }
  if (bad) { results.push({ name, error: bad }); continue }
  try {
    writeFileSync(file, mutated)
    // Reach: the built renderer must differ from the unmutated build's
    const b = spawnSync('pnpm', ['build'], { cwd: W, encoding: 'utf8' })
    if (b.status !== 0) { results.push({ name, error: 'build failed', out: b.stdout.slice(-2000) + b.stderr.slice(-2000) }); continue }
    const r = spawnSync('npx', ['playwright', 'test', 'e2e/global-search.spec.ts', '-g', 'a session opened from a hit|on into the project|leaving the session|going to a hit'], { cwd: W, encoding: 'utf8' })
    const out = r.stdout + r.stderr
    const failed = [...out.matchAll(/✘\s+\d+ e2e\/global-search\.spec\.ts:(\d+):\d+ › ([^(\n]{0,60})/g)].map((m) => `${m[1]} ${m[2].trim()}`)
    const errs = [...out.matchAll(/> (\d+) \|([^\n]{0,140})/g)].map((m) => `${m[1]}:${m[2].trim()}`)
    results.push({ name, expect, exit: r.status, failed, errorLines: errs })
  } finally {
    writeFileSync(file, orig)
  }
}
const after = { [APP]: hash(APP), [SP]: hash(SP) }
console.log(JSON.stringify({ results, restored: before[APP] === after[APP] && before[SP] === after[SP] }, null, 1))
const b = spawnSync('pnpm', ['build'], { cwd: W, encoding: 'utf8' })
console.log('final rebuild exit', b.status)
