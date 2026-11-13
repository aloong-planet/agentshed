// The engine module as a thread loads it (ADR-0045), against the development build the global setup made: where it
// is, what a thread does with a module that will not load or is another build's, and a panic caught at the module's
// boundary. That the module loads in the built app's scan worker, parse workers and main process is covered by e2e —
// every launcher fails on a `[parse-pool]` or `[scan-worker]` line — and, for the packaged app, by packaging, which
// loads the module it ships (scripts/build-engine.mjs).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ENGINE_MODULE_SEAM, engineModulePath, loadEngineModule } from './engine-module'
import { TEST_ENGINE, type PanicSeam } from './testing/engine'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-engine-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('where the engine module is', () => {
  it.each([
    { name: 'an unpackaged run loads the development build', packaged: false, env: {}, path: '/repo/engine/dist/agentshed_engine.node' },
    { name: 'an unpackaged run follows the module seam', packaged: false, env: { [ENGINE_MODULE_SEAM]: '/elsewhere/broken.node' }, path: '/elsewhere/broken.node' },
    // Never another module in a signed app, whatever the environment says (the launch guard refuses the seam first)
    { name: 'a packaged build loads its own and ignores the seam', packaged: true, env: { [ENGINE_MODULE_SEAM]: '/elsewhere/broken.node' }, path: '/App/Resources/engine/agentshed_engine.node' }
  ])('$name', ({ packaged, env, path }) => {
    expect(engineModulePath({ packaged, resourcesPath: '/App/Resources', mainDir: '/repo/out/main', env })).toBe(path)
  })
})

describe('loading the engine module (token-stats, Scans and the window: the module will not load)', () => {
  it('the development build loads in this thread as this build\'s own', () => {
    expect(() => loadEngineModule(TEST_ENGINE)).not.toThrow()
  })

  it('a file that is no module will not load, and says where it was looked for', () => {
    const damaged = join(dir, 'agentshed_engine.node')
    writeFileSync(damaged, 'not a library')
    expect(() => loadEngineModule({ ...TEST_ENGINE, path: damaged })).toThrow(`the engine module will not load from ${damaged}`)
    // Asked again, as the next scan asks: still refused
    expect(() => loadEngineModule({ ...TEST_ENGINE, path: damaged })).toThrow('will not load')
  })

  it('a module of another build is refused, naming both builds', () => {
    expect(() => loadEngineModule({ ...TEST_ENGINE, build: 'another-build' })).toThrow(/is another build's \(".+"\), not this build's \("another-build"\)/)
  })
})

describe('a panic in the engine module (token-stats, Scans and the window: caught where it crosses into the application)', () => {
  afterEach(() => {
    ;(loadEngineModule(TEST_ENGINE) as PanicSeam).seamPanicWhileParsing(null)
  })

  /** A real worker thread that loads the module and answers each file it is sent with what parsing it gave */
  function parsingWorker(): { ask: (file: string) => Promise<{ ok?: string; error?: string }>; worker: Worker } {
    const script = join(dir, 'parses.mjs')
    writeFileSync(
      script,
      `import { parentPort, workerData } from 'node:worker_threads'
const holder = { exports: {} }
process.dlopen(holder, workerData)
parentPort.on('message', (file) => {
  try {
    parentPort.postMessage({ ok: holder.exports.seamParse(file) })
  } catch (e) {
    parentPort.postMessage({ error: e.message })
  }
})
`
    )
    const worker = new Worker(script, { workerData: TEST_ENGINE.path })
    const ask = (file: string): Promise<{ ok?: string; error?: string }> =>
      new Promise((resolve, reject) => {
        worker.once('message', resolve)
        worker.once('error', reject)
        worker.postMessage(file)
      })
    return { ask, worker }
  }

  it('a panic in a call a worker makes fails that call with the panic\'s message; the worker and the process go on, and the next call succeeds', async () => {
    const named = join(dir, 'named.jsonl')
    const other = join(dir, 'other.jsonl')
    // The seam is the process's, as the module's code is shared by every thread: named here, it holds in the worker
    ;(loadEngineModule(TEST_ENGINE) as PanicSeam).seamPanicWhileParsing(named)
    const { ask, worker } = parsingWorker()
    let exited = false
    worker.once('exit', () => (exited = true))
    try {
      expect(await ask(named)).toEqual({ error: `the panic seam, while parsing ${named}` })
      expect(await ask(other)).toEqual({ ok: other })
      expect(exited, 'the worker thread').toBe(false)
    } finally {
      await worker.terminate()
    }
  })
})
