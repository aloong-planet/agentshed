// The scan benchmark's search modes (#469), run through the runner under the Electron binary, the way a developer runs
// them: `search-index` scans a home and keeps the session lists the app searches by, then `search` runs one project's
// search through the app's own search code, in question mode and in full-text mode, and reports what it found, its wall
// time and the main process's footprint. The fixture home's hits are known: a Claude session with the word in its first
// question and in the answer to its second, and a Codex session with the word in its question, whose legacy fork replays
// that question (stripped, so in full-text mode the copy is folded).
//
// Gap: the case runs on macOS only. The footprint is read by macOS `footprint`, which exists nowhere else, so it is
// skipped on CI's Linux runners; it runs wherever `pnpm test:scripts` runs on a Mac.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNNER = fileURLToPath(new URL('./bench-scan.mjs', import.meta.url))

/** The bench's output, its run having exited 0 */
function bench(home, ...args) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', env: { ...process.env, AGENTSHED_HOME_OVERRIDE: home } })
  assert.equal(r.status, 0, `bench ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

/** A home with one registered project and the sessions described above; the word is "zebra" */
function fixtureHome() {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-bench-search-home-'))
  const project = join(home, 'work', 'p1')
  mkdirSync(project, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [project]: {} } }))

  const claudeDir = join(home, '.claude', 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(claudeDir, { recursive: true })
  const at = '2026-07-30T02:00:00.000Z'
  const asked = (text) => JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content: text } })
  const answered = (text) => JSON.stringify({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text }] } })
  writeFileSync(
    join(claudeDir, 'a.jsonl'),
    [asked('a zebra in the first question'), answered('a plain answer'), asked('the second question'), answered('the answer names a zebra')].join('\n') + '\n'
  )

  const codexDir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(codexDir, { recursive: true })
  const meta = (ts, id, extra = {}) => JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd: project, id, ...extra } })
  const question = (ts, message) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message } })
  const PARENT = '019f0000-aaaa-7000-8000-000000000041'
  const CHILD = '019f0000-bbbb-7000-8000-000000000042'
  writeFileSync(
    join(codexDir, `rollout-${PARENT}.jsonl`),
    [meta('2026-07-30T01:00:00Z', PARENT), question('2026-07-30T01:00:01Z', 'a zebra in the parent session')].join('\n') + '\n'
  )
  writeFileSync(
    join(codexDir, `rollout-${CHILD}.jsonl`),
    [
      meta('2026-07-30T02:00:00Z', CHILD, { forked_from_id: PARENT }),
      question('2026-07-30T02:00:00Z', 'a zebra in the parent session'), // The replayed copy
      question('2026-07-30T02:00:05Z', 'child new question')
    ].join('\n') + '\n'
  )
  return { home, project }
}

/** The figures a search run reports */
function searchFigures(out) {
  const found = /^\[search\] (questions|full text) "zebra": (\d+) ms; (\d+) hits in (\d+) sessions, (\d+) folded;/m.exec(out)
  const footprint = /^\[search\] main-process footprint, worker threads included: (\d+) MB before the search; peak (\d+) MB/m.exec(out)
  assert.ok(found && footprint, `no search figures in:\n${out}`)
  return {
    mode: found[1],
    ms: Number(found[2]),
    hits: [Number(found[3]), Number(found[4]), Number(found[5])],
    before: Number(footprint[1]),
    peak: Number(footprint[2])
  }
}

test('one project\'s search, in question mode and full-text mode, reports its hits, its wall time and the main process\'s footprint', {
  skip: process.platform !== 'darwin' && 'the footprint is read by macOS `footprint`',
  timeout: 600_000
}, () => {
  const { home, project } = fixtureHome()
  let index = null
  try {
    const indexed = bench(home, 'search-index')
    index = /^\[search-index\] index (.+)$/m.exec(indexed)?.[1] ?? null
    assert.ok(index, `no index directory in:\n${indexed}`)

    const questions = searchFigures(bench(home, 'search', index, project, 'zebra'))
    // [hits, sessions, folded]: each session's question, and nothing outside a displayed turn
    assert.deepEqual([questions.mode, questions.hits], ['questions', [2, 2, 0]])
    const fullText = searchFigures(bench(home, 'search', index, project, 'zebra', '--full-text'))
    // The Claude answer's body hit joins them, and the fork's replayed copy is folded
    assert.deepEqual([fullText.mode, fullText.hits], ['full text', [3, 2, 1]])

    for (const run of [questions, fullText]) {
      assert.ok(Number.isFinite(run.ms) && run.ms >= 0, `wall time ${run.ms}`)
      assert.ok(run.before > 0 && run.peak >= run.before, `footprint ${run.before} MB before, peak ${run.peak} MB`)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
    if (index) rmSync(index, { recursive: true, force: true })
  }
})
