// The observed-reads seam's own cases (engine/src/seams.rs): what it hands a test for a turn's body is what the read
// kept, once the side has left out the lines the turn does not hold, and only a read of a file it names is handed over
// so: the module's assembly of any other read's turn, and of the same file's once the seam no longer names it, is
// untouched.
import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { threadEngineModule } from '../engine-module'
import { readTurn } from '../providers/turn-read'
import { transcriptText } from './agy-transcript-fixture'
import type { ObservedReadsSeam } from './engine'

const dir = mkdtempSync(join(tmpdir(), 'observed-reads-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const seam = (): ObservedReadsSeam => threadEngineModule() as ObservedReadsSeam
let files = 0

/** A file of `content` in the case's directory, named `name` and a number of its own */
function fileOf(name: (n: number) => string, content: string | Buffer): string {
  const file = join(dir, name(files++))
  writeFileSync(file, content)
  return file
}

describe('the observed-reads seam', () => {
  const AT = '2026-11-12T09:36:03.436Z'
  const said = JSON.stringify({ timestamp: AT, type: 'event_msg', payload: { type: 'agent_message', message: 'the answer' } })

  test.each([false, true])('a read of a Codex turn hands over its blocks, assembled, until the seam names the file; then the lines the read kept and no blocks; then the blocks again once it names it no longer (cold %s)', async (cold) => {
    const content = Buffer.from(`${said}\n`)
    const file = fileOf((n) => `rollout-${n}.jsonl${cold ? '.zst' : ''}`, cold ? zstdCompressSync(content) : content)
    const read = async (): Promise<unknown> => (await readTurn('codex', file, { start: 0, end: 0 }, { start: 0, end: content.length })).body
    const blocks = { blocks: [{ kind: 'text', role: 'assistant', at: Date.parse(AT), body: 'the answer' }] }
    try {
      expect(await read()).toEqual(blocks)
      seam().seamObserveTurnReadsOf(file, true)
      expect(await read()).toEqual({ keptLines: [said] })
      seam().seamObserveTurnReadsOf(file, false)
      expect(await read()).toEqual(blocks)
    } finally {
      seam().seamObserveTurnReadsOf(file, false)
    }
  })

  test('what it hands over is what the read kept: the lines a rewind undid inside an Antigravity turn are not among them', async () => {
    const step = (index: number, type: string, extra: Record<string, unknown>): string =>
      JSON.stringify({ step_index: index, source: 'MODEL', type, status: 'DONE', created_at: '2026-10-28T08:06:23Z', ...extra })
    // A redo of step 1 undoes the call and the result before it (session-view::REQ-004/AC-03)
    const lines = [
      step(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'read_file', args: { Path: '/x' } }] }),
      step(2, 'GENERIC', { content: 'undone' }),
      step(1, 'PLANNER_RESPONSE', { tool_calls: [{ name: 'run_command', args: { CommandLine: 'ls' } }] }),
      step(2, 'GENERIC', { content: 'redone' })
    ]
    const text = transcriptText(lines)
    const file = fileOf((n) => `transcript-${n}.jsonl`, text)
    seam().seamObserveTurnReadsOf(file, true)
    try {
      const read = await readTurn('antigravity', file, { start: 0, end: 0 }, { start: 0, end: Buffer.byteLength(text) })
      expect(read.body).toEqual({ keptLines: [lines[2], lines[3]] })
    } finally {
      seam().seamObserveTurnReadsOf(file, false)
    }
  })
})
