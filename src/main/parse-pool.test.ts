// The parse pool's own mechanics, with small stand-in worker scripts written at run time: vitest cannot
// start the real parse worker, which is a build output (out/main/parse-worker.js). That the real worker
// loads and parses in the built app is covered by e2e — every launcher treats a `[parse-pool]` line on
// stderr as a failure — and by `pnpm bench:scan workers`, which compares a pooled cold scan with a
// main-thread one entry by entry on real data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ParsePool } from './parse-pool'
import { runParseJob, type ParseJob, type ParseResult } from './providers/token-stats'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-pool-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** A worker that answers each job after `delay` ms (taken from the job's projectKey) with its own thread id */
function echoWorker(): string {
  const f = join(dir, 'echo.mjs')
  writeFileSync(
    f,
    `import { parentPort, threadId } from 'node:worker_threads'
parentPort.on('message', (job) => {
  setTimeout(() => parentPort.postMessage({ agg: { file: job.file, threadId } }), Number(job.projectKey))
})
`
  )
  return f
}
function crashWorker(): string {
  const f = join(dir, 'crash.mjs')
  writeFileSync(f, `import { parentPort } from 'node:worker_threads'\nparentPort.on('message', () => process.exit(3))\n`)
  return f
}
/** A job the stand-in echo worker answers; projectKey carries its delay */
function echoJob(file: string, delay: number): ParseJob {
  return { kind: 'grok', file, projectKey: String(delay), subagent: false }
}
type Echo = { agg: { file: string; threadId: number } }
const echoOf = (r: ParseResult): Echo['agg'] => (r as unknown as Echo).agg

/** A real Claude session file and the job that parses it */
function realJob(): ParseJob {
  const d = join(dir, 'home', '.claude', 'projects', '-p')
  mkdirSync(d, { recursive: true })
  const file = join(d, 's.jsonl')
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-07-30T01:00:00Z', message: { role: 'user', content: 'a real question' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-07-30T01:00:01Z', message: { id: 'm', model: 'claude-fable-5', usage: { input_tokens: 9, output_tokens: 1 } } })
    ].join('\n') + '\n'
  )
  return { kind: 'claude', file, projectKey: 'p', listed: true }
}

describe('ParsePool', () => {
  it('answers every job with its own result when jobs finish out of order', async () => {
    const pool = new ParsePool(echoWorker(), 4)
    const files = Array.from({ length: 8 }, (_, i) => `f${i}`)
    const results = await Promise.all(files.map((f, i) => pool.run(echoJob(f, (8 - i) * 10))))
    expect(results.map((r) => echoOf(r).file)).toEqual(files)
    pool.close()
  })

  it('never runs more workers than its size, and does use more than one', async () => {
    const pool = new ParsePool(echoWorker(), 3)
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => pool.run(echoJob(`f${i}`, 20))))
    const threads = new Set(results.map((r) => echoOf(r).threadId))
    expect(threads.size).toBeLessThanOrEqual(3)
    expect(threads.size).toBeGreaterThan(1)
    pool.close()
  })

  it('reuses an idle worker within its idle time and stops it after', async () => {
    const pool = new ParsePool(echoWorker(), 1, 50)
    const a = echoOf(await pool.run(echoJob('a', 0))).threadId
    const b = echoOf(await pool.run(echoJob('b', 0))).threadId
    expect(b).toBe(a)
    await new Promise((r) => setTimeout(r, 250))
    const c = echoOf(await pool.run(echoJob('c', 0))).threadId
    expect(c).not.toBe(a)
    pool.close()
  })

  it('a worker that dies mid-job loses nothing: the job is parsed on the main thread, with one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pool = new ParsePool(crashWorker(), 2)
    const job = realJob()
    const [r1, r2] = await Promise.all([pool.run(job), pool.run(job)])
    const inline = await runParseJob(job)
    expect(inline).not.toBeNull()
    expect(r1).toEqual(inline)
    expect(r2).toEqual(inline)
    expect(warn).toHaveBeenCalledTimes(1)
    pool.close()
  })

  it('a worker script that does not load loses nothing either', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pool = new ParsePool(join(dir, 'missing.mjs'), 2)
    const job = realJob()
    expect(await pool.run(job)).toEqual(await runParseJob(job))
    pool.close()
  })
})
