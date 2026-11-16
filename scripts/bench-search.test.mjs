// The scan benchmark's search modes (#469), run through the runner under the Electron binary, the way a developer runs
// them: `search-index` scans a home and keeps the session lists the app searches by, ranking the projects by the bytes a
// full-text search reads of them, then `search` runs one project's search through the app's own search code, in
// question mode and in full-text mode, and reports what it found, its wall time, the main process's longest event-loop
// stall and its footprint.
//
// The fixture home:
// - Project p1 holds the known hits: a Claude session with the word in its first question and in the answer to its
//   second, and a Codex session with the word in its question, whose legacy fork replays that question (stripped, so in
//   full-text mode the copy is folded). Beside them, a Claude session of some 52 MB with no hit, whose full-text search
//   raised the footprint by its size and held the main thread while the search read each file whole on the main process
//   (#469): the word is all letters, so the byte search gathered every place its first letter stands, and that session
//   holds two million of them. Searched line by line on a thread of the engine module's own (#479), it must do neither.
// - Project p2 holds one cold rollout, two zstd frames on disk of a few kilobytes, whose stream is 16,000,000 bytes.
// - Project p3 holds one plain Claude session of about 1 MB: more bytes on disk than p2, fewer read by full text.
//
// Gaps:
// - The case runs on macOS only. The footprint is read by macOS `footprint`, which exists nowhere else, so it is
//   skipped on CI's Linux runners; it runs wherever `pnpm test:scripts` runs on a Mac.
// - That the search is measured in the state the app searches in (each session's question index asked for before the
//   measurement, which builds what the app's scans have built) is not guarded: what it removes from the wall time is a
//   one-time cost of milliseconds, which no bound on a wall time can tell apart. It was checked by running the same
//   search twice in one process, the first run's time against the second's.
// - Of the stream sizes `search-index` reads off zstd frame headers, only Node's frames are driven: two of them, each
//   recording a 4-byte content size and no checksum. A skippable frame, a frame recording no content size (and the
//   count of such rollouts it prints), a content size of 1, 2 or 8 bytes, raw, RLE and reserved blocks, a checksum, a
//   file that is not zstd, and more than one cold rollout in a project are not; nor is an Antigravity conversation,
//   counted by its transcript. The walker was checked against `zstd -lv` on 30 of this machine's real cold rollouts,
//   each a single frame, the five largest among them: every stream size agreed to the byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

const RUNNER = fileURLToPath(new URL('./bench-scan.mjs', import.meta.url))

/** The bench's output, its run having exited 0 */
function bench(home, ...args) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', env: { ...process.env, AGENTSHED_HOME_OVERRIDE: home } })
  assert.equal(r.status, 0, `bench ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

/** About a megabyte of text holding none of the word's letters in either case */
const FILLER = 'the same tool output again '.repeat(37_000)

/** The home described above; the word is "zebra" */
function fixtureHome() {
  const home = mkdtempSync(join(tmpdir(), 'agentshed-bench-search-home-'))
  const [p1, p2, p3] = ['p1', 'p2', 'p3'].map((name) => join(home, 'work', name))
  for (const p of [p1, p2, p3]) mkdirSync(p, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [p1]: {}, [p2]: {}, [p3]: {} } }))

  const at = '2026-07-30T02:00:00.000Z'
  const asked = (text) => JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content: text } })
  const answered = (text) => JSON.stringify({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text }] } })
  const claudeSession = (project, name, lines) => {
    const dir = join(home, '.claude', 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), lines.join('\n') + '\n')
  }
  claudeSession(p1, 'a.jsonl', [asked('a zebra in the first question'), answered('a plain answer'), asked('the second question'), answered('the answer names a zebra')])
  claudeSession(p1, 'big.jsonl', [asked('the long session'), ...Array.from({ length: 48 }, () => answered(FILLER)), answered('z '.repeat(2_000_000))])
  claudeSession(p3, 'small.jsonl', [asked('the short session'), answered(FILLER)])

  const codexDir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(codexDir, { recursive: true })
  const meta = (ts, id, cwd, extra = {}) => JSON.stringify({ timestamp: ts, type: 'session_meta', payload: { cwd, id, ...extra } })
  const question = (ts, message) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'user_message', message } })
  const PARENT = '019f0000-aaaa-7000-8000-000000000041'
  const CHILD = '019f0000-bbbb-7000-8000-000000000042'
  writeFileSync(
    join(codexDir, `rollout-${PARENT}.jsonl`),
    [meta('2026-07-30T01:00:00Z', PARENT, p1), question('2026-07-30T01:00:01Z', 'a zebra in the parent session')].join('\n') + '\n'
  )
  writeFileSync(
    join(codexDir, `rollout-${CHILD}.jsonl`),
    [
      meta('2026-07-30T02:00:00Z', CHILD, p1, { forked_from_id: PARENT }),
      question('2026-07-30T02:00:00Z', 'a zebra in the parent session'), // The replayed copy
      question('2026-07-30T02:00:05Z', 'child new question')
    ].join('\n') + '\n'
  )

  // The cold rollout: lines of tool output to a stream of exactly STREAM bytes, the last line padded to it
  const COLD = '019f0000-cccc-7000-8000-000000000051'
  const STREAM = 16_000_000
  const output = (text) => JSON.stringify({ timestamp: '2026-07-30T03:00:02Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c', output: text } }) + '\n'
  let stream = [meta('2026-07-30T03:00:00Z', COLD, p2), question('2026-07-30T03:00:01Z', 'a question in the cold session')].join('\n') + '\n'
  const line = output(FILLER.slice(0, 2000))
  while (stream.length + 2 * line.length < STREAM) stream += line
  stream += output('x'.repeat(STREAM - stream.length - output('').length))
  const bytes = Buffer.from(stream)
  assert.equal(bytes.length, STREAM)
  const half = STREAM / 2
  writeFileSync(join(codexDir, `rollout-${COLD}.jsonl.zst`), Buffer.concat([zstdCompressSync(bytes.subarray(0, half)), zstdCompressSync(bytes.subarray(half))]))
  return { home, p1, p2, p3 }
}

/** The figures a search run reports */
function searchFigures(out) {
  const found = /^\[search\] (questions|full text) "zebra": (\d+) ms; (\d+) hits in (\d+) sessions, (\d+) folded; main-process event-loop stall max (\d+) ms/m.exec(out)
  const footprint = /^\[search\] main-process footprint, worker threads included: (\d+) MB before the search; peak \d+ MB, (?:reached during the search, (\d+) MB over|(reached before))/m.exec(out)
  assert.ok(found && footprint, `no search figures in:\n${out}`)
  return {
    mode: found[1],
    ms: Number(found[2]),
    hits: [Number(found[3]), Number(found[4]), Number(found[5])],
    stall: Number(found[6]),
    before: Number(footprint[1]),
    // How far the peak rose above the footprint before the search; null when the peak was not the search's
    over: footprint[3] ? null : Number(footprint[2])
  }
}

test('one project\'s search, in question mode and full-text mode, reports its hits, its wall time, its stall and the main process\'s footprint, the projects ranked by the bytes full text reads', {
  skip: process.platform !== 'darwin' && 'the footprint is read by macOS `footprint`',
  timeout: 600_000
}, () => {
  const { home, p1, p2, p3 } = fixtureHome()
  let index = null
  try {
    const indexed = bench(home, 'search-index')
    index = /^\[search-index\] index (.+)$/m.exec(indexed)?.[1] ?? null
    assert.ok(index, `no index directory in:\n${indexed}`)
    // By the bytes on disk p3 would come before p2
    const ranked = [...indexed.matchAll(/^\[search-index\] {3}.*? {2}(\S+)$/gm)]
    assert.deepEqual(ranked.map((m) => m[1]), [p1, p2, p3], indexed)
    const p2Line = ranked[1][0]
    assert.ok(p2Line.startsWith('[search-index]   16.0 MB read by full text,') && p2Line.includes('1 cold rollouts (16.0 MB of stream,'), p2Line)
    assert.match(indexed, /^\[search-index\] the largest cold rollout, 16\.0 MB of stream \(/m)
    assert.ok(indexed.includes(`is in ${p2}: `), indexed)

    const questions = searchFigures(bench(home, 'search', index, p1, 'zebra'))
    // [hits, sessions, folded]: each session's question, and nothing outside a displayed turn
    assert.deepEqual([questions.mode, questions.hits], ['questions', [2, 2, 0]])
    assert.ok(questions.before > 0, `footprint ${questions.before} MB before the search`)

    const fullText = searchFigures(bench(home, 'search', index, p1, 'zebra', '--full-text'))
    // The Claude answer's body hit joins them, and the fork's replayed copy is folded
    assert.deepEqual([fullText.mode, fullText.hits], ['full text', [3, 2, 1]])
    // The large session is searched on a thread of the engine module's own, a line at a time: the peak during the search
    // rises by less than half the session's size, where the whole read raised it by more, and the byte search over two
    // million candidates no longer holds the main thread, which it held for 50 ms and more
    assert.ok(fullText.over === null || fullText.over < 26, `peak ${fullText.over === null ? 'not the search\'s' : `${fullText.over} MB over`} the footprint before the search`)
    assert.ok(fullText.stall < 50, `event-loop stall max ${fullText.stall} ms`)
  } finally {
    rmSync(home, { recursive: true, force: true })
    if (index) rmSync(index, { recursive: true, force: true })
  }
})
