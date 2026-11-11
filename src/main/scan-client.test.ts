// The main process's side of the scan worker (scan-client.ts) with the worker's side of the protocol
// (scan-protocol.ts). vitest cannot start the real scan worker, which is a build output (out/main/scan-worker.js),
// so the worker's side runs here in this thread behind a real message channel: every request and result is
// cloned as it is between two threads. A worker that does not load or exits is a real thread, from a small
// script written at run time. That the built worker loads, scans and stops in the app is covered by e2e — every
// launcher treats a `[scan-worker]` line on stderr as a failure — and by `pnpm bench:scan rescan`.
import { EventEmitter } from 'node:events'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MessageChannel, Worker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERR, decodeAppError } from '@shared/errors'
import { mergeKey } from '@shared/path-key'
import { Scanner, type ScanOutput } from './providers/scanner'
import { runParseJob, type ParseRunner } from './providers/token-stats'
import { ScanClient, type ScanWorker } from './scan-client'
import { answerScans, type ScanReply, type ScanRequest, type Scans } from './scan-protocol'
import { FORK_TITLE, mkScanHome, type ScanHome } from './testing/scan-home'

/** The scan worker's side in this thread: `scans` answers what the client posts, across a message channel */
class StandIn extends EventEmitter implements ScanWorker {
  /** How many times it was asked to stop */
  stops = 0
  private readonly channel = new MessageChannel()

  constructor(scans: Scans) {
    super()
    answerScans(this.channel.port2, scans, () => {
      this.stops++
      this.end(0)
    })
    this.channel.port1.on('message', (reply: ScanReply) => this.emit('message', reply))
  }

  postMessage(request: ScanRequest): void {
    this.channel.port1.postMessage(request)
  }

  /** The thread ending: nothing more comes from it */
  end(code: number): void {
    this.channel.port1.close()
    this.emit('exit', code)
  }

  terminate(): void {
    this.channel.port1.close()
  }
}

/** A parse runner on this thread that counts its parses and can hold them open */
function gatedRunner(): { runner: ParseRunner; parses: () => number; hold: () => { entered: Promise<void>; release: () => void } } {
  let count = 0
  let gate: { open: Promise<void>; entered: () => void } | null = null
  return {
    runner: {
      concurrency: 1,
      run: async (job) => {
        count++
        if (gate) {
          gate.entered()
          await gate.open
        }
        return runParseJob(job)
      }
    },
    parses: () => count,
    hold: () => {
      let release = (): void => {}
      let entered = (): void => {}
      const reached = new Promise<void>((resolve) => (entered = resolve))
      gate = { open: new Promise<void>((resolve) => (release = resolve)), entered }
      return {
        entered: reached,
        release: () => {
          gate = null
          release()
        }
      }
    }
  }
}

let dir: string
let home: ScanHome
/** The cache directory the worker's scanner and the main process's share, as the settings directory is in the app */
let cacheDir: string
let standIns: StandIn[]
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-scans-'))
  home = mkScanHome(join(dir, 'home'))
  cacheDir = join(dir, 'cache')
  standIns = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  for (const s of standIns) s.terminate()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function standIn(scans: Scans): StandIn {
  const s = new StandIn(scans)
  standIns.push(s)
  return s
}

/** A client over one stand-in, with nothing behind it: a fallback is this case's failure */
function clientOver(scans: Scans): { client: ScanClient; worker: () => StandIn } {
  const client = new ScanClient({
    spawn: () => standIn(scans),
    fallback: () => {
      throw new Error('the worker was taken for failed')
    }
  })
  return { client, worker: () => standIns[standIns.length - 1] }
}

/** Two scans of one home differ only in when they ran */
const timeless = (out: ScanOutput): ScanOutput => ({ ...out, snapshot: { ...out.snapshot, scannedAt: 0 } })

/** The same home scanned on this thread, into a cache of its own */
function reference(): Scanner {
  return new Scanner(join(dir, 'reference-cache'))
}

/** One more call in a Claude session file: the next scan has to parse it */
function grow(file: string): void {
  appendFileSync(
    file,
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-30T12:05:00Z', message: { id: 'm-grown', model: 'claude-fable-5', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n'
  )
}

describe('a scan through the scan worker (token-stats, "Where a scan runs")', () => {
  it('returns what the same scan returns on the calling thread: the snapshot, the rows, each project\'s sessions and the read allow-list, and after it the same question index', async () => {
    const { client } = clientOver(new Scanner(cacheDir))
    const direct = reference()

    const through = await client.scan(home.roots)
    const here = await direct.scan(home.roots)

    expect(timeless(through)).toEqual(timeless(here))
    // Not two empty results: the fork is listed under the question it asked, and the Antigravity conversation is listed
    const sessions = through.sessions.get(mergeKey(home.project)) ?? []
    expect(sessions.find((s) => s.file === home.codex.fork)?.title).toBe(FORK_TITLE)
    expect(sessions.map((s) => s.file)).toContain(home.antigravity.listed)
    expect(through.sessionFiles.has(home.antigravity.listed)).toBe(true)

    for (const file of [home.codex.fork, home.antigravity.listed, home.claude.asked, home.grok]) {
      expect(await client.sessionQuestions(home.roots, file), file).toEqual(await direct.sessionQuestions(home.roots, file))
      expect(await client.isFresh(file), file).toBe(true)
    }
    grow(home.claude.asked)
    expect(await client.isFresh(home.claude.asked)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('a question index asked for while a scan is held open on a parse is answered before the scan is', async () => {
    const gated = gatedRunner()
    const { client } = clientOver(new Scanner(cacheDir, gated.runner))
    await client.scan(home.roots)
    grow(home.claude.asked)
    const held = gated.hold()
    let scanned = false
    const scanning = client.scan(home.roots).then(() => {
      scanned = true
    })
    await held.entered

    const index = await client.sessionQuestions(home.roots, home.grok)

    expect(index.side).toBe('grok')
    expect(index.questions).toHaveLength(1)
    expect(scanned, 'the scan is still waiting for its parse').toBe(false)
    held.release()
    await scanning
  })

  it('a scan with nothing to parse gives way between its steps: a question index asked for right behind it is answered first', async () => {
    // Without the fork, nothing in a rescan waits for a file: it would run from its first step to its last in one stretch
    rmSync(home.codex.fork)
    const { client } = clientOver(new Scanner(cacheDir))
    await client.scan(home.roots)
    const order: string[] = []

    await Promise.all([
      client.scan(home.roots).then(() => order.push('scan')),
      client.sessionQuestions(home.roots, home.grok).then(() => order.push('index'))
    ])

    expect(order).toEqual(['index', 'scan'])
  })

  it('an error the worker\'s scanner throws arrives as that error, and the worker is not taken for failed', async () => {
    const { client } = clientOver(new Scanner(cacheDir))
    await client.scan(home.roots)

    const refused = await client.sessionQuestions(home.roots, join(dir, 'never-scanned.jsonl')).catch((e: unknown) => e)

    expect(decodeAppError(refused)?.code).toBe(ERR.sessionNotIndexed)
    expect(client.servedOn).toBe('worker')
    expect(warn).not.toHaveBeenCalled()
  })

  it('a scan that fails on the worker is a failed scan, with its message, and the next one is asked of the worker again', async () => {
    const real = new Scanner(cacheDir)
    let failing = true
    const { client } = clientOver({
      scan: (roots, holdMs) => (failing ? Promise.reject(new Error('the registry went away')) : real.scan(roots, holdMs)),
      sessionQuestions: (roots, file) => real.sessionQuestions(roots, file),
      isFresh: (file) => real.isFresh(file)
    })

    await expect(client.scan(home.roots)).rejects.toThrow('the registry went away')
    failing = false

    expect((await client.scan(home.roots)).snapshot.projects).toHaveLength(1)
    expect(standIns).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('a scan worker that fails (token-stats, Failure modes and boundaries: scans and the window)', () => {
  /** A real thread that exits as soon as it is asked anything */
  function exitingScript(): string {
    const file = join(dir, 'exits.mjs')
    writeFileSync(file, `import { parentPort } from 'node:worker_threads'\nparentPort.on('message', () => process.exit(3))\n`)
    return file
  }

  it.each<{ name: string; spawn: () => ScanWorker; afterFirstScan?: () => void; parsedOnMain: number }>([
    {
      name: 'cannot be started',
      spawn: () => {
        throw new Error('no thread to be had')
      },
      parsedOnMain: 8
    },
    { name: 'does not load its script', spawn: () => new Worker(join(dir, 'missing.mjs')), parsedOnMain: 8 },
    { name: 'exits during the first scan', spawn: () => new Worker(exitingScript()), parsedOnMain: 8 },
    {
      name: 'exits between two scans',
      spawn: () => standIn(new Scanner(cacheDir)),
      afterFirstScan: () => standIns[0].end(1),
      // The main process's scanner read the cache file the worker had written, and found every file in it
      parsedOnMain: 0
    }
  ])('a worker that $name: the scan under way and every later request are answered on the main process with the same results, no worker is started again, and it is logged once', async (c) => {
    const onMain = gatedRunner()
    let spawned = 0
    let fallbacks = 0
    const client = new ScanClient({
      spawn: () => {
        spawned++
        return c.spawn()
      },
      fallback: () => {
        fallbacks++
        return new Scanner(cacheDir, onMain.runner)
      }
    })
    const direct = reference()
    const here = timeless(await direct.scan(home.roots))

    const first = await client.scan(home.roots)
    c.afterFirstScan?.()
    const second = await client.scan(home.roots)
    const index = await client.sessionQuestions(home.roots, home.codex.fork)
    const fresh = await client.isFresh(home.claude.asked)

    expect(timeless(first)).toEqual(here)
    expect(timeless(second)).toEqual(here)
    expect(index).toEqual(await direct.sessionQuestions(home.roots, home.codex.fork))
    expect(fresh).toBe(true)
    expect(client.servedOn).toBe('main')
    expect(spawned).toBe(1)
    expect(fallbacks).toBe(1)
    // The eight session files of the fixture, each parsed once by whichever scanner met them first
    expect(onMain.parses()).toBe(c.parsedOnMain)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('[scan-worker]')
  })

  it('a worker that exits with a scan and a question-index read both unanswered: each is answered on the main process', async () => {
    const onWorker = new Scanner(cacheDir)
    let answering = true
    const unanswered = <T>(): Promise<T> => new Promise<T>(() => {})
    const client = new ScanClient({
      spawn: () =>
        standIn({
          scan: (roots, holdMs) => (answering ? onWorker.scan(roots, holdMs) : unanswered()),
          sessionQuestions: (roots, file) => (answering ? onWorker.sessionQuestions(roots, file) : unanswered()),
          isFresh: (file) => onWorker.isFresh(file)
        }),
      fallback: () => new Scanner(cacheDir)
    })
    const direct = reference()
    const here = timeless(await direct.scan(home.roots))
    await client.scan(home.roots)
    answering = false
    const scanning = client.scan(home.roots)
    const reading = client.sessionQuestions(home.roots, home.codex.fork)

    standIns[0].end(1)

    // A request the failure does not hand over never settles, and the case times out
    expect(await reading).toEqual(await direct.sessionQuestions(home.roots, home.codex.fork))
    expect(timeless(await scanning)).toEqual(here)
    expect(client.servedOn).toBe('main')
  })
})

describe('quitting (token-stats, Failure modes and boundaries: scans and the window)', () => {
  it('close asks the worker to stop once and resolves when its thread has ended; the scan under way gets no result, and that exit is no failure', async () => {
    const gated = gatedRunner()
    const { client, worker } = clientOver(new Scanner(cacheDir, gated.runner))
    await client.scan(home.roots)
    grow(home.claude.asked)
    const held = gated.hold()
    let settled = false
    void client.scan(home.roots).then(
      () => (settled = true),
      () => (settled = true)
    )
    await held.entered

    await Promise.all([client.close(), client.close()])

    expect(worker().stops).toBe(1)
    held.release()
    // Asked while quitting: no answer either, and no second worker started to give one
    void client.sessionQuestions(home.roots, home.grok).then(
      () => (settled = true),
      () => (settled = true)
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(settled, 'the dropped scan, and the read asked after the close').toBe(false)
    expect(standIns).toHaveLength(1)
    expect(client.servedOn).toBe('worker')
    expect(warn).not.toHaveBeenCalled()
  })

  it('close resolves at once when no worker was ever started', async () => {
    const { client } = clientOver(new Scanner(cacheDir))
    await client.close()
    expect(standIns).toHaveLength(0)
  })

  it('close after the worker failed stops what the main process\'s scanner holds, and waits for no thread', async () => {
    let closed = 0
    const onMain = new Scanner(cacheDir)
    const client = new ScanClient({
      spawn: () => {
        throw new Error('no thread to be had')
      },
      fallback: () => ({
        scan: (roots, holdMs) => onMain.scan(roots, holdMs),
        sessionQuestions: (roots, file) => onMain.sessionQuestions(roots, file),
        isFresh: (file) => onMain.isFresh(file),
        close: () => {
          closed++
        }
      })
    })
    await client.scan(home.roots)

    await client.close()

    expect(closed).toBe(1)
  })
})
