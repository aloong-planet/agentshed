// The owner-requested increment's proof (2026-10-28): each of the page and turn handlers' arguments to the question
// identity dropped at both call sites — the text, the byte range, both (F7's) — must turn the restart case red. Each
// mutation is checked in the built main bundle before the case runs; index.ts is restored byte for byte in finally.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const WT = '/Users/loong_zhou/CascadeProjects/agentshed-session-resume'
const run = (cmd, args) => { try { return { code: 0, out: execFileSync(cmd, args, { cwd: WT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 26 }) } } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } } }
const path = `${WT}/src/main/index.ts`
const PAGE = 'questionRevision(identity, file, rec[0], rec[1], texts[idx])'
const TURN = 'questionRevision(identity, file, rec[0], rec[1], texts[0])'
const mutations = {
  text: [[PAGE, "questionRevision(identity, file, rec[0], rec[1], '')"], [TURN, "questionRevision(identity, file, rec[0], rec[1], '')"]],
  range: [[PAGE, 'questionRevision(identity, file, 0, 0, texts[idx])'], [TURN, 'questionRevision(identity, file, 0, 0, texts[0])']],
  both: [[PAGE, "questionRevision(identity, file, 0, 0, '')"], [TURN, "questionRevision(identity, file, 0, 0, '')"]]
}
const original = readFileSync(path)
const out = {}
try {
  for (const [name, pairs] of Object.entries(mutations)) {
    let s = original.toString('utf8')
    for (const [a, b] of pairs) { if (s.split(a).length !== 2) throw new Error(`site not unique: ${a}`); s = s.replace(a, () => b) }
    writeFileSync(path, s)
    const r = { build: run('pnpm', ['exec', 'electron-vite', 'build']).code }
    const bundle = readFileSync(`${WT}/out/main/index.js`, 'utf8')
    r.reached = pairs.every(([, b]) => bundle.includes(b.replace(/'/g, '"'))) && !bundle.includes('rec[1], texts[idx])')
    const t = run('pnpm', ['exec', 'playwright', 'test', 'e2e/startup-restore.spec.ts', '-g', 'restart restores'])
    r.test = t.code
    r.lines = t.out.split('\n').filter((l) => /Error:|Expected|Received|✘|passed|failed|> \d+ \|/.test(l)).slice(0, 10)
    out[name] = r
  }
} finally {
  writeFileSync(path, original)
  out.identical = Buffer.compare(readFileSync(path), original) === 0
}
out.rebuild = run('pnpm', ['exec', 'electron-vite', 'build']).code
console.log(JSON.stringify(out, null, 1))
