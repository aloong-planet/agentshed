// The rule the scan benchmark's workers mode judges its two token stores by (scripts/bench-scan.entry.ts): an entry the
// two stores hold under one signature with different contents is a disagreement, an entry only one store holds is a
// failure too, and an entry whose signature differs is a file that changed between the two builds. That the verdict
// sets the run's exit code under Electron is shown by the runs in the change that wired it, not here: no test starts the
// Electron binary.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareStores } from './lib/bench-store-compare.mjs'

// Rows as the bench reads them from a store's entries table: the signature is the file's mtime and size, the aggregate is
// JSON text, and the resume point is text or null
const CLAUDE = '/Users/someone/.claude/projects/-Users-someone-code-app/0d4f6c2e-7f3a-4a8e-9a51-2b6f0c1e9d3a.jsonl'
const CODEX = '/Users/someone/.codex/sessions/2026/11/09/rollout-2026-11-09T22-32-38-01a1c0b9-b610-7011-993c-5eaa939752ed.jsonl'
const GEMINI = '/Users/someone/.gemini/tmp/5f1c0e2a/chats/session-2026-11-10T08-15-4a2b.json'
const row = (path, sig, agg, resume) => ({ path, sig, agg, resume })

test('two stores holding the same entries pass with nothing counted', () => {
  const rows = () => [
    row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":12}', null),
    row(CODEX, '1762699958000:6634120', '{"kind":"codex","input":7}', '{"offset":6634120,"ino":41925}')
  ]
  assert.deepEqual(compareStores(rows(), rows()), {
    entries: 2,
    disagreeing: [],
    onlyInMainThread: [],
    onlyInPool: [],
    changed: [],
    fails: false
  })
})

test('an entry held under one signature with different contents is a disagreement, and it fails the run', () => {
  // Out of path order, so the lists' order is the comparison's own
  const mainThread = [
    row(GEMINI, '1762762548000:9180', '{"kind":"gemini","input":3}', '{"offset":9180,"ino":52011}'),
    row(CODEX, '1762699958000:6634120', '{"kind":"codex","input":7}', '{"offset":6634120,"ino":41925}'),
    row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":12}', null)
  ]
  const pool = [
    row(CODEX, '1762699958000:6634120', '{"kind":"codex","input":7}', '{"offset":6634120,"ino":41925}'),
    row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":13}', null),
    row(GEMINI, '1762762548000:9180', '{"kind":"gemini","input":3}', null)
  ]
  assert.deepEqual(compareStores(mainThread, pool), {
    entries: 3,
    disagreeing: [CLAUDE, GEMINI],
    onlyInMainThread: [],
    onlyInPool: [],
    changed: [],
    fails: true
  })
})

test('an entry only one store holds fails the run, and is named on its own side', () => {
  const both = row(CODEX, '1762699958000:6634120', '{"kind":"codex","input":7}', null)
  const mainThread = [both, row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":12}', null)]
  const pool = [row(GEMINI, '1762762548000:9180', '{"kind":"gemini","input":3}', null), both]
  assert.deepEqual(compareStores(mainThread, pool), {
    entries: 3,
    disagreeing: [],
    onlyInMainThread: [CLAUDE],
    onlyInPool: [GEMINI],
    changed: [],
    fails: true
  })
})

test('an entry whose signature differs is a file that changed between the builds, counted apart, and it does not fail', () => {
  const mainThread = [
    row(CODEX, '1762699958000:6634120', '{"kind":"codex","input":7}', '{"offset":6634120,"ino":41925}'),
    row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":12}', null)
  ]
  const pool = [
    row(CODEX, '1762700012000:6640988', '{"kind":"codex","input":9}', '{"offset":6640988,"ino":41925}'),
    row(CLAUDE, '1762700000123.456:40213', '{"kind":"claude","input":12}', null)
  ]
  assert.deepEqual(compareStores(mainThread, pool), {
    entries: 2,
    disagreeing: [],
    onlyInMainThread: [],
    onlyInPool: [],
    changed: [CODEX],
    fails: false
  })
})
