import { readFileSync, writeFileSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const W = '/Users/loong_zhou/CascadeProjects/agentshed-wt/gs-exits'
const APP = `${W}/src/renderer/src/App.tsx`, SP = `${W}/src/renderer/src/SessionPane.tsx`
const I = (n) => ' '.repeat(n)
const M = [
  ['M1 the fork parent keeps the origin', APP, `setOpenFocusQ(null)\n${I(24)}setFromSearch(false)\n${I(22)}})\n${I(20)}}}\n${I(20)}exits={`, `setOpenFocusQ(null)\n${I(22)}})\n${I(20)}}}\n${I(20)}exits={`, 'E9'],
  ['M2 a session opened in the project keeps the origin', APP, `setBackToSessions(false)\n${I(24)}setFromSearch(false)\n${I(22)}})\n${I(20)}}}\n${I(18)}/>\n${I(16)}) : (`, `setBackToSessions(false)\n${I(22)}})\n${I(20)}}}\n${I(18)}/>\n${I(16)}) : (`, 'E9'],
  ['M3 the rail drops the origin', APP, `jumpSeq.current++\n    setDim(d)`, `jumpSeq.current++\n    setFromSearch(false)\n    setDim(d)`, 'E10'],
  ['M4 no project is taken as stale', APP, `stale: snap.projects.find((p) => p.path === shownProject)?.stale ?? false,`, `stale: false,`, 'E9'],
  ['M5 back to the results goes to Projects', APP, `onBackToSearch: () => navigate('search'),`, `onBackToSearch: () => navigate('projects'),`, 'E8, E10'],
  ['M6 going into the project lands on its first tab', APP, `setBackToSessions(true)\n${I(32)}setFromSearch(false)`, `setBackToSessions(false)\n${I(32)}setFromSearch(false)`, 'E9'],
  ['M7 the back exit takes the right chevron', SP, `<ChevronLeft size={12} />\n${I(16)}<span>{t.session.backToSearch}</span>`, `<ChevronRight size={12} />\n${I(16)}<span>{t.session.backToSearch}</span>`, 'E8'],
  ['M8 the stale exit keeps "· Sessions"', SP, `{exits.stale ? t.session.goToProjectStale(projectName) : t.session.goToProject(projectName)}`, `{t.session.goToProject(projectName)}`, 'E9'],
  ['M9 choosing a project keeps the origin (expected equivalent)', APP, `setBackToSessions(false)\n${I(6)}setFromSearch(false)\n${I(4)}})`, `setBackToSessions(false)\n${I(4)}})`, 'none (equivalent)'],
  ['M10 going into the project keeps the origin (expected equivalent)', APP, `setBackToSessions(true)\n${I(32)}setFromSearch(false)`, `setBackToSessions(true)`, 'none (equivalent)']
]
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const before = { [APP]: hash(APP), [SP]: hash(SP) }
const results = []
for (const [name, file, from, to, expect] of M) {
  const orig = readFileSync(file)
  const text = orig.toString('utf8')
  const n = text.split(from).length - 1
  if (n !== 1) { results.push({ name, error: `anchor matched ${n} times` }); continue }
  try {
    writeFileSync(file, text.replace(from, to))
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
