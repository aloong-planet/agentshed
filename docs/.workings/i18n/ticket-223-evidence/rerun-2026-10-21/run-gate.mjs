// Run a list of commands in the current directory and write one log the full-gateway rules accept:
// the version (HEAD plus git hash-object of every file git status lists), each command, its exit code taken
// straight from spawnSync, and its complete output. Stops at the first failure. Usage:
//   node run-gate.mjs <log-file> "<command>" ["<command>" ...]
import { spawnSync, execFileSync } from 'node:child_process'
import { writeFileSync, appendFileSync, existsSync } from 'node:fs'

const [log, ...commands] = process.argv.slice(2)
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })

const head = git('rev-parse', 'HEAD').trim()
const status = git('status', '--porcelain', '--untracked-files=all')
const files = status
  .split('\n')
  .filter(Boolean)
  .map((l) => [l.slice(0, 2), l.slice(3)])
const hashes = files.map(([st, f]) => `  ${st} ${f}  ${existsSync(f) ? git('hash-object', f).trim() : '(deleted)'}`)
writeFileSync(
  log,
  [
    `date: ${new Date().toISOString()}`,
    `cwd: ${process.cwd()}`,
    `git rev-parse HEAD: ${head}`,
    'git status --porcelain --untracked-files=all, with git hash-object of each file:',
    ...(hashes.length ? hashes : ['  (clean)']),
    ''
  ].join('\n')
)

let exit = 0
for (const cmd of commands) {
  const t0 = Date.now()
  const r = spawnSync(cmd, { shell: '/bin/zsh', encoding: 'utf8', maxBuffer: 1 << 30, env: { ...process.env, FORCE_COLOR: '0' } })
  appendFileSync(
    log,
    [`\n==== command: ${cmd}`, `==== exit: ${r.status}${r.signal ? ` (signal ${r.signal})` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`, '---- stdout', r.stdout, '---- stderr', r.stderr].join('\n')
  )
  console.log(`exit ${r.status}  ${cmd}`)
  if (r.status !== 0) {
    exit = r.status ?? 1
    break
  }
}
appendFileSync(log, `\n==== overall exit: ${exit}\n`)
process.exit(exit)
