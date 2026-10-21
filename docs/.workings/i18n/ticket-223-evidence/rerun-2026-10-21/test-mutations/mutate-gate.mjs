// One-off mutations of scripts/check-lang.mjs, to see scripts/check-lang.test.mjs go red (ticket #223).
// Run from the repository root: node docs/.workings/i18n/ticket-223-evidence/rerun-2026-10-21/test-mutations/mutate-gate.mjs
//
// Each mutation replaces one exact string in the gate (confirmed to occur once before, and the replacement
// confirmed present after), runs the test exactly as `pnpm check:lang` does, takes the exit code straight
// from spawnSync, and restores the gate byte for byte from an in-memory backup in a finally block. The
// expected failing tests are written down before the run. Logs escape Chinese as \u{XXXX}.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CJK_G } from '../../../../../../scripts/lib/working-language.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const GATE = 'scripts/check-lang.mjs'
const escape = (s) => s.replace(CJK_G, (c) => `\\u{${c.codePointAt(0).toString(16).toUpperCase()}}`)

const R = (f) => `Chinese in the skill's copy docs/prototypes/${f} is reported like any other tooling`
const MUTATIONS = [
  { id: 'none', from: null, expect: [] },
  {
    id: 'M1-narrowing-removed',
    from: '!SKILL_TOOLING.includes(file) && ',
    to: '',
    expect: [R('index.html'), R('app-identity.js'), R('demo-dimensions.js'), R('demo-harness.js')]
  },
  {
    id: 'M2-entry-misspelled',
    from: "'docs/prototypes/demo-harness.js'",
    to: "'docs/prototypes/demo-harnes.js'",
    expect: [R('demo-harness.js')]
  },
  {
    id: 'M3-manifest-named',
    from: "  'docs/prototypes/demo-harness.js'\n]",
    to: "  'docs/prototypes/demo-harness.js',\n  'docs/prototypes/manifest.js'\n]",
    expect: ['Chinese stays permitted in the manifest, whose names and questions address the reviewer']
  },
  {
    id: 'M4-mjs-exempt',
    from: '/\\.(html|mmd|css|js)$/.test(file)) return []',
    to: '/\\.(html|mmd|css|m?js)$/.test(file)) return []',
    expect: ["Chinese in the skill's copy sync-mmd.mjs is reported, since .mjs is not an exempt type"]
  }
]

const rows = []
let unexpected = false
for (const m of MUTATIONS) {
  const backup = readFileSync(GATE)
  let run
  let reach = '(gate unchanged)'
  try {
    if (m.from !== null) {
      const src = backup.toString('utf8')
      const n = src.split(m.from).length - 1
      if (n !== 1) throw new Error(`${m.id}: expected one occurrence, found ${n}`)
      writeFileSync(GATE, src.replace(m.from, m.to))
      const now = readFileSync(GATE, 'utf8')
      if (m.to && !now.includes(m.to)) throw new Error(`${m.id}: replacement not in the gate`)
      if (!m.to && now.includes(m.from)) throw new Error(`${m.id}: original still in the gate`)
      reach = `${GATE}: 1 occurrence replaced, replacement confirmed in the file`
    }
    run = spawnSync(process.execPath, ['--test', 'scripts/check-lang.test.mjs'], { encoding: 'utf8' })
  } finally {
    writeFileSync(GATE, backup)
    if (!readFileSync(GATE).equals(backup)) throw new Error(`${m.id}: restore is not byte-identical`)
  }
  // node --test lists each failing test twice: where it ran, and again in its closing summary
  const failed = [...new Set([...run.stdout.matchAll(/^✖ (.+?) \(\d/gm)].map((x) => x[1]))]
  const ok = JSON.stringify([...failed].sort()) === JSON.stringify([...m.expect].sort()) && (m.expect.length ? run.status !== 0 : run.status === 0)
  if (!ok) unexpected = true
  writeFileSync(
    join(OUT, `${m.id}.log`),
    escape([`mutation: ${m.id}`, `expected failing: ${JSON.stringify(m.expect)}`, `command: node --test scripts/check-lang.test.mjs`, `exit: ${run.status}`, `reach: ${reach}`, `failed: ${JSON.stringify(failed)}`, `restore: ${GATE} byte-identical to the backup`, '--- stdout', run.stdout, '--- stderr', run.stderr].join('\n'))
  )
  rows.push([m.id, m.expect.length ? `${m.expect.length} named test(s) fail` : 'all pass', `exit ${run.status}`, failed.length, ok ? 'as expected' : 'UNEXPECTED'])
}
const table = ['| Mutation | Expected | Test run | Failed tests | Result |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
writeFileSync(join(OUT, 'summary.md'), `${table}\n`)
console.log(table)
process.exit(unexpected ? 1 : 0)
