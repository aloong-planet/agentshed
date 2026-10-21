// Mutation runs for the narrowed mockupOnly predicate (ticket #223, re-run after merging main).
// Run from the repository root: node docs/.workings/i18n/ticket-223-evidence/rerun-2026-10-21/mutate.mjs
//
// Each mutation edits real files in place, confirms the edit is in the file before the gate runs, runs the
// gate exactly as `pnpm check:lang` does, and takes its exit code straight from spawnSync. Every touched
// file is restored byte for byte from an in-memory backup in a finally block, and the restore is compared
// against the backup. No git command restores anything, so uncommitted work is never at risk.
//
// The Chinese marker is built from code points so that this file itself stays free of Chinese, and every
// log escapes Chinese as \u{XXXX} so that the logs can be committed without tripping the gate they record.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CJK_G } from '../../../../../scripts/lib/working-language.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const CN = String.fromCodePoint(0x53d8, 0x5f02, 0x6807, 0x8bb0) // a four-character Chinese marker
const GATE = 'scripts/check-lang.mjs'
const NARROWING = '!SKILL_TOOLING.includes(file) && '

const escape = (s) => s.replace(CJK_G, (c) => `\\u{${c.codePointAt(0).toString(16).toUpperCase()}}`)
const comment = (file) => (file.endsWith('.html') ? `<!-- ${CN} -->` : `// ${CN}`)

/** Append one Chinese comment line to `file` */
const append = (file) => ({ file, edit: (t) => `${t}${t.endsWith('\n') ? '' : '\n'}${comment(file)}\n`, marker: comment(file) })
/** Remove the narrowing from the predicate, so every HTML/JS file under docs/prototypes/ is exempt again */
const dropNarrowing = { file: GATE, edit: (t) => t.replace(NARROWING, ''), marker: null, absent: NARROWING }

const MUTATIONS = [
  { id: 'baseline', edits: [], expect: 'green' },
  { id: 'T1-shell', edits: [append('docs/prototypes/index.html')], expect: 'red' },
  { id: 'T2-app-identity', edits: [append('docs/prototypes/app-identity.js')], expect: 'red' },
  { id: 'T3-demo-dimensions', edits: [append('docs/prototypes/demo-dimensions.js')], expect: 'red' },
  { id: 'T4-demo-harness', edits: [append('docs/prototypes/demo-harness.js')], expect: 'red' },
  { id: 'G1-mockup-page', edits: [append('docs/prototypes/shell/prototype-app-shell.html')], expect: 'green' },
  { id: 'G2-logic-index', edits: [append('docs/prototypes/project-list/visibility/index.html')], expect: 'green' },
  { id: 'G3-manifest', edits: [append('docs/prototypes/manifest.js')], expect: 'green' },
  { id: 'G4-dimensions', edits: [append('docs/prototypes/dimensions.js')], expect: 'green' },
  { id: 'G5-shared-component', edits: [append('docs/prototypes/_shared/app-rail.js')], expect: 'green' },
  { id: 'N1-shell-without-narrowing', edits: [append('docs/prototypes/index.html'), dropNarrowing], expect: 'green' },
  { id: 'N2-app-identity-without-narrowing', edits: [append('docs/prototypes/app-identity.js'), dropNarrowing], expect: 'green' },
  { id: 'final', edits: [], expect: 'green' }
]

const summary = []
let failed = false
for (const m of MUTATIONS) {
  const backups = new Map()
  const reach = []
  let run
  try {
    for (const e of m.edits) {
      if (!backups.has(e.file)) backups.set(e.file, readFileSync(e.file))
      const before = readFileSync(e.file, 'utf8')
      const after = e.edit(before)
      if (after === before) throw new Error(`${m.id}: the edit to ${e.file} changed nothing`)
      writeFileSync(e.file, after)
      const now = readFileSync(e.file, 'utf8')
      if (e.marker !== null && !now.includes(e.marker)) throw new Error(`${m.id}: marker not found in ${e.file}`)
      if (e.absent && now.includes(e.absent)) throw new Error(`${m.id}: ${e.file} still contains the narrowing`)
      reach.push(e.marker !== null ? `${e.file}: marker present at line ${now.split('\n').indexOf(e.marker) + 1}` : `${e.file}: narrowing removed (${before.split(e.absent).length - 1} occurrence before, 0 after)`)
    }
    run = spawnSync(process.execPath, [GATE], { encoding: 'utf8' })
  } finally {
    for (const [file, buf] of backups) {
      writeFileSync(file, buf)
      if (!readFileSync(file).equals(buf)) throw new Error(`${m.id}: restore of ${file} is not byte-identical`)
    }
  }
  const got = run.status === 0 ? 'green' : 'red'
  const ok = got === m.expect
  if (!ok) failed = true
  const problems = (run.stdout + run.stderr).split('\n').filter((l) => /^ {4}docs\/|^ {4}scripts\/|^ {4}rule matches/.test(l))
  const permitted = (run.stdout.match(/Working language: (\d+) line/) || [])[1] ?? '-'
  writeFileSync(
    join(OUT, `${m.id}.log`),
    escape(
      [
        `mutation: ${m.id}`,
        `expected: ${m.expect}`,
        `command: node ${GATE}`,
        `exit: ${run.status}`,
        ...reach.map((r) => `reach: ${r}`),
        `restore: ${[...backups.keys()].join(', ') || '(nothing edited)'} — byte-identical to the backup`,
        '--- stdout',
        run.stdout,
        '--- stderr',
        run.stderr
      ].join('\n')
    )
  )
  summary.push([m.id, m.expect, `exit ${run.status}`, permitted, problems.length, ok ? 'as expected' : 'UNEXPECTED'])
}

mkdirSync(OUT, { recursive: true })
const table = ['| Mutation | Expected | Gate | Permitted lines | Problems | Result |', '|---|---|---|---|---|---|', ...summary.map((r) => `| ${r.join(' | ')} |`)].join('\n')
writeFileSync(join(OUT, 'summary.md'), `${table}\n`)
console.log(table)
process.exit(failed ? 1 : 0)
