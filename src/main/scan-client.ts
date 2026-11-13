// The main process's side of the scan worker (ADR-0043). Scans and question-index reads are requests to the
// worker, which owns the token engine and its cache. A worker that cannot be started, fails or exits hands
// the work back: the requests in flight and every later one of the run are answered by a scanner on the main
// process, which reads the cache file as a build without the worker would. It is logged once, and no worker is
// started again in that run.
import { Worker } from 'node:worker_threads'
import { ParsePool } from './parse-pool'
import { Scanner, type ScanOutput } from './providers/scanner'
import type { ScanRoots } from './providers/types'
import { answerScan, type ScanAsk, type ScanReply, type ScanRequest, type Scans, type ScanWorkerData, type SessionIndex } from './scan-protocol'

/** The part of a worker thread the client uses */
export interface ScanWorker {
  postMessage(request: ScanRequest): void
  on(event: 'message', listener: (reply: ScanReply) => void): unknown
  on(event: 'error', listener: (error: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  terminate(): unknown
}

export interface ScanClientOptions {
  /** Starts the scan worker; a throw is a worker that cannot be started */
  spawn: () => ScanWorker
  /** The scanner on the main process, made when the worker fails and kept for the run; `close` stops what it holds */
  fallback: () => Scans & { close?: () => void }
}

interface Pending {
  ask: ScanAsk
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

export class ScanClient {
  private worker: ScanWorker | null = null
  /** The main process's own scanner, from the worker's failure on */
  private local: (Scans & { close?: () => void }) | null = null
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private closing: Promise<void> | null = null
  private stopped: () => void = () => {}

  constructor(private readonly opts: ScanClientOptions) {}

  /** Where requests are answered now */
  get servedOn(): 'worker' | 'main' {
    return this.local ? 'main' : 'worker'
  }

  /** One scan (Scanner.scan) */
  scan(roots: ScanRoots, holdMs = 0): Promise<ScanOutput> {
    return this.ask({ op: 'scan', roots, holdMs }) as Promise<ScanOutput>
  }

  /** A session's question index (TokenEngine.sessionQuestions) */
  sessionQuestions(roots: ScanRoots, file: string): Promise<SessionIndex> {
    return this.ask({ op: 'questions', roots, file }) as Promise<SessionIndex>
  }

  /** Whether a session file's index still matches disk (TokenEngine.isFresh) */
  isFresh(file: string): Promise<boolean> {
    return this.ask({ op: 'fresh', file }) as Promise<boolean>
  }

  /**
   * For quitting: asks the worker to stop and resolves once its thread has ended. The worker stops between two
   * steps of whatever it is doing, so a scan under way is dropped with its results and the cache file on disk is
   * the last one written whole. What the worker has not answered when its thread ends is never answered, and
   * nothing asked from here on is; an answer it gives before that arrives as any other, the result of a scan it
   * finished before taking the stop among them (quit.ts flushes the display copy after it).
   */
  close(): Promise<void> {
    this.closing ??= new Promise<void>((resolve) => {
      this.local?.close?.()
      const worker = this.worker
      if (!worker) {
        resolve()
        return
      }
      this.stopped = resolve
      worker.postMessage({ op: 'stop' })
    })
    return this.closing
  }

  private ask(ask: ScanAsk): Promise<unknown> {
    if (this.closing) return new Promise(() => {})
    if (this.local) return answerScan(this.local, ask)
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { ask, resolve, reject })
      // A worker that could not be started has handed this request to the main process already
      const worker = this.worker ?? this.start()
      worker?.postMessage({ id, ...ask })
    })
  }

  private start(): ScanWorker | null {
    let worker: ScanWorker
    try {
      worker = this.opts.spawn()
    } catch {
      this.fail(null)
      return null
    }
    this.worker = worker
    worker.on('message', (reply) => {
      // A reply from a worker that has failed since: its request was answered on the main process
      if (worker !== this.worker) return
      const asked = this.pending.get(reply.id)
      if (!asked) return
      this.pending.delete(reply.id)
      if (reply.ok) asked.resolve(reply.value)
      // The worker's scanner threw, as the main process's would have: a failed request, not a failed worker
      else asked.reject(new Error(reply.message))
    })
    worker.on('error', () => this.fail(worker))
    worker.on('exit', () => {
      if (worker !== this.worker) return
      if (!this.closing) {
        this.fail(worker)
        return
      }
      this.worker = null
      this.stopped()
    })
    return worker
  }

  /** The worker is gone, or never came: from here on the main process answers, starting with what was in flight */
  private fail(worker: ScanWorker | null): void {
    // While quitting, a failing worker's exit is the stop that is being waited for
    if (worker !== this.worker || this.local || this.closing) return
    this.worker = null
    void worker?.terminate()
    console.warn('[scan-worker] the scan worker failed; scans and question-index reads run on the main process for the rest of this run')
    const local = (this.local = this.opts.fallback())
    for (const [id, asked] of [...this.pending]) {
      this.pending.delete(id)
      answerScan(local, asked.ask).then(asked.resolve, asked.reject)
    }
  }
}

/**
 * The app's arrangement: the scan worker started from its built script, with the parse pool it starts itself,
 * and behind it a scanner on the calling thread with a parse pool of its own.
 */
export function startScans(o: ScanWorkerData & { script: string }): ScanClient {
  const data: ScanWorkerData = { cacheDir: o.cacheDir, parseScript: o.parseScript, poolSize: o.poolSize, engine: o.engine }
  return new ScanClient({
    spawn: () => new Worker(o.script, { workerData: data }),
    fallback: () => new Scanner(o.cacheDir, o.engine, new ParsePool(o.parseScript, o.poolSize, o.engine))
  })
}
