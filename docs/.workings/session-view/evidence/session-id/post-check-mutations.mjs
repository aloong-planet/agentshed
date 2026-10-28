// Reversible mutations for the post-implementation fixes: each changes one line of product code, rebuilds, runs the
// case that should catch it, and restores the file byte for byte in a finally block (never via git).
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const WT = '/Users/loong_zhou/CascadeProjects/agentshed-session-resume'
const run = (cmd, args) => { try { return { code: 0, out: execFileSync(cmd, args, { cwd: WT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 26 }) } } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } } }
const MUTATIONS = [
  { name: 'E2: the handler stops passing the restored state', file: 'src/main/index.ts',
    from: 'restored: !firstScanComplete', to: 'restored: false', test: ['e2e/startup-restore.spec.ts', '-g', 'restart restores'] },
  { name: 'F2: the icon is not swapped for the check', file: 'src/renderer/src/SessionActions.tsx',
    from: 'const Icon = copied === a ? Check : ICON[a]', to: 'const Icon = ICON[a]', test: ['e2e/app.spec.ts', '-g', 'the session page header'] },
  { name: 'F1: the check is set before the copy resolves', file: 'src/renderer/src/SessionActions.tsx',
    from: '    window.agentshed.copyText(text).then(', to: '    setCopied(act)\n    window.agentshed.copyText(text).then(', test: ['e2e/app.spec.ts', '-g', 'the session page header'] }
]
const results = []
for (const m of MUTATIONS) {
  const path = `${WT}/${m.file}`
  const original = readFileSync(path)
  try {
    const text = original.toString('utf8')
    if (text.split(m.from).length !== 2) throw new Error(`${m.name}: the mutation site is not unique or missing`)
    writeFileSync(path, text.replace(m.from, () => m.to))
    // That the mutation reached the build is shown by where the case fails: the assertion it was written for
    const b = run('pnpm', ['exec', 'electron-vite', 'build'])
    const t = run('pnpm', ['exec', 'playwright', 'test', ...m.test])
    const failLines = t.out.split('\n').filter((l) => /Error|Expected|Received|✘|passed|failed|> \d+ \|/.test(l)).slice(0, 8)
    results.push({ name: m.name, build: b.code, test: t.code, lines: failLines })
  } finally {
    writeFileSync(path, original)
    results.push({ restored: m.file, identical: Buffer.compare(readFileSync(path), original) === 0 })
  }
}
const rebuild = run('pnpm', ['exec', 'electron-vite', 'build'])
results.push({ rebuildAfterRestore: rebuild.code })
console.log(JSON.stringify(results, null, 1))
