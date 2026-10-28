// F7's proof: with the inode kept, dropping the byte range and text from the page handler's question identity
// (both call sites) must turn the restart case red; the file is restored byte for byte in finally.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const WT = '/Users/loong_zhou/CascadeProjects/agentshed-session-resume'
const run = (cmd, args) => { try { return { code: 0, out: execFileSync(cmd, args, { cwd: WT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 26 }) } } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } } }
const path = `${WT}/src/main/index.ts`
const original = readFileSync(path)
const out = {}
try {
  let s = original.toString('utf8')
  for (const [a, b] of [
    ['questionRevision(identity, file, rec[0], rec[1], texts[idx])', "questionRevision(identity, file, 0, 0, '')"],
    ['questionRevision(identity, file, rec[0], rec[1], texts[0])', "questionRevision(identity, file, 0, 0, '')"]
  ]) { if (s.split(a).length !== 2) throw new Error(`site not unique: ${a}`); s = s.replace(a, () => b) }
  writeFileSync(path, s)
  out.build = run('pnpm', ['exec', 'electron-vite', 'build']).code
  const t = run('pnpm', ['exec', 'playwright', 'test', 'e2e/startup-restore.spec.ts', '-g', 'restart restores'])
  out.test = t.code
  out.lines = t.out.split('\n').filter((l) => /Error|Expected|Received|✘|passed|failed|> \d+ \|/.test(l)).slice(0, 8)
} finally {
  writeFileSync(path, original)
  out.identical = Buffer.compare(readFileSync(path), original) === 0
}
out.rebuild = run('pnpm', ['exec', 'electron-vite', 'build']).code
console.log(JSON.stringify(out, null, 1))
